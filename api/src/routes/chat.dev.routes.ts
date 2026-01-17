// Development chat routes - uses OpenAI GPT with real-time research
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.dev.js';
import { generateChatResponse, generateResearchBasedResponse, detectIntent } from '../services/ai.openai.js';
import { conductProductResearch } from '../services/research.service.js';
import { extractProductsFromResearch, fetchProductImages, ExtractedProduct } from '../services/product-extraction.service.js';

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
          // Search Reddit, forums, and review sites for real recommendations
          const research = await conductProductResearch(message);
          researchSources = research.sources.map((s) => ({ title: s.title, url: s.url }));

          fastify.log.info(`Found ${research.sources.length} research sources`);

          // Extract products from research (with affiliate links)
          extractedProducts = await extractProductsFromResearch(message, research.context);
          fastify.log.info(`Extracted ${extractedProducts.length} products`);

          // Fetch product images
          extractedProducts = await fetchProductImages(extractedProducts);
          fastify.log.info(`Fetched images for products`);

          // Generate response based on real research data
          aiResponse = await generateResearchBasedResponse(
            message,
            {
              preferences: parsedPreferences,
              pageContext: pageContext || null,
              conversationHistory,
            },
            research.context
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

      return {
        message: aiResponse,
        products: extractedProducts.map((p) => ({
          id: `${p.brand}-${p.name}`.toLowerCase().replace(/\s+/g, '-'),
          name: p.name,
          brand: p.brand,
          description: p.whyRecommended || '',
          imageUrl: p.imageUrl || '',
          price: p.estimatedPrice
            ? {
                amount: parseFloat(String(p.estimatedPrice).replace(/[^0-9.]/g, '')) || 0,
                currency: 'USD',
              }
            : { amount: 0, currency: 'USD' },
          pros: p.pros || [],
          cons: p.cons || [],
          affiliateUrl: p.affiliateUrl || '',
          retailer: p.retailer || 'Amazon',
          sourcesCount: p.sourcesCount || 1,
          // Use actual confidence from research-based extraction
          aiRating: p.confidenceScore || 75, // Direct from AI analysis
          confidence: (p.confidenceScore || 75) / 100, // Convert to 0-1 scale
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
