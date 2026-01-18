// Mode detection service - automatically chooses the right mode for user queries
import OpenAI from 'openai';
import type { ChatMode } from '../types/index.js';

// Lazy initialization
let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

/**
 * Intelligently detects which mode to use based on the user's query
 * Returns: 'ask' | 'search' | 'comparison'
 */
export async function detectMode(
  query: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<Exclude<ChatMode, 'auto'>> {
  // Extract last few messages for context
  const recentHistory = conversationHistory.slice(-4);
  const contextStr = recentHistory.length > 0
    ? `\n\nRecent conversation:\n${recentHistory.map(m => `${m.role}: ${m.content}`).join('\n')}`
    : '';

  const prompt = `Classify this user query into one of three modes:

1. ASK MODE - General questions, clarifications, non-product queries
   Use when:
   - User asks "what is X", "how does X work", "explain X"
   - Questions about features, technology, concepts
   - Comparisons of technologies/features (not specific products)
   - Follow-up questions about previous recommendations
   Examples:
   - "What is OLED technology?"
   - "How does noise cancellation work?"
   - "Can you explain the difference between LCD and OLED?"
   - "What should I look for in a good laptop?"

2. SEARCH MODE - Product searches, recommendations, "best X" queries
   Use when:
   - User wants product recommendations
   - "best X", "good X", "recommend X", "looking for X"
   - Shopping for a specific category
   - Needs help finding products
   Examples:
   - "best headphones under $200"
   - "good laptop for gaming"
   - "recommend a camera for beginners"
   - "looking for wireless earbuds"

3. COMPARISON MODE - User wants to compare specific products
   Use when:
   - Multiple specific product names/models mentioned
   - Explicit comparison request ("compare", "vs", "versus", "which is better")
   - User has narrowed down to 2-3 specific options
   Examples:
   - "compare Sony WH-1000XM5 vs Bose QC45"
   - "which is better between iPhone 15 Pro and Samsung S24"
   - "MacBook Air M2 vs M3 comparison"
   - "show me a comparison of these products"

User query: "${query}"${contextStr}

Respond with ONLY one word: ASK, SEARCH, or COMPARISON`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a query classifier. Your job is to categorize user queries into the appropriate mode.

Key distinctions:
- ASK = Questions about concepts/features/how things work
- SEARCH = Looking for product recommendations
- COMPARISON = Wants to compare specific named products

Be precise. If unclear, default to SEARCH for shopping-related queries, ASK for general questions.`,
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 10,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content?.trim().toUpperCase();

    if (content === 'ASK') return 'ask';
    if (content === 'SEARCH') return 'search';
    if (content === 'COMPARISON') return 'comparison';

    // Fallback: analyze query with simple heuristics
    return detectModeHeuristic(query);
  } catch (error) {
    console.error('Mode detection AI error:', error);
    // Fallback to heuristic detection
    return detectModeHeuristic(query);
  }
}

/**
 * Heuristic-based mode detection (fallback when AI fails)
 */
function detectModeHeuristic(query: string): Exclude<ChatMode, 'auto'> {
  const lowerQuery = query.toLowerCase();

  // Comparison patterns
  const comparisonPatterns = [
    /\bvs\.?\b/i,
    /\bversus\b/i,
    /\bcompare\b/i,
    /\bcomparison\b/i,
    /\bwhich is better\b/i,
    /\b(or|vs) the\b/i,
    /\bdifference between .+ and .+\b/i,
  ];

  if (comparisonPatterns.some(p => p.test(lowerQuery))) {
    return 'comparison';
  }

  // Ask mode patterns (questions about concepts, not products)
  const askPatterns = [
    /^what is\b/i,
    /^how does\b/i,
    /^can you explain\b/i,
    /^tell me about\b/i,
    /^why (is|are|do|does)\b/i,
    /^should i (consider|look for|prioritize)\b/i,
    /\bexplain\b/i,
  ];

  // But NOT if it's asking about specific products
  const hasProductMention = /\b(best|recommend|good|top|buy|looking for|need|want)\s+(a|an|the)?\s*\w+/i.test(lowerQuery);

  if (askPatterns.some(p => p.test(lowerQuery)) && !hasProductMention) {
    return 'ask';
  }

  // Search mode patterns (product recommendations)
  const searchPatterns = [
    /\b(best|recommend|good|top|suggest)\s+(a|an|the)?\s*\w+/i,
    /\blooking for\b/i,
    /\b(need|want) (a|an|the)?\s*\w+/i,
    /\b(buy|purchase|shop for)\b/i,
    /\bunder \$\d+/i,
    /\bbudget\b/i,
  ];

  if (searchPatterns.some(p => p.test(lowerQuery))) {
    return 'search';
  }

  // Default: if query contains product category keywords, assume search
  const productKeywords = [
    'laptop', 'computer', 'headphone', 'earbuds', 'speaker', 'keyboard',
    'mouse', 'monitor', 'chair', 'desk', 'phone', 'camera', 'tv', 'watch',
    'shoes', 'bag', 'backpack', 'mattress', 'blender', 'vacuum', 'bike',
  ];

  if (productKeywords.some(k => lowerQuery.includes(k))) {
    return 'search';
  }

  // Final fallback: ask mode (safe default for unclear queries)
  return 'ask';
}
