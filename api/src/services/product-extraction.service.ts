// Product extraction service - extracts product info from research and generates affiliate links
import OpenAI from 'openai';
import { tavily } from '@tavily/core';
import FirecrawlApp from '@mendable/firecrawl-js';

// Google Custom Search API config
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX; // Custom Search Engine ID

let _openai: OpenAI | null = null;
let _tavily: ReturnType<typeof tavily> | null = null;
let _firecrawl: FirecrawlApp | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

function getTavily() {
  if (!_tavily) {
    _tavily = tavily({ apiKey: process.env.TAVILY_API_KEY! });
  }
  return _tavily;
}

function getFirecrawl(): FirecrawlApp | null {
  if (!process.env.FIRECRAWL_API_KEY) {
    return null; // Firecrawl is optional
  }
  if (!_firecrawl) {
    _firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
  }
  return _firecrawl;
}

export interface ExtractedProduct {
  name: string;
  brand: string;
  category: string;
  estimatedPrice: string | null;
  description: string; // Query-agnostic product description
  pros: string[];
  cons: string[];
  sourcesCount: number;
  affiliateUrl: string | null;
  imageUrl: string | null;
  retailer: string;
  // Validation fields
  endorsementStrength: 'strong' | 'moderate' | 'weak';
  endorsementQuotes: string[]; // Actual quotes from research
  sourceTypes: string[]; // e.g., ['reddit', 'expert_review', 'forum']
  // Two separate ratings
  qualityScore: number; // 0-100 general product quality (cached, consistent)
  matchScore: number; // 0-100 relevance to specific query (computed per-search)
}

// Affiliate tags for different retailers
const AMAZON_AFFILIATE_TAG = process.env.AMAZON_AFFILIATE_TAG || 'shopii-20';

// Known DTC (direct-to-consumer) brands and their websites
const DTC_BRANDS: Record<string, string> = {
  'american giant': 'https://www.american-giant.com',
  'everlane': 'https://www.everlane.com',
  'allbirds': 'https://www.allbirds.com',
  'warby parker': 'https://www.warbyparker.com',
  'casper': 'https://casper.com',
  'away': 'https://www.awaytravel.com',
  'glossier': 'https://www.glossier.com',
  'bombas': 'https://bombas.com',
  'brooklinen': 'https://www.brooklinen.com',
  'parachute': 'https://www.parachutehome.com',
  'outdoor voices': 'https://www.outdoorvoices.com',
  'rothy\'s': 'https://rothys.com',
  'quip': 'https://www.getquip.com',
  'harry\'s': 'https://www.harrys.com',
  'dollar shave club': 'https://www.dollarshaveclub.com',
  'third love': 'https://www.thirdlove.com',
  'untuckit': 'https://www.untuckit.com',
  'mizzen+main': 'https://www.mizzenandmain.com',
  'vuori': 'https://vuoriclothing.com',
  'koio': 'https://www.koio.co',
  'greats': 'https://www.greats.com',
  'thursday boot': 'https://thursdayboots.com',
  'taylor stitch': 'https://www.taylorstitch.com',
  'buck mason': 'https://www.buckmason.com',
  'marine layer': 'https://www.marinelayer.com',
  'mack weldon': 'https://mackweldon.com',
  'rhone': 'https://www.rhone.com',
  'cuts': 'https://www.cutsclothing.com',
  'true classic': 'https://trueclassictees.com',
  'bylt': 'https://byltbasics.com',
  'feat': 'https://www.featclothing.com',
  'chubbies': 'https://www.chubbiesshorts.com',
  'bonobos': 'https://bonobos.com',
  'manduka': 'https://www.manduka.com',
  'liforme': 'https://liforme.com',
  'hydroflask': 'https://www.hydroflask.com',
  'yeti': 'https://www.yeti.com',
  'stanley': 'https://www.stanley1913.com',
  'fellow': 'https://fellowproducts.com',
  'chemex': 'https://www.chemexcoffeemaker.com',
  'aeropress': 'https://aeropress.com',
  'baratza': 'https://www.baratza.com',
  'breville': 'https://www.breville.com',
  'vitamix': 'https://www.vitamix.com',
  'instant pot': 'https://instantpot.com',
  'lodge': 'https://www.lodgecastiron.com',
  'le creuset': 'https://www.lecreuset.com',
  'staub': 'https://www.staub-usa.com',
  'zwilling': 'https://www.zwilling.com',
  'wusthof': 'https://www.wusthof.com',
  'victorinox': 'https://www.swissarmy.com',
  'global': 'https://global-knife.com',
  'shun': 'https://shun.kaiusa.com',
  'misono': 'https://www.korin.com/Misono',
  'mac knife': 'https://www.macknife.com',
  'tojiro': 'https://www.tojiro.net',
  'dalstrong': 'https://dalstrong.com',
  'misen': 'https://www.misen.com',
  'made in': 'https://madeincookware.com',
  'caraway': 'https://www.carawayhome.com',
  'our place': 'https://fromourplace.com',
  'great jones': 'https://greatjonesgoods.com',
  'material': 'https://materialkitchen.com',
};

