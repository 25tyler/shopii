import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js';

export async function suggestionsRoutes(fastify: FastifyInstance) {
  // Get personalized suggestions feed
  fastify.get(
    '/',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request) => {
      const userId = request.userId;
      const user = request.user;

      const querySchema = z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(50).default(20),
      });

      const { page, limit } = querySchema.parse(request.query);
      const offset = (page - 1) * limit;

      // Get user preferences if authenticated
      let preferences = null;
      let interactions: string[] = [];

      if (userId) {
        preferences = await prisma.userPreferences.findUnique({
          where: { userId },
        });

        // Get recent interactions for personalization
        const recentInteractions = await prisma.userInteraction.findMany({
          where: {
            userId,
            interactionType: { in: ['view', 'click_affiliate', 'save'] },
          },
          select: { productId: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });

        interactions = recentInteractions.filter((i) => i.productId).map((i) => i.productId!);
      }

      // Build query based on preferences
      const where: any = {};

      if (preferences?.categories && preferences.categories.length > 0) {
        where.category = { in: preferences.categories };
      }

      if (preferences?.budgetMax) {
        where.currentPrice = { lte: preferences.budgetMax };
      }

      if (preferences?.brandExclusions && preferences.brandExclusions.length > 0) {
        where.brand = { notIn: preferences.brandExclusions };
      }

      // Get organic products
      const organicProducts = await prisma.product.findMany({
        where: {
          ...where,
          // Exclude recently viewed products
          ...(interactions.length > 0 && {
            id: { notIn: interactions.slice(0, 20) },
          }),
        },
        include: {
          rating: true,
        },
        orderBy: [{ rating: { aiRating: 'desc' } }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      });

      // Get sponsored products if not a pro user
      let sponsoredProducts: any[] = [];
      if (user?.plan !== 'pro') {
        const sponsoredWhere: any = {
          isActive: true,
          dailyBudget: { gt: prisma.sponsoredProduct.fields.spent },
        };

        if (preferences?.categories && preferences.categories.length > 0) {
          sponsoredWhere.OR = [
            { targetingCategories: { hasSome: preferences.categories } },
            { targetingCategories: { isEmpty: true } },
          ];
        }

        const sponsored = await prisma.sponsoredProduct.findMany({
          where: sponsoredWhere,
          include: {
            product: {
              include: {
                rating: true,
              },
            },
          },
          orderBy: { bidAmount: 'desc' },
          take: Math.ceil(limit / 5), // 1 sponsored per 5 organic
        });

        sponsoredProducts = sponsored.map((s) => ({
          ...s.product,
          isSponsored: true,
          sponsoredProductId: s.id,
        }));

        // Track impressions
        if (userId && sponsoredProducts.length > 0) {
          await prisma.adImpression.createMany({
            data: sponsoredProducts.map((s) => ({
              sponsoredProductId: s.sponsoredProductId,
              userId,
              placement: 'suggestions_feed',
            })),
          });
        }
      }

      // Merge organic and sponsored products
      const allProducts = [...organicProducts.map((p) => ({ ...p, isSponsored: false }))];

      // Insert sponsored products every 5 positions
      for (let i = 0; i < sponsoredProducts.length; i++) {
        const insertIndex = Math.min((i + 1) * 5, allProducts.length);
        allProducts.splice(insertIndex, 0, sponsoredProducts[i]);
      }

      // Get total count for pagination
      const total = await prisma.product.count({ where });

      return {
        products: allProducts.slice(0, limit).map((p) => ({
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
          isSponsored: p.isSponsored,
        })),
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + limit < total,
        },
      };
    }
  );

  // Get trending products in user's categories
  fastify.get(
    '/trending',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request) => {
      const userId = request.userId;

      const querySchema = z.object({
        limit: z.coerce.number().min(1).max(20).default(10),
      });

      const { limit } = querySchema.parse(request.query);

      // Get user preferences
      let categories: string[] = [];
      if (userId) {
        const preferences = await prisma.userPreferences.findUnique({
          where: { userId },
        });
        categories = preferences?.categories || [];
      }

      // Find products with most recent interactions
      const trendingProducts = await prisma.product.findMany({
        where: {
          ...(categories.length > 0 && { category: { in: categories } }),
        },
        include: {
          rating: true,
          _count: {
            select: {
              interactions: {
                where: {
                  createdAt: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                  },
                },
              },
            },
          },
        },
        orderBy: [{ rating: { aiRating: 'desc' } }],
        take: limit,
      });

      return {
        products: trendingProducts.map((p) => ({
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
          recentInteractions: p._count.interactions,
        })),
      };
    }
  );
}
