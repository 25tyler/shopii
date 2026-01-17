// Development chat routes - uses OpenAI GPT with real-time research
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.dev.js';
import { generateChatResponse, generateResearchBasedResponse, detectIntent } from '../services/ai.openai.js';
import { conductProductResearch, enrichProducts } from '../services/research.service.js';
import { extractProductsFromResearch, fetchProductImages, enhanceProductsWithEnrichment, ExtractedProduct, getPurchaseUrl } from '../services/product-extraction.service.js';
import { cacheProducts, searchCachedProducts } from '../services/product-cache.service.js';
import { learnFromSearch } from '../services/preference-learning.service.js';

// Parse price string that might be a range like "$150-200" or single like "$149.99"
// Returns null if no valid price found (so frontend can show "Price varies")
function parsePrice(priceStr: string | null | undefined): number | null {
  if (!priceStr) return null;

  // Remove currency symbols and whitespace
  const cleaned = priceStr.replace(/[$€£¥,\s]/g, '');

  // Check if it's a range (contains - but not negative)
  if (cleaned.includes('-') && !cleaned.startsWith('-')) {
    const parts = cleaned.split('-');
    // Take the first (lower) price in the range
    const firstPrice = parseFloat(parts[0]);
    return isNaN(firstPrice) ? null : firstPrice;
  }

  // Single price
  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
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
            pageContext: pageContext ? JSON.stringify(pageContext) : null,
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

      // Parse preferences for SQLite
      const parsedPreferences = preferences
        ? {
            userId: preferences.userId,
            categories: JSON.parse(preferences.categories as string),
            budgetMin: preferences.budgetMin,
            budgetMax: preferences.budgetMax,
            currency: preferences.currency,
            qualityPreference: preferences.qualityPreference as any,
            brandPreferences: JSON.parse(preferences.brandPreferences as string),
            brandExclusions: JSON.parse(preferences.brandExclusions as string),
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
          fastify.log.info(`Research context length: ${research.context.length} chars`);
          fastify.log.info(`Research context preview: ${research.context.slice(0, 500)}...`);
          extractedProducts = await extractProductsFromResearch(message, research.context);
          fastify.log.info(`Extracted ${extractedProducts.length} products`);

          // FALLBACK: If extraction yielded no products, use cached products ONLY if they're highly relevant
          // (matchScore >= 70 means good category/name match, not just description match)
          if (extractedProducts.length === 0 && cachedMatches.length > 0) {
            const relevantCacheMatches = cachedMatches.filter((p) => p.matchScore >= 70);
            if (relevantCacheMatches.length > 0) {
              fastify.log.info(`No products extracted from research, using ${relevantCacheMatches.length} relevant cached products as fallback`);
              extractedProducts = relevantCacheMatches;
            } else {
              fastify.log.info(`Cache had ${cachedMatches.length} products but none were highly relevant (matchScore >= 70)`);
            }
          }

          // Don't do broader keyword search - it returns too many false positives
          // If we don't have relevant products, it's better to show none than wrong ones

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
            metadata: JSON.stringify({ intent }),
          },
          {
            conversationId: conversation.id,
            role: 'assistant',
            content: aiResponse,
            productsShown: JSON.stringify(extractedProducts.map((p) => p.name)),
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

      // Look up actual product URLs in parallel
      // We try to find real product pages and extract prices from them
      const productsWithUrls = await Promise.all(
        extractedProducts.map(async (p) => {
          // Try to get a real product URL and price
          let affiliateUrl = '';
          let retailer = p.retailer || 'Store';
          let actualPrice: string | null = null;

          try {
            const urlInfo = await getPurchaseUrl(
              p.name,
              p.brand,
              p.retailer,
              p.affiliateUrl // Use existing URL if it's a direct product link
            );

            if (urlInfo && urlInfo.url) {
              affiliateUrl = urlInfo.url;
              retailer = urlInfo.retailer;
              // Use the actual price from the product page if available
              actualPrice = urlInfo.price;
              fastify.log.info(`[Chat] Found product URL for ${p.name}: ${affiliateUrl}, price: ${actualPrice}`);
            } else {
              // Fallback: Amazon search URL with affiliate tag (better than nothing)
              const searchTerm = p.brand ? `${p.brand} ${p.name}` : p.name;
              affiliateUrl = `https://www.amazon.com/s?k=${encodeURIComponent(searchTerm)}&tag=shopii-20`;
              retailer = 'Amazon';
              fastify.log.info(`[Chat] Using Amazon search fallback for ${p.name}`);
            }
          } catch (error) {
            // On error, use Amazon search fallback
            const searchTerm = p.brand ? `${p.brand} ${p.name}` : p.name;
            affiliateUrl = `https://www.amazon.com/s?k=${encodeURIComponent(searchTerm)}&tag=shopii-20`;
            retailer = 'Amazon';
            fastify.log.info(`[Chat] URL lookup failed for ${p.name}, using Amazon search fallback`);
          }

          // Use actual price from product page, fall back to estimated price only if needed
          const finalPrice = actualPrice || p.estimatedPrice;

          return {
            id: `${p.brand}-${p.name}`.toLowerCase().replace(/\s+/g, '-'),
            name: p.name,
            brand: p.brand,
            description: p.description || '',
            imageUrl: p.imageUrl || '',
            price: {
              amount: parsePrice(finalPrice),
              currency: 'USD',
            },
            pros: p.pros || [],
            cons: p.cons || [],
            affiliateUrl,
            retailer,
            sourcesCount: p.sourcesCount || 1,
            // Two separate ratings
            aiRating: p.qualityScore || 75, // General product quality (cached)
            confidence: (p.matchScore || 75) / 100, // Query match/relevance (per-search)
            matchScore: p.matchScore || 75, // Explicit match score for sorting
            endorsementStrength: p.endorsementStrength || 'moderate',
            endorsementQuotes: p.endorsementQuotes || [],
            sourceTypes: p.sourceTypes || [],
            isSponsored: false,
          };
        })
      );

      fastify.log.info(`[Chat] Returning ${productsWithUrls.length} products`);

      return {
        message: aiResponse,
        products: productsWithUrls,
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
        pageContext: conversation.pageContext ? JSON.parse(conversation.pageContext as string) : null,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          productsShown: JSON.parse(m.productsShown as string),
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