// Check if a URL is NOT a search/category page (inverse logic - more permissive)
// We reject known bad patterns and accept everything else
function isNotSearchOrCategoryPage(url: string): boolean {
  const urlLower = url.toLowerCase();

  // Reject Google search/shopping pages
  if (urlLower.includes('google.com')) {
    return false;
  }

  // Reject Amazon search pages (but allow product pages)
  if (urlLower.includes('amazon.com')) {
    // Amazon search pages have /s? pattern
    if (urlLower.includes('/s?') || urlLower.includes('/s/')) {
      return false;
    }
    // Amazon browse pages
    if (urlLower.includes('/gp/browse') || urlLower.includes('/b?') || urlLower.includes('/b/')) {
      return false;
    }
    // Accept Amazon product pages (/dp/ASIN) and other Amazon pages
    return true;
  }

  // Reject common search/category patterns on other sites
  const badPatterns = [
    '/search',
    '/category/',
    '/categories/',
    '/collections/',
    '/browse/',
    '/blog/',
    '/article/',
    '/news/',
    '/about',
    '/contact',
    '/faq',
    '/help/',
    'tbm=shop',
    '?q=',
    '?query=',
    '?search=',
  ];

  for (const pattern of badPatterns) {
    if (urlLower.includes(pattern)) {
      return false;
    }
  }

  // Accept everything else - trust Tavily's search results
  return true;
}

// Add affiliate tag to Amazon URLs
function addAmazonAffiliateTag(url: string): string {
  if (!url.includes('amazon.com')) return url;
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('tag', AMAZON_AFFILIATE_TAG);
    return urlObj.toString();
  } catch {
    return url;
  }
}

// Extract retailer display name from URL
function getRetailerFromUrl(url: string): string {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const retailerName = domain.split('.')[0] || 'Store';
    return retailerName.charAt(0).toUpperCase() + retailerName.slice(1);
  } catch {
    return 'Store';
  }
}

// Extract price from text content (Tavily result or page content)
// Very conservative - only returns prices we're confident about
// Prices should come from actual product pages, not random numbers in content
function extractPriceFromContent(content: string, productName: string): string | null {
  if (!content) return null;

  // Look for prices explicitly labeled as "price", "cost", "$X.XX" near product-related context
  // We want to avoid picking up random numbers like shipping costs, ratings, counts, etc.

  // Priority 1: Look for explicitly labeled current prices (most reliable)
  const labeledPricePatterns = [
    /(?:current\s+price|price|our\s+price|sale\s+price|now)[:\s"]*\$(\d{1,4}(?:\.\d{2})?)\b/gi,
    /\$(\d{1,4}(?:\.\d{2})?)\s*(?:USD|usd)?(?:\s*-\s*|\s+)(?:free\s+shipping|in\s+stock|add\s+to\s+cart)/gi,
    /"price"\s*:\s*"?\$(\d{1,4}(?:\.\d{2})?)["\/]?/gi, // JSON format: "price":"$40.00" or "$24/60"
    /\$(\d{1,4}(?:\.\d{2})?)[\/\s](?:\d+\s+)?(?:capsule|capsules|tablet|tablets|serving|servings|count|ct|oz|lb|ea|each)/gi, // "$24/60 Capsules" or "$5/bottle"
  ];

  for (const pattern of labeledPricePatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Remove potential trailing slash (e.g., "$24/" → "$24")
      const priceStr = match[1].replace(/\/$/, '');
      const price = parseFloat(priceStr);
      // Filter for reasonable consumer product prices
      if (price >= 4.99 && price <= 3000) {
        console.log(`[PriceExtract] Found labeled price: $${price.toFixed(2)}`);
        return `$${price.toFixed(2)}`;
      }
    }
  }

  // Priority 2: If we find multiple prices with .99 or .95 endings (common retail pricing)
  // these are more likely to be actual product prices
  const retailPricePattern = /\$(\d{1,4}\.(?:99|95|49|00))\b/g;
  const retailPrices: number[] = [];
  let match;

  while ((match = retailPricePattern.exec(content)) !== null) {
    const price = parseFloat(match[1]);
    if (price >= 4.99 && price <= 3000) {
      retailPrices.push(price);
    }
  }

  // If we found retail-formatted prices, use them
  // Prefer prices that appear multiple times (more confident), but accept single occurrences too
  if (retailPrices.length > 0) {
    // Find the most common price
    const priceCount = new Map<number, number>();
    for (const price of retailPrices) {
      priceCount.set(price, (priceCount.get(price) || 0) + 1);
    }

    let bestPrice = retailPrices[0];
    let maxCount = 0;
    for (const [price, count] of priceCount) {
      if (count > maxCount) {
        maxCount = count;
        bestPrice = price;
      }
    }

    console.log(`[PriceExtract] Found ${retailPrices.length} retail prices, using: $${bestPrice} (${maxCount}x occurrences)`);
    return `$${bestPrice.toFixed(2)}`;
  }

  // No reliable price found - better to show "Price varies" than a wrong price
  return null;
}

