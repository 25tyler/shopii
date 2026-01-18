import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { searchRateLimitMiddleware, trackUsage } from '../middleware/rateLimit.middleware.js';
import { generateChatResponse, detectIntent } from '../services/ai.service.js';
import { ChatMessageRequestSchema } from '../types/index.js';
import type { ResearchProgressEvent } from '../services/research.service.js';

export async function chatRoutes(fastify: FastifyInstance) {
  // Send a message and get AI response
  fastify.post(
    '/message',
    {
      preHandler: [optionalAuthMiddleware, searchRateLimitMiddleware],
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
      const userId = request.userId;

      // Track usage if authenticated
      if (userId) {
        await trackUsage(userId, 'search');
      }

      // Get or create conversation
      let conversation;
      if (conversationId && userId) {
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

      if (!conversation && userId) {
        conversation = await prisma.conversation.create({
          data: {
            userId,
            title: message.slice(0, 50),
            pageContext: pageContext || null,
          },
          include: {
            messages: true,
          },
        });
      }

      // Get user preferences
      let preferences = null;
      if (userId) {
        preferences = await prisma.userPreferences.findUnique({
          where: { userId },
        });
      }

      // Detect intent
      const intent = await detectIntent(message);

      // Search for relevant products if it's a product search
      let products: any[] = [];
      if (intent.type === 'product_search' || intent.type === 'comparison') {
        // For now, return mock products - will be replaced with real search
        products = await prisma.product.findMany({
          take: 5,
          include: {
            rating: true,
          },
          orderBy: {
            rating: {
              aiRating: 'desc',
            },
          },
        });
      }

      // Build conversation history
      const conversationHistory =
        conversation?.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })) || [];

      // Generate AI response
      const aiResponse = await generateChatResponse(
        message,
        {
          preferences: preferences
            ? {
                userId: preferences.userId,
                categories: preferences.categories,
                budgetMin: preferences.budgetMin,
                budgetMax: preferences.budgetMax,
                currency: preferences.currency,
                qualityPreference: preferences.qualityPreference as any,
                brandPreferences: preferences.brandPreferences,
                brandExclusions: preferences.brandExclusions,
              }
            : null,
          pageContext: pageContext || null,
          conversationHistory,
        },
        products.map((p) => ({
          ...p,
          currentPrice: p.currentPrice ? Number(p.currentPrice) : null,
          rating: p.rating
            ? {
                ...p.rating,
                confidence: p.rating.confidence ? Number(p.rating.confidence) : 0,
                sentimentScore: p.rating.sentimentScore ? Number(p.rating.sentimentScore) : 0,
                reliabilityScore: p.rating.reliabilityScore ? Number(p.rating.reliabilityScore) : 0,
                valueScore: p.rating.valueScore ? Number(p.rating.valueScore) : 0,
                popularityScore: p.rating.popularityScore ? Number(p.rating.popularityScore) : 0,
              }
            : null,
        }))
      );

      // Save messages to conversation if authenticated
      if (conversation && userId) {
        await prisma.message.createMany({
          data: [
            {
              conversationId: conversation.id,
              role: 'user',
              content: message,
              metadata: { intent },
            },
            {
              conversationId: conversation.id,
              role: 'assistant',
              content: aiResponse,
              productsShown: products.map((p) => p.id),
            },
          ],
        });

        // Update conversation title if it's the first message
        if (conversation.messages.length === 0) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
              updatedAt: new Date(),
            },
          });
        }
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
          pros: Array.isArray(p.rating?.pros) ? p.rating.pros : [],
          cons: Array.isArray(p.rating?.cons) ? p.rating.cons : [],
          affiliateUrl: p.affiliateUrl,
          retailer: p.retailer,
          isSponsored: false,
        })),
        conversationId: conversation?.id || null,
      };
    }
  );

  // Send a message and get AI response with SSE streaming (for progress updates)
  fastify.post(
    '/message-stream',
    {
      preHandler: [optionalAuthMiddleware, searchRateLimitMiddleware],
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
      const userId = request.userId;

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Helper to send SSE events
      const sendEvent = (eventType: string, data: any) => {
        reply.raw.write(`event: ${eventType}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        // Track usage if authenticated
        if (userId) {
          await trackUsage(userId, 'search');
        }

        // Get or create conversation
        let conversation;
        if (conversationId && userId) {
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

        if (!conversation && userId) {
          conversation = await prisma.conversation.create({
            data: {
              userId,
              title: message.slice(0, 50),
              pageContext: pageContext || null,
            },
            include: {
              messages: true,
            },
          });
        }

        // Get user preferences
        let preferences = null;
        if (userId) {
          preferences = await prisma.userPreferences.findUnique({
            where: { userId },
          });
        }

        // Detect intent
        const intent = await detectIntent(message);

        // Search for relevant products if it's a product search
        let products: any[] = [];
        if (intent.type === 'product_search' || intent.type === 'comparison') {
          products = await prisma.product.findMany({
            take: 5,
            include: {
              rating: true,
            },
            orderBy: {
              rating: {
                aiRating: 'desc',
              },
            },
          });
        }

        // Build conversation history
        const conversationHistory =
          conversation?.messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })) || [];

        // Create progress callback
        const progressCallback = (event: ResearchProgressEvent) => {
          sendEvent('progress', event);
        };

        // Generate AI response with progress callback
        const aiResponse = await generateChatResponse(
          message,
          {
            preferences: preferences
              ? {
                  userId: preferences.userId,
                  categories: preferences.categories,
                  budgetMin: preferences.budgetMin,
                  budgetMax: preferences.budgetMax,
                  currency: preferences.currency,
                  qualityPreference: preferences.qualityPreference as any,
                  brandPreferences: preferences.brandPreferences,
                  brandExclusions: preferences.brandExclusions,
                }
              : null,
            pageContext: pageContext || null,
            conversationHistory,
          },
          products.map((p) => ({
            ...p,
            currentPrice: p.currentPrice ? Number(p.currentPrice) : null,
            rating: p.rating
              ? {
                  ...p.rating,
                  confidence: p.rating.confidence ? Number(p.rating.confidence) : 0,
                  sentimentScore: p.rating.sentimentScore ? Number(p.rating.sentimentScore) : 0,
                  reliabilityScore: p.rating.reliabilityScore ? Number(p.rating.reliabilityScore) : 0,
                  valueScore: p.rating.valueScore ? Number(p.rating.valueScore) : 0,
                  popularityScore: p.rating.popularityScore ? Number(p.rating.popularityScore) : 0,
                }
              : null,
          })),
          progressCallback
        );

        // Save messages to conversation if authenticated
        if (conversation && userId) {
          await prisma.message.createMany({
            data: [
              {
                conversationId: conversation.id,
                role: 'user',
                content: message,
                metadata: { intent },
              },
              {
                conversationId: conversation.id,
                role: 'assistant',
                content: aiResponse,
                productsShown: products.map((p) => p.id),
              },
            ],
          });

          // Update conversation title if it's the first message
          if (conversation.messages.length === 0) {
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
                updatedAt: new Date(),
              },
            });
          }
        }

        // Send final message
        sendEvent('message', { message: aiResponse });

        // Send products
        const formattedProducts = products.map((p) => ({
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
          pros: Array.isArray(p.rating?.pros) ? p.rating.pros : [],
          cons: Array.isArray(p.rating?.cons) ? p.rating.cons : [],
          affiliateUrl: p.affiliateUrl,
          retailer: p.retailer,
          isSponsored: false,
        }));
        sendEvent('products', { products: formattedProducts });

        // Send conversation ID
        sendEvent('conversationId', { conversationId: conversation?.id || null });

        // Signal completion
        sendEvent('done', {});

        reply.raw.end();
      } catch (error: any) {
        console.error('[SSE] Error:', error);
        sendEvent('error', { error: error.message || 'Internal server error' });
        reply.raw.end();
      }
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
        pageContext: conversation.pageContext,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          productsShown: m.productsShown,
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
