// Development chat routes - uses OpenAI GPT with real-time research
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.dev.js';
import { generateChatResponse, generateResearchBasedResponse, detectIntent } from '../services/ai.openai.js';
import { conductProductResearch, enrichProducts } from '../services/research.service.js';
import { extractProductsFromResearch, enhanceProductsWithEnrichment, ExtractedProduct, lookupProductUrl, estimateProductPrice } from '../services/product-extraction.service.js';
import { cacheProducts, searchCachedProducts } from '../services/product-cache.service.js';
import { learnFromSearch } from '../services/preference-learning.service.js';
import { formatArray, parseArray, formatJson, parseJson } from '../utils/db-helpers.js';
import { conductDeepComparison, type PreResearchedProduct } from '../services/comparison.service.js';

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
  mode: z.enum(['ask', 'search', 'comparison', 'auto']).optional().default('auto'),
  selectedProducts: z.array(z.string()).optional(),
  productData: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    imageUrl: z.string(),
    price: z.object({
      amount: z.number().nullable(),
      currency: z.string(),
    }),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
    aiRating: z.number(),
    matchScore: z.number(),
    affiliateUrl: z.string(),
    retailer: z.string(),
  })).optional(),
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

          // NOTE: Images will come from page scraping during URL lookup

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

      // Look up actual product URLs with AI verification, scraping price and images
      // Only include products where we successfully find verified URLs
      const productsWithUrls = await Promise.all(
        extractedProducts.map(async (p) => {
          try {
            const urlInfo = await lookupProductUrl(p.name, p.brand);

            if (urlInfo) {
              // Successfully found and verified product page with price and images
              return {
                id: `${p.brand}-${p.name}`.toLowerCase().replace(/\s+/g, '-'),
                name: p.name,
                brand: p.brand,
                description: p.description || '',
                imageUrl: urlInfo.images[0] || '', // Primary image
                imageUrls: urlInfo.images, // All images (3-5)
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
                sourceTypes: p.sourceTypes || [],
                isSponsored: false,
              };
            } else {
              // No valid URL found - don't include this product
              fastify.log.info(`[Chat] No verified URL found for ${p.name}, excluding from results`);
              return null;
            }
          } catch (error) {
            fastify.log.warn(`[Chat] URL lookup failed for ${p.name}:`, error);
            return null;
          }
        })
      );

      // Filter out products without URLs
      const validProducts = productsWithUrls.filter((p): p is NonNullable<typeof p> => p !== null);

      fastify.log.info(`[Chat] Returning ${validProducts.length} products (excluded ${productsWithUrls.length - validProducts.length} without valid URLs)`);

      return {
        message: aiResponse,
        products: validProducts,
        sources: researchSources.slice(0, 5),
        conversationId: conversation.id,
        _devMode: true,
        _researchBased: intent.type === 'product_search' || intent.type === 'comparison',
      };
    }
  );

  // Send a message and get AI response with SSE streaming (for progress updates)
  fastify.post(
    '/message-stream',
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

      const { message, conversationId, pageContext, mode: requestedMode, selectedProducts, productData } = parseResult.data;
      const userId = request.userId!;

      fastify.log.info(`[Chat] Mode: ${requestedMode}, Selected products: ${selectedProducts?.length || 0}, Product data: ${productData?.length || 0}`);

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
        // Get or create conversation (same as /message endpoint)
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
        let comparisonData: any = null;

        // COMPARISON MODE: Conduct targeted research on selected products
        if (requestedMode === 'comparison' && selectedProducts && selectedProducts.length >= 2) {
          fastify.log.info(`[Chat] Using Comparison mode - conducting targeted research on ${selectedProducts.length} products`);

          try {
            // Send initial progress message for comparison mode
            sendEvent('progress', {
              type: 'search_start',
              source: 'Researching products for comparison',
              timestamp: Date.now(),
            });

            // Create comparison-specific query for deep research
            const comparisonQuery = `Compare ${selectedProducts.join(' vs ')} - detailed comparison, pros and cons, reviews, pricing`;

            // Search with progress callback that uses comparison-specific messages
            const progressCallback = (event: any) => {
              // Customize progress messages for comparison mode
              if (event.type === 'search_start') {
                sendEvent('progress', {
                  ...event,
                  source: 'Researching products for comparison',
                });
              } else {
                sendEvent('progress', event);
              }
            };

            // Conduct deep research specifically for comparison
            const research = await conductProductResearch(comparisonQuery, progressCallback);
            researchSources = research.sources.map((s) => ({ title: s.title, url: s.url }));

            fastify.log.info(`[Comparison] Found ${research.sources.length} research sources for comparison`);

            // Extract detailed product information from research
            const researchedProducts: PreResearchedProduct[] = [];

            for (const productName of selectedProducts) {
              // Extract product-specific information from research context
              const productExtracted = await extractProductsFromResearch(productName, research.context);

              if (productExtracted && productExtracted.length > 0 && productExtracted[0]) {
                const product = productExtracted[0];
                // Try to get price from original productData as fallback
                const originalProduct = productData?.find(p => p.name === productName);

                researchedProducts.push({
                  name: product.name,
                  brand: product.brand,
                  description: product.description,
                  pros: product.pros || [],
                  cons: product.cons || [],
                  endorsementQuotes: product.endorsementQuotes || [],
                  sourcesCount: product.sourcesCount || 1,
                  price: originalProduct?.price?.amount || 0,
                  retailer: product.retailer || originalProduct?.retailer || 'Various',
                });
              } else if (productData) {
                // Fallback to basic product data if extraction fails
                const fallback = productData.find(p => p.name === productName);
                if (fallback) {
                  researchedProducts.push({
                    name: fallback.name,
                    brand: fallback.name.split(' ')[0] || '',
                    description: fallback.description,
                    pros: fallback.pros || [],
                    cons: fallback.cons || [],
                    endorsementQuotes: [],
                    sourcesCount: fallback.matchScore || 1,
                    price: fallback.price.amount || 0,
                    retailer: fallback.retailer,
                  });
                }
              }
            }

            // Conduct comparison with progress updates
            const comparisonProgress = (msg: string) => {
              sendEvent('progress', {
                type: 'comparison_progress',
                source: msg,
                timestamp: Date.now(),
              });
            };

            comparisonData = await conductDeepComparison(
              selectedProducts,
              researchedProducts,
              message,
              comparisonProgress
            );
            aiResponse = comparisonData.summary;

            // Send comparison data
            sendEvent('comparison_data', { comparisonData });
          } catch (error: any) {
            fastify.log.error(`[Chat] Comparison error: ${error.message}`);
            aiResponse = `I encountered an error while comparing these products: ${error.message || 'Unknown error'}. Please try again.`;
          }
        } else if (intent.type === 'product_search' || intent.type === 'comparison') {
          // For product searches, conduct real-time research with progress callbacks
          fastify.log.info(`Conducting research for: "${message}"`);

          try {
            // Check cached products
            const cachedMatches = await searchCachedProducts(message, 5);
            fastify.log.info(`Found ${cachedMatches.length} cached products matching query`);

            // Search with progress callback
            const progressCallback = (event: any) => {
              sendEvent('progress', event);
            };

            const research = await conductProductResearch(message, progressCallback);
            researchSources = research.sources.map((s) => ({ title: s.title, url: s.url }));

            fastify.log.info(`Found ${research.sources.length} research sources`);

            // Extract products from research
            extractedProducts = await extractProductsFromResearch(message, research.context);
            fastify.log.info(`Extracted ${extractedProducts.length} products`);

            // Fallback to cached if needed
            if (extractedProducts.length === 0 && cachedMatches.length > 0) {
              const relevantCacheMatches = cachedMatches.filter((p) => p.matchScore >= 70);
              if (relevantCacheMatches.length > 0) {
                fastify.log.info(`Using ${relevantCacheMatches.length} cached products as fallback`);
                extractedProducts = relevantCacheMatches;
              }
            }

            // Enrichment
            const [enrichmentMap] = await Promise.all([
              enrichProducts(extractedProducts.map((p) => ({ name: p.name, brand: p.brand }))),
            ]);
            extractedProducts = await enhanceProductsWithEnrichment(extractedProducts, enrichmentMap);

            // Cache products
            cacheProducts(extractedProducts).catch((err) => {
              fastify.log.error(`Failed to cache products: ${err.message}`);
            });

            // Generate response
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
          // For general chat
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

        // Save messages
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

        // Update conversation title
        if (!conversation.messages || conversation.messages.length === 0) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
              updatedAt: new Date(),
            },
          });
        }

        // Learn from search
        if (extractedProducts.length > 0) {
          learnFromSearch(userId, message, extractedProducts).catch((err) => {
            console.error('[Chat] Failed to learn from search:', err);
          });
        }

        // Look up actual product URLs with AI verification, scraping price and images
        // Only include products where we successfully find verified URLs
        const productsWithUrls = await Promise.all(
          extractedProducts.map(async (p) => {
            try {
              const urlInfo = await lookupProductUrl(p.name, p.brand);

              if (urlInfo) {
                // Successfully found and verified product page with price and images
                let priceAmount = parsePrice(urlInfo.price);

                // If no price was found or price is zero, estimate it using AI
                if (priceAmount === null || priceAmount === 0) {
                  fastify.log.info(`[Chat SSE] No valid price found for ${p.name}, estimating...`);
                  const estimatedPrice = await estimateProductPrice(
                    p.name,
                    p.brand,
                    p.category,
                    p.description
                  );
                  priceAmount = parsePrice(estimatedPrice);
                  fastify.log.info(`[Chat SSE] Estimated price for ${p.name}: ${estimatedPrice}`);
                }

                return {
                  id: `${p.brand}-${p.name}`.toLowerCase().replace(/\s+/g, '-'),
                  name: p.name,
                  brand: p.brand,
                  description: p.description || '',
                  imageUrl: urlInfo.images[0] || '', // Primary image
                  imageUrls: urlInfo.images, // All images (3-5)
                  price: {
                    amount: priceAmount,
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
                  sourceTypes: p.sourceTypes || [],
                  isSponsored: false,
                };
              } else {
                // No valid URL found - don't include this product
                fastify.log.info(`[Chat SSE] No verified URL found for ${p.name}, excluding from results`);
                return null;
              }
            } catch (error: any) {
              fastify.log.warn(`[Chat SSE] URL lookup failed for ${p.name}: ${error?.message || error}`);
              return null;
            }
          })
        );

        // Filter out products without URLs
        const validProducts = productsWithUrls.filter((p): p is NonNullable<typeof p> => p !== null);

        fastify.log.info(`[Chat SSE] Returning ${validProducts.length} products (excluded ${productsWithUrls.length - validProducts.length} without valid URLs)`);

        // Send final message
        sendEvent('message', { message: aiResponse });

        // Send products
        sendEvent('products', { products: validProducts });

        // Send conversation ID
        sendEvent('conversationId', { conversationId: conversation.id });

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
