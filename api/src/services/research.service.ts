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
  'heddels.com', // Raw denim and workwear
  'putthison.com', // Quality menswear
  'dieworkwear.com', // Quality basics and workwear
  'permanentstyle.com', // Classic menswear
  'ironheart.co.uk/forum', // Heavy denim
  'supertalk.superfuture.com', // Streetwear and fashion

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
  // Tech
  'wirecutter.com',
  'rtings.com',
  'cnet.com',
  'techradar.com',
  'tomsguide.com',
  'pcmag.com',
  'theverge.com',
  'engadget.com',
  // Outdoor
  'outdoorgearlab.com',
  'switchbacktravel.com',
  'cleverhiker.com',
  'runnersworld.com',
  'bicycling.com',
  // Home & Kitchen
  'seriouseats.com',
  'americastestkitchen.com',
  'consumerreports.org',
  // Fashion & Lifestyle
  'gearpatrol.com',
  'gq.com',
  'esquire.com',
  'menshealth.com',
  'highsnobiety.com',
  'hypebeast.com',
];

// Detect category from query to customize search approach
function detectQueryCategory(query: string): 'tech' | 'fashion' | 'home' | 'outdoor' | 'fitness' | 'general' {
  const q = query.toLowerCase();

  // Fashion/Apparel keywords
  if (q.match(/\b(shirt|tee|t-shirt|pants|jeans|sweatpants|hoodie|jacket|coat|shoes|boots|sneakers|dress|clothing|apparel|wear|denim|cotton|wool|cashmere|leather)\b/)) {
    return 'fashion';
  }

  // Tech keywords
  if (q.match(/\b(headphones|earbuds|laptop|phone|monitor|keyboard|mouse|speaker|camera|tv|computer|pc|gaming|audio|wireless|bluetooth)\b/)) {
    return 'tech';
  }

  // Home/Kitchen keywords
  if (q.match(/\b(kitchen|cookware|pan|pot|knife|appliance|vacuum|mattress|pillow|sheets|furniture|blender|coffee|espresso)\b/)) {
    return 'home';
  }

  // Outdoor/Sports keywords
  if (q.match(/\b(hiking|camping|backpack|tent|bike|cycling|running|fitness|gym|outdoor|trail|climbing)\b/)) {
    return 'outdoor';
  }

  // Fitness keywords
  if (q.match(/\b(workout|exercise|protein|supplement|weights|yoga|gym equipment)\b/)) {
    return 'fitness';
  }

  return 'general';
}

// Generate search queries tailored to the category
function generateSearchQueries(query: string, category: string): string[] {
  switch (category) {
    case 'fashion':
      return [
        // Fashion-specific subreddits and language
        `${query} site:reddit.com/r/malefashionadvice OR site:reddit.com/r/frugalmalefashion`,
        `${query} reddit "go-to" OR "favorite" OR "love these"`,
        `${query} reddit "quality" OR "well made" OR "holds up"`,
        `best ${query} "buy it for life" OR "worth the money"`,
        `${query} styleforum OR heddels recommendation`,
        `${query} review "comfortable" OR "fits great" OR "perfect"`,
        // Brand discovery
        `${query} reddit "underrated" OR "hidden gem" OR "slept on"`,
      ];

    case 'tech':
      return [
        // Tech-specific language
        `${query} reddit "best" OR "highly recommend" OR "can't go wrong"`,
        `${query} reddit "gold standard" OR "hands down" OR "no contest"`,
        `${query} site:reddit.com megathread OR guide`,
        `${query} head-fi OR audiosciencereview recommendation`,
        `${query} "worth every penny" OR "best in class"`,
        `${query} comparison "winner" OR "beats" OR "nothing comes close"`,
      ];

    case 'home':
      return [
        `${query} reddit "game changer" OR "life changing" OR "best purchase"`,
        `${query} site:reddit.com/r/BuyItForLife OR site:reddit.com/r/cookware`,
        `${query} "worth the investment" OR "buy once"`,
        `best ${query} wirecutter OR serious eats`,
        `${query} review "durable" OR "well built" OR "quality"`,
      ];

    case 'outdoor':
      return [
        `${query} reddit "trust my life" OR "never failed" OR "bombproof"`,
        `${query} site:reddit.com/r/CampingGear OR site:reddit.com/r/ultralight`,
        `${query} backpackinglight recommendation`,
        `best ${query} outdoorgearlab OR switchbacktravel`,
        `${query} "tried and true" OR "go-to" OR "workhorse"`,
      ];

    case 'fitness':
      return [
        `${query} reddit "gains" OR "results" OR "works great"`,
        `${query} site:reddit.com/r/fitness OR site:reddit.com/r/homegym`,
        `best ${query} "bang for buck" OR "worth it"`,
        `${query} review bodybuilding OR t-nation`,
      ];

    default:
      return [
        `${query} reddit "best" OR "highly recommend"`,
        `${query} reddit "buy it for life" OR "worth every penny"`,
        `best ${query} forum recommendation`,
        `${query} "the best" OR "my favorite" OR "go-to"`,
        `${query} comparison review`,
      ];
  }
}

