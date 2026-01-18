// UPDATED VERSION WITH COMPARISON MODE FIX
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { searchRateLimitMiddleware, trackUsage } from '../middleware/rateLimit.middleware.js';
import { generateChatResponse, generateResearchBasedResponse, detectIntent, generateFastResponse } from '../services/ai.openai.js';
import { ChatMessageRequestSchema } from '../types/index.js';
import type { ResearchProgressEvent } from '../services/research.service.js';
import { conductProductResearch, enrichProducts } from '../services/research.service.js';
import { extractProductsFromResearch, enhanceProductsWithEnrichment, ExtractedProduct, lookupProductUrl } from '../services/product-extraction.service.js';
import { cacheProducts, searchCachedProducts } from '../services/product-cache.service.js';
import { learnFromSearch } from '../services/preference-learning.service.js';
import { formatArray, parseArray, formatJson, parseJson } from '../utils/db-helpers.js';
import { detectMode } from '../services/mode-detection.service.js';
import { conductDeepComparison } from '../services/comparison.service.js';
import type { ChatMode, ComparisonData } from '../types/index.js';

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
    const firstPrice = parseFloat(parts[0] || '0');
    return isNaN(firstPrice) ? 0 : firstPrice;
  }

  // Single price
  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
}

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
          where: {},
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
        conversation?.messages?.map((m: any) => ({
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
        const messageCount = await prisma.message.count({
          where: { conversationId: conversation.id }
        });
        if (messageCount <= 2) {
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
      console.log('='.repeat(80));
      console.log('[Chat] NEW VERSION - Incoming request body:', JSON.stringify(request.body, null, 2));
      console.log('='.repeat(80));

      const parseResult = ChatMessageRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        console.error('[Chat] Validation error:', parseResult.error.flatten());
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { message, conversationId, pageContext, mode: requestedMode, selectedProducts, productData } = parseResult.data;
      const userId = request.userId;

      console.log(`[Chat] Parsed - Mode: ${requestedMode}, Selected products:`, selectedProducts);
      console.log(`[Chat] Product data provided:`, productData ? `${productData.length} products` : 'none');

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

        // Detect intent (still useful for tracking)
        const intent = await detectIntent(message);

        // Build conversation history
        const conversationHistory =
          conversation?.messages?.map((m: any) => ({
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

        // Determine which mode to use
        let mode: ChatMode = requestedMode || 'auto';

        // If auto mode, detect the appropriate mode
        if (mode === 'auto') {
          const detectedMode = await detectMode(message, conversationHistory);
          mode = detectedMode;
          sendEvent('mode_selected', { mode: detectedMode });
          console.log(`[Chat] Auto mode selected: ${detectedMode}`);
        }

        let aiResponse: string;
        let extractedProducts: ExtractedProduct[] = [];
        let comparisonData: ComparisonData | null = null;

        // Create progress callback for SSE updates
        const progressCallback = (event: ResearchProgressEvent) => {
          sendEvent('progress', event);
        };

        // Handle different modes
        if (mode === 'ask') {
          // ASK MODE: Fast response without product research
          console.log('[Chat] Using Ask mode');
          aiResponse = await generateFastResponse(message, {
            preferences: parsedPreferences,
            pageContext: pageContext || null,
            conversationHistory,
          });

        } else if (mode === 'comparison') {
          // COMPARISON MODE: Use pre-researched data from previous search
          console.log(`[Chat] Using Comparison mode with ${selectedProducts?.length || 0} products`);

          if (!selectedProducts || selectedProducts.length < 2) {
            aiResponse = "To use comparison mode, please select at least 2 products to compare.";
          } else if (!productData || productData.length < 2) {
            aiResponse = "Product data is missing. Please search for products first, then select them for comparison.";
          } else {
            try {
              console.log('[Chat] Using pre-researched product data for comparison');

              // Convert frontend ProductCard to PreResearchedProduct format
              const preResearchedData = productData.map(p => ({
                name: p.name,
                brand: p.name.split(' ')[0] || '', // Extract brand from name
                description: p.description,
                pros: p.pros || [],
                cons: p.cons || [],
                endorsementQuotes: [], // Not available from ProductCard
                sourcesCount: p.matchScore || 1, // Use matchScore as proxy for sources
                price: p.price.amount || 0,
                retailer: p.retailer,
              }));

              console.log(`[Chat] Comparing ${preResearchedData.length} products:`, preResearchedData.map(p => p.name));

              // Conduct comparison with progress updates (no new research needed!)
              const comparisonProgress = (msg: string) => {
                sendEvent('progress', {
                  type: 'search_start',
                  source: msg,
                  timestamp: Date.now(),
                });
              };

              comparisonData = await conductDeepComparison(
                selectedProducts,
                preResearchedData,
                message,
                comparisonProgress
              );
              aiResponse = comparisonData.summary;

              // Send comparison data and visualizations
              sendEvent('comparison_data', { comparisonData });
            } catch (error: any) {
              console.error('[Chat] Comparison error:', error);
              aiResponse = `I encountered an error while comparing these products: ${error.message || 'Unknown error'}. Please try again.`;
            }
          }

        } else {
          // SEARCH MODE: Current implementation - conduct real-time research from Reddit/forums
          console.log('[Chat] Using Search mode');
          try {
            // Check cached products first
            const cachedMatches = await searchCachedProducts(message, 5);

            // Search with progress callback
            const research = await conductProductResearch(message, progressCallback);

            // Extract products from research
            extractedProducts = await extractProductsFromResearch(message, research.context);

            // Fallback to cached if needed
            if (extractedProducts.length === 0 && cachedMatches.length > 0) {
              const relevantCacheMatches = cachedMatches.filter((p) => p.matchScore >= 70);
              if (relevantCacheMatches.length > 0) {
                extractedProducts = relevantCacheMatches;
              }
            }

            // Enrichment
            const [enrichmentMap] = await Promise.all([
              enrichProducts(extractedProducts.map((p) => ({ name: p.name, brand: p.brand }))),
            ]);
            extractedProducts = await enhanceProductsWithEnrichment(extractedProducts, enrichmentMap);

            // Cache products in background
            cacheProducts(extractedProducts).catch(() => {});

            // Generate response based on research
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
        }

        // Learn from this search to improve recommendations
        if (extractedProducts.length > 0 && userId) {
          learnFromSearch(userId, message, extractedProducts).catch(() => {});
        }

        // Look up actual product URLs with AI verification, scraping price and images
        const productsWithUrls = await Promise.all(
          extractedProducts.map(async (p) => {
            try {
              const urlInfo = await lookupProductUrl(p.name, p.brand);

              if (urlInfo) {
                return {
                  id: `${p.brand}-${p.name}`.toLowerCase().replace(/\s+/g, '-'),
                  name: p.name,
                  brand: p.brand,
                  description: p.description || '',
                  imageUrl: urlInfo.images[0] || '',
                  imageUrls: urlInfo.images,
                  price: {
                    amount: parsePrice(urlInfo.price),
                    currency: 'USD',
                  },
                  pros: p.pros || [],
                  cons: p.cons || [],
                  affiliateUrl: urlInfo.url,
                  retailer: urlInfo.retailer,
                  sourcesCount: p.sourcesCount || 1,
                  aiRating: p.qualityScore || 75,
                  confidence: (p.matchScore || 75) / 100,
                  matchScore: p.matchScore || 75,
                  endorsementStrength: p.endorsementStrength || 'moderate',
                  endorsementQuotes: p.endorsementQuotes || [],
                };
              }
              return null;
            } catch (error) {
              return null;
            }
          })
        );

        // Filter out null results (products where URL lookup failed)
        const validProducts = productsWithUrls.filter((p): p is NonNullable<typeof p> => p !== null);

        // Save messages to conversation if authenticated
        if (conversation && userId) {
          await prisma.message.createMany({
            data: [
              {
                conversationId: conversation.id,
                role: 'user',
                content: message,
                metadata: formatJson({ intent, mode, selectedProducts }) as any,
              },
              {
                conversationId: conversation.id,
                role: 'assistant',
                content: aiResponse,
                productsShown: formatArray(validProducts.map((p) => p.name)) as any,
                metadata: formatJson({ mode, hasComparison: !!comparisonData }) as any,
              },
            ],
          });

          // Update conversation title if it's the first message
          const messageCount = await prisma.message.count({
            where: { conversationId: conversation.id }
          });
          if (messageCount <= 2) { // Just the user and assistant message we just created
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

        // Send products (only for search mode)
        if (mode === 'search') {
          sendEvent('products', { products: validProducts });
        }

        // Send mode used
        sendEvent('mode', { mode });

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
