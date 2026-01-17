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
  whyRecommended: string;
  pros: string[];
  cons: string[];
  sourcesCount: number;
  affiliateUrl: string | null;
  imageUrl: string | null;
  retailer: string;
  // New validation fields
  endorsementStrength: 'strong' | 'moderate' | 'weak';
  endorsementQuotes: string[]; // Actual quotes from research
  sourceTypes: string[]; // e.g., ['reddit', 'expert_review', 'forum']
  confidenceScore: number; // 0-100 based on evidence quality
}

// Amazon affiliate tag - replace with your actual tag
const AMAZON_AFFILIATE_TAG = process.env.AMAZON_AFFILIATE_TAG || 'shopii-20';

// Generate Amazon affiliate search URL for a product
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
  const prompt = `Analyze this research data and extract the BEST products that are being strongly recommended.

USER QUERY: "${userQuery}"

RESEARCH DATA:
${researchContext}

Extract up to 5 products that have STRONG EVIDENCE of being the best options. For each product, provide:

1. name: Full product name with model number if available (e.g., "Sony WH-1000XM5", not just "Sony headphones")
2. brand: Brand name
3. category: Product category
4. estimatedPrice: Price if mentioned, or null
5. whyRecommended: 2-3 sentence summary of why this is considered THE BEST, citing specific evidence from research
6. pros: Array of 3-4 specific pros mentioned in the research (use actual points from sources)
7. cons: Array of 1-2 cons mentioned (be honest about drawbacks)
8. sourcesCount: How many INDEPENDENT sources mentioned this product positively
9. endorsementStrength: "strong" (multiple sources agree it's the best), "moderate" (recommended but not unanimous), or "weak" (only mentioned once)
10. endorsementQuotes: Array of 2-3 ACTUAL PHRASES from the research that endorse this product (e.g., "best in class", "can't go wrong with this")
11. sourceTypes: Array of source types that mentioned it (e.g., ["reddit", "wirecutter", "enthusiast_forum"])
12. confidenceScore: 0-100 score based on:
    - 100: Multiple expert reviews + enthusiast consensus + superlative language
    - 80-99: Expert review pick OR strong enthusiast consensus
    - 60-79: Multiple positive mentions but no "best" designation
    - 40-59: Single strong recommendation
    - 0-39: Mentioned but weak evidence (DON'T INCLUDE THESE)

STRICT RULES:
- ONLY include products with confidenceScore >= 60
- Products must have ACTUAL evidence in the research data - don't hallucinate recommendations
- Quote actual language from sources in endorsementQuotes
- If research doesn't clearly identify "the best" products, return fewer products rather than padding with weak recommendations
- Prioritize products that enthusiasts specifically call out over generic mainstream options
- If a niche brand is consistently recommended over a mainstream alternative, include the niche brand

Return a JSON array sorted by confidenceScore (highest first). Return ONLY valid JSON, no markdown or code blocks.`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o', // Upgraded from gpt-4o-mini for better extraction
      max_tokens: 3000,
      temperature: 0.3, // Lower temperature for more consistent extraction
      messages: [
        {
          role: 'system',
          content: `You are an expert product analyst. You extract product recommendations from research data with high accuracy.

CRITICAL: Only recommend products that have STRONG EVIDENCE in the research. Never hallucinate or make up recommendations.

Your confidence scores must accurately reflect the evidence:
- 100: This product is clearly "the best" with multiple sources agreeing
- 80+: Strong recommendation with solid evidence
- 60-79: Good recommendation but could use more validation
- Below 60: Don't include - not enough evidence

Return only valid JSON arrays. No markdown formatting.`,
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
      products.map((p: any) => ({ name: p.name, confidence: p.confidenceScore }))
    );

    // Filter out low confidence products and enrich with affiliate URLs
    const filtered = products.filter((p: any) => (p.confidenceScore || 0) >= 60);
    console.log(`Filtered from ${products.length} to ${filtered.length} products (threshold: 60)`);

    return filtered
      .map((p: any) => ({
        name: p.name || 'Unknown Product',
        brand: p.brand || '',
        category: p.category || '',
        estimatedPrice: p.estimatedPrice || null,
        whyRecommended: p.whyRecommended || '',
        pros: p.pros || [],
        cons: p.cons || [],
        sourcesCount: p.sourcesCount || 1,
        affiliateUrl: generateAmazonAffiliateUrl(`${p.brand} ${p.name}`),
        imageUrl: null, // Will be fetched separately
        retailer: 'Amazon',
        // New validation fields
        endorsementStrength: p.endorsementStrength || 'moderate',
        endorsementQuotes: p.endorsementQuotes || [],
        sourceTypes: p.sourceTypes || [],
        confidenceScore: p.confidenceScore || 60,
      }));
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

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      // Return the first image result
      return data.items[0].link;
    }

    return null;
  } catch (error) {
    console.error('Image fetch error:', error);
    return null;
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
