// Mock AI service for development/testing without API keys
import type { UserPreferences, ProductWithRating, PageContext, SearchIntent } from '../types/index.js';

interface ChatContext {
  preferences: UserPreferences | null;
  pageContext: PageContext | null;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  recentSearches?: string[];
}

// Mock responses based on query patterns
const mockResponses: Record<string, string> = {
  headphones: `Great choice looking for headphones! Based on my analysis of thousands of reviews across Reddit, YouTube, and expert sites, here are the top picks:

**Sony WH-1000XM5** (AI Rating: 92/100)
The current king of noise-cancelling headphones. Reddit users love the ANC and call quality improvements. Some note they don't fold flat like the XM4s.

**Apple AirPods Max** (AI Rating: 88/100)
Premium build quality that Apple fans rave about. The price is steep, but the sound quality and seamless Apple ecosystem integration get high marks.

**Bose QuietComfort Ultra** (AI Rating: 87/100)
Legendary comfort that you can wear all day. The ANC is top-tier, though some audiophiles prefer the Sony's sound signature.

Would you like me to compare any of these in more detail?`,

  laptop: `I've analyzed reviews from Reddit, YouTube, and tech experts for the best laptops. Here's what I found:

**MacBook Pro 14" M3** (AI Rating: 94/100)
Incredible performance and battery life. Developers and creatives on Reddit consistently praise it. The only downside is the price point.

**Dell XPS 15** (AI Rating: 89/100)
Great Windows option with a beautiful display. Build quality is excellent, though some users report fan noise under load.

**Framework Laptop 16** (AI Rating: 86/100)
The repairable/upgradeable choice. Tech enthusiasts love the modularity. Battery life is good but not class-leading.

What's your primary use case? I can narrow down the recommendations.`,

  default: `I'd be happy to help you find the perfect product! Based on what you're looking for, I'll search through thousands of real user reviews from Reddit, YouTube, and expert sites to find the best options.

Could you tell me more about:
1. What category of product you're interested in?
2. Your budget range?
3. Any specific features you need?

This will help me give you more targeted recommendations backed by real user experiences!`,
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

  // Check for specific product categories
  if (lowerMessage.includes('headphone') || lowerMessage.includes('earbuds') || lowerMessage.includes('audio')) {
    return mockResponses.headphones!;
  }

  if (lowerMessage.includes('laptop') || lowerMessage.includes('computer') || lowerMessage.includes('macbook')) {
    return mockResponses.laptop!;
  }

  // If we have products from the database, format a response with them
  if (products.length > 0) {
    let response = `Based on reviews from Reddit, YouTube, and expert sites, here are my top recommendations:\n\n`;

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

  // Default response
  return mockResponses.default!;
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
