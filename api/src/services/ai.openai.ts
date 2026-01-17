// AI service using OpenAI GPT API
import OpenAI from 'openai';
import type { UserPreferences, ProductWithRating, PageContext, SearchIntent } from '../types/index.js';

// Lazy initialization to ensure env vars are loaded first
let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

interface ChatContext {
  preferences: UserPreferences | null;
  pageContext: PageContext | null;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  recentSearches?: string[];
}

const SYSTEM_PROMPT = `You are Shopii, an AI shopping assistant that helps users find products based on REAL user opinions from Reddit, forums, and review sites.

CRITICAL: You have access to real-time research from Reddit and forums. Use ONLY the research data provided to make recommendations - do NOT fall back on general knowledge or popular products.

Your personality:
- Friendly but concise - users are shopping, not chatting
- Data-driven - always cite specific sources and quotes from the research
- Honest - if research doesn't have good data, say so
- Quality-focused - prioritize niche/quality brands that enthusiasts recommend over mainstream popular options

When recommending products:
1. Extract specific product names mentioned positively in the research
2. Explain WHY real users recommend each product (quote their reasoning)
3. Prioritize products that multiple sources agree on
4. Highlight niche/quality brands that enthusiasts prefer over mainstream options
5. Be honest about any concerns or trade-offs mentioned

Format guidelines:
- Use **bold** for product names
- Quote specific user opinions when relevant (e.g., "One Reddit user noted...")
- Cite sources (e.g., "According to r/BuyItForLife...")
- Keep responses under 400 words
- End with a follow-up question

IMPORTANT: Do NOT default to mainstream/popular products. If the research shows enthusiasts prefer a niche brand over a popular one, recommend the niche brand.`;

function buildUserContext(context: ChatContext): string {
  let userContext = '';

  if (context.preferences) {
    userContext += '\n\nUSER PREFERENCES:';
    if (context.preferences.categories?.length) {
      userContext += `\n- Interested in: ${context.preferences.categories.join(', ')}`;
    }
    if (context.preferences.budgetMin || context.preferences.budgetMax) {
      userContext += `\n- Budget: $${context.preferences.budgetMin || 0} - $${context.preferences.budgetMax || 'unlimited'} ${context.preferences.currency || 'USD'}`;
    }
    if (context.preferences.qualityPreference) {
      userContext += `\n- Quality preference: ${context.preferences.qualityPreference}`;
    }
    if (context.preferences.brandPreferences?.length) {
      userContext += `\n- Preferred brands: ${context.preferences.brandPreferences.join(', ')}`;
    }
    if (context.preferences.brandExclusions?.length) {
      userContext += `\n- Brands to avoid: ${context.preferences.brandExclusions.join(', ')}`;
    }
  }

  if (context.pageContext) {
    userContext += '\n\nCURRENT PAGE CONTEXT:';
    userContext += `\n- URL: ${context.pageContext.url}`;
    if (context.pageContext.productName) {
      userContext += `\n- Product: ${context.pageContext.productName}`;
    }
    if (context.pageContext.price) {
      userContext += `\n- Price: ${context.pageContext.price}`;
    }
    if (context.pageContext.retailer) {
      userContext += `\n- Retailer: ${context.pageContext.retailer}`;
    }
  }

  return userContext;
}

