// Development chat routes - uses OpenAI GPT
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.dev.js';
import { generateChatResponse, detectIntent } from '../services/ai.openai.js';

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

      // Search for relevant products if it's a product search
      let products: any[] = [];
      if (intent.type === 'product_search' || intent.type === 'comparison') {
        // Extract search terms from message
        const searchTerms = message.toLowerCase();

        // Build search conditions based on message content (lowercase to match DB)
        const categoryMap: Record<string, string[]> = {
          'headphone': ['audio', 'Audio'],
          'earbuds': ['audio', 'Audio'],
          'audio': ['audio', 'Audio'],
          'speaker': ['audio', 'Audio'],
          'laptop': ['computing', 'Computing'],
          'computer': ['computing', 'Computing'],
          'macbook': ['computing', 'Computing'],
          'keyboard': ['peripherals', 'Peripherals'],
          'mouse': ['peripherals', 'Peripherals'],
          'monitor': ['monitors', 'Monitors'],
          'display': ['monitors', 'Monitors'],
        };

        let matchedCategories: string[] = [];
        for (const [keyword, categories] of Object.entries(categoryMap)) {
          if (searchTerms.includes(keyword)) {
            matchedCategories.push(...categories);
          }
        }

        // Search products by category or name
        if (matchedCategories.length > 0) {
          products = await prisma.product.findMany({
            where: {
              category: { in: matchedCategories },
            },
            take: 5,
            include: {
              rating: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });
        }

        // If no category match, try text search on name
        if (products.length === 0) {
          products = await prisma.product.findMany({
            where: {
              OR: [
                { name: { contains: message } },
                { description: { contains: message } },
              ],
            },
            take: 5,
            include: {
              rating: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });
        }

        // Fallback: return empty if no match (better than random products)
        if (products.length === 0 && !matchedCategories.length) {
          // No matching products for this query
          products = [];
        }

        // Parse JSON arrays for SQLite
        products = products.map((p) => ({
          ...p,
          rating: p.rating
            ? {
                ...p.rating,
                pros: JSON.parse(p.rating.pros as string),
                cons: JSON.parse(p.rating.cons as string),
              }
            : null,
        }));
      }

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

      // Generate AI response (mock)
      const aiResponse = await generateChatResponse(
        message,
        {
          preferences: parsedPreferences,
          pageContext: pageContext || null,
          conversationHistory,
        },
        products.map((p) => ({
          ...p,
          currentPrice: p.currentPrice ? Number(p.currentPrice) : null,
        }))
      );

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
            productsShown: JSON.stringify(products.map((p) => p.id)),
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
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          price: {
            amount: p.currentPrice ? Number(p.currentPrice) : 0,
            currency: p.currency,
          },
          aiRating: p.rating?.aiRating || null,
          confidence: p.rating?.confidence ? Number(p.rating.confidence) : null,
          pros: p.rating?.pros || [],
          cons: p.rating?.cons || [],
          affiliateUrl: p.affiliateUrl,
          retailer: p.retailer,
          isSponsored: false,
        })),
        conversationId: conversation.id,
        _devMode: true,
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