// Get category-specific scoring signals
function getCategoryScoringSignals(category: string): { phrases: string[], weight: number }[] {
  const baseSignals = [
    { phrases: ['best', 'highly recommend'], weight: 3 },
    { phrases: ['buy it for life', 'worth every penny'], weight: 4 },
  ];

  switch (category) {
    case 'fashion':
      return [
        ...baseSignals,
        { phrases: ['go-to', 'favorite', 'love these', 'perfect fit'], weight: 4 },
        { phrases: ['quality', 'well made', 'holds up', 'comfortable'], weight: 3 },
        { phrases: ['underrated', 'hidden gem', 'slept on'], weight: 3 },
      ];

    case 'tech':
      return [
        ...baseSignals,
        { phrases: ['gold standard', 'hands down', 'no contest'], weight: 4 },
        { phrases: ['best in class', 'nothing comes close'], weight: 4 },
      ];

    case 'home':
      return [
        ...baseSignals,
        { phrases: ['game changer', 'life changing', 'best purchase'], weight: 4 },
        { phrases: ['durable', 'well built', 'buy once'], weight: 3 },
      ];

    case 'outdoor':
      return [
        ...baseSignals,
        { phrases: ['bombproof', 'never failed', 'trust my life'], weight: 4 },
        { phrases: ['tried and true', 'workhorse'], weight: 3 },
      ];

    default:
      return baseSignals;
  }
}

// Step 1: Search Reddit/forums for what people actually recommend
export async function searchForRecommendations(query: string): Promise<ResearchResult> {
  const client = getTavily();

  // Detect category and generate tailored queries
  const category = detectQueryCategory(query);
  const searchQueries = generateSearchQueries(query, category);
  const scoringSignals = getCategoryScoringSignals(category);

  console.log(`Detected category: ${category}, using ${searchQueries.length} tailored queries`);

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

          // Score results based on category-specific signals
          let score = 0;
          const contentLower = result.content.toLowerCase();
          const titleLower = result.title.toLowerCase();

          // Apply category-specific scoring signals
          for (const signal of scoringSignals) {
            for (const phrase of signal.phrases) {
              if (contentLower.includes(phrase)) {
                score += signal.weight;
                break; // Only count each signal group once
              }
            }
          }

          // Reddit-specific signals
          if (result.url.includes('reddit.com')) {
            score += 2;
            if (titleLower.includes('guide') || titleLower.includes('megathread')) score += 3;
          }

          // Expert forum signals (category-aware)
          if (category === 'tech') {
            if (result.url.includes('head-fi.org') || result.url.includes('audiosciencereview')) score += 3;
          } else if (category === 'fashion') {
            if (result.url.includes('styleforum.net') || result.url.includes('heddels.com')) score += 3;
          } else if (category === 'home') {
            if (result.url.includes('home-barista.com') || result.url.includes('cookingforums')) score += 3;
          } else if (category === 'outdoor') {
            if (result.url.includes('backpackinglight.com') || result.url.includes('mtbr.com')) score += 3;
          }

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