// Check if URL is from a major retailer where we can reliably extract prices
function isRetailProductPage(url: string): boolean {
  const urlLower = url.toLowerCase();
  const retailDomains = [
    'amazon.com',
    'bestbuy.com',
    'walmart.com',
    'target.com',
    'costco.com',
    'newegg.com',
    'bhphotovideo.com',
    'adorama.com',
  ];
  return retailDomains.some(domain => urlLower.includes(domain));
}

// Fetch price using Firecrawl (handles JavaScript-rendered content)
async function fetchPriceWithFirecrawl(
  url: string,
  productName: string
): Promise<string | null> {
  const firecrawl = getFirecrawl();
  if (!firecrawl) {
    return null; // Firecrawl not configured
  }

  try {
    console.log(`[Firecrawl] Scraping ${url} for ${productName}`);

    const result = await firecrawl.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 3000, // Wait 3 seconds for dynamic content to load
    });

    // Check if we got markdown content
    if (!result || !result.markdown) {
      console.log(`[Firecrawl] Failed to scrape ${url} - no markdown returned`);
      console.log(`[Firecrawl] Result:`, JSON.stringify(result, null, 2).slice(0, 500));
      return null;
    }

    console.log(`[Firecrawl] Got ${result.markdown.length} chars of markdown`);

    // Extract price from the markdown content
    const price = extractPriceFromContent(result.markdown, productName);

    if (price) {
      console.log(`[Firecrawl] Found price ${price} from ${url}`);
    } else {
      console.log(`[Firecrawl] No price found in markdown from ${url}`);
    }

    return price;
  } catch (error: any) {
    console.error(`[Firecrawl] Error scraping ${url}:`, error.message);
    return null;
  }
}

// Fetch actual price from a product page URL with 2-tier fallback
// Tier 1: Tavily extract (fast, free) - works for static HTML
// Tier 2: Firecrawl (handles JS, cheap) - works for dynamic content
async function fetchPriceFromProductPage(url: string, productName: string): Promise<string | null> {
  // Tier 1: Try Tavily extract first (fastest, free)
  try {
    const client = getTavily();

    // Use Tavily extract to get structured content from the product page
    const response = await client.extract([url], {
      includeImages: false,
    });

    if (response.results && response.results.length > 0) {
      const content = response.results[0].rawContent || '';
      console.log(`[Tavily] Extracted ${content.length} chars from ${url}`);

      // Try to extract price from the static content
      const price = extractPriceFromContent(content, productName);
      if (price) {
        console.log(`[Tavily] ✓ Got price ${price} from page: ${url}`);
        return price;
      } else {
        console.log(`[Tavily] No price in static content, trying Firecrawl...`);
      }
    } else {
      console.log(`[Tavily] No results from extract, trying Firecrawl...`);
    }
  } catch (error) {
    console.log(`[Tavily] Extract failed, trying Firecrawl...`);
  }

  // Tier 2: Try Firecrawl (handles JavaScript-rendered prices)
  const firecrawlPrice = await fetchPriceWithFirecrawl(url, productName);
  if (firecrawlPrice) {
    console.log(`[Firecrawl] ✓ Got price ${firecrawlPrice} from page: ${url}`);
    return firecrawlPrice;
  }

  // No price found with either method
  console.log(`[PriceExtract] ✗ No price found for ${url} with any method`);
  return null;
}

