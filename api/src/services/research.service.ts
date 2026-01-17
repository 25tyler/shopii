// Product research service - searches Reddit, forums, and reviews for real recommendations
import { tavily } from '@tavily/core';
import { generateSearchStrategy } from './ai.openai.js';

// Lazy initialization
let _tavily: ReturnType<typeof tavily> | null = null;

function getTavily() {
  if (!_tavily) {
    _tavily = tavily({ apiKey: process.env.TAVILY_API_KEY! });
  }
  return _tavily;
}

interface ProductMention {
  name: string;
  mentions: number;
  sources: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  quotes: string[];
}

interface ResearchResult {
  query: string;
  recommendedProducts: ProductMention[];
  rawSources: Array<{
    title: string;
    url: string;
    content: string;
  }>;
  summary: string;
}



// Step 1: Search Reddit/forums for what people actually recommend
export async function searchForRecommendations(query: string): Promise<ResearchResult> {
  const client = getTavily();

  // Have AI generate optimized search queries and select relevant domains
  const strategy = await generateSearchStrategy(query);

  console.log(`AI search strategy for "${query}":`, {
    queries: strategy.searchQueries.length,
    domains: strategy.priorityDomains.length,
    intent: strategy.searchIntent,
  });

  const allResults: Array<{ title: string; url: string; content: string }> = [];
  const seenUrls = new Set<string>();

  // Use AI's priority domains - these are tailored to the query
  // If AI returns empty or just reddit, don't restrict domains at all
  const domainsToSearch = strategy.priorityDomains.length > 1
    ? strategy.priorityDomains
    : undefined; // undefined = search all domains

  console.log(`Searching domains:`, domainsToSearch || 'all (no restriction)');

  // Search using AI-generated queries
  for (const searchQuery of strategy.searchQueries) {
    try {
      const response = await client.search(searchQuery, {
        searchDepth: 'advanced',
        maxResults: 10,
        includeAnswer: false,
        ...(domainsToSearch && { includeDomains: domainsToSearch }),
      });

      if (response.results) {
        for (const result of response.results) {
          // Deduplicate by URL
          if (seenUrls.has(result.url)) continue;
          seenUrls.add(result.url);

          // No scoring here - let the AI extraction service evaluate quality
          allResults.push({
            title: result.title,
            url: result.url,
            content: result.content,
          });
        }
      }
    } catch (error) {
      console.error(`Search failed for "${searchQuery}":`, error);
    }
  }

  console.log(`Found ${allResults.length} total sources from AI-generated queries`);

  // If we got very few results, try broader fallback searches
  if (allResults.length < 5) {
    console.log(`Low results (${allResults.length}), trying broader fallback searches...`);

    const fallbackQueries = [
      `best ${query} reddit`,
      `${query} recommendation`,
      `${query} review`,
    ];

    for (const fallbackQuery of fallbackQueries) {
      try {
        const response = await client.search(fallbackQuery, {
          searchDepth: 'advanced',
          maxResults: 10,
          includeAnswer: false,
          // No domain restriction for fallback - search everywhere
        });

        if (response.results) {
          for (const result of response.results) {
            if (seenUrls.has(result.url)) continue;
            seenUrls.add(result.url);
            allResults.push({
              title: result.title,
              url: result.url,
              content: result.content,
            });
          }
        }
      } catch (error) {
        console.error(`Fallback search failed for "${fallbackQuery}":`, error);
      }
    }

    console.log(`After fallback: ${allResults.length} total sources`);
  }

  // Return all results for AI to evaluate - no pre-scoring needed
  // The extraction AI will determine which sources have strong recommendations
  return {
    query,
    recommendedProducts: [], // Will be extracted by AI
    rawSources: allResults.slice(0, 25), // Give AI more sources to analyze
    summary: '',
  };
}

// Step 2: Research specific products that were mentioned
export async function researchProduct(productName: string): Promise<{
  name: string;
  sources: Array<{ url: string; content: string; sentiment: string }>;
  overallSentiment: string;
}> {
  const client = getTavily();

  try {
    const response = await client.search(`"${productName}" review discussion`, {
      searchDepth: 'advanced',
      maxResults: 8,
      includeAnswer: false,
    });

    const sources = (response.results || []).map((r) => ({
      url: r.url,
      content: r.content,
      sentiment: 'neutral', // Will be analyzed by AI
    }));

    return {
      name: productName,
      sources,
      overallSentiment: 'neutral',
    };
  } catch (error) {
    console.error(`Failed to research ${productName}:`, error);
    return {
      name: productName,
      sources: [],
      overallSentiment: 'unknown',
    };
  }
}

