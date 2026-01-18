// Product extraction service - extracts product info from research and generates affiliate links
import OpenAI from 'openai';
import { tavily } from '@tavily/core';
import { scrapeProductPage } from './web-scraper.service.js';
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
  // REMOVED: estimatedPrice - prices come from page scraping now
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

/**
 * Estimate price based on product name, brand, and category using AI
 * Returns a specific price estimate (e.g., "$129.99") instead of null
 */
export async function estimateProductPrice(
  productName: string,
  brand: string,
  category: string,
  _description?: string
): Promise<string> {
  try {
    const prompt = `Price estimate for: ${productName} by ${brand}
Category: ${category}

Return ONLY a realistic specific price like "$129.99" (must include .99 or .95). Nothing else.`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You estimate retail prices. Return ONLY the price like "$149.99". Premium brands cost more, budget brands less.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 10,
      temperature: 0.1,
    });

    const estimatedPrice = response.choices[0]?.message?.content?.trim() || null;

    if (estimatedPrice && estimatedPrice.match(/\$\d+\.\d{2}/)) {
      console.log(`[PriceEstimate] Estimated price for ${productName}: ${estimatedPrice}`);
      return estimatedPrice;
    }

    // Fallback: Simple category-based estimation
    console.log(`[PriceEstimate] AI estimation failed, using category fallback for ${productName}`);
    return estimatePriceFallback(category);

  } catch (error) {
    console.error('[PriceEstimate] Error estimating price:', error);
    return estimatePriceFallback(category);
  }
}

/**
 * Fallback price estimation based on category
 */
function estimatePriceFallback(category: string): string {
  const categoryLower = category.toLowerCase();

  // Electronics & Tech
  if (categoryLower.includes('headphone') || categoryLower.includes('earbud')) return '$149.99';
  if (categoryLower.includes('laptop') || categoryLower.includes('macbook')) return '$999.99';
  if (categoryLower.includes('phone') || categoryLower.includes('smartphone')) return '$799.99';
  if (categoryLower.includes('tablet')) return '$499.99';
  if (categoryLower.includes('smartwatch') || categoryLower.includes('watch')) return '$399.99';
  if (categoryLower.includes('speaker')) return '$199.99';
  if (categoryLower.includes('camera')) return '$599.99';
  if (categoryLower.includes('monitor') || categoryLower.includes('display')) return '$349.99';
  if (categoryLower.includes('keyboard')) return '$129.99';
  if (categoryLower.includes('mouse')) return '$79.99';

  // Fashion & Apparel
  if (categoryLower.includes('t-shirt') || categoryLower.includes('tee')) return '$29.99';
  if (categoryLower.includes('jeans') || categoryLower.includes('pants')) return '$79.99';
  if (categoryLower.includes('jacket') || categoryLower.includes('coat')) return '$149.99';
  if (categoryLower.includes('shoe') || categoryLower.includes('sneaker')) return '$119.99';
  if (categoryLower.includes('boots')) return '$169.99';
  if (categoryLower.includes('dress')) return '$89.99';
  if (categoryLower.includes('sweater') || categoryLower.includes('hoodie')) return '$59.99';

  // Home & Kitchen
  if (categoryLower.includes('cookware') || categoryLower.includes('pan')) return '$89.99';
  if (categoryLower.includes('mattress')) return '$799.99';
  if (categoryLower.includes('pillow')) return '$49.99';
  if (categoryLower.includes('blanket') || categoryLower.includes('comforter')) return '$129.99';
  if (categoryLower.includes('towel')) return '$34.99';
  if (categoryLower.includes('coffee maker')) return '$99.99';
  if (categoryLower.includes('blender')) return '$79.99';
  if (categoryLower.includes('vacuum')) return '$249.99';

  // Health & Beauty
  if (categoryLower.includes('skincare') || categoryLower.includes('serum')) return '$39.99';
  if (categoryLower.includes('makeup')) return '$24.99';
  if (categoryLower.includes('shampoo') || categoryLower.includes('conditioner')) return '$19.99';
  if (categoryLower.includes('supplement') || categoryLower.includes('vitamin')) return '$29.99';

  // Food & Beverage
  if (categoryLower.includes('kombucha') || categoryLower.includes('juice')) return '$4.99';
  if (categoryLower.includes('protein powder')) return '$49.99';
  if (categoryLower.includes('coffee') || categoryLower.includes('tea')) return '$14.99';

  // Sports & Outdoors
  if (categoryLower.includes('yoga mat')) return '$69.99';
  if (categoryLower.includes('dumbbell') || categoryLower.includes('weights')) return '$89.99';
  if (categoryLower.includes('bike') || categoryLower.includes('bicycle')) return '$599.99';
  if (categoryLower.includes('tent')) return '$249.99';
  if (categoryLower.includes('backpack')) return '$99.99';

  // Default fallback
  return '$79.99';
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

// AI verification to check if a webpage matches the expected product
async function aiVerifyProductMatch(
  pageContent: string,
  pageTitle: string,
  expectedProduct: string,
  expectedBrand: string
): Promise<{ isMatch: boolean; confidence: number; reason: string }> {
  const prompt = `I'm looking for a product page for: ${expectedBrand} ${expectedProduct}

Here's the webpage I found:
Title: ${pageTitle}
Content: ${pageContent}

Is this the correct product page?

Consider:
1. Does the page title/content mention "${expectedBrand}"?
2. Does it mention "${expectedProduct}"?
3. Is this a product page where you can buy this item? (not a review, forum, category page)

Return JSON only:
{
  "isMatch": boolean,
  "confidence": 0-100,
  "reason": "brief explanation"
}`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini', // Fast and cheap for verification
      max_tokens: 200,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: 'You verify if a webpage matches an expected product. Return only JSON.',
        },
        { role: 'user', content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() || '{}';
    const result = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));

    return {
      isMatch: result.isMatch || false,
      confidence: result.confidence || 0,
      reason: result.reason || 'Unknown',
    };
  } catch (error) {
    console.error('[AI Verify] Error:', error);
    return { isMatch: false, confidence: 0, reason: 'AI verification failed' };
  }
}

