// Web scraper service - fetches and parses product pages
import * as cheerio from 'cheerio';

export interface ScrapedProductPage {
  success: boolean;
  title: string;
  price: string | null;
  images: string[];  // 3-5 product images
  content: string;    // Text for AI verification
  error?: string;
}

export async function scrapeProductPage(url: string): Promise<ScrapedProductPage> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShopiiBot/1.0)' },
      redirect: 'follow',
    });

    if (!response.ok) {
      return {
        success: false,
        title: '',
        price: null,
        images: [],
        content: '',
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title
    const title = $('title').text().trim();

    // Extract price (common e-commerce selectors)
    const price = extractPrice($);

    // Extract product images (3-5 from main gallery)
    const images = extractProductImages($);

    // Extract text for AI verification (limit to 3000 chars)
    $('script, style, nav, footer, header').remove();
    const content = $('body').text().trim().slice(0, 3000);

    return { success: true, title, price, images, content };
  } catch (error: any) {
    return {
      success: false,
      title: '',
      price: null,
      images: [],
      content: '',
      error: error.message,
    };
  }
}

// Extract structured data from JSON-LD (most reliable)
function extractFromJsonLd($: cheerio.CheerioAPI): { price: string | null; images: string[] } {
  const result = { price: null as string | null, images: [] as string[] };

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const jsonText = $(el).html() || '{}';
      const data = JSON.parse(jsonText);

      // Handle arrays of JSON-LD objects
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        // Extract price from Product schema
        if (item['@type'] === 'Product' || item['@type']?.includes?.('Product')) {
          // Try various price locations
          if (item.offers?.price) {
            result.price = String(item.offers.price);
          } else if (item.offers?.lowPrice) {
            result.price = String(item.offers.lowPrice);
          } else if (Array.isArray(item.offers) && item.offers[0]?.price) {
            result.price = String(item.offers[0].price);
          }

          // Extract images
          if (item.image) {
            const images = Array.isArray(item.image) ? item.image : [item.image];
            result.images.push(...images.map((img: any) => {
              // Handle both string URLs and image objects
              if (typeof img === 'string') return img;
              if (img?.url) return img.url;
              return null;
            }).filter(Boolean).slice(0, 5));
          }
        }
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  });

  return result;
}

// Extract price from meta tags (works even when content is JS-loaded)
function extractPriceFromMeta($: cheerio.CheerioAPI): string | null {
  const metaSelectors = [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    'meta[property="product:price"]',
    'meta[name="price"]',
    'meta[itemprop="price"]',
    'meta[itemprop="lowPrice"]',
  ];

  for (const selector of metaSelectors) {
    const el = $(selector);
    if (el.length) {
      const content = el.attr('content');
      if (content) {
        const numPrice = parseFloat(content.replace(/[^\d.]/g, ''));
        if (numPrice > 0 && numPrice < 10000) {
          return '$' + numPrice.toFixed(2);
        }
      }
    }
  }

  return null;
}

function extractPrice($: cheerio.CheerioAPI): string | null {
  // Try JSON-LD first (most reliable for modern e-commerce)
  const jsonLdData = extractFromJsonLd($);
  if (jsonLdData.price) {
    const price = jsonLdData.price;
    const numPrice = parseFloat(price.replace(/[^\d.]/g, ''));

    // Validate price is reasonable (between $0.01 and $10,000)
    if (numPrice > 0 && numPrice < 10000) {
      // Add currency symbol if not present
      if (!/[\$€£¥]/.test(price)) {
        return '$' + price;
      }
      return price;
    }
  }

  // Try meta tags first (work even when JS is needed)
  const metaPrice = extractPriceFromMeta($);
  if (metaPrice) return metaPrice;

  // Try common price selectors
  const priceSelectors = [
    // Amazon-specific (most specific first)
    '.a-price.a-text-price span.a-offscreen',
    '.a-price .a-offscreen',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '.a-price-whole',

    // Shopify-specific
    '.price__sale .price-item--sale',
    '.price .price-item--regular',
    'span.money',
    '[data-product-price]',

    // React/SPA sites
    '[data-price]',
    '[class*="ProductPrice"]',
    '[class*="product-price"]',

    // Schema.org microdata
    '[itemprop="price"]',
    '[itemprop="lowPrice"]',

    // Generic patterns (least specific)
    '[data-testid*="price" i]',
    '.price:not(.price-per):not(.unit-price)',
    '[class*="price" i]:not([class*="price-per" i]):not([class*="unit-price" i])',
    'span[class*="Price" i]',
  ];

  for (const selector of priceSelectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = (el.attr('content') || el.text()).trim();

      // Skip if this looks like a subscription/pack price indicator
      if (/subscribe|subscription|pack|case|bulk|per\s+item/i.test(text)) {
        continue;
      }

      // Match price pattern: optional currency symbol, digits with optional comma separators, optional decimal
      const match = text.match(/[\$€£¥]?\s*(\d{1,3}(?:,?\d{3})*(?:\.\d{2})?)/);
      if (match) {
        const priceStr = match[0].trim();
        const numPrice = parseFloat(priceStr.replace(/[^\d.]/g, ''));

        // Validate price is reasonable (between $0.01 and $10,000)
        if (numPrice > 0 && numPrice < 10000) {
          // Ensure it has currency symbol
          if (!/[\$€£¥]/.test(priceStr)) {
            return '$' + numPrice.toFixed(2);
          }
          return priceStr;
        }
      }
    }
  }

  return null;
}

function extractProductImages($: cheerio.CheerioAPI): string[] {
  let images: string[] = [];

  // Try JSON-LD first (most reliable)
  const jsonLdData = extractFromJsonLd($);
  if (jsonLdData.images.length > 0) {
    images = jsonLdData.images.map(normalizeImageUrl);
    if (images.length >= 3) {
      return images.slice(0, 5);
    }
  }

  // Try image selectors
  const imageSelectors = [
    // Shopify-specific
    '.product__media img',
    '.product-media-container img',
    '[data-media-id] img',
    '.product-single__photo img',

    // React/SPA sites
    'img[data-product-image]',
    'img[data-main-image]',
    '[class*="ProductImage"] img',
    '[class*="product-image"] img',

    // Standard meta tags
    'meta[property="og:image"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',

    // Generic patterns
    'img[data-testid*="product"]',
    'img[class*="product"]',
    'img[class*="gallery"]',
    '.product-image img',
    '#product-images img',

    // Broader fallbacks
    'main img[src*="product"]',
    'article img',
  ];

  for (const selector of imageSelectors) {
    $(selector).each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('content') || $(el).attr('data-src');
      if (src && !images.includes(src) && images.length < 5) {
        // Filter out tiny images (icons, logos, etc)
        if (!src.includes('icon') && !src.includes('logo') && !src.includes('placeholder')) {
          const normalized = normalizeImageUrl(src);
          if (normalized && !images.includes(normalized)) {
            images.push(normalized);
          }
        }
      }
    });
    if (images.length >= 3) break; // Stop once we have enough
  }

  return images.slice(0, 5); // Max 5 images
}

// Normalize image URLs (handle protocol-relative URLs, etc)
function normalizeImageUrl(url: string): string {
  if (!url) return '';

  // Handle protocol-relative URLs (//cdn.example.com/image.jpg)
  if (url.startsWith('//')) {
    return 'https:' + url;
  }

  return url;
}
