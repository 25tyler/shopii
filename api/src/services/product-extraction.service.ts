// Product extraction service - extracts product info from research and generates affiliate links
import OpenAI from 'openai';

// Google Custom Search API config
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX; // Custom Search Engine ID

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
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

// Generate the best purchase URL for a product
export function generatePurchaseUrl(
  productName: string,
  brand: string,
  recommendedRetailer?: string
): { url: string; retailer: string } {
  const brandLower = brand.toLowerCase();
  const fullProductName = brand ? `${brand} ${productName}` : productName;

  // Check if this is a known DTC brand
  if (DTC_BRANDS[brandLower]) {
    const brandUrl = DTC_BRANDS[brandLower];
    // Try to create a search URL for the brand's site
    const searchQuery = encodeURIComponent(productName);
    return {
      url: `${brandUrl}/search?q=${searchQuery}`,
      retailer: brand,
    };
  }

  // Check if AI recommended a specific retailer
  if (recommendedRetailer) {
    const retailerLower = recommendedRetailer.toLowerCase();

    // Direct brand website recommendation
    if (retailerLower.includes('brand') || retailerLower.includes('direct') || retailerLower.includes('official')) {
      // Try to find brand website via search
      return {
        url: `https://www.google.com/search?q=${encodeURIComponent(fullProductName + ' official site buy')}`,
        retailer: `${brand} (Official)`,
      };
    }
  }

  // Default to Amazon with affiliate tag
  const searchQuery = encodeURIComponent(fullProductName);
  let url = `https://www.amazon.com/s?k=${searchQuery}&tag=${AMAZON_AFFILIATE_TAG}`;

  return {
    url,
    retailer: 'Amazon',
  };
}

// Legacy function for backwards compatibility
export function generateAmazonAffiliateUrl(productName: string): string {
  const searchQuery = encodeURIComponent(productName);
  return `https://www.amazon.com/s?k=${searchQuery}&tag=${AMAZON_AFFILIATE_TAG}`;
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
  const prompt = `Analyze this research data and extract ALL products that are mentioned positively.

USER QUERY (for context only): "${userQuery}"

RESEARCH DATA:
${researchContext}

Extract up to 7 products that are mentioned in the research. For each product, provide DETAILED and SPECIFIC information that is QUERY-AGNOSTIC (descriptions should work regardless of how someone found this product):

1. name: Full product name. Format depends on category:
   - Electronics: Include model numbers (e.g., "Sony WH-1000XM5", "Sennheiser HD 600")
   - Fashion/Clothing: Use brand + product line (e.g., "American Giant Premium Heavyweight Tee", "Uniqlo Supima Cotton T-Shirt")
   - General products: Be as specific as the research allows (e.g., "Lodge 10.25-inch Cast Iron Skillet")
2. brand: Brand name
3. category: Product category (e.g., "T-Shirts", "Wireless Headphones", "Cast Iron Cookware")
4. estimatedPrice: Price if mentioned, or best estimate (e.g., "$299", "$50-75")
5. bestRetailer: Where to buy - "brand_direct", "amazon", or specific retailer name
6. description: 2-3 sentence GENERAL description of what this product is and who it's for. DO NOT reference the user's specific query - write as if for a product database entry.
   - Good: "A heavyweight 100% cotton t-shirt known for durability and American manufacturing. Popular among those seeking quality basics that last for years."
   - Bad: "Perfect for users looking for 100% cotton options" (too query-specific)
7. pros: Array of GENERAL product strengths (not query-specific). Include 1-6 based on research.
   - Be specific: "515 GSM heavyweight cotton", "40-hour battery life", "Made in USA"
   - These should be true regardless of why someone is searching
8. cons: Array of GENERAL product weaknesses. Include 0-4 based on research.
   - Be specific: "Runs short in length", "No wireless charging", "$50+ price point"
   - OK to have 0 if none mentioned
9. sourcesCount: How many independent sources mentioned this positively
10. endorsementStrength: "strong", "moderate", or "weak"
11. endorsementQuotes: 2-4 actual phrases from research (e.g., "best in class", "gold standard")
12. sourceTypes: Array of source types (e.g., ["reddit", "wirecutter", "enthusiast_forum"])
13. qualityScore: 0-100 GENERAL PRODUCT QUALITY rating based on:
    - Build quality and materials
    - Durability and longevity
    - Value for price
    - Overall user satisfaction across all use cases
    This is NOT about query relevance - it's about how good the product is overall.
14. matchScore: 0-100 rating of how well this product matches the USER QUERY specifically.
    - 90-100: Directly answers what user asked for
    - 70-89: Good match with minor misalignment
    - 50-69: Partial match, might work for user
    - Below 50: Tangentially related

CRITICAL RULES:
- description, pros, and cons must be QUERY-AGNOSTIC - they should make sense for ANY search that surfaces this product
- qualityScore = general product quality (cacheable, consistent)
- matchScore = relevance to THIS specific query (computed per-search)
- Only include info ACTUALLY in the research - don't hallucinate
- For fashion: Brand + product line IS a valid product name

Return a JSON array sorted by matchScore (highest first). Return ONLY valid JSON, no markdown.`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4500, // Increased for richer, more detailed responses
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `You are an expert product analyst building a product database. Extract product info that is QUERY-AGNOSTIC.

CRITICAL: Write descriptions, pros, and cons as if for a general product database - NOT tailored to any specific search query. The same product info should make sense whether someone searched "best cotton shirts", "durable t-shirts", or "American made clothing".

TWO SEPARATE RATINGS:
1. qualityScore (0-100): How good is this product OVERALL? Based on build quality, materials, durability, value. This never changes.
2. matchScore (0-100): How well does it match THIS SPECIFIC query? This varies per search.

PRODUCT NAMING:
- Electronics: Model numbers (Sony WH-1000XM5)
- Fashion: Brand + product line (American Giant Heavyweight Tee)
- Home goods: Brand + specific product (Lodge Cast Iron Skillet)

Return only valid JSON arrays. No markdown.`,
        },
        { role: 'user', content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    // Parse JSON response - handle potential markdown wrapping
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const products = JSON.parse(jsonContent);

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

        return {
          name: p.name || 'Unknown Product',
          brand: p.brand || '',
          category: p.category || '',
          estimatedPrice: p.estimatedPrice || null,
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
Price: ${product.estimatedPrice || 'Unknown'}

ADDITIONAL RESEARCH:
${enrichmentContext}

Based on the additional research, provide enhanced QUERY-AGNOSTIC information (should work for any search):

1. description: 2-3 sentence GENERAL description of this product and who it's for. Don't reference any specific search query.

2. pros: Array of GENERAL product strengths (1-6 items). Be specific with numbers/specs when available.

3. cons: Array of GENERAL product weaknesses (0-4 items). OK to return empty array if none mentioned.

4. estimatedPrice: Price if found, or best estimate (e.g., "$299", "$150-200")

Return a JSON object with these 4 fields only. No markdown.`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini', // Use mini for speed on enrichment
      max_tokens: 1000,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'You are a product database analyst. Write QUERY-AGNOSTIC descriptions that work regardless of how someone found this product. Be specific and avoid generic descriptions.',
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

    return {
      ...product,
      description: enhanced.description || product.description,
      pros: enhanced.pros?.length > 0 ? enhanced.pros : product.pros,
      cons: enhanced.cons?.length > 0 ? enhanced.cons : product.cons,
      estimatedPrice: enhanced.estimatedPrice || product.estimatedPrice,
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