// Look up actual product URL - search, scrape, and verify with AI
// Returns verified product with real price and multiple images
export async function lookupProductUrl(
  productName: string,
  brand: string
): Promise<{
  url: string;
  retailer: string;
  price: string | null;
  images: string[];
} | null> {
  try {
    // Build simple search query: just the brand + product name
    const searchTerm = brand ? `${brand} ${productName}` : productName;

    console.log(`[ProductURL] Searching for: "${searchTerm}"`);

    // Try Google Shopping first
    let searchResults: Array<{ url: string }> = [];

    if (GOOGLE_API_KEY && GOOGLE_CX) {
      const query = encodeURIComponent(searchTerm);
      const googleUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${query}&num=10`;

      try {
        const response = await fetch(googleUrl);
        if (response.ok) {
          const data = await response.json() as { items?: Array<{ link: string }> };
          searchResults = data.items?.map(item => ({ url: item.link })) || [];
          console.log(`[ProductURL] Google found ${searchResults.length} results`);
        }
      } catch (err) {
        console.error('[ProductURL] Google search failed:', err);
      }
    }

    // Fallback to Tavily if Google didn't work
    if (searchResults.length === 0) {
      const client = getTavily();
      const tavilyResponse = await client.search(searchTerm, {
        searchDepth: 'basic',
        maxResults: 10,
      });
      searchResults = tavilyResponse.results?.map(r => ({ url: r.url })) || [];
      console.log(`[ProductURL] Tavily found ${searchResults.length} results`);
    }

    // Try each result until we find a match
    for (let i = 0; i < Math.min(searchResults.length, 10); i++) {
      const result = searchResults[i];
      console.log(`[ProductURL] Trying result ${i + 1}: ${result.url}`);

      // Quick domain filter - skip obvious non-shopping sites
      const hostname = new URL(result.url).hostname;
      if (hostname.includes('reddit.com') ||
          hostname.includes('youtube.com') ||
          hostname.includes('facebook.com') ||
          hostname.includes('twitter.com')) {
        console.log(`[ProductURL] Skipping social/forum site: ${hostname}`);
        continue;
      }

      // Scrape the page
      const scraped = await scrapeProductPage(result.url);

      if (!scraped.success) {
        console.log(`[ProductURL] Failed to scrape: ${scraped.error}`);
        continue;
      }

      // Verify with AI
      const verification = await aiVerifyProductMatch(
        scraped.content,
        scraped.title,
        productName,
        brand
      );

      console.log(`[ProductURL] AI verification: ${verification.isMatch} (confidence: ${verification.confidence}%) - ${verification.reason}`);

      if (verification.isMatch && verification.confidence >= 70) {
        // Found the right product!
        const finalUrl = addAmazonAffiliateTag(result.url);
        const retailer = getRetailerFromUrl(result.url);

        console.log(`[ProductURL] ✓ Found verified product page: ${finalUrl}`);
        console.log(`[ProductURL] Price: ${scraped.price || 'not found'}, Images: ${scraped.images.length}`);

        return {
          url: finalUrl,
          retailer,
          price: scraped.price,
          images: scraped.images,
        };
      }
    }

    console.log(`[ProductURL] No valid product page found after checking ${searchResults.length} results`);
    return null;

  } catch (error) {
    console.error('[ProductURL] Lookup failed:', error);
    return null;
  }
}

// Main function to get purchase URL - search, scrape, and verify
// Returns verified product with real price and images, or null if not found
export async function getPurchaseUrl(
  productName: string,
  brand: string
): Promise<{
  url: string;
  retailer: string;
  price: string | null;
  images: string[];
} | null> {
  // Look up product URL with AI verification
  const lookedUpUrl = await lookupProductUrl(productName, brand);
  return lookedUpUrl; // Returns null if not found
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
4. bestRetailer: Where to buy - "brand_direct", "amazon", or specific retailer name
5. productUrl: **CRITICAL - ONLY EXTRACT DIRECT PRODUCT PAGES**

   RULES:
   - ONLY extract URLs that go DIRECTLY to a product page where someone can buy the item
   - VALID examples: amazon.com/dp/B07ABC1234, nike.com/t/air-max/CZ1234-100
   - INVALID examples (DO NOT EXTRACT):
     * Reddit/forum discussions: reddit.com/r/shoes/comments/...
     * Search results: amazon.com/s?k=shoes
     * Category pages: nike.com/shoes, nike.com/collections/running
     * Landing pages: nike.com/, nike.com/men
     * Review articles: wirecutter.com/reviews/best-shoes

   - Look for URLs containing product identifiers (IDs, SKUs, model codes)
   - If you find multiple URLs, choose the MOST DIRECT product page
   - Prefer URLs with clear product IDs over generic pages
   - Return null if ONLY category/search/forum URLs are found
6. description: 2-3 sentence GENERAL description of what this product is and who it's for. DO NOT reference the user's specific query - write as if for a product database entry.
   - Good: "A heavyweight 100% cotton t-shirt known for durability and American manufacturing. Popular among those seeking quality basics that last for years."
   - Bad: "Perfect for users looking for 100% cotton options" (too query-specific)
7. pros: Array of GENERAL product strengths (not query-specific). Include 1-6 based on research.
   - Be specific: "515 GSM heavyweight cotton", "40-hour battery life", "Made in USA"
   - These should be true regardless of why someone is searching
   - If research is sparse, provide general known strengths of the product
8. cons: Array of GENERAL product weaknesses. Include 0-4 based on research.
   - Be specific: "Runs short in length", "No wireless charging", "$50+ price point"
   - OK to have 0 if none mentioned
9. sourcesCount: How many independent sources mentioned this (even 1 is valid)
10. endorsementStrength: "strong", "moderate", or "weak" - use "weak" for products barely mentioned, but STILL INCLUDE THEM
11. endorsementQuotes: 1-4 actual phrases from research (e.g., "best in class", "gold standard"). Can be just 1 short quote.
12. sourceTypes: Array of source types (e.g., ["reddit", "wirecutter", "enthusiast_forum"])
13. qualityScore: 0-100 GENERAL PRODUCT QUALITY rating based on:
    - Build quality and materials
    - Durability and longevity
    - Value for price
    - Overall user satisfaction across all use cases
    This is NOT about query relevance - it's about how good the product is overall.
    For weakly endorsed products, use 60-70 range.
14. matchScore: 0-100 rating of how well this product matches the USER QUERY specifically.
    - 90-100: Directly answers what user asked for
    - 70-89: Good match with minor misalignment
    - 50-69: Partial match, might work for user
    - Below 50: Tangentially related

CRITICAL RULES:
- ALWAYS extract products. Never return an empty array. Find products even if endorsements are weak.
- **URL EXTRACTION IS CRITICAL**: Scan carefully for ANY product URLs in the research. Reddit posts, articles, and forum discussions often include Amazon links or retailer links. Extract the complete URL.
- description, pros, and cons must be QUERY-AGNOSTIC - they should make sense for ANY search that surfaces this product
- qualityScore = general product quality (cacheable, consistent)
- matchScore = relevance to THIS specific query (computed per-search)
- Only include info ACTUALLY in the research - don't hallucinate product details
- For fashion: Brand + product line IS a valid product name
- If a product is mentioned but has little info, still include it with endorsementStrength: "weak"
- DO NOT estimate prices - prices will be scraped from actual product pages during verification.

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

CRITICAL RULES:
1. NEVER return an empty array. Show 3-5 products minimum.
2. **EXTRACT PRODUCT URLs**: Reddit posts, articles, and forum discussions often contain product links (especially Amazon links). SCAN the research text carefully for URLs and extract them in the productUrl field. This is CRITICAL for user experience.

Write descriptions, pros, and cons as if for a general product database - NOT tailored to any specific search query. The same product info should make sense whether someone searched "best cotton shirts", "durable t-shirts", or "American made clothing".

TWO SEPARATE RATINGS:
1. qualityScore (0-100): How good is this product OVERALL? Based on build quality, materials, durability, value. This never changes.
2. matchScore (0-100): How well does it match THIS SPECIFIC query? This varies per search.

PRODUCT NAMING:
- Electronics: Model numbers (Sony WH-1000XM5)
- Fashion: Brand + product line (American Giant Heavyweight Tee)
- Food/Beverages: Brand + specific product (GT's Kombucha Original)
- Home goods: Brand + specific product (Lodge Cast Iron Skillet)

DO NOT ESTIMATE PRICES: Prices will be scraped from actual product pages during verification. Do not include price information in extraction.

URL EXTRACTION RULES (CRITICAL):
1. ONLY extract direct product page URLs where users can buy the item
2. NEVER extract:
   - Reddit/forum discussion URLs (reddit.com/r/, head-fi.org/threads/)
   - Search result URLs (amazon.com/s, /search, ?q=, ?k=)
   - Category pages (nike.com/shoes, /category/, /collections/, /browse/)
   - Landing pages (nike.com/, nike.com/men)
   - Review article URLs (wirecutter.com/reviews/)

3. ONLY extract URLs with product identifiers (IDs, SKUs, model codes)
4. If research ONLY contains non-product URLs, return productUrl: null
   The system will perform a proper product lookup instead.

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

        // Generate placeholder URL - real URLs with prices will be looked up in chat route
        const { url: affiliateUrl, retailer } = generatePurchaseUrl(
          p.name || 'Unknown Product',
          p.brand || '',
          p.bestRetailer
        );

        return {
          name: p.name || 'Unknown Product',
          brand: p.brand || '',
          category: p.category || '',
          // NO estimatedPrice - prices come from page scraping
          description,
          pros,
          cons,
          sourcesCount: p.sourcesCount || 1,
          affiliateUrl,
          imageUrl: null, // Images will come from page scraping
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

Return a JSON object with these 3 fields only. No markdown. DO NOT include price - prices are scraped from product pages.`;

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
      // NO estimatedPrice - prices come from page scraping
    };
  } catch (error) {
    console.error(`Enhancement parsing failed for ${product.name}:`, error);
    return product;
  }
}