// Look up actual product URL using Tavily search
// Priority: 1) Brand official store, 2) Recommended retailer, 3) Any product page
// NEVER returns search URLs - only actual product pages
// Also extracts price from the product page content
export async function lookupProductUrl(
  productName: string,
  brand: string,
  preferredRetailer?: string
): Promise<{ url: string; retailer: string; price: string | null } | null> {
  try {
    const client = getTavily();

    // Clean up the search term - avoid duplicating brand if already in name
    const nameLower = productName.toLowerCase();
    const brandLower = brand.toLowerCase();
    const searchTerm = (brand && !nameLower.includes(brandLower))
      ? `${brand} ${productName}`
      : productName;

    // Build search queries in priority order
    // Priority: Brand official > Recommended retailer > General product page search
    const searchQueries: Array<{ query: string; includeDomains?: string[]; priority: string }> = [];

    // Priority 1: Brand official store (best for the brand, often best prices)
    const dtcUrl = DTC_BRANDS[brandLower];
    if (dtcUrl) {
      const dtcDomain = new URL(dtcUrl).hostname.replace('www.', '');
      searchQueries.push({
        query: `${searchTerm} site:${dtcDomain}`,
        includeDomains: [dtcDomain],
        priority: 'brand_official',
      });
    }

    // Priority 2: Recommended retailer (if specified and not "brand")
    if (preferredRetailer) {
      const retailerLower = preferredRetailer.toLowerCase();
      if (!retailerLower.includes('brand') && !retailerLower.includes('official') && !retailerLower.includes('direct')) {
        if (retailerLower.includes('amazon')) {
          searchQueries.push({
            query: `${searchTerm} site:amazon.com`,
            includeDomains: ['amazon.com'],
            priority: 'amazon',
          });
        } else {
          searchQueries.push({
            query: `${searchTerm} buy ${preferredRetailer}`,
            priority: 'preferred_retailer',
          });
        }
      }
    }

    // Priority 3: General product page search (find wherever it's sold)
    searchQueries.push({
      query: `buy ${searchTerm} product`,
      priority: 'general',
    });

    // Try each search query until we find a product page
    for (const { query, includeDomains, priority } of searchQueries) {
      try {
        console.log(`[ProductURL] Trying ${priority} search: "${query}"`);

        const response = await client.search(query, {
          searchDepth: 'basic',
          maxResults: 8,
          includeAnswer: false,
          ...(includeDomains && { includeDomains }),
        });

        if (response.results && response.results.length > 0) {
          // Find actual product pages (not search pages)
          for (const result of response.results) {
            if (isNotSearchOrCategoryPage(result.url)) {
              const finalUrl = addAmazonAffiliateTag(result.url);
              const retailer = getRetailerFromUrl(result.url);
              // Try to extract price from the Tavily result content first (fast)
              let price = extractPriceFromContent(result.content || '', productName);

              // If no price from search snippet, try fetching from the actual page
              // Try for ALL product pages, not just major retailers (includes DTC brand sites)
              if (!price) {
                console.log(`[ProductURL] No price in snippet for ${productName}, fetching from page: ${result.url}`);
                price = await fetchPriceFromProductPage(result.url, productName);
              }

              console.log(`[ProductURL] Found product page (${priority}): ${finalUrl}, price: ${price}`);
              return { url: finalUrl, retailer, price };
            }
          }
        }
      } catch (searchError) {
        console.error(`[ProductURL] Search failed for "${query}":`, searchError);
        // Continue to next search query
      }
    }

    console.log(`[ProductURL] No product page found for ${searchTerm}`);
    return null;
  } catch (error) {
    console.error('Product URL lookup failed:', error);
    return null;
  }
}

