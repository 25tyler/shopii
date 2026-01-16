import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { ProductSearchRequestSchema } from '../types/index.js';

export async function productsRoutes(fastify: FastifyInstance) {
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

      // Build where clause
      const where: any = {
        OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }],
      };

      if (category) {
        where.category = category;
      }

      if (minPrice !== undefined || maxPrice !== undefined) {
        where.currentPrice = {};
        if (minPrice !== undefined) where.currentPrice.gte = minPrice;
        if (maxPrice !== undefined) where.currentPrice.lte = maxPrice;
      }

      // Get products with ratings
      const products = await prisma.product.findMany({
        where,
        include: {
          rating: true,
        },
        orderBy: [{ rating: { aiRating: 'desc' } }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      });

      // Filter by rating if specified
      let filteredProducts = products;
      if (minRating !== undefined) {
        filteredProducts = products.filter((p) => (p.rating?.aiRating || 0) >= minRating);
      }

      // Get total count for pagination
      const total = await prisma.product.count({ where });

      return {
        products: filteredProducts.map((p) => ({
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
          pros: p.rating?.pros || [],
          cons: p.rating?.cons || [],
          affiliateUrl: p.affiliateUrl,
          retailer: p.retailer,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
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

      // Validate UUID
      const uuidSchema = z.string().uuid();
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid product ID',
        });
      }

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
        metadata: product.metadata,
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
              pros: product.rating.pros,
              cons: product.rating.cons,
              summary: product.rating.summary,
              calculatedAt: product.rating.calculatedAt,
            }
          : null,
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

      // Validate UUID
      const uuidSchema = z.string().uuid();
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid product ID',
        });
      }

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
        pros: product.rating?.pros || [],
        cons: product.rating?.cons || [],
        sourcesAnalyzed: product.rating?.sourcesAnalyzed || 0,
        sources: product.reviewSources.map((s) => ({
          type: s.sourceType,
          name: s.sourceName,
          url: s.sourceUrl,
          sentiment: s.extractedSentiment ? Number(s.extractedSentiment) : null,
          pros: s.extractedPros,
          cons: s.extractedCons,
          upvotes: s.upvotes,
          scrapedAt: s.scrapedAt,
        })),
      };
    }
  );
}