function buildProductContext(products: ProductWithRating[]): string {
  if (products.length === 0) return '';

  let productContext = '\n\nAVAILABLE PRODUCTS FROM DATABASE:';

  for (const product of products) {
    productContext += `\n\n**${product.name}**`;
    productContext += `\n- Price: $${product.currentPrice || 'N/A'} at ${product.retailer}`;
    productContext += `\n- Category: ${product.category}`;

    if (product.rating) {
      productContext += `\n- AI Rating: ${product.rating.aiRating}/100 (Confidence: ${Math.round((product.rating.confidence || 0) * 100)}%)`;
      if (product.rating.summary) {
        productContext += `\n- Summary: ${product.rating.summary}`;
      }
      if (product.rating.pros?.length) {
        productContext += `\n- Pros: ${product.rating.pros.join(', ')}`;
      }
      if (product.rating.cons?.length) {
        productContext += `\n- Cons: ${product.rating.cons.join(', ')}`;
      }
    }
  }

  productContext += '\n\nUse this product data to make recommendations. Reference the actual ratings and pros/cons.';

  return productContext;
}

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
    /buy\s+(a|an)?\s*(\w+)/i,
    /shopping for/i,
    /suggestions? for/i,
  ];

  const comparisonPatterns = [/vs\.?/i, /versus/i, /compare/i, /better/i, /difference between/i, /or\s+the/i];

  const questionPatterns = [/what is/i, /how does/i, /should i/i, /is it worth/i, /tell me about/i];

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

  if (questionPatterns.some((p) => p.test(lowerMessage))) {
    return { type: 'product_question' };
  }

  return { type: 'general_chat' };
}

export async function generateChatResponse(
  message: string,
  context: ChatContext,
  products: ProductWithRating[]
): Promise<string> {
  const userContext = buildUserContext(context);
  const productContext = buildProductContext(products);

  // Build conversation messages for OpenAI format
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  // Add conversation history (last 10 messages for context)
  const recentHistory = context.conversationHistory.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  // Add current message with context
  const currentMessage = `${message}${userContext}${productContext}`;
  messages.push({
    role: 'user',
    content: currentMessage,
  });

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: messages,
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      return content;
    }

    return "I'm having trouble generating a response. Please try again.";
  } catch (error: any) {
    console.error('OpenAI API error:', error?.message || error);
    console.error('Error type:', error?.constructor?.name);
    console.error('Error status:', error?.status);
    console.error('Error code:', error?.code);

    // Fallback to smart mock response
    return generateFallbackResponse(message, products);
  }
}

// Fallback response when API is unavailable
function generateFallbackResponse(message: string, products: ProductWithRating[]): string {
  const lowerMessage = message.toLowerCase();

  // Determine what the user is looking for
  let category = 'products';
  if (lowerMessage.includes('headphone') || lowerMessage.includes('earbuds') || lowerMessage.includes('audio')) {
    category = 'headphones';
  } else if (lowerMessage.includes('laptop') || lowerMessage.includes('computer') || lowerMessage.includes('macbook')) {
    category = 'laptops';
  } else if (lowerMessage.includes('keyboard')) {
    category = 'keyboards';
  } else if (lowerMessage.includes('mouse')) {
    category = 'mice';
  } else if (lowerMessage.includes('monitor') || lowerMessage.includes('display')) {
    category = 'monitors';
  }

  if (products.length > 0) {
    let response = `Great choice! Based on thousands of reviews from Reddit, YouTube, and expert sites, here are the top ${category}:\n\n`;

    for (const product of products.slice(0, 3)) {
      response += `**${product.name}** (AI Rating: ${product.rating?.aiRating || 'N/A'}/100)\n`;
      response += `$${product.currentPrice || 'Price varies'} at ${product.retailer}\n`;

      if (product.rating?.summary) {
        response += `${product.rating.summary}\n`;
      }

      if (product.rating?.pros?.length) {
        response += `✓ ${product.rating.pros.slice(0, 2).join(' ✓ ')}\n`;
      }

      response += '\n';
    }

    response += 'Would you like me to compare any of these in more detail, or do you have specific requirements?';
    return response;
  }

  // No products found
  if (category === 'products') {
    return `I don't have enough data on that product category yet. My database currently covers tech products like:

• **Audio** - Headphones, earbuds, speakers
• **Computing** - Laptops, keyboards, mice
• **Displays** - Monitors, gaming displays

Is there something in these categories I can help you find?`;
  }

  return `I'm still building my ${category} database. In the meantime, I can help with other tech products like laptops, keyboards, or monitors. What else are you looking for?`;
}

