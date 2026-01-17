// Development suggestions routes - uses CachedProduct and learned preferences
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
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
    const firstPrice = parseFloat(parts[0] || '0');
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

      // Helper to calculate recency boost (higher = more recent)
      // Recency is the PRIMARY sorting factor - recent searches should always appear first
      const getRecencyBoost = (lastSeen: string): number => {
        const now = Date.now();
        const lastSeenTime = new Date(lastSeen).getTime();
        const minutesSince = (now - lastSeenTime) / (1000 * 60);

        // Large differences to ensure recent items always come first
        if (minutesSince < 5) return 1000;      // Last 5 minutes - highest priority
        if (minutesSince < 30) return 500;      // Last 30 minutes
        if (minutesSince < 60) return 200;      // Last hour
        if (minutesSince < 60 * 24) return 50;  // Last 24 hours
        return 10;                               // Older than 24 hours
      };

      // 1. Get products from top learned categories (if user has preferences)
      // Process in order of recency (topCategories is already sorted by recency score)
      if (topCategories.length > 0) {
        for (let i = 0; i < topCategories.length; i++) {
          const category = topCategories[i];
          const categoryProducts = await getCachedProductsByCategory(category, 5);
          for (const product of categoryProducts) {
            const key = `${product.brand}-${product.name}`.toLowerCase();
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              const pref = learnedCategories.find(
                (c) => c.category.toLowerCase() === category.toLowerCase()
              );
              const prefWeight = pref?.weight || 0;
              const recencyBoost = pref?.lastSeen ? getRecencyBoost(pref.lastSeen) : 0;
              allProducts.push({
                ...product,
                _preferenceBoost: prefWeight,
                _recencyBoost: recencyBoost,
                _order: i, // Lower = more recent category
                _matchReason: `Based on your interest in ${category}`,
              });
            }
          }
        }
      }

      // 2. Get products from preferred brands
      if (topBrands.length > 0) {
        for (let i = 0; i < topBrands.length; i++) {
          const brand = topBrands[i];
          const brandProducts = await searchCachedProducts(brand, 5);
          for (const product of brandProducts) {
            const key = `${product.brand}-${product.name}`.toLowerCase();
            if (!seenKeys.has(key) && product.brand.toLowerCase() === brand.toLowerCase()) {
              seenKeys.add(key);
              const pref = learnedBrands.find(
                (b) => b.brand.toLowerCase() === brand.toLowerCase()
              );
              const prefWeight = pref?.weight || 0;
              const recencyBoost = pref?.lastSeen ? getRecencyBoost(pref.lastSeen) : 0;
              allProducts.push({
                ...product,
                _preferenceBoost: prefWeight,
                _recencyBoost: recencyBoost,
                _order: i,
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
              _recencyBoost: 0,
              _order: 999, // Low priority
              _matchReason: 'Top-rated product',
            });
          }
        }
      }

      // Sort by: recency boost (most important) > preference boost > quality score
      allProducts.sort((a, b) => {
        // First, prioritize by recency boost (recent searches first)
        const recencyDiff = (b._recencyBoost || 0) - (a._recencyBoost || 0);
        if (recencyDiff !== 0) return recencyDiff;

        // Then by preference weight
        const prefDiff = (b._preferenceBoost || 0) - (a._preferenceBoost || 0);
        if (prefDiff !== 0) return prefDiff;

        // Finally by quality score
        return (b.qualityScore || 0) - (a.qualityScore || 0);
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
