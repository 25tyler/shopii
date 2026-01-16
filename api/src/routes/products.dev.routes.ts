// Development products routes - handles SQLite compatibility
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { optionalAuthMiddleware } from '../middleware/auth.dev.js';

export async function devProductsRoutes(fastify: FastifyInstance) {
  // Search products
  fastify.get(
    '/search',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request, reply) => {
      const querySchema = z.object({
        q: z.string().min(1).max(200),
        category: z.string().optional(),
        minPrice: z.coerce.number().min(0).optional(),
        maxPrice: z.coerce.number().min(0).optional(),
        minRating: z.coerce.number().min(0).max(100).optional(),
        limit: z.coerce.number().min(1).max(50).default(20),
        offset: z.coerce.number().min(0).default(0),
      });

      const parseResult = querySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid query parameters',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { q, category, minPrice, maxPrice, minRating, limit, offset } = parseResult.data;

      // SQLite uses LIKE for case-insensitive search
      const qLower = q.toLowerCase();

      // Get all products and filter in memory for SQLite compatibility
      let products = await prisma.product.findMany({
        include: {
          rating: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Filter by search query
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(qLower) || (p.description && p.description.toLowerCase().includes(qLower))
      );

      // Filter by category
      if (category) {
        products = products.filter((p) => p.category === category);
      }

      // Filter by price range
      if (minPrice !== undefined) {
        products = products.filter((p) => p.currentPrice && p.currentPrice >= minPrice);
      }
      if (maxPrice !== undefined) {
        products = products.filter((p) => p.currentPrice && p.currentPrice <= maxPrice);
      }

      // Filter by rating
      if (minRating !== undefined) {
        products = products.filter((p) => (p.rating?.aiRating || 0) >= minRating);
      }

      // Sort by rating
      products.sort((a, b) => {
        const ratingA = a.rating?.aiRating || 0;
        const ratingB = b.rating?.aiRating || 0;
        return ratingB - ratingA;
      });

      const total = products.length;
      const paginated = products.slice(offset, offset + limit);

      return {
        products: paginated.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          category: p.category,
          brand: p.brand,
          price: {
            amount: p.currentPrice ? Number(p.currentPrice) : null,
            currency: p.currency,
          },
          aiRating: p.rating?.aiRating || null,
          confidence: p.rating?.confidence ? Number(p.rating.confidence) : null,
          pros: p.rating?.pros ? JSON.parse(p.rating.pros as string) : [],
          cons: p.rating?.cons ? JSON.parse(p.rating.cons as string) : [],
          affiliateUrl: p.affiliateUrl,
          retailer: p.retailer,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
        _devMode: true,
      };
    }
  );

  // Get product by ID
  fastify.get(
    '/:id',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          rating: true,
        },
      });

      if (!product) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Product not found',
        });
      }

      // Track view if user is authenticated
      if (request.userId) {
        await prisma.userInteraction.create({
          data: {
            userId: request.userId,
            productId: id,
            interactionType: 'view',
          },
        });
      }

      return {
        id: product.id,
        externalId: product.externalId,
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        category: product.category,
        brand: product.brand,
        price: {
          amount: product.currentPrice ? Number(product.currentPrice) : null,
          currency: product.currency,
        },
        affiliateUrl: product.affiliateUrl,
        retailer: product.retailer,
        metadata: product.metadata ? JSON.parse(product.metadata as string) : null,
        lastScrapedAt: product.lastScrapedAt,
        rating: product.rating
          ? {
              aiRating: product.rating.aiRating,
              confidence: product.rating.confidence ? Number(product.rating.confidence) : null,
              sentimentScore: product.rating.sentimentScore ? Number(product.rating.sentimentScore) : null,
              reliabilityScore: product.rating.reliabilityScore ? Number(product.rating.reliabilityScore) : null,
              valueScore: product.rating.valueScore ? Number(product.rating.valueScore) : null,
              popularityScore: product.rating.popularityScore ? Number(product.rating.popularityScore) : null,
              sourcesAnalyzed: product.rating.sourcesAnalyzed,
              pros: JSON.parse(product.rating.pros as string),
              cons: JSON.parse(product.rating.cons as string),
              summary: product.rating.summary,
              calculatedAt: product.rating.calculatedAt,
            }
          : null,
        _devMode: true,
      };
    }
  );

  // Get product reviews summary
  fastify.get(
    '/:id/reviews',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          rating: true,
          reviewSources: {
            orderBy: { scrapedAt: 'desc' },
            take: 20,
          },
        },
      });

      if (!product) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Product not found',
        });
      }

      return {
        productId: product.id,
        productName: product.name,
        summary: product.rating?.summary || null,
        pros: product.rating?.pros ? JSON.parse(product.rating.pros as string) : [],
        cons: product.rating?.cons ? JSON.parse(product.rating.cons as string) : [],
        sourcesAnalyzed: product.rating?.sourcesAnalyzed || 0,
        sources: product.reviewSources.map((s) => ({
          type: s.sourceType,
          name: s.sourceName,
          url: s.sourceUrl,
          sentiment: s.extractedSentiment ? Number(s.extractedSentiment) : null,
          pros: JSON.parse(s.extractedPros as string),
          cons: JSON.parse(s.extractedCons as string),
          upvotes: s.upvotes,
          scrapedAt: s.scrapedAt,
        })),
        _devMode: true,
      };
    }
  );
}
