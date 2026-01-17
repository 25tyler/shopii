// Preference learning service - learns user interests from search behavior
import { prisma } from '../config/prisma.js';
import { ExtractedProduct } from './product-extraction.service.js';

interface LearnedCategory {
  category: string;
  weight: number; // 0-100, higher = more interested
  lastSeen: string; // ISO date string
  searchCount: number;
}

interface LearnedBrand {
  brand: string;
  weight: number;
  lastSeen: string;
  searchCount: number;
}

// Decay factor for old interests (per day)
const DECAY_FACTOR = 0.95;
const MAX_CATEGORIES = 15;
const MAX_BRANDS = 20;
const MAX_RECENT_SEARCHES = 20;

// Learn from a user's search query and the products that were returned
export async function learnFromSearch(
  userId: string,
  searchQuery: string,
  products: ExtractedProduct[]
): Promise<void> {
  try {
    // Get current preferences
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      // Create preferences if they don't exist
      await prisma.userPreferences.create({
        data: {
          userId,
          learnedCategories: '[]',
          learnedBrands: '[]',
          recentSearches: '[]',
        },
      });
      return learnFromSearch(userId, searchQuery, products);
    }

    // Parse existing learned data
    let learnedCategories: LearnedCategory[] = [];
    let learnedBrands: LearnedBrand[] = [];
    let recentSearches: string[] = [];

    try {
      const catData = prefs.learnedCategories;
      learnedCategories = typeof catData === 'string' ? JSON.parse(catData) : (catData as LearnedCategory[]) || [];
    } catch {
      learnedCategories = [];
    }

    try {
      const brandData = prefs.learnedBrands;
      learnedBrands = typeof brandData === 'string' ? JSON.parse(brandData) : (brandData as LearnedBrand[]) || [];
    } catch {
      learnedBrands = [];
    }

    try {
      const searchData = prefs.recentSearches;
      recentSearches = typeof searchData === 'string' ? JSON.parse(searchData) : (searchData as string[]) || [];
    } catch {
      recentSearches = [];
    }

    const now = new Date().toISOString();

    // Apply time decay to existing interests
    learnedCategories = applyDecay(learnedCategories);
    learnedBrands = applyDecay(learnedBrands);

    // Extract categories and brands from returned products
    const categoriesFromProducts = new Map<string, number>();
    const brandsFromProducts = new Map<string, number>();

    for (const product of products) {
      if (product.category) {
        const cat = product.category.toLowerCase();
        // Weight by match score - higher match = more relevant to user's interest
        const weight = (product.matchScore || 70) / 100;
        categoriesFromProducts.set(cat, (categoriesFromProducts.get(cat) || 0) + weight);
      }
      if (product.brand) {
        const brand = product.brand.toLowerCase();
        const weight = (product.matchScore || 70) / 100;
        brandsFromProducts.set(brand, (brandsFromProducts.get(brand) || 0) + weight);
      }
    }

    // Update learned categories
    for (const [category, addedWeight] of categoriesFromProducts) {
      const existing = learnedCategories.find((c) => c.category === category);
      if (existing) {
        // Boost existing interest
        existing.weight = Math.min(100, existing.weight + addedWeight * 10);
        existing.lastSeen = now;
        existing.searchCount++;
      } else {
        // Add new interest
        learnedCategories.push({
          category,
          weight: Math.min(100, addedWeight * 15), // Initial weight based on relevance
          lastSeen: now,
          searchCount: 1,
        });
      }
    }

    // Update learned brands
    for (const [brand, addedWeight] of brandsFromProducts) {
      const existing = learnedBrands.find((b) => b.brand === brand);
      if (existing) {
        existing.weight = Math.min(100, existing.weight + addedWeight * 8);
        existing.lastSeen = now;
        existing.searchCount++;
      } else {
        learnedBrands.push({
          brand,
          weight: Math.min(100, addedWeight * 12),
          lastSeen: now,
          searchCount: 1,
        });
      }
    }

    // Sort and trim
    learnedCategories.sort((a, b) => b.weight - a.weight);
    learnedCategories = learnedCategories.slice(0, MAX_CATEGORIES);

    learnedBrands.sort((a, b) => b.weight - a.weight);
    learnedBrands = learnedBrands.slice(0, MAX_BRANDS);

    // Update recent searches (dedupe and keep most recent)
    recentSearches = [searchQuery, ...recentSearches.filter((s) => s !== searchQuery)].slice(
      0,
      MAX_RECENT_SEARCHES
    );

    // Save updated preferences
    await prisma.userPreferences.update({
      where: { userId },
      data: {
        learnedCategories: JSON.stringify(learnedCategories),
        learnedBrands: JSON.stringify(learnedBrands),
        recentSearches: JSON.stringify(recentSearches),
      },
    });

    console.log(
      `[PreferenceLearning] Updated preferences for user ${userId}: ${learnedCategories.length} categories, ${learnedBrands.length} brands`
    );
  } catch (error) {
    console.error('[PreferenceLearning] Failed to learn from search:', error);
    // Don't throw - this is a background operation that shouldn't break the main flow
  }
}

// Apply time decay to interests
function applyDecay<T extends { weight: number; lastSeen: string }>(items: T[]): T[] {
  const now = Date.now();
  return items
    .map((item) => {
      const daysSinceLastSeen = (now - new Date(item.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
      const decayedWeight = item.weight * Math.pow(DECAY_FACTOR, daysSinceLastSeen);
      return { ...item, weight: Math.max(1, decayedWeight) };
    })
    .filter((item) => item.weight >= 5); // Remove very low weight items
}

// Get user's learned interests for personalization
export async function getLearnedPreferences(userId: string): Promise<{
  categories: LearnedCategory[];
  brands: LearnedBrand[];
  recentSearches: string[];
}> {
  try {
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      return { categories: [], brands: [], recentSearches: [] };
    }

    let categories: LearnedCategory[] = [];
    let brands: LearnedBrand[] = [];
    let recentSearches: string[] = [];

    try {
      const catData = prefs.learnedCategories;
      categories = typeof catData === 'string' ? JSON.parse(catData) : (catData as LearnedCategory[]) || [];
    } catch {
      categories = [];
    }

    try {
      const brandData = prefs.learnedBrands;
      brands = typeof brandData === 'string' ? JSON.parse(brandData) : (brandData as LearnedBrand[]) || [];
    } catch {
      brands = [];
    }

    try {
      const searchData = prefs.recentSearches;
      recentSearches = typeof searchData === 'string' ? JSON.parse(searchData) : (searchData as string[]) || [];
    } catch {
      recentSearches = [];
    }

    // Apply decay before returning
    categories = applyDecay(categories);
    brands = applyDecay(brands);

    return { categories, brands, recentSearches };
  } catch (error) {
    console.error('[PreferenceLearning] Failed to get learned preferences:', error);
    return { categories: [], brands: [], recentSearches: [] };
  }
}

// Get top categories for suggestions
export function getTopCategories(categories: LearnedCategory[], limit: number = 5): string[] {
  return categories
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((c) => c.category);
}

// Get top brands for suggestions
export function getTopBrands(brands: LearnedBrand[], limit: number = 5): string[] {
  return brands
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((b) => b.brand);
}
