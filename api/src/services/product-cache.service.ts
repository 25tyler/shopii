// Product cache service - stores and retrieves query-agnostic product info
import { prisma } from '../config/prisma.js';
import { ExtractedProduct } from './product-extraction.service.js';
import { formatArray, parseArray } from '../utils/db-helpers.js';

// Generate a normalized key for product lookup
export function normalizeProductKey(brand: string, name: string): string {
  return `${brand}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Convert CachedProduct from DB to ExtractedProduct format
interface CachedProductDB {
  id: string;
  normalizedKey: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  estimatedPrice: string | null;
  imageUrl: string | null;
  affiliateUrl: string | null;
  retailer: string;
  pros: string;
  cons: string;
  endorsementStrength: string;
  endorsementQuotes: string;
  sourceTypes: string;
  sourcesCount: number;
  qualityScore: number;
  searchesFoundIn: number;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function dbToExtractedProduct(cached: CachedProductDB, matchScore: number = 75): ExtractedProduct {
  return {
    name: cached.name,
    brand: cached.brand,
    category: cached.category,
    description: cached.description,
    estimatedPrice: cached.estimatedPrice,
    imageUrl: cached.imageUrl,
    affiliateUrl: cached.affiliateUrl,
    retailer: cached.retailer,
    pros: parseArray(cached.pros),
    cons: parseArray(cached.cons),
    endorsementStrength: cached.endorsementStrength as 'strong' | 'moderate' | 'weak',
    endorsementQuotes: parseArray(cached.endorsementQuotes),
    sourceTypes: parseArray(cached.sourceTypes),
    sourcesCount: cached.sourcesCount,
    qualityScore: cached.qualityScore,
    matchScore, // Computed per-query
  };
}

// Look up products by their normalized keys
export async function lookupCachedProducts(
  products: Array<{ brand: string; name: string }>
): Promise<Map<string, ExtractedProduct>> {
  const keys = products.map((p) => normalizeProductKey(p.brand, p.name));

  const cached = await prisma.cachedProduct.findMany({
    where: {
      normalizedKey: { in: keys },
    },
  });

  const result = new Map<string, ExtractedProduct>();
  for (const c of cached) {
    result.set(c.normalizedKey, dbToExtractedProduct(c as CachedProductDB));
  }

  console.log(`[Cache] Found ${result.size}/${keys.length} products in cache`);
  return result;
}

// Look up products by category for suggestions
export async function getCachedProductsByCategory(
  category: string,
  limit: number = 10
): Promise<ExtractedProduct[]> {
  const cached = await prisma.cachedProduct.findMany({
    where: {
      category: {
        contains: category,
      },
    },
    orderBy: {
      qualityScore: 'desc',
    },
    take: limit,
  });

  return cached.map((c) => dbToExtractedProduct(c as CachedProductDB));
}

// Get top products across all categories
export async function getTopCachedProducts(limit: number = 20): Promise<ExtractedProduct[]> {
  const cached = await prisma.cachedProduct.findMany({
    orderBy: [
      { qualityScore: 'desc' },
      { searchesFoundIn: 'desc' },
    ],
    take: limit,
  });

  return cached.map((c) => dbToExtractedProduct(c as CachedProductDB));
}

// Save or update products in the cache
export async function cacheProducts(products: ExtractedProduct[]): Promise<void> {
  for (const product of products) {
    const normalizedKey = normalizeProductKey(product.brand, product.name);

    try {
      // Check if product already exists
      const existing = await prisma.cachedProduct.findUnique({
        where: { normalizedKey },
      });

      if (existing) {
        // Update existing product - merge data intelligently
        const existingPros = parseArray((existing as CachedProductDB).pros);
        const existingCons = parseArray((existing as CachedProductDB).cons);
        const existingQuotes = parseArray((existing as CachedProductDB).endorsementQuotes);
        const existingSourceTypes = parseArray((existing as CachedProductDB).sourceTypes);

        // Merge and dedupe arrays
        const mergedPros = [...new Set([...existingPros, ...product.pros])].slice(0, 8);
        const mergedCons = [...new Set([...existingCons, ...product.cons])].slice(0, 6);
        const mergedQuotes = [...new Set([...existingQuotes, ...product.endorsementQuotes])].slice(0, 6);
        const mergedSourceTypes = [...new Set([...existingSourceTypes, ...product.sourceTypes])];

        // Use higher quality score
        const newQualityScore = Math.max(existing.qualityScore, product.qualityScore);

        // Use longer/better description
        const newDescription =
          product.description.length > existing.description.length
            ? product.description
            : existing.description;

        await prisma.cachedProduct.update({
          where: { normalizedKey },
          data: {
            description: newDescription,
            pros: formatArray(mergedPros) as any,
            cons: formatArray(mergedCons) as any,
            endorsementQuotes: formatArray(mergedQuotes) as any,
            sourceTypes: formatArray(mergedSourceTypes) as any,
            sourcesCount: Math.max(existing.sourcesCount, product.sourcesCount),
            qualityScore: newQualityScore,
            searchesFoundIn: existing.searchesFoundIn + 1,
            lastSeenAt: new Date(),
            // Update image/price if we have new values
            imageUrl: product.imageUrl || existing.imageUrl,
            estimatedPrice: product.estimatedPrice || existing.estimatedPrice,
          },
        });

        console.log(`[Cache] Updated product: ${product.name}`);
      } else {
        // Create new product
        await prisma.cachedProduct.create({
          data: {
            normalizedKey,
            name: product.name,
            brand: product.brand,
            category: product.category,
            description: product.description,
            estimatedPrice: product.estimatedPrice,
            imageUrl: product.imageUrl,
            affiliateUrl: product.affiliateUrl,
            retailer: product.retailer,
            pros: formatArray(product.pros) as any,
            cons: formatArray(product.cons) as any,
            endorsementStrength: product.endorsementStrength,
            endorsementQuotes: formatArray(product.endorsementQuotes) as any,
            sourceTypes: formatArray(product.sourceTypes) as any,
            sourcesCount: product.sourcesCount,
            qualityScore: product.qualityScore,
            searchesFoundIn: 1,
          },
        });

        console.log(`[Cache] Created new product: ${product.name}`);
      }
    } catch (error) {
      console.error(`[Cache] Failed to cache product ${product.name}:`, error);
    }
  }
}

// Search cache by text query (for finding cached products that might match a search)
export async function searchCachedProducts(
  query: string,
  limit: number = 10
): Promise<ExtractedProduct[]> {
  // Extract keywords from query
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (keywords.length === 0) {
    return [];
  }

  // Search by name, brand, category, description
  // SQLite doesn't support full-text search easily, so we use LIKE
  const cached = await prisma.cachedProduct.findMany({
    where: {
      OR: keywords.flatMap((keyword) => [
        { name: { contains: keyword } },
        { brand: { contains: keyword } },
        { category: { contains: keyword } },
        { description: { contains: keyword } },
      ]),
    },
    orderBy: {
      qualityScore: 'desc',
    },
    take: limit * 2, // Get more and filter
  });

  // Score results by how many keywords match
  const scored = cached.map((c) => {
    const text = `${c.name} ${c.brand} ${c.category} ${c.description}`.toLowerCase();
    const matchCount = keywords.filter((k) => text.includes(k)).length;
    return { product: c, matchCount };
  });

  // Sort by match count, then quality
  scored.sort((a, b) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    return b.product.qualityScore - a.product.qualityScore;
  });

  return scored
    .slice(0, limit)
    .map((s) => {
      // Compute match score based on keyword matches
      const matchScore = Math.min(95, 50 + (s.matchCount / keywords.length) * 45);
      return dbToExtractedProduct(s.product as CachedProductDB, matchScore);
    });
}

// Get cache statistics
export async function getCacheStats(): Promise<{
  totalProducts: number;
  byCategory: Record<string, number>;
  avgQualityScore: number;
}> {
  const total = await prisma.cachedProduct.count();

  const categories = await prisma.cachedProduct.groupBy({
    by: ['category'],
    _count: { id: true },
  });

  const avgScore = await prisma.cachedProduct.aggregate({
    _avg: { qualityScore: true },
  });

  const byCategory: Record<string, number> = {};
  for (const cat of categories) {
    byCategory[cat.category] = cat._count.id;
  }

  return {
    totalProducts: total,
    byCategory,
    avgQualityScore: avgScore._avg.qualityScore || 0,
  };
}