// Product info for response generation
interface ExtractedProductInfo {
  name: string;
  brand: string;
  whyRecommended: string;
  pros: string[];
  cons: string[];
  confidenceScore: number;
  endorsementQuotes: string[];
}

// Generate response using real-time research from Reddit/forums
export async function generateResearchBasedResponse(
  message: string,
  context: ChatContext,
  _researchContext: string, // Kept for API compatibility, products are pre-extracted
  extractedProducts: ExtractedProductInfo[] = []
): Promise<string> {
  const userContext = buildUserContext(context);

  // Build a product-focused system prompt
  let systemPrompt = SYSTEM_PROMPT;

  // If we have extracted products, tell the AI to ONLY discuss those
  if (extractedProducts.length > 0) {
    const productList = extractedProducts.map((p, i) =>
      `${i + 1}. **${p.brand} ${p.name}** (Confidence: ${p.confidenceScore}%)
   - Why: ${p.whyRecommended}
   - Quotes: ${p.endorsementQuotes.slice(0, 2).map(q => `"${q}"`).join(', ')}
   - Pros: ${p.pros.join(', ')}
   - Cons: ${p.cons.join(', ')}`
    ).join('\n\n');

    systemPrompt += `

CRITICAL: You MUST ONLY discuss these ${extractedProducts.length} products that we have verified data for. Do NOT mention any other products.

VERIFIED PRODUCTS TO DISCUSS:
${productList}

Write a helpful response that:
1. Briefly introduces the recommendations (1 sentence)
2. For each product, explain WHY it's recommended using the quotes and reasoning provided
3. Keep it concise - the product cards will show the full details
4. End with a follow-up question

Do NOT list products that aren't in the verified list above.`;
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history
  const recentHistory = context.conversationHistory.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  // Add user message (without the raw research context since products are pre-extracted)
  messages.push({
    role: 'user',
    content: `${message}${userContext}`,
  });

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1000, // Shorter since we just need a summary
      messages: messages,
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      return content;
    }

    return "I'm having trouble analyzing the research. Please try again.";
  } catch (error: any) {
    console.error('OpenAI API error:', error?.message || error);
    return "I encountered an error while researching. Please try again.";
  }
}

export async function generateProductSummary(
  productName: string,
  reviews: Array<{ content: string; source: string; sentiment?: number }>
): Promise<{
  summary: string;
  pros: string[];
  cons: string[];
  sentiment: number;
}> {
  if (reviews.length === 0) {
    return {
      summary: `${productName} - No reviews analyzed yet.`,
      pros: [],
      cons: [],
      sentiment: 0.5,
    };
  }

  const reviewText = reviews
    .slice(0, 20) // Limit to 20 reviews for context window
    .map((r) => `[${r.source}]: ${r.content}`)
    .join('\n\n');

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 512,
      messages: [
        {
          role: 'system',
          content: 'You analyze product reviews and extract insights. Return JSON only, no markdown code blocks.',
        },
        {
          role: 'user',
          content: `Analyze these reviews for "${productName}" and return a JSON object with:
- summary: 1-2 sentence summary of overall sentiment
- pros: array of 3-5 specific pros mentioned
- cons: array of 2-4 specific cons mentioned
- sentiment: number from 0 to 1 (0 = very negative, 1 = very positive)

Reviews:
${reviewText}

Return only valid JSON.`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return {
        summary: parsed.summary || '',
        pros: parsed.pros || [],
        cons: parsed.cons || [],
        sentiment: parsed.sentiment || 0.5,
      };
    }
  } catch (error) {
    console.error('Failed to generate product summary:', error);
  }

  return {
    summary: `${productName} has mixed reviews from users.`,
    pros: ['Well-reviewed by some users'],
    cons: ['Some users report issues'],
    sentiment: 0.5,
  };
}