// Main function to get purchase URL - tries lookup first
// Returns null if no actual product page can be found (never returns search URLs)
// Also returns the price extracted from the product page
export async function getPurchaseUrl(
  productName: string,
  brand: string,
  recommendedRetailer?: string,
  existingUrl?: string | null
): Promise<{ url: string; retailer: string; price: string | null } | null> {
  // If we already have a direct product URL, validate and use it
  if (existingUrl && isNotSearchOrCategoryPage(existingUrl)) {
    const finalUrl = addAmazonAffiliateTag(existingUrl);
    const retailer = getRetailerFromUrl(existingUrl);
    console.log(`[ProductURL] Using existing product URL: ${finalUrl}`);
    // No price available for existing URLs without fetching
    return { url: finalUrl, retailer, price: null };
  }

  // Try to look up actual product URL (also extracts price from page content)
  const lookedUpUrl = await lookupProductUrl(productName, brand, recommendedRetailer);
  return lookedUpUrl; // Returns null if not found - NO fallback to search URLs
}

// Sync version - returns placeholder URL that will be replaced by async lookup
// Used during initial extraction, real URLs are fetched in chat route
export function generatePurchaseUrl(
  productName: string,
  brand: string,
  recommendedRetailer?: string
): { url: string; retailer: string } {
  // Return a placeholder - the real URL will be looked up asynchronously
  // This is just for the initial extraction phase
  return {
    url: '', // Empty - will be filled by getPurchaseUrl
    retailer: recommendedRetailer || 'Store',
  };
}

// Generate direct Amazon product affiliate URL (if we have ASIN)
export function generateAmazonProductUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}?tag=${AMAZON_AFFILIATE_TAG}`;
}

// Extract products mentioned in research using AI
export async function extractProductsFromResearch(
  userQuery: string,
  researchContext: string
): Promise<ExtractedProduct[]> {
  const prompt = `Analyze this research data and extract ALL products that are mentioned. Your job is to ALWAYS find products - the user is shopping and needs product recommendations.

USER QUERY (for context only): "${userQuery}"

RESEARCH DATA:
${researchContext}

CRITICAL: You MUST extract at least 3-5 products. The user is shopping and expects product recommendations. Even if products are only briefly mentioned or have weak endorsements, include them. It's better to show products with caveats than to show nothing.

Extract up to 7 products. For each product, provide DETAILED and SPECIFIC information that is QUERY-AGNOSTIC (descriptions should work regardless of how someone found this product):

1. name: Full product name. Format depends on category:
   - Electronics: Include model numbers (e.g., "Sony WH-1000XM5", "Sennheiser HD 600")
   - Fashion/Clothing: Use brand + product line (e.g., "American Giant Premium Heavyweight Tee", "Uniqlo Supima Cotton T-Shirt")
   - Food/Beverages: Brand + specific product (e.g., "GT's Kombucha Original", "Suja Organic Green Juice")
   - General products: Be as specific as the research allows (e.g., "Lodge 10.25-inch Cast Iron Skillet")
2. brand: Brand name
3. category: Product category (e.g., "T-Shirts", "Wireless Headphones", "Cast Iron Cookware", "Healthy Beverages")
4. estimatedPrice: Price ONLY if explicitly mentioned in the research. If not mentioned, return null.
   IMPORTANT: Do NOT guess prices. Only use prices you see in the research data.
   Typical price ranges for reference (DO NOT use these as defaults - only verify if a price seems wrong):
   - Snacks/candy/fruit snacks: $3-15
   - Beverages/drinks: $2-10
   - Basic clothing items: $15-60
   - Premium clothing: $50-200
   - Electronics accessories: $20-150
   - Major electronics: $100-2000
   - Furniture: $100-2000
5. bestRetailer: Where to buy - "brand_direct", "amazon", or specific retailer name
6. productUrl: CRITICAL - If a direct link to the product page is in the research data, extract it here. Look for URLs containing the product name or linking to product pages on retailer sites. Return null if no direct product URL is found.
7. description: 2-3 sentence GENERAL description of what this product is and who it's for. DO NOT reference the user's specific query - write as if for a product database entry.
   - Good: "A heavyweight 100% cotton t-shirt known for durability and American manufacturing. Popular among those seeking quality basics that last for years."
   - Bad: "Perfect for users looking for 100% cotton options" (too query-specific)
8. pros: Array of GENERAL product strengths (not query-specific). Include 1-6 based on research.
   - Be specific: "515 GSM heavyweight cotton", "40-hour battery life", "Made in USA"
   - These should be true regardless of why someone is searching
   - If research is sparse, provide general known strengths of the product
