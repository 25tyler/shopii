export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('Shopii content script loaded');

    // Listen for messages from background/sidepanel
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'EXTRACT_PAGE_CONTEXT':
          sendResponse(extractPageContext());
          break;

        case 'HIGHLIGHT_PRODUCT':
          highlightElement(message.selector);
          sendResponse({ success: true });
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    });
  },
});

// Extract product information from the current page
function extractPageContext() {
  const hostname = window.location.hostname;

  // Site-specific extractors
  if (hostname.includes('amazon.com')) {
    return extractAmazonProduct();
  } else if (hostname.includes('bestbuy.com')) {
    return extractBestBuyProduct();
  } else if (hostname.includes('walmart.com')) {
    return extractWalmartProduct();
  }

  // Generic extraction
  return extractGenericProduct();
}

function extractAmazonProduct() {
  const productName = document.querySelector('#productTitle')?.textContent?.trim();
  const price = document.querySelector('.a-price .a-offscreen')?.textContent?.trim();
  const image = document.querySelector('#landingImage')?.getAttribute('src');
  const asin = window.location.pathname.match(/\/dp\/([A-Z0-9]+)/)?.[1];

  return {
    url: window.location.href,
    title: document.title,
    productName,
    price,
    imageUrl: image,
    retailer: 'Amazon',
    externalId: asin,
  };
}

function extractBestBuyProduct() {
  const productName = document.querySelector('.sku-title h1')?.textContent?.trim();
  const price = document.querySelector('.priceView-hero-price span')?.textContent?.trim();
  const image = document.querySelector('.primary-image img')?.getAttribute('src');

  return {
    url: window.location.href,
    title: document.title,
    productName,
    price,
    imageUrl: image,
    retailer: 'Best Buy',
  };
}

function extractWalmartProduct() {
  const productName = document.querySelector('[itemprop="name"]')?.textContent?.trim();
  const price = document.querySelector('[itemprop="price"]')?.getAttribute('content');
  const image = document.querySelector('[data-testid="hero-image"] img')?.getAttribute('src');

  return {
    url: window.location.href,
    title: document.title,
    productName,
    price: price ? `$${price}` : undefined,
    imageUrl: image,
    retailer: 'Walmart',
  };
}

function extractGenericProduct() {
  // Try common patterns
  const productName =
    document.querySelector('h1')?.textContent?.trim() ||
    document.querySelector('[itemprop="name"]')?.textContent?.trim();

  const price =
    document.querySelector('[itemprop="price"]')?.getAttribute('content') ||
    document.querySelector('[class*="price"]')?.textContent?.trim();

  const image =
    document.querySelector('[itemprop="image"]')?.getAttribute('src') ||
    document.querySelector('meta[property="og:image"]')?.getAttribute('content');

  return {
    url: window.location.href,
    title: document.title,
    productName,
    price,
    imageUrl: image,
    retailer: extractRetailerFromUrl(window.location.hostname),
  };
}

function extractRetailerFromUrl(hostname: string): string {
  // Remove common prefixes and suffixes
  const cleaned = hostname
    .replace('www.', '')
    .replace('.com', '')
    .replace('.co', '')
    .replace('.net', '');

  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function highlightElement(selector: string) {
  const element = document.querySelector(selector);
  if (element) {
    (element as HTMLElement).style.boxShadow = '0 0 0 3px #6366f1, 0 0 20px rgba(99, 102, 241, 0.3)';
    (element as HTMLElement).style.borderRadius = '8px';
  }
}
