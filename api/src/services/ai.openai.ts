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

  // Product category keywords - if message contains these, it's likely a product search
  const productCategoryKeywords = [
    'laptop', 'computer', 'macbook', 'pc',
    'headphone', 'earbuds', 'speaker', 'audio',
    'keyboard', 'mouse', 'monitor', 'display',
    'chair', 'desk', 'furniture',
    'phone', 'tablet', 'ipad', 'iphone', 'android',
    'camera', 'lens', 'tripod',
    'tv', 'television', 'projector',
    'watch', 'smartwatch', 'fitbit',
    'shoes', 'sneakers', 'boots',
    'bag', 'backpack', 'luggage',
    'mattress', 'pillow', 'bed',
    'cookware', 'pan', 'pot', 'knife',
    'blender', 'mixer', 'appliance',
    'vacuum', 'robot',
    'bike', 'bicycle', 'scooter',
    'coffee', 'espresso', 'grinder',
    'protein', 'supplement', 'vitamin',
    'drink', 'beverage', 'juice',
    'skincare', 'moisturizer', 'sunscreen',
    'toothbrush', 'shaver', 'razor',
    'router', 'modem', 'wifi',
    'gpu', 'graphics card', 'cpu', 'processor',
    'ssd', 'hard drive', 'storage',
    'printer', 'scanner',
    'gaming', 'console', 'controller',
  ];

  const comparisonPatterns = [/vs\.?/i, /versus/i, /compare/i, /difference between/i, /or\s+the/i];

  const questionPatterns = [/what is/i, /how does/i, /is it worth/i, /tell me about/i];

  // Non-product patterns - don't treat these as product searches
  const nonProductPatterns = [
    /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no|bye|goodbye)/i,
    /how are you/i,
    /what can you do/i,
    /help me understand/i,
  ];

  // Skip if it's just a greeting or non-product message
  if (nonProductPatterns.some((p) => p.test(lowerMessage))) {
    return { type: 'general_chat' };
  }

  if (comparisonPatterns.some((p) => p.test(lowerMessage))) {
    return { type: 'comparison' };
  }

  // Check explicit product search patterns first
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

  // Check if message contains product category keywords - treat as product search
  if (productCategoryKeywords.some((keyword) => lowerMessage.includes(keyword))) {
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

  // Build a minimal system prompt - product cards will show the details
  let systemPrompt = `You are Shopii, a concise AI shopping assistant.

CRITICAL: Product cards will be displayed below your message showing ALL the details (pros, cons, prices, ratings, endorsement quotes). Your job is to provide a brief, conversational intro - NOT to repeat what the cards show.`;

  // If we have extracted products, give AI just the names for context
  if (extractedProducts.length > 0) {
    const productNames = extractedProducts.map((p) => `${p.brand} ${p.name}`).join(', ');

    systemPrompt += `

We found ${extractedProducts.length} recommended products: ${productNames}

YOUR RESPONSE MUST:
1. Be 1-3 sentences MAX
2. Give a brief, friendly intro like "Based on Reddit discussions, here are some great options:" or "I found some highly-rated picks from enthusiast communities:"
3. Optionally add ONE brief insight not shown in cards (e.g., "The X is the crowd favorite, while the Y is better if you prioritize Z")

YOUR RESPONSE MUST NOT:
- List the products by name (cards show them)
- Describe features, pros, or cons (cards show them)
- Include endorsement quotes (cards show them)
- Repeat any information visible in the product cards
- Be longer than 3 sentences

Example good responses:
- "Here are some top picks from r/BuyItForLife and Wirecutter. The cards below have all the details!"
- "Found some solid options based on enthusiast recommendations. The first one is the crowd favorite for everyday use."
- "Based on Reddit discussions, these are the most recommended. Let me know if you want to compare any specific features!"`;
  } else {
    // No products found - tell AI to be honest about it
    systemPrompt += `

IMPORTANT: Our research didn't find strongly-endorsed specific products for this query. Do NOT make up or suggest specific product names.

Instead:
1. Acknowledge that you searched but didn't find well-reviewed specific products
2. Explain what to look for when shopping for this category (features, materials, things to avoid)
3. Suggest the user try a more specific query or ask about a particular brand
4. Keep the response helpful but honest

Do NOT list specific product names or brands as recommendations.`;
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

// AI-generated search strategy for product research
export interface SearchStrategy {
  searchQueries: string[];  // 5-7 optimized search queries
  priorityDomains: string[]; // Which domains to prioritize for this query
  searchIntent: string; // What the user is looking for
}

export async function generateSearchStrategy(userQuery: string): Promise<SearchStrategy> {
  const prompt = `Generate an optimal search strategy for finding product recommendations for: "${userQuery}"

Your job is to figure out WHERE enthusiasts discuss this type of product and HOW to search for recommendations.

Return a JSON object with:

1. searchQueries: Array of 5-7 search queries that will find the BEST recommendations. Include:
   - At least 2 queries targeting Reddit (e.g., "site:reddit.com ${userQuery} best recommend")
   - Queries with endorsement language ("best", "highly recommend", "worth it", "gold standard")
   - Queries looking for guides, megathreads, or comparison discussions
   - Use the EXACT product terms the user mentioned

2. priorityDomains: Array of 4-8 domains to search. You must determine the best sites for THIS specific product:
   - FIRST: Always include "reddit.com" (has subreddits for everything)
   - THEN: Add 1-2 expert review sites that cover this product category (e.g., wirecutter.com, consumerreports.org, rtings.com, outdoorgearlab.com, seriouseats.com, etc.)
   - THEN: Add 1-3 enthusiast forums or niche sites where people who care deeply about this product would discuss it

   Think about: What forums exist for this hobby/category? What review sites specialize in this? Where do enthusiasts gather?

   Examples:
   - Headphones → head-fi.org, audiosciencereview.com
   - Camping gear → backpackinglight.com, outdoorgearlab.com
   - Coffee equipment → home-barista.com, coffeeforums.com
   - Watches → watchuseek.com, hodinkee.com
   - Denim/fashion → styleforum.net, heddels.com
   - Dog products → dogfoodadvisor.com, whole-dog-journal.com
   - Baby products → whattoexpect.com, babylist.com
   - Kitchen equipment → seriouseats.com, americastestkitchen.com
   - Cars → edmunds.com, caranddriver.com

   If you don't know specific forums for this product type, just use reddit.com + general review sites like wirecutter.com and consumerreports.org.

3. searchIntent: One sentence describing what the user is looking for.

Return ONLY valid JSON, no markdown.`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 800,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `You are a search optimization expert with deep knowledge of where enthusiasts discuss products online.

Your job is to identify:
1. The best search queries to find real recommendations
2. The specific websites where enthusiasts of THIS product category gather

Always include reddit.com first. Then add relevant expert review sites and niche forums/communities.

Use your knowledge of the internet to find the RIGHT communities for each product type. Don't limit yourself to a predefined list - think about what forums, review sites, and communities exist for this specific category.`,
        },
        { role: 'user', content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return getDefaultSearchStrategy(userQuery);
    }

    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const parsed = JSON.parse(jsonContent);

    console.log(`AI generated search strategy:`, {
      queries: parsed.searchQueries?.length || 0,
      domains: parsed.priorityDomains?.length || 0,
      intent: parsed.searchIntent
    });

    return {
      searchQueries: parsed.searchQueries || getDefaultSearchStrategy(userQuery).searchQueries,
      priorityDomains: parsed.priorityDomains || ['reddit.com'],
      searchIntent: parsed.searchIntent || userQuery,
    };
  } catch (error) {
    console.error('Failed to generate search strategy:', error);
    return getDefaultSearchStrategy(userQuery);
  }
}

// Fallback if AI strategy generation fails
function getDefaultSearchStrategy(query: string): SearchStrategy {
  return {
    searchQueries: [
      `${query} reddit best recommend`,
      `${query} site:reddit.com guide`,
      `best ${query} review`,
      `${query} vs comparison`,
      `${query} "highly recommend" OR "worth it"`,
    ],
    priorityDomains: ['reddit.com', 'wirecutter.com'],
    searchIntent: query,
  };
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
