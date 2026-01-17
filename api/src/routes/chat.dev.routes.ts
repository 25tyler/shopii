// Development chat routes - uses OpenAI GPT with real-time research
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.dev.js';
import { generateChatResponse, generateResearchBasedResponse, detectIntent } from '../services/ai.openai.js';
import { conductProductResearch, enrichProducts } from '../services/research.service.js';
import { extractProductsFromResearch, fetchProductImages, enhanceProductsWithEnrichment, ExtractedProduct } from '../services/product-extraction.service.js';
import { cacheProducts, searchCachedProducts } from '../services/product-cache.service.js';
import { learnFromSearch } from '../services/preference-learning.service.js';
import { formatArray, parseArray, formatJson, parseJson } from '../utils/db-helpers.js';

// Parse price string that might be a range like "$150-200" or single like "$149.99"
function parsePrice(priceStr: string | null | undefined): number {
  if (!priceStr) return 0;

  // Remove currency symbols and whitespace
  const cleaned = priceStr.replace(/[$€£¥,\s]/g, '');

  // Check if it's a range (contains - but not negative)
  if (cleaned.includes('-') && !cleaned.startsWith('-')) {
    const parts = cleaned.split('-');
    // Take the first (lower) price in the range
    const firstPrice = parseFloat(parts[0] || '0');
    return isNaN(firstPrice) ? 0 : firstPrice;
  }

  // Single price
  const price = parseFloat(cleaned);
  return isNaN(price) ? 0 : price;
}

const ChatMessageRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().optional(),
  pageContext: z
    .object({
      url: z.string(),
      title: z.string().optional(),
      productName: z.string().optional(),
      price: z.string().optional(),
      imageUrl: z.string().optional(),
      retailer: z.string().optional(),
    })
    .optional(),
});

