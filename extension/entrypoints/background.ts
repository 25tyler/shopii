export default defineBackground(() => {
  console.log('Shopii background service worker started');

  // Open side panel when extension icon is clicked
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  });

  // Enable side panel on all tabs
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Handle messages from content scripts and sidepanel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'TRACK_AFFILIATE_CLICK':
        handleAffiliateClick(message.payload);
        sendResponse({ success: true });
        break;

      case 'GET_PAGE_CONTEXT':
        if (sender.tab?.id) {
          getPageContext(sender.tab.id).then(sendResponse);
          return true; // Keep channel open for async response
        }
        sendResponse({ error: 'No tab ID' });
        break;

      case 'API_REQUEST':
        handleApiRequest(message.payload)
          .then(sendResponse)
          .catch((error) => sendResponse({ error: error.message }));
        return true; // Keep channel open for async response

      default:
        console.log('Unknown message type:', message.type);
    }
  });

  // Listen for tab updates to detect shopping sites
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      const isShoppingSite = checkIfShoppingSite(tab.url);
      // Could trigger notifications or UI updates here
      if (isShoppingSite) {
        console.log('Shopping site detected:', tab.url);
      }
    }
  });
});

// Track affiliate link clicks
async function handleAffiliateClick(payload: {
  productId: string;
  retailer: string;
  url: string;
}) {
  try {
    // Store click locally for now (will send to API later)
    const { affiliateClicks = [] } = await chrome.storage.local.get('affiliateClicks');
    affiliateClicks.push({
      ...payload,
      timestamp: Date.now(),
    });
    await chrome.storage.local.set({ affiliateClicks });

    console.log('Tracked affiliate click:', payload);
  } catch (error) {
    console.error('Failed to track affiliate click:', error);
  }
}

// Get context from current page
async function getPageContext(tabId: number) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return {
          url: window.location.href,
          title: document.title,
          // Try to extract product info from common patterns
          productName: document.querySelector('h1')?.textContent?.trim(),
        };
      },
    });

    return results[0]?.result || null;
  } catch (error) {
    console.error('Failed to get page context:', error);
    return null;
  }
}

// Handle API requests from sidepanel
async function handleApiRequest(payload: {
  endpoint: string;
  method: string;
  body?: any;
}) {
  const API_BASE_URL = 'https://api.shopii.com'; // Will be configured later

  try {
    const response = await fetch(`${API_BASE_URL}${payload.endpoint}`, {
      method: payload.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload.body ? JSON.stringify(payload.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// Check if URL is a shopping site
function checkIfShoppingSite(url: string): boolean {
  const shoppingSites = [
    'amazon.com',
    'bestbuy.com',
    'walmart.com',
    'target.com',
    'ebay.com',
    'newegg.com',
    'bhphotovideo.com',
    'costco.com',
    'homedepot.com',
    'lowes.com',
  ];

  try {
    const hostname = new URL(url).hostname;
    return shoppingSites.some((site) => hostname.includes(site));
  } catch {
    return false;
  }
}
