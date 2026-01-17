// Development suggestions routes - uses CachedProduct and learned preferences
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.dev.js';
import {
  getLearnedPreferences,
  getTopCategories,
  getTopBrands,
} from '../services/preference-learning.service.js';
import {
  getCachedProductsByCategory,
  getTopCachedProducts,
  searchCachedProducts,
  getCacheStats,
} from '../services/product-cache.service.js';

// Parse price string that might be a range like "$150-200" or single like "$149.99"
function parsePrice(priceStr: string | null | undefined): number {
  if (!priceStr) return 0;

  // Remove currency symbols and whitespace
  const cleaned = priceStr.replace(/[$€£¥,\s]/g, '');

  // Check if it's a range (contains - but not negative)
  if (cleaned.includes('-') && !cleaned.startsWith('-')) {
    const parts = cleaned.split('-');
    // Take the first (lower) price in the range
    const firstPrice = parseFloat(parts[0]);
    return isNaN(firstPrice) ? 0 : firstPrice;
  }

  // Single price
  const price = parseFloat(cleaned);
  return isNaN(price) ? 0 : price;
}

export async function devSuggestionsRoutes(fastify: FastifyInstance) {
  // Get personalized suggestions feed based on learned preferences
  fastify.get(
    '/',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request) => {
      const userId = request.userId;

      const querySchema = z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(50).default(20),
      });

      const { page, limit } = querySchema.parse(request.query);
      const offset = (page - 1) * limit;

      // Check if we have any cached products
      const stats = await getCacheStats();
      if (stats.totalProducts === 0) {
        // No cached products yet - return empty with helpful message
        return {
          products: [],
          pagination: {
            page,
            limit,
            total: 0,
            hasMore: false,
          },
          _message: 'Start searching for products to build your personalized feed!',
          _devMode: true,
        };
      }

      // Get learned preferences if user is authenticated
      let topCategories: string[] = [];
      let topBrands: string[] = [];
      let learnedCategories: any[] = [];
      let learnedBrands: any[] = [];

      if (userId) {
        const learned = await getLearnedPreferences(userId);
        topCategories = getTopCategories(learned.categories, 5);
        topBrands = getTopBrands(learned.brands, 5);
        learnedCategories = learned.categories;
        learnedBrands = learned.brands;

        console.log(`[Suggestions] User ${userId} - Top categories:`, topCategories);
        console.log(`[Suggestions] User ${userId} - Top brands:`, topBrands);
      }

      // Collect products from various sources
      const allProducts: any[] = [];
      const seenKeys = new Set<string>();

      // 1. Get products from top learned categories (if user has preferences)
      if (topCategories.length > 0) {
        for (const category of topCategories) {
          const categoryProducts = await getCachedProductsByCategory(category, 5);
          for (const product of categoryProducts) {
            const key = `${product.brand}-${product.name}`.toLowerCase();
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              const prefWeight = learnedCategories.find(
                (c) => c.category.toLowerCase() === category.toLowerCase()
              )?.weight || 0;
              allProducts.push({
                ...product,
                _preferenceBoost: prefWeight,
                _matchReason: `Based on your interest in ${category}`,
              });
            }
          }
        }
      }

      // 2. Get products from preferred brands
      if (topBrands.length > 0) {
        for (const brand of topBrands) {
          const brandProducts = await searchCachedProducts(brand, 5);
          for (const product of brandProducts) {
            const key = `${product.brand}-${product.name}`.toLowerCase();
            if (!seenKeys.has(key) && product.brand.toLowerCase() === brand.toLowerCase()) {
              seenKeys.add(key);
              const prefWeight = learnedBrands.find(
                (b) => b.brand.toLowerCase() === brand.toLowerCase()
              )?.weight || 0;
              allProducts.push({
                ...product,
                _preferenceBoost: prefWeight,
                _matchReason: `From ${product.brand}, a brand you like`,
              });
            }
          }
        }
      }

      // 3. Fill with top quality products if we don't have enough
      if (allProducts.length < limit * 2) {
        const topProducts = await getTopCachedProducts(limit * 2);
        for (const product of topProducts) {
          const key = `${product.brand}-${product.name}`.toLowerCase();
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            allProducts.push({
              ...product,
              _preferenceBoost: 0,
              _matchReason: 'Top-rated product',
            });
          }
        }
      }

      // Sort by preference boost + quality score
      allProducts.sort((a, b) => {
        const scoreA = (a.qualityScore || 0) + (a._preferenceBoost || 0) * 0.5;
        const scoreB = (b.qualityScore || 0) + (b._preferenceBoost || 0) * 0.5;
        return scoreB - scoreA;
      });

      // Paginate
      const paginatedProducts = allProducts.slice(offset, offset + limit);
      const total = allProducts.length;

      return {
        products: paginatedProducts.map((p) => ({
          id: `${p.brand}-${p.name}`.toLowerCase().replace(/\s+/g, '-'),
          name: p.name,
          brand: p.brand,
          description: p.description,
          imageUrl: p.imageUrl || '',
          category: p.category,
          price: {
            amount: parsePrice(p.estimatedPrice),
            currency: 'USD',
          },
          aiRating: p.qualityScore || 75,
          confidence: 0.8,
          pros: p.pros || [],
          cons: p.cons || [],
          affiliateUrl: p.affiliateUrl || '',
          retailer: p.retailer || 'Amazon',
          matchReason: p._matchReason,
          isSponsored: false,
        })),
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + limit < total,
        },
        _learnedCategories: topCategories,
        _learnedBrands: topBrands,
        _devMode: true,
      };
    }
  );

  // Get user's learned preferences (for debugging/UI)
  fastify.get(
    '/preferences',
    {
      preHandler: authMiddleware,
    },
    async (request) => {
      const userId = request.userId!;

      const learned = await getLearnedPreferences(userId);

      return {
        categories: learned.categories.map((c) => ({
          name: c.category,
          weight: Math.round(c.weight),
          searchCount: c.searchCount,
        })),
        brands: learned.brands.map((b) => ({
          name: b.brand,
          weight: Math.round(b.weight),
          searchCount: b.searchCount,
        })),
        recentSearches: learned.recentSearches,
        _devMode: true,
      };
    }
  );

  // Get trending products (from cache)
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

      // Get top cached products
      const products = await getTopCachedProducts(limit);

      return {
        products: products.map((p) => ({
          id: `${p.brand}-${p.name}`.toLowerCase().replace(/\s+/g, '-'),
          name: p.name,
          brand: p.brand,
          description: p.description,
          imageUrl: p.imageUrl || '',
          category: p.category,
          price: {
            amount: parsePrice(p.estimatedPrice),
            currency: 'USD',
          },
          aiRating: p.qualityScore || 75,
          confidence: 0.8,
          pros: p.pros || [],
          cons: p.cons || [],
          affiliateUrl: p.affiliateUrl || '',
          retailer: p.retailer || 'Amazon',
        })),
        _devMode: true,
      };
    }
  );

  // Search cached products
  fastify.get('/search', async (request) => {
    const querySchema = z.object({
      q: z.string().min(1),
      limit: z.coerce.number().min(1).max(20).default(10),
    });

    const { q, limit } = querySchema.parse(request.query);

    const products = await searchCachedProducts(q, limit);

    return {
      products: products.map((p) => ({
        id: `${p.brand}-${p.name}`.toLowerCase().replace(/\s+/g, '-'),
        name: p.name,
        brand: p.brand,
        description: p.description,
        imageUrl: p.imageUrl || '',
        category: p.category,
        price: {
          amount: parsePrice(p.estimatedPrice),
          currency: 'USD',
        },
        aiRating: p.qualityScore || 75,
        matchScore: p.matchScore || 75,
        pros: p.pros || [],
        cons: p.cons || [],
        affiliateUrl: p.affiliateUrl || '',
        retailer: p.retailer || 'Amazon',
      })),
      query: q,
      _devMode: true,
    };
  });

  // Get cache statistics
  fastify.get('/stats', async () => {
    const stats = await getCacheStats();
    return {
      ...stats,
      _devMode: true,
    };
  });
}