// Full research pipeline: search for recommendations, then research each product
export async function conductProductResearch(userQuery: string): Promise<{
  sources: Array<{ title: string; url: string; content: string }>;
  context: string;
}> {
  // Step 1: Find what people are recommending
  const recommendations = await searchForRecommendations(userQuery);

  // Build context for AI to analyze - include more content from each source
  let context = `USER QUERY: "${userQuery}"\n\n`;
  context += `=== RESEARCH FINDINGS FROM REDDIT, FORUMS, AND EXPERT REVIEW SITES ===\n\n`;

  // Include more sources and more content from each
  for (const source of recommendations.rawSources.slice(0, 15)) {
    const sourceType = getSourceType(source.url);
    context += `--- [${sourceType}] ${source.title} ---\n`;
    context += `URL: ${source.url}\n`;
    context += `${source.content.slice(0, 3000)}\n\n`; // Increased to 3000 for richer context
  }

  context += `\n=== CRITICAL ANALYSIS INSTRUCTIONS ===

You are identifying the ABSOLUTE BEST products based on this research. Apply these strict criteria:

VALIDATION REQUIREMENTS:
1. Only recommend products that have STRONG ENDORSEMENT signals in the research:
   - Multiple sources mentioning it positively
   - Phrases like "best", "highly recommend", "gold standard", "can't go wrong"
   - Enthusiast communities specifically calling it out as top-tier

2. EVIDENCE SCORING (products must have at least 2 of these):
   - Mentioned by 2+ independent sources
   - Called "the best" or similar superlative
   - Recommended by expert reviewers (Wirecutter, RTINGS, etc.)
   - Has enthusiast community consensus

3. REJECTION CRITERIA - Do NOT include products that:
   - Are only mentioned once without strong endorsement
   - Are just "mentioned" but not recommended
   - Are described with qualifiers like "okay", "decent", "budget option" (unless user asked for budget)
   - Have significant criticisms without being defended

4. QUALITY OVER QUANTITY:
   - Return 3-5 STRONGLY VALIDATED products rather than 5 weakly mentioned ones
   - It's better to return fewer high-confidence picks than pad the list

5. For each product, you MUST cite:
   - How many sources mentioned it
   - What SPECIFIC phrases of endorsement were used
   - What the consensus pros/cons are across sources

PRIORITIZATION:
- Products with enthusiast community consensus > Expert picks alone > Single mentions
- Niche quality brands over mainstream if the research supports it
- Specific model recommendations over generic brand mentions`;

  return {
    sources: recommendations.rawSources,
    context,
  };
}

// Helper to categorize source type
function getSourceType(url: string): string {
  if (url.includes('reddit.com')) return 'REDDIT';
  if (url.includes('head-fi.org') || url.includes('styleforum.net') || url.includes('avsforum.com')) return 'ENTHUSIAST FORUM';
  if (url.includes('wirecutter') || url.includes('rtings.com') || url.includes('outdoorgearlab')) return 'EXPERT REVIEW';
  if (url.includes('youtube.com')) return 'YOUTUBE';
  return 'REVIEW SITE';
}

// Parallel product enrichment - searches for specific product info to enhance details
export interface ProductEnrichmentResult {
  productName: string;
  additionalSources: Array<{
    title: string;
    url: string;
    content: string;
    sourceType: string;
  }>;
  enrichmentContext: string;
}

// Search for specific product details (used to enrich products after initial extraction)
export async function enrichProductDetails(
  productName: string,
  brand: string
): Promise<ProductEnrichmentResult> {
  const client = getTavily();
  const fullName = brand ? `${brand} ${productName}` : productName;

  const searchQueries = [
    `"${fullName}" review pros cons`,
    `"${fullName}" reddit recommendation`,
  ];

  const results: Array<{ title: string; url: string; content: string; sourceType: string }> = [];
  const seenUrls = new Set<string>();

  // Run searches in parallel for speed
  const searchPromises = searchQueries.map(async (query) => {
    try {
      const response = await client.search(query, {
        searchDepth: 'basic', // Use basic for speed
        maxResults: 5,
        includeAnswer: false,
      });
      return response.results || [];
    } catch (error) {
      console.error(`Enrichment search failed for "${query}":`, error);
      return [];
    }
  });

  const searchResults = await Promise.all(searchPromises);

  for (const resultSet of searchResults) {
    for (const result of resultSet) {
      if (seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);
      results.push({
        title: result.title,
        url: result.url,
        content: result.content,
        sourceType: getSourceType(result.url),
      });
    }
  }

  // Build enrichment context
  let enrichmentContext = `\n=== ADDITIONAL DETAILS FOR ${fullName.toUpperCase()} ===\n\n`;
  for (const source of results.slice(0, 4)) {
    enrichmentContext += `[${source.sourceType}] ${source.title}\n`;
    enrichmentContext += `${source.content.slice(0, 1500)}\n\n`;
  }

  return {
    productName: fullName,
    additionalSources: results,
    enrichmentContext,
  };
}

// Enrich multiple products in parallel (called after initial extraction)
export async function enrichProducts(
  products: Array<{ name: string; brand: string }>
): Promise<Map<string, ProductEnrichmentResult>> {
  const enrichmentMap = new Map<string, ProductEnrichmentResult>();

  // Only enrich up to 5 products to limit latency
  const productsToEnrich = products.slice(0, 5);

  console.log(`Enriching ${productsToEnrich.length} products in parallel...`);

  const enrichPromises = productsToEnrich.map(async (product) => {
    const result = await enrichProductDetails(product.name, product.brand);
    return { key: `${product.brand} ${product.name}`.toLowerCase(), result };
  });

  const results = await Promise.all(enrichPromises);

  for (const { key, result } of results) {
    enrichmentMap.set(key, result);
  }

  console.log(`Enrichment complete for ${enrichmentMap.size} products`);

  return enrichmentMap;
}