export async function devChatRoutes(fastify: FastifyInstance) {
  // Send a message and get AI response
  fastify.post(
    '/message',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      const parseResult = ChatMessageRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { message, conversationId, pageContext } = parseResult.data;
      const userId = request.userId!;

      // Get or create conversation
      let conversation;
      if (conversationId) {
        conversation = await prisma.conversation.findFirst({
          where: {
            id: conversationId,
            userId,
          },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 20,
            },
          },
        });
      }

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            userId,
            title: message.slice(0, 50),
            pageContext: pageContext ? (formatJson(pageContext) as any) : null,
          },
          include: {
            messages: true,
          },
        });
      }

      // Get user preferences
      const preferences = await prisma.userPreferences.findUnique({
        where: { userId },
      });

      // Detect intent
      const intent = await detectIntent(message);

      // Build conversation history
      const conversationHistory =
        conversation.messages?.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })) || [];

      // Parse preferences
      const parsedPreferences = preferences
        ? {
            userId: preferences.userId,
            categories: parseArray(preferences.categories),
            budgetMin: preferences.budgetMin,
            budgetMax: preferences.budgetMax,
            currency: preferences.currency,
            qualityPreference: preferences.qualityPreference as any,
            brandPreferences: parseArray(preferences.brandPreferences),
            brandExclusions: parseArray(preferences.brandExclusions),
          }
        : null;

      let aiResponse: string;
      let extractedProducts: ExtractedProduct[] = [];
      let researchSources: Array<{ title: string; url: string }> = [];

      // For product searches, conduct real-time research from Reddit/forums
      if (intent.type === 'product_search' || intent.type === 'comparison') {
        fastify.log.info(`Conducting research for: "${message}"`);

        try {
          // First, check if we have cached products that match this query
          const cachedMatches = await searchCachedProducts(message, 5);
          fastify.log.info(`Found ${cachedMatches.length} cached products matching query`);

          // Search Reddit, forums, and review sites for real recommendations
          const research = await conductProductResearch(message);
          researchSources = research.sources.map((s) => ({ title: s.title, url: s.url }));

          fastify.log.info(`Found ${research.sources.length} research sources`);

          // Extract products from research (with affiliate links)
          extractedProducts = await extractProductsFromResearch(message, research.context);
          fastify.log.info(`Extracted ${extractedProducts.length} products`);

          // Run enrichment and image fetching in parallel for speed
          // Enrichment searches for product-specific details to fill in gaps
          const [enrichmentMap] = await Promise.all([
            enrichProducts(extractedProducts.map((p) => ({ name: p.name, brand: p.brand }))),
            // Image fetching runs in parallel too
          ]);
          fastify.log.info(`Enriched product data from ${enrichmentMap.size} searches`);

          // Enhance products that have sparse details with enrichment data
          extractedProducts = await enhanceProductsWithEnrichment(extractedProducts, enrichmentMap);
          fastify.log.info(`Enhanced products with enrichment data`);

          // Fetch product images
          extractedProducts = await fetchProductImages(extractedProducts);
          fastify.log.info(`Fetched images for products`);

          // Cache the extracted products for future queries (async, don't wait)
          cacheProducts(extractedProducts).catch((err) => {
            fastify.log.error(`Failed to cache products: ${err.message}`);
          });
          fastify.log.info(`Caching ${extractedProducts.length} products in background`);

          // Generate response based on extracted products (so AI only discusses products we have cards for)
          aiResponse = await generateResearchBasedResponse(
            message,
            {
              preferences: parsedPreferences,
              pageContext: pageContext || null,
              conversationHistory,
            },
            research.context,
            extractedProducts.map((p) => ({
              name: p.name,
              brand: p.brand,
              whyRecommended: p.description,
              pros: p.pros,
              cons: p.cons,
              confidenceScore: p.qualityScore,
              endorsementQuotes: p.endorsementQuotes,
            }))
          );
        } catch (error: any) {
          fastify.log.error(`Research failed: ${error?.message}`);
          // Fallback to regular response if research fails
          aiResponse = await generateChatResponse(
            message,
            {
              preferences: parsedPreferences,
              pageContext: pageContext || null,
              conversationHistory,
            },
            []
          );
        }
      } else {
        // For general chat, use regular response
        aiResponse = await generateChatResponse(
          message,
          {
            preferences: parsedPreferences,
            pageContext: pageContext || null,
            conversationHistory,
          },
          []
        );
      }

      // Save messages to conversation
      await prisma.message.createMany({
        data: [
          {
            conversationId: conversation.id,
            role: 'user',
            content: message,
            metadata: formatJson({ intent }) as any,
          },
          {
            conversationId: conversation.id,
            role: 'assistant',
            content: aiResponse,
            productsShown: formatArray(extractedProducts.map((p) => p.name)) as any,
          },
        ],
      });

      // Update conversation title if it's the first message
      if (!conversation.messages || conversation.messages.length === 0) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
            updatedAt: new Date(),
          },
        });
      }

      // Learn from this search to improve "For You" recommendations
      if (extractedProducts.length > 0) {
        // Run in background - don't block the response
        learnFromSearch(userId, message, extractedProducts).catch((err) => {
          console.error('[Chat] Failed to learn from search:', err);
        });
      }

      return {
        message: aiResponse,
        products: extractedProducts.map((p) => ({
          id: `${p.brand}-${p.name}`.toLowerCase().replace(/\s+/g, '-'),
          name: p.name,
          brand: p.brand,
          description: p.description || '',
          imageUrl: p.imageUrl || '',
          price: {
            amount: parsePrice(p.estimatedPrice),
            currency: 'USD',
          },
          pros: p.pros || [],
          cons: p.cons || [],
          affiliateUrl: p.affiliateUrl || '',
          retailer: p.retailer || 'Amazon',
          sourcesCount: p.sourcesCount || 1,
          // Two separate ratings
          aiRating: p.qualityScore || 75, // General product quality (cached)
          confidence: (p.matchScore || 75) / 100, // Query match/relevance (per-search)
          matchScore: p.matchScore || 75, // Explicit match score for sorting
          endorsementStrength: p.endorsementStrength || 'moderate',
          endorsementQuotes: p.endorsementQuotes || [],
          sourceTypes: p.sourceTypes || [],
          isSponsored: false,
        })),
        sources: researchSources.slice(0, 5),
        conversationId: conversation.id,
        _devMode: true,
        _researchBased: intent.type === 'product_search' || intent.type === 'comparison',
      };
    }
  );

  // List user conversations
  fastify.get(
    '/conversations',
    {
      preHandler: authMiddleware,
    },
    async (request) => {
      const userId = request.userId!;

      const conversations = await prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { messages: true },
          },
        },
      });

      return conversations.map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c._count.messages,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
    }
  );

  // Get a specific conversation with messages
  fastify.get(
    '/conversations/:id',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };

      const conversation = await prisma.conversation.findFirst({
        where: {
          id,
          userId,
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!conversation) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Conversation not found',
        });
      }

      return {
        id: conversation.id,
        title: conversation.title,
        pageContext: conversation.pageContext ? parseJson(conversation.pageContext as any) : null,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          productsShown: parseArray(m.productsShown as any),
          createdAt: m.createdAt,
        })),
      };
    }
  );

  // Delete a conversation
  fastify.delete(
    '/conversations/:id',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      const userId = request.userId!;
      const { id } = request.params as { id: string };

      const conversation = await prisma.conversation.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!conversation) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Conversation not found',
        });
      }

      await prisma.conversation.delete({
        where: { id },
      });

      return { success: true };
    }
  );
}