9. cons: Array of GENERAL product weaknesses. Include 0-4 based on research.
   - Be specific: "Runs short in length", "No wireless charging", "$50+ price point"
   - OK to have 0 if none mentioned
10. sourcesCount: How many independent sources mentioned this (even 1 is valid)
11. endorsementStrength: "strong", "moderate", or "weak" - use "weak" for products barely mentioned, but STILL INCLUDE THEM
12. endorsementQuotes: 1-4 actual phrases from research (e.g., "best in class", "gold standard"). Can be just 1 short quote.
13. sourceTypes: Array of source types (e.g., ["reddit", "wirecutter", "enthusiast_forum"])
14. qualityScore: 0-100 GENERAL PRODUCT QUALITY rating based on:
    - Build quality and materials
    - Durability and longevity
    - Value for price
    - Overall user satisfaction across all use cases
    This is NOT about query relevance - it's about how good the product is overall.
    For weakly endorsed products, use 60-70 range.
15. matchScore: 0-100 rating of how well this product matches the USER QUERY specifically.
    - 90-100: Directly answers what user asked for
    - 70-89: Good match with minor misalignment
    - 50-69: Partial match, might work for user
    - Below 50: Tangentially related

CRITICAL RULES:
- ALWAYS extract products. Never return an empty array. Find products even if endorsements are weak.
- description, pros, and cons must be QUERY-AGNOSTIC - they should make sense for ANY search that surfaces this product
- qualityScore = general product quality (cacheable, consistent)
- matchScore = relevance to THIS specific query (computed per-search)
- Only include info ACTUALLY in the research - don't hallucinate product details
- For fashion: Brand + product line IS a valid product name
- If a product is mentioned but has little info, still include it with endorsementStrength: "weak"
- For estimatedPrice: ONLY use prices from the research data. Return null if no price is mentioned.

Return a JSON array sorted by matchScore (highest first). Return ONLY valid JSON, no markdown.`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4500, // Increased for richer, more detailed responses
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `You are an expert product analyst for a shopping assistant. Your PRIMARY job is to ALWAYS find products to recommend.

CRITICAL RULE: NEVER return an empty array. The user is shopping and MUST see product recommendations. Even if products have weak endorsements or limited info, include them. Show 3-5 products minimum.

Write descriptions, pros, and cons as if for a general product database - NOT tailored to any specific search query. The same product info should make sense whether someone searched "best cotton shirts", "durable t-shirts", or "American made clothing".

TWO SEPARATE RATINGS:
1. qualityScore (0-100): How good is this product OVERALL? Based on build quality, materials, durability, value. This never changes.
2. matchScore (0-100): How well does it match THIS SPECIFIC query? This varies per search.

