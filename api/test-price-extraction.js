// Test price extraction for debugging
import { tavily } from '@tavily/core';
import FirecrawlApp from '@mendable/firecrawl-js';
import 'dotenv/config';

const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
const firecrawl = process.env.FIRECRAWL_API_KEY
  ? new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })
  : null;

// Test URL - Thorne Vitamin B12 (this one showed $24.00)
const testUrl = 'https://www.thorne.com/products/dp/methylcobalamin';
const productName = 'Thorne Vitamin B12';

console.log('\n=== Testing Price Extraction ===\n');
console.log('Test URL:', testUrl);
console.log('Product:', productName);

// Test 1: Tavily Extract
console.log('\n--- Test 1: Tavily Extract ---');
try {
  const response = await client.extract([testUrl], { includeImages: false });
  if (response.results && response.results.length > 0) {
    const content = response.results[0].rawContent || '';
    console.log('✓ Tavily extracted', content.length, 'chars');

    // Look for price patterns
    const priceMatches = content.match(/\$\d+\.\d{2}/g);
    console.log('Price patterns found:', priceMatches ? priceMatches.slice(0, 5) : 'none');

    // Save first 1000 chars for inspection
    console.log('\nFirst 500 chars of content:');
    console.log(content.slice(0, 500));
  } else {
    console.log('✗ No results from Tavily extract');
  }
} catch (error) {
  console.error('✗ Tavily extract error:', error.message);
}

// Test 2: Firecrawl
console.log('\n--- Test 2: Firecrawl ---');
if (!firecrawl) {
  console.log('✗ Firecrawl not configured (no API key)');
} else {
  try {
    console.log('Calling firecrawl.scrapeUrl()...');
    const result = await firecrawl.scrape(testUrl, {
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 3000,
    });

    if (result.success && result.markdown) {
      console.log('✓ Firecrawl success, got', result.markdown.length, 'chars');

      // Look for price patterns
      const priceMatches = result.markdown.match(/\$\d+\.\d{2}/g);
      console.log('Price patterns found:', priceMatches ? priceMatches.slice(0, 5) : 'none');

      // Save first 1000 chars for inspection
      console.log('\nFirst 500 chars of markdown:');
      console.log(result.markdown.slice(0, 500));
    } else {
      console.log('✗ Firecrawl failed or no markdown');
      console.log('Result:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('✗ Firecrawl error:', error.message);
    console.error('Full error:', error);
  }
}

// Test 3: Test the price extraction function directly
console.log('\n--- Test 3: Direct Price Extraction ---');
const testContent = '$24/60 Capsules';
console.log('Test content:', testContent);

// Test the pattern manually
const testMatch = testContent.match(/\$(\d{1,4}(?:\.\d{2})?)["\/]?/g);
console.log('Pattern match:', testMatch);

if (testMatch) {
  const priceStr = testMatch[0].replace(/[\/"'].*$/, '').replace('$', '');
  console.log('Extracted price:', `$${parseFloat(priceStr).toFixed(2)}`);
}

console.log('\n=== Test Complete ===\n');
