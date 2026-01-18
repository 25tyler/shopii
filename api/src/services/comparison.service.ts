// Comparison service - deep product research and visualization data generation
import OpenAI from 'openai';
import { tavily } from '@tavily/core';
import type {
  ComparisonData,
  SentimentChartData,
  FeatureMatrixData,
  PriceComparisonData,
  MentionTrendsData,
} from '../types/index.js';
import { lookupProductUrl } from './product-extraction.service.js';

// Lazy initialization
let _openai: OpenAI | null = null;
let _tavily: ReturnType<typeof tavily> | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

function getTavily() {
  if (!_tavily) {
    _tavily = tavily({ apiKey: process.env.TAVILY_API_KEY! });
  }
  return _tavily;
}

interface ResearchedProduct {
  name: string;
  brand: string;
  sources: Array<{
    title: string;
    url: string;
    content: string;
    sourceType: 'reddit' | 'youtube' | 'expert_review' | 'forum' | 'other';
  }>;
  rawMentions: string[]; // Collected quotes/mentions
}

// Interface for pre-researched product data from search mode
export interface PreResearchedProduct {
  name: string;
  brand: string;
  description: string;
  pros: string[];
  cons: string[];
  endorsementQuotes: string[];
  sourcesCount: number;
  price?: number;
  retailer?: string;
}

/**
 * Main comparison function - uses pre-researched data from initial search
 */
export async function conductDeepComparison(
  productNames: string[], // e.g., ["Sony WH-1000XM5", "Bose QC45"]
  preResearchedData: PreResearchedProduct[], // Existing research data
  userQuery: string,
  onProgress?: (message: string) => void
): Promise<ComparisonData> {
  console.log(`[Comparison] Starting comparison for ${productNames.length} products using pre-researched data`);

  if (productNames.length < 2) {
    throw new Error('Comparison requires at least 2 products');
  }

  if (productNames.length > 5) {
    productNames = productNames.slice(0, 5); // Limit to 5 for performance
  }

  // Convert pre-researched data to ResearchedProduct format
  const researchedProducts: ResearchedProduct[] = preResearchedData.map(product => ({
    name: product.name,
    brand: product.brand,
    sources: [
      {
        title: `Research summary for ${product.name}`,
        url: '',
        content: `${product.description}\n\nPros: ${product.pros.join(', ')}\n\nCons: ${product.cons.join(', ')}\n\n${product.endorsementQuotes.join('\n\n')}`,
        sourceType: 'other' as const,
      }
    ],
    rawMentions: [
      product.description,
      ...product.endorsementQuotes,
      ...product.pros.map(pro => `Positive: ${pro}`),
      ...product.cons.map(con => `Negative: ${con}`),
    ],
  }));

  // Step 1: Generate sentiment data from pre-researched pros/cons
  onProgress?.('Analyzing sentiment...');
  const sentimentData = await generateSentimentFromPreResearch(preResearchedData);

  // Step 2: Extract features and build comparison matrix
  onProgress?.('Extracting features...');
  const featureMatrix = await generateFeatureMatrix(researchedProducts, userQuery);

  // Step 3: Calculate mention trends from sources count
  onProgress?.('Calculating popularity...');
  const mentionTrends: MentionTrendsData = {
    products: preResearchedData.map(p => ({
      name: p.name,
      totalMentions: p.sourcesCount || 1,
    })),
  };

  // Step 4: Generate AI summary comparing all products
  onProgress?.('Generating comparison summary...');
  const summary = await generateComparisonSummary(researchedProducts, userQuery);

  console.log(`[Comparison] Comparison complete for ${productNames.length} products`);

  return {
    products: productNames,
    visualizations: {
      sentiment: sentimentData,
      features: featureMatrix,
      mentions: mentionTrends,
    },
    summary,
  };
}

/**
 * Research a single product deeply (20-30 sources)
 */
async function researchProductForComparison(
  productName: string,
  onProgress?: (message: string) => void
): Promise<ResearchedProduct> {
  const client = getTavily();

  onProgress?.(`Researching ${productName}...`);

  // Parse brand and name
  const parts = productName.split(' ');
  const brand = parts[0] || '';
  const name = productName;

  const searchQueries = [
    `"${productName}" review pros cons`,
    `"${productName}" reddit discussion`,
    `"${productName}" vs comparison`,
    `"${productName}" "worth it"`,
    `"${productName}" expert review`,
  ];

  const sources: ResearchedProduct['sources'] = [];
  const rawMentions: string[] = [];
  const seenUrls = new Set<string>();

  // Execute searches in parallel
  const searchPromises = searchQueries.map(async (query) => {
    try {
      const response = await client.search(query, {
        searchDepth: 'advanced',
        maxResults: 6,
        includeAnswer: false,
      });

      return response.results || [];
    } catch (error) {
      console.error(`Search failed for "${query}":`, error);
      return [];
    }
  });

  const searchResults = await Promise.all(searchPromises);

  // Process all results
  for (const results of searchResults) {
    for (const result of results) {
      if (seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);

      const sourceType = inferSourceType(result.url);
      sources.push({
        title: result.title,
        url: result.url,
        content: result.content,
        sourceType,
      });

      // Collect raw mentions for sentiment analysis
      rawMentions.push(result.content);
    }
  }

  console.log(`[Comparison] Found ${sources.length} sources for ${productName}`);

  return {
    name,
    brand,
    sources,
    rawMentions,
  };
}