PRODUCT NAMING:
- Electronics: Model numbers (Sony WH-1000XM5)
- Fashion: Brand + product line (American Giant Heavyweight Tee)
- Food/Beverages: Brand + specific product (GT's Kombucha Original)
- Home goods: Brand + specific product (Lodge Cast Iron Skillet)

PRICING RULE: Only include estimatedPrice if the price is explicitly stated in the research data. Return null if no price is mentioned. NEVER guess prices.

Return only valid JSON arrays. No markdown.`,
        },
        { role: 'user', content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('[ProductExtraction] No content in AI response');
      return [];
    }

    console.log('[ProductExtraction] Raw AI response length:', content.length);
    console.log('[ProductExtraction] Raw AI response preview:', content.slice(0, 500));

    // Parse JSON response - handle potential markdown wrapping
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    let products;
    try {
      products = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('[ProductExtraction] JSON parse error:', parseError);
      console.error('[ProductExtraction] Content was:', jsonContent.slice(0, 1000));
      return [];
    }

    if (!Array.isArray(products)) {
      console.log('[ProductExtraction] Response was not an array, got:', typeof products);
      return [];
    }

    // Log what we got before filtering
    console.log(
      'Extracted products before filtering:',
      products.map((p: any) => ({ name: p.name, quality: p.qualityScore, match: p.matchScore }))
    );

    // Filter by matchScore (relevance to query) - use lower threshold to ensure results
    let filtered = products.filter((p: any) => (p.matchScore || 0) >= 60);

    // If we filtered out everything, try with a lower threshold
    if (filtered.length === 0 && products.length > 0) {
      console.log('No products above 60% match, lowering threshold to 45%');
      filtered = products.filter((p: any) => (p.matchScore || 0) >= 45);
    }

    // If still nothing, take the top 3 products regardless of score
    if (filtered.length === 0 && products.length > 0) {
      console.log('No products above 45% match, taking top 3 regardless of score');
      filtered = products.slice(0, 3);
    }

    // Sort by matchScore (best matches first)
    filtered.sort((a: any, b: any) => (b.matchScore || 0) - (a.matchScore || 0));

    console.log(`Filtered from ${products.length} to ${filtered.length} products`);

    // Map and validate each product
    const mappedProducts = filtered
      .slice(0, 5) // Max 5 products
      .map((p: any) => {
        // Filter out very short/generic pros, but don't require a minimum
        const pros = (p.pros || []).filter((pro: string) => pro && pro.length > 10);

        // Filter out very short cons, allow empty array if none mentioned
        const cons = (p.cons || []).filter((con: string) => con && con.length > 10);

        // Ensure description is substantive
        let description = p.description || '';
        if (description.length < 50) {
          description = `${p.name} is a popular choice in the ${p.category || 'product'} category, recommended by users for its quality and value.`;
        }

        // Generate smart purchase URL based on brand and AI recommendation
        const { url: affiliateUrl, retailer } = generatePurchaseUrl(
          p.name || 'Unknown Product',
          p.brand || '',
          p.bestRetailer
        );

        // Validate price - null out obviously wrong prices based on category
        let validatedPrice = p.estimatedPrice || null;
        if (validatedPrice) {
          const priceNum = parseFloat(validatedPrice.replace(/[$,]/g, ''));
          const category = (p.category || '').toLowerCase();

          // Category-based price sanity checks
          const isFoodOrSnack = category.includes('snack') || category.includes('food') ||
            category.includes('fruit') || category.includes('candy') || category.includes('beverage') ||
            category.includes('drink') || category.includes('grocery');
          const isClothing = category.includes('shirt') || category.includes('clothing') ||
            category.includes('apparel') || category.includes('pants') || category.includes('shoes');
          const isElectronics = category.includes('electronic') || category.includes('headphone') ||
            category.includes('computer') || category.includes('phone') || category.includes('laptop');

          // Set null if price is unreasonable for category
          if (isFoodOrSnack && priceNum > 50) {
            console.log(`[PriceValidation] Rejected $${priceNum} for ${p.name} (food/snack category)`);
            validatedPrice = null;
          } else if (isClothing && priceNum > 500) {
            console.log(`[PriceValidation] Rejected $${priceNum} for ${p.name} (clothing category)`);
            validatedPrice = null;
          } else if (!isElectronics && priceNum > 1000) {
            console.log(`[PriceValidation] Rejected $${priceNum} for ${p.name} (too high for non-electronics)`);
            validatedPrice = null;
          }
        }

        return {
          name: p.name || 'Unknown Product',
          brand: p.brand || '',
          category: p.category || '',
          estimatedPrice: validatedPrice,
          description,
          pros,
          cons,
          sourcesCount: p.sourcesCount || 1,
          affiliateUrl,
          imageUrl: null, // Will be fetched separately
          retailer,
          // Validation fields
          endorsementStrength: p.endorsementStrength || 'moderate',
          endorsementQuotes: p.endorsementQuotes || [],
          sourceTypes: p.sourceTypes || [],
          // Two ratings
          qualityScore: p.qualityScore || 70, // General product quality
          matchScore: p.matchScore || 70, // Query relevance
        };
      });

    return mappedProducts;
  } catch (error) {
    console.error('Product extraction failed:', error);
    return [];
  }
}

// Fetch product image using Google Custom Search API
export async function fetchProductImage(productName: string): Promise<string | null> {
  if (!GOOGLE_API_KEY || !GOOGLE_CX) {
    console.log('Google Custom Search not configured, skipping image fetch');
    return null;
  }

  try {
    const searchQuery = encodeURIComponent(`${productName} product`);
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${searchQuery}&searchType=image&num=1&imgSize=medium&safe=active`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Google Image Search failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as { items?: Array<{ link: string }> };

    if (data.items && data.items.length > 0 && data.items[0]) {
      // Return the first image result
      return data.items[0].link;
    }

    return null;
  } catch (error) {
    console.error('Image fetch error:', error);
    return null;
  }
}

