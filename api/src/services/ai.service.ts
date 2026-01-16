import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import type { UserPreferences, ProductWithRating, PageContext, SearchIntent } from '../types/index.js';

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

interface ChatContext {
  preferences: UserPreferences | null;
  pageContext: PageContext | null;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  recentSearches?: string[];
}

function buildSystemPrompt(context: ChatContext): string {
  let prompt = `You are Shopii, an AI shopping assistant that helps users find products based on real user opinions from Reddit, YouTube, expert review sites, and forums.

Your goal is to understand what the user is looking for and help them find the best products. You have access to aggregated reviews and sentiment data from across the internet.

When recommending products:
1. Explain WHY each product matches using real user opinions
2. Highlight pros/cons relevant to their specific use case
3. Be conversational but concise - they're actively shopping
4. Consider their budget and quality preferences
5. If they're on a product page, you can answer specific questions about that product`;

  if (context.preferences) {
    prompt += `

USER PREFERENCES:
- Interested in: ${context.preferences.categories.join(', ') || 'various categories'}
- Budget: $${context.preferences.budgetMin} - $${context.preferences.budgetMax} ${context.preferences.currency}
- Quality preference: ${context.preferences.qualityPreference}`;

    if (context.preferences.brandPreferences.length > 0) {
      prompt += `\n- Preferred brands: ${context.preferences.brandPreferences.join(', ')}`;
    }
    if (context.preferences.brandExclusions.length > 0) {
      prompt += `\n- Avoid brands: ${context.preferences.brandExclusions.join(', ')}`;
    }
  }

  if (context.pageContext) {
    prompt += `

CURRENT PAGE:
- URL: ${context.pageContext.url}`;
    if (context.pageContext.productName) {
      prompt += `\n- Product: ${context.pageContext.productName}`;
    }
    if (context.pageContext.price) {
      prompt += `\n- Price: ${context.pageContext.price}`;
    }
    if (context.pageContext.retailer) {
      prompt += `\n- Retailer: ${context.pageContext.retailer}`;
    }
  }

  if (context.recentSearches && context.recentSearches.length > 0) {
    prompt += `

RECENT SEARCHES:
${context.recentSearches.slice(0, 5).join(', ')}`;
  }

  prompt += `

RESPONSE FORMAT:
- For product recommendations, respond naturally but include clear product names
- Mention the AI rating score (out of 100) when discussing products
- Keep responses under 300 words unless specifically asked for more detail
- Use "Based on reviews from Reddit/YouTube/experts..." to cite sources
- If you can't find good matches, explain why and suggest alternatives`;

  return prompt;
}

export async function detectIntent(message: string): Promise<SearchIntent> {
  const lowerMessage = message.toLowerCase();

  // Simple rule-based intent detection (can be enhanced with LLM)
  const productSearchPatterns = [
    /best\s+(\w+)/i,
    /looking for\s+(a|an)?\s*(\w+)/i,
    /recommend\s+(a|an)?\s*(\w+)/i,
    /find\s+(me)?\s*(a|an)?\s*(\w+)/i,
    /need\s+(a|an)?\s*(\w+)/i,
    /want\s+(a|an)?\s*(\w+)/i,
    /good\s+(\w+)/i,
    /top\s+(\w+)/i,
    /which\s+(\w+)/i,
    /what\s+(\w+)\s+(should|would|do)/i,
  ];

  const comparisonPatterns = [/vs\.?/i, /versus/i, /compare/i, /better/i, /difference between/i];

  const questionPatterns = [
    /what do people think/i,
    /is it worth/i,
    /should i buy/i,
    /how is the/i,
    /any issues with/i,
    /problems with/i,
  ];

  // Check for comparison
  if (comparisonPatterns.some((p) => p.test(lowerMessage))) {
    return { type: 'comparison' };
  }

  // Check for product question
  if (questionPatterns.some((p) => p.test(lowerMessage))) {
    return { type: 'product_question' };
  }

  // Check for product search
  if (productSearchPatterns.some((p) => p.test(lowerMessage))) {
    // Extract potential features and price range
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
  const systemPrompt = buildSystemPrompt(context);

  // Build messages array with conversation history
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Add recent conversation history (last 10 messages)
  for (const msg of context.conversationHistory.slice(-10)) {
    messages.push(msg);
  }

  // Add current message with product context if we have products
  let userMessage = message;
  if (products.length > 0) {
    userMessage += '\n\n[PRODUCT DATA FOR REFERENCE - Use this to inform your response]\n';
    for (const product of products.slice(0, 5)) {
      userMessage += `\n- ${product.name} ($${product.currentPrice}) - AI Rating: ${product.rating?.aiRating || 'N/A'}/100`;
      if (product.rating?.pros.length) {
        userMessage += `\n  Pros: ${product.rating.pros.slice(0, 3).join(', ')}`;
      }
      if (product.rating?.cons.length) {
        userMessage += `\n  Cons: ${product.rating.cons.slice(0, 3).join(', ')}`;
      }
      if (product.rating?.summary) {
        userMessage += `\n  Summary: ${product.rating.summary}`;
      }
    }
  }

  messages.push({ role: 'user', content: userMessage });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.text || "I'm sorry, I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error('Failed to generate response');
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
  const reviewContent = reviews
    .slice(0, 20)
    .map((r) => `[${r.source}]: ${r.content.slice(0, 500)}`)
    .join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `You are analyzing product reviews to extract insights. Be factual and balanced.`,
    messages: [
      {
        role: 'user',
        content: `Analyze these reviews for "${productName}" and extract:
1. A 2-3 sentence summary of the general consensus
2. Top 3-5 pros mentioned
3. Top 3-5 cons mentioned
4. Overall sentiment score from -1 (very negative) to 1 (very positive)

Reviews:
${reviewContent}

Respond in JSON format:
{
  "summary": "...",
  "pros": ["...", "..."],
  "cons": ["...", "..."],
  "sentiment": 0.5
}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock) {
    return {
      summary: 'Unable to generate summary',
      pros: [],
      cons: [],
      sentiment: 0,
    };
  }

  try {
    const parsed = JSON.parse(textBlock.text);
    return {
      summary: parsed.summary || '',
      pros: Array.isArray(parsed.pros) ? parsed.pros : [],
      cons: Array.isArray(parsed.cons) ? parsed.cons : [],
      sentiment: typeof parsed.sentiment === 'number' ? parsed.sentiment : 0,
    };
  } catch {
    return {
      summary: textBlock.text.slice(0, 200),
      pros: [],
      cons: [],
      sentiment: 0,
    };
  }
}