/**
 * Infer source type from URL
 */
function inferSourceType(url: string): ResearchedProduct['sources'][0]['sourceType'] {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes('reddit.com')) return 'reddit';
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
  if (lowerUrl.includes('wirecutter') || lowerUrl.includes('rtings') || lowerUrl.includes('consumerreports') || lowerUrl.includes('outdoorgearlab')) {
    return 'expert_review';
  }
  if (lowerUrl.includes('forum') || lowerUrl.includes('head-fi') || lowerUrl.includes('styleforum') || lowerUrl.includes('avsforum')) {
    return 'forum';
  }

  return 'other';
}

/**
 * Generate sentiment data from pre-researched product pros/cons
 */
async function generateSentimentFromPreResearch(products: PreResearchedProduct[]): Promise<SentimentChartData> {
  return {
    products: products.map(product => {
      // Calculate sentiment based on pros vs cons ratio
      const totalItems = product.pros.length + product.cons.length;
      const positiveRatio = totalItems > 0 ? (product.pros.length / totalItems) * 100 : 50;
      const negativeRatio = totalItems > 0 ? (product.cons.length / totalItems) * 100 : 50;

      // Distribute across all source types (since we don't have source-specific data)
      return {
        name: product.name,
        reddit: {
          positive: Math.round(positiveRatio),
          negative: Math.round(negativeRatio),
          neutral: Math.round(100 - positiveRatio - negativeRatio),
        },
        youtube: {
          positive: Math.round(positiveRatio),
          negative: Math.round(negativeRatio),
          neutral: Math.round(100 - positiveRatio - negativeRatio),
        },
        expertReviews: {
          positive: Math.round(positiveRatio),
          negative: Math.round(negativeRatio),
          neutral: Math.round(100 - positiveRatio - negativeRatio),
        },
      };
    }),
  };
}

/**
 * Generate sentiment data by analyzing sources for each product
 */
async function generateSentimentData(products: ResearchedProduct[]): Promise<SentimentChartData> {
  const sentimentPromises = products.map(async (product) => {
    // Group sources by type
    const redditSources = product.sources.filter(s => s.sourceType === 'reddit');
    const youtubeSources = product.sources.filter(s => s.sourceType === 'youtube');
    const expertSources = product.sources.filter(s => s.sourceType === 'expert_review');

    // Analyze sentiment for each source type
    const [redditSentiment, youtubeSentiment, expertSentiment] = await Promise.all([
      analyzeSentiment(redditSources.map(s => s.content)),
      analyzeSentiment(youtubeSources.map(s => s.content)),
      analyzeSentiment(expertSources.map(s => s.content)),
    ]);

    return {
      name: product.name,
      reddit: redditSentiment,
      youtube: youtubeSentiment,
      expertReviews: expertSentiment,
    };
  });

  const productSentiments = await Promise.all(sentimentPromises);

  return { products: productSentiments };
}

/**
 * Analyze sentiment from text snippets using GPT-4
 */
async function analyzeSentiment(
  texts: string[]
): Promise<{ positive: number; negative: number; neutral: number }> {
  if (texts.length === 0) {
    return { positive: 0, negative: 0, neutral: 0 };
  }

  const combinedText = texts.slice(0, 10).join('\n\n').slice(0, 4000); // Limit token usage

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You analyze product review sentiment. Return only JSON.',
        },
        {
          role: 'user',
          content: `Analyze the sentiment of these product review snippets and return JSON with:
{
  "positive": <number 0-100>,
  "negative": <number 0-100>,
  "neutral": <number 0-100>
}

The three numbers should sum to 100.

Snippets:
${combinedText}`,
        },
      ],
      max_tokens: 100,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return {
        positive: parsed.positive || 0,
        negative: parsed.negative || 0,
        neutral: parsed.neutral || 0,
      };
    }
  } catch (error) {
    console.error('Sentiment analysis error:', error);
  }

  // Fallback: equal distribution
  return { positive: 33, negative: 33, neutral: 34 };
}