// Enhance products with additional enrichment data using AI
export async function enhanceProductsWithEnrichment(
  products: ExtractedProduct[],
  enrichmentMap: Map<string, { enrichmentContext: string }>
): Promise<ExtractedProduct[]> {
  // Find products that need enhancement (have sparse details)
  const productsNeedingEnhancement = products.filter((p) => {
    const hasWeakDescription = p.description.length < 100;
    const hasFewPros = p.pros.length < 3;
    const hasFewCons = p.cons.length < 2;
    return hasWeakDescription || hasFewPros || hasFewCons;
  });

  if (productsNeedingEnhancement.length === 0) {
    console.log('All products have sufficient detail, skipping enrichment');
    return products;
  }

  console.log(`Enhancing ${productsNeedingEnhancement.length} products with enrichment data`);

  // Enhance products in parallel
  const enhancedProductsPromises = products.map(async (product) => {
    const key = `${product.brand} ${product.name}`.toLowerCase();
    const enrichment = enrichmentMap.get(key);

    // Skip if no enrichment data or product already has good details
    const needsEnhancement =
      product.description.length < 100 || product.pros.length < 3 || product.cons.length < 2;

    if (!enrichment || !needsEnhancement) {
      return product;
    }

    try {
      const enhanced = await enhanceSingleProduct(product, enrichment.enrichmentContext);
      return enhanced;
    } catch (error) {
      console.error(`Failed to enhance ${product.name}:`, error);
      return product;
    }
  });

  const enhancedProducts = await Promise.all(enhancedProductsPromises);
  return enhancedProducts;
}

// Enhance a single product with additional context
// NOTE: This function does NOT handle prices - prices are extracted from actual product pages
async function enhanceSingleProduct(
  product: ExtractedProduct,
  enrichmentContext: string
): Promise<ExtractedProduct> {
  const prompt = `Enhance this product information with additional details from the research.

CURRENT PRODUCT DATA:
Name: ${product.name}
Brand: ${product.brand}
Description: ${product.description}
Current Pros: ${JSON.stringify(product.pros)}
Current Cons: ${JSON.stringify(product.cons)}

ADDITIONAL RESEARCH:
${enrichmentContext}

Based on the additional research, provide enhanced QUERY-AGNOSTIC information (should work for any search):

1. description: 2-3 sentence GENERAL description of this product and who it's for. Don't reference any specific search query.

2. pros: Array of GENERAL product strengths (1-6 items). Be specific with numbers/specs when available.

3. cons: Array of GENERAL product weaknesses (0-4 items). OK to return empty array if none mentioned.

Return a JSON object with these 3 fields only. Do NOT include price. No markdown.`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini', // Use mini for speed on enrichment
      max_tokens: 1000,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'You are a product database analyst. Write QUERY-AGNOSTIC descriptions that work regardless of how someone found this product. Be specific and avoid generic descriptions. Do NOT include prices - those come from the actual product pages.',
        },
        { role: 'user', content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return product;

    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const enhanced = JSON.parse(jsonContent);

    // Do NOT use enhanced.estimatedPrice - prices come from actual product pages only
    return {
      ...product,
      description: enhanced.description || product.description,
      pros: enhanced.pros?.length > 0 ? enhanced.pros : product.pros,
      cons: enhanced.cons?.length > 0 ? enhanced.cons : product.cons,
      // Keep original price - don't use AI-guessed prices
    };
  } catch (error) {
    console.error(`Enhancement parsing failed for ${product.name}:`, error);
    return product;
  }
}

// Batch fetch images for multiple products
export async function fetchProductImages(
  products: ExtractedProduct[]
): Promise<ExtractedProduct[]> {
  if (!GOOGLE_API_KEY || !GOOGLE_CX) {
    return products;
  }

  // Fetch images in parallel (with rate limiting consideration)
  const productsWithImages = await Promise.all(
    products.map(async (product, index) => {
      // Add small delay between requests to avoid rate limits
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100 * index));
      }

      const imageUrl = await fetchProductImage(`${product.brand} ${product.name}`);
      return {
        ...product,
        imageUrl: imageUrl || product.imageUrl,
      };
    })
  );

  return productsWithImages;
}
