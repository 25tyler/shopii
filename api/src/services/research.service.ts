// Product research service - searches Reddit, forums, and reviews for real recommendations
import { tavily } from '@tavily/core';

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

// Comprehensive list of forums and community sites for product research
const COMMUNITY_DOMAINS = [
  // General
  'reddit.com', // Covers ALL subreddits - r/BuyItForLife, r/frugal, r/onebag, etc.

  // Tech & Electronics
  'head-fi.org', // Audiophile headphones
  'audiosciencereview.com', // Audio measurements and reviews
  'avsforum.com', // Home theater, AV equipment
  'gearspace.com', // Pro audio equipment
  'dpreview.com', // Cameras and photography
  'fredmiranda.com', // Photography forums
  'mu-43.com', // Mirrorless cameras
  'overclock.net', // PC hardware, overclocking
  'hardforum.com', // PC hardware
  'linustechtips.com', // Tech discussions
  'notebookreview.com', // Laptops
  'anandtech.com', // Tech reviews

  // Fashion & Clothing
  'styleforum.net', // Men's fashion, quality clothing
  'askandyaboutclothes.com', // Men's clothing
  'thefedoralounge.com', // Vintage fashion, hats
  'denimio.com', // Raw denim
  'rawrdenim.com', // Denim reviews

  // Outdoor & Sports
  'backpackinglight.com', // Ultralight hiking gear
  'whiteblaze.net', // Hiking, Appalachian Trail
  'candlepowerforums.com', // Flashlights
  'bladeforums.com', // Knives, EDC
  'edcforums.com', // Everyday carry
  'bikeforums.net', // Cycling
  'mtbr.com', // Mountain biking
  'thetruthaboutcars.com', // Automotive
  'bobistheoilguy.com', // Automotive maintenance

  // Home & Kitchen
  'gardenforums.com', // Gardening
  'cookingforums.net', // Cooking equipment
  'houzz.com', // Home improvement
  'contractortalk.com', // Tools, construction

  // Health & Fitness
  't-nation.com', // Fitness, supplements
  'bodybuilding.com', // Fitness forums
  'longecity.org', // Supplements, longevity

  // Hobbies
  'watchuseek.com', // Watches
  'rolexforums.com', // Luxury watches
  'fountainpennetwork.com', // Fountain pens
  'ar15.com', // Firearms
  'thehighroad.org', // Firearms
  'homebrewtalk.com', // Homebrewing
  'coffeeforums.com', // Coffee equipment
  'home-barista.com', // Espresso machines

  // Gaming
  'resetera.com', // Gaming discussions
  'neogaf.com', // Gaming
  'pcgamer.com', // PC gaming

  // International
  'forums.whirlpool.net.au', // Australian tech
  'redflagdeals.com', // Canadian deals/reviews
  'hukd.com', // UK deals/reviews
];

// Expert review sites (separate from forums - these have professional reviews)
const EXPERT_REVIEW_DOMAINS = [
  'wirecutter.com',
  'rtings.com',
  'cnet.com',
  'techradar.com',
  'tomsguide.com',
  'pcmag.com',
  'theverge.com',
  'engadget.com',
  'outdoorgearlab.com',
  'runnersworld.com',
  'bicycling.com',
  'seriouseats.com',
  'americastestkitchen.com',
];

// Step 1: Search Reddit/forums for what people actually recommend
export async function searchForRecommendations(query: string): Promise<ResearchResult> {
  const client = getTavily();

  // More targeted search queries - focus on finding actual "best" recommendations
  const searchQueries = [
    // Reddit-specific searches for strong recommendations
    `"${query}" site:reddit.com "best" OR "highly recommend" OR "can't go wrong"`,
    `${query} reddit "buy it for life" OR "worth every penny" OR "top pick"`,
    `${query} reddit megathread OR guide OR recommendation`,
    // Forum-specific searches
    `best ${query} forum "hands down" OR "no contest" OR "gold standard"`,
    `${query} enthusiast recommendation "the best" OR "my favorite"`,
    // Comparative searches
    `${query} comparison "winner" OR "beats" OR "nothing comes close"`,
  ];

  const allResults: Array<{ title: string; url: string; content: string; score: number }> = [];
  const seenUrls = new Set<string>();

  // Search community forums with more queries and results
  for (const searchQuery of searchQueries) {
    try {
      const response = await client.search(searchQuery, {
        searchDepth: 'advanced',
        maxResults: 8, // Increased from 5
        includeAnswer: false,
        includeDomains: COMMUNITY_DOMAINS,
      });

      if (response.results) {
        for (const result of response.results) {
          // Deduplicate by URL
          if (seenUrls.has(result.url)) continue;
          seenUrls.add(result.url);

          // Score results based on relevance signals
          let score = 0;
          const contentLower = result.content.toLowerCase();
          const titleLower = result.title.toLowerCase();

          // Strong recommendation signals
          if (contentLower.includes('best') || contentLower.includes('highly recommend')) score += 3;
          if (contentLower.includes('gold standard') || contentLower.includes('buy it for life')) score += 4;
          if (contentLower.includes('hands down') || contentLower.includes('no contest')) score += 4;
          if (contentLower.includes('worth every penny') || contentLower.includes('can\'t go wrong')) score += 3;

          // Reddit-specific signals
          if (result.url.includes('reddit.com')) {
            score += 2;
            if (titleLower.includes('guide') || titleLower.includes('megathread')) score += 3;
          }

          // Expert forum signals
          if (result.url.includes('head-fi.org') || result.url.includes('styleforum.net')) score += 2;
          if (result.url.includes('audiosciencereview') || result.url.includes('rtings')) score += 3;

          allResults.push({
            title: result.title,
            url: result.url,
            content: result.content,
            score,
          });
        }
      }
    } catch (error) {
      console.error(`Search failed for "${searchQuery}":`, error);
    }
  }

  // Search expert review sites with more results
  try {
    const expertResponse = await client.search(`best ${query} review 2024 2023`, {
      searchDepth: 'advanced', // Upgraded from basic
      maxResults: 6, // Increased from 3
      includeAnswer: false,
      includeDomains: EXPERT_REVIEW_DOMAINS,
    });

    if (expertResponse.results) {
      for (const result of expertResponse.results) {
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);

        // Expert reviews get high base score
        let score = 5;
        if (result.url.includes('wirecutter') || result.url.includes('rtings')) score += 3;

        allResults.push({
          title: result.title,
          url: result.url,
          content: result.content,
          score,
        });
      }
    }
  } catch (error) {
    console.error('Expert review search failed:', error);
  }

  // Sort by score and take top results
  allResults.sort((a, b) => b.score - a.score);

  return {
    query,
    recommendedProducts: [], // Will be extracted by AI
    rawSources: allResults.slice(0, 15).map(({ title, url, content }) => ({ title, url, content })),
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
  for (const source of recommendations.rawSources.slice(0, 12)) {
    const sourceType = getSourceType(source.url);
    context += `--- [${sourceType}] ${source.title} ---\n`;
    context += `URL: ${source.url}\n`;
    context += `${source.content.slice(0, 2000)}\n\n`; // Increased from 1500
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