/**
 * Extract features and generate comparison matrix
 */
async function generateFeatureMatrix(
  products: ResearchedProduct[],
  userQuery: string
): Promise<FeatureMatrixData> {
  // Use GPT-4 to extract common features across all products
  const productSummaries = products.map(p => {
    const topSources = p.sources.slice(0, 5).map(s => s.content).join('\n\n');
    return `**${p.name}**:\n${topSources.slice(0, 2000)}`;
  }).join('\n\n---\n\n');

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You extract product features for comparison tables. Return only JSON.

Your job is to:
1. Identify the 5-8 most important comparable features across these products
2. Extract the value for each feature for each product
3. Return structured data for a comparison matrix`,
        },
        {
          role: 'user',
          content: `User is comparing these products for: "${userQuery}"

Extract common features and their values for each product. Return JSON:
{
  "features": ["Feature1", "Feature2", ...],
  "products": ["Product A", "Product B", ...],
  "values": [
    ["value for Product A Feature1", "value for Product A Feature2", ...],
    ["value for Product B Feature1", "value for Product B Feature2", ...],
    ...
  ]
}

Important:
- Focus on comparable, objective features (price, weight, battery life, specs)
- Include subjective features mentioned frequently (comfort, sound quality, build quality)
- Limit to 5-8 features
- Values can be numbers (e.g., 30) or short strings (e.g., "Excellent", "30 hours")

Product data:
${productSummaries}`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return {
        features: parsed.features || [],
        products: parsed.products || products.map(p => p.name),
        values: parsed.values || [],
      };
    }
  } catch (error) {
    console.error('Feature extraction error:', error);
  }

  // Fallback: basic feature matrix
  return {
    features: ['Price', 'Rating', 'Availability'],
    products: products.map(p => p.name),
    values: products.map(() => ['N/A', 'N/A', 'N/A']),
  };
}

/**
 * Look up prices for products
 */
async function generatePriceComparison(productNames: string[]): Promise<PriceComparisonData> {
  const pricePromises = productNames.map(async (name) => {
    try {
      // Extract brand and product name
      const parts = name.split(' ');
      const brand = parts[0] || '';

      const urlInfo = await lookupProductUrl(name, brand);

      if (urlInfo && urlInfo.price) {
        // Parse price (remove currency symbols, take first number if range)
        const priceStr = urlInfo.price.replace(/[$€£¥,\s]/g, '');
        const priceMatch = priceStr.match(/(\d+\.?\d*)/);
        const price = priceMatch ? parseFloat(priceMatch[1]!) : 0;

        return {
          name,
          price,
          retailer: urlInfo.retailer,
        };
      }
    } catch (error) {
      console.error(`Price lookup failed for ${name}:`, error);
    }

    return {
      name,
      price: 0, // Will show as "Price unavailable" in UI
      retailer: 'Unknown',
    };
  });

  const priceData = await Promise.all(pricePromises);
  return { products: priceData };
}

/**
 * Calculate mention trends from research data
 */
function generateMentionTrends(products: ResearchedProduct[]): MentionTrendsData {
  return {
    products: products.map(p => ({
      name: p.name,
      totalMentions: p.sources.length,
      // Note: Temporal trends not available from Tavily, so we just show total mentions
      // In a future version, could scrape Reddit/forum post dates for trend analysis
    })),
  };
}

/**
 * Generate AI comparison summary
 */
async function generateComparisonSummary(
  products: ResearchedProduct[],
  userQuery: string
): Promise<string> {
  // Build context from research
  const productContexts = products.map(p => {
    const topQuotes = p.rawMentions.slice(0, 5).join('\n\n');
    return `**${p.name}** (${p.sources.length} sources):\n${topQuotes.slice(0, 1500)}`;
  }).join('\n\n---\n\n');

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are Shopii's comparison assistant. Create concise, data-driven comparisons.

Your summary should:
1. Highlight key differences between products (2-3 sentences)
2. Recommend which product is best for specific use cases
3. Be honest about trade-offs
4. Cite specific sources when making claims

Keep it under 200 words.`,
        },
        {
          role: 'user',
          content: `User wants to compare these products for: "${userQuery}"

Based on this research, write a comparison summary:

${productContexts}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      return content;
    }
  } catch (error) {
    console.error('Comparison summary generation error:', error);
  }

  // Fallback summary
  const productList = products.map(p => p.name).join(', ');
  return `Based on research from ${products.reduce((acc, p) => acc + p.sources.length, 0)} sources, here's a comparison of ${productList}. Check the visualizations above for detailed sentiment analysis, feature comparisons, and pricing information.`;
}
