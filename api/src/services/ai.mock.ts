// Mock AI service for development/testing without API keys
import type { UserPreferences, ProductWithRating, PageContext, SearchIntent } from '../types/index.js';

interface ChatContext {
  preferences: UserPreferences | null;
  pageContext: PageContext | null;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  recentSearches?: string[];
}

// Categories we have products for
const SUPPORTED_CATEGORIES = ['headphones', 'audio', 'laptop', 'computer', 'keyboard', 'mouse', 'monitor', 'peripherals'];

// Mock responses based on query patterns
const mockResponses: Record<string, string> = {
  headphones: `Great choice looking for headphones! Based on my analysis of thousands of reviews across Reddit, YouTube, and expert sites, here are the top picks:`,

  laptop: `I've analyzed reviews from Reddit, YouTube, and tech experts for the best laptops. Here's what I found:`,

  keyboard: `Looking for a keyboard! Based on r/MechanicalKeyboards and expert reviews, here are the top recommendations:`,

  mouse: `I've gathered insights from Reddit and tech reviewers on the best mice available:`,

  monitor: `Based on reviews from r/Monitors, RTINGS, and tech experts, here are the top displays:`,

  default: `I'd be happy to help you find the perfect product! Based on what you're looking for, I'll search through thousands of real user reviews from Reddit, YouTube, and expert sites to find the best options.

Could you tell me more about:
1. What category of product you're interested in?
2. Your budget range?
3. Any specific features you need?

This will help me give you more targeted recommendations backed by real user experiences!`,

  no_products: `I don't have enough data on that product category yet. My database currently covers tech products like:

• **Audio** - Headphones, earbuds, speakers
• **Computing** - Laptops, keyboards, mice
• **Displays** - Monitors, gaming displays

Is there something in these categories I can help you find?`,
};

export async function detectIntent(message: string): Promise<SearchIntent> {
  const lowerMessage = message.toLowerCase();

  const productSearchPatterns = [
    /best\s+(\w+)/i,
    /looking for\s+(a|an)?\s*(\w+)/i,
    /recommend\s+(a|an)?\s*(\w+)/i,
    /find\s+(me)?\s*(a|an)?\s*(\w+)/i,
    /need\s+(a|an)?\s*(\w+)/i,
    /want\s+(a|an)?\s*(\w+)/i,
    /good\s+(\w+)/i,
    /top\s+(\w+)/i,
  ];

  const comparisonPatterns = [/vs\.?/i, /versus/i, /compare/i, /better/i, /difference between/i];

  if (comparisonPatterns.some((p) => p.test(lowerMessage))) {
    return { type: 'comparison' };
  }

  if (productSearchPatterns.some((p) => p.test(lowerMessage))) {
    const priceMatch = lowerMessage.match(/under\s*\$?(\d+)/i) || lowerMessage.match(/\$(\d+)\s*-\s*\$?(\d+)/i);
    const priceRange = priceMatch
      ? {
          min: priceMatch[2] ? parseInt(priceMatch[1]!) : 0,
          max: parseInt(priceMatch[2] || priceMatch[1]!),
        }
      : undefined;

    return {
      type: 'product_search',
      priceRange,
    };
  }

  return { type: 'general_chat' };
}

export async function generateChatResponse(
  message: string,
  context: ChatContext,
  products: ProductWithRating[]
): Promise<string> {
  // Simulate some latency
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));

  const lowerMessage = message.toLowerCase();

  // Determine category from message
  let category: string | null = null;
  if (lowerMessage.includes('headphone') || lowerMessage.includes('earbuds') || lowerMessage.includes('audio')) {
    category = 'headphones';
  } else if (lowerMessage.includes('laptop') || lowerMessage.includes('computer') || lowerMessage.includes('macbook')) {
    category = 'laptop';
  } else if (lowerMessage.includes('keyboard')) {
    category = 'keyboard';
  } else if (lowerMessage.includes('mouse')) {
    category = 'mouse';
  } else if (lowerMessage.includes('monitor') || lowerMessage.includes('display')) {
    category = 'monitor';
  }

  // If we have matching products, build response with them
  if (products.length > 0) {
    let response = mockResponses[category || 'default'] || mockResponses.default!;
    response += '\n\n';

    for (const product of products.slice(0, 3)) {
      response += `**${product.name}** (AI Rating: ${product.rating?.aiRating || 'N/A'}/100)\n`;
      response += `$${product.currentPrice || 'Price varies'} at ${product.retailer}\n`;

      if (product.rating?.summary) {
        response += `${product.rating.summary}\n`;
      }

      if (product.rating?.pros && product.rating.pros.length > 0) {
        response += `Pros: ${product.rating.pros.slice(0, 2).join(', ')}\n`;
      }

      response += '\n';
    }

    response += `Would you like more details on any of these options?`;
    return response;
  }

  // No products found - check if it's a category we don't support
  if (category === null) {
    // Unknown category like "vitamin D supplement"
    return mockResponses.no_products!;
  }

  // Known category but no products in DB
  return mockResponses[category] + '\n\n*No products found in this category yet. Try searching for headphones, laptops, or keyboards!*';
}

export async function generateProductSummary(
  productName: string,
  _reviews: Array<{ content: string; source: string; sentiment?: number }>
): Promise<{
  summary: string;
  pros: string[];
  cons: string[];
  sentiment: number;
}> {
  // Return mock data for development
  return {
    summary: `${productName} is highly rated by users for its quality and value. Reviews are generally positive with some minor concerns about specific features.`,
    pros: ['Great build quality', 'Excellent value for money', 'Reliable performance'],
    cons: ['Could be more affordable', 'Some users report minor issues'],
    sentiment: 0.7,
  };
}
