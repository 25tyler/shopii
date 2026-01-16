// Development suggestions routes - handles SQLite compatibility
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { optionalAuthMiddleware } from '../middleware/auth.dev.js';

export async function devSuggestionsRoutes(fastify: FastifyInstance) {
  // Get personalized suggestions feed
  fastify.get(
    '/',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request) => {
      const user = request.user;
      const userId = request.userId;

      const querySchema = z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(50).default(20),
      });

      const { page, limit } = querySchema.parse(request.query);
      const offset = (page - 1) * limit;

      // Get user preferences if authenticated
      let preferredCategories: string[] = [];
      let maxBudget: number | null = null;
      let excludedBrands: string[] = [];

      if (userId) {
        const preferences = await prisma.userPreferences.findUnique({
          where: { userId },
        });

        if (preferences) {
          preferredCategories = JSON.parse(preferences.categories as string);
          maxBudget = preferences.budgetMax;
          excludedBrands = JSON.parse(preferences.brandExclusions as string);
        }
      }

      // Get all products and filter in memory for SQLite compatibility
      let products = await prisma.product.findMany({
        include: {
          rating: true,
        },
      });

      // Apply filters
      if (preferredCategories.length > 0) {
        products = products.filter((p) => p.category && preferredCategories.includes(p.category));
      }

      if (maxBudget) {
        products = products.filter((p) => !p.currentPrice || p.currentPrice <= maxBudget!);
      }

      if (excludedBrands.length > 0) {
        products = products.filter((p) => !p.brand || !excludedBrands.includes(p.brand));
      }

      // Sort by rating
      products.sort((a, b) => {
        const ratingA = a.rating?.aiRating || 0;
        const ratingB = b.rating?.aiRating || 0;
        return ratingB - ratingA;
      });

      // Get sponsored products if not a pro user
      let sponsoredProducts: any[] = [];
      if (user?.plan !== 'pro') {
        const sponsored = await prisma.sponsoredProduct.findMany({
          where: {
            isActive: true,
          },
          include: {
            product: {
              include: {
                rating: true,
              },
            },
          },
          take: Math.ceil(limit / 5),
        });

        sponsoredProducts = sponsored.map((s) => ({
          ...s.product,
          isSponsored: true,
          sponsoredProductId: s.id,
        }));
      }

      // Merge organic and sponsored products
      const organicProducts = products.map((p) => ({ ...p, isSponsored: false }));

      // Insert sponsored products every 5 positions
      const allProducts = [...organicProducts];
      for (let i = 0; i < sponsoredProducts.length; i++) {
        const insertIndex = Math.min((i + 1) * 5, allProducts.length);
        allProducts.splice(insertIndex, 0, sponsoredProducts[i]);
      }

      const total = products.length;
      const paginated = allProducts.slice(offset, offset + limit);

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
          isSponsored: p.isSponsored,
        })),
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + limit < total,
        },
        _devMode: true,
      };
    }
  );

  // Get trending products
  fastify.get(
    '/trending',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request) => {
      const querySchema = z.object({
        limit: z.coerce.number().min(1).max(20).default(10),
      });

      const { limit } = querySchema.parse(request.query);

      // Get products sorted by rating
      const products = await prisma.product.findMany({
        include: {
          rating: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      });

      // Sort by rating
      products.sort((a, b) => {
        const ratingA = a.rating?.aiRating || 0;
        const ratingB = b.rating?.aiRating || 0;
        return ratingB - ratingA;
      });

      return {
        products: products.map((p) => ({
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
          recentInteractions: 0, // Simplified for dev mode
        })),
        _devMode: true,
      };
    }
  );
}
