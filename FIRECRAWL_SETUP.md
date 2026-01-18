# Firecrawl Integration - Dynamic Price Extraction

## What Was Implemented

Added **Firecrawl** integration to handle JavaScript-rendered prices that the current static HTML scraper (Tavily extract) can't access.

### 2-Tier Fallback System

```
Product URL found
    ↓
Tier 1: Tavily Extract (fast, free)
    ↓ (if no price found)
Tier 2: Firecrawl (handles JavaScript, cheap)
    ↓
Return price or null
```

**Benefits**:
- ✅ Handles Coca-Cola and other JavaScript-heavy brand sites
- ✅ Cost-effective (only uses Firecrawl when needed)
- ✅ Graceful degradation (Firecrawl is optional)
- ✅ Fast (tries cheap method first)

## Setup Instructions

### 1. Get Firecrawl API Key

1. Go to [https://firecrawl.dev](https://firecrawl.dev)
2. Sign up for free account
3. Get your API key from dashboard
4. **Free tier**: 500 requests/month (plenty for testing)

### 2. Add API Key to Environment

Edit `api/.env` and uncomment the Firecrawl line:

```bash
# Web Scraping - Handles JavaScript-rendered prices (Optional)
# Get free API key at https://firecrawl.dev (500 requests/month free)
FIRECRAWL_API_KEY=fc-your-actual-key-here
```

### 3. Test It

The system will automatically use Firecrawl when:
1. Tavily extract fails to find a price
2. The URL is from a major retailer (isRetailProductPage check)

**Without Firecrawl key**: System works normally but may show "Price varies" for JS-rendered prices
**With Firecrawl key**: System catches most dynamic prices

## How It Works

### Code Flow

1. User searches "best sodas"
2. System extracts products from research
3. For each product:
   ```
   getPurchaseUrl()
     → lookupProductUrl()  // Finds product page URL
       → fetchPriceFromProductPage()  // NEW: 2-tier extraction
         → Tavily extract (try first)
         → Firecrawl (fallback if no price)
   ```

### Files Modified

1. **`api/src/services/product-extraction.service.ts`**:
   - Added `getFirecrawl()` function
   - Added `fetchPriceWithFirecrawl()` function
   - Updated `fetchPriceFromProductPage()` with 2-tier fallback
   - Firecrawl gracefully degrades if not configured

2. **`api/.env.example`**:
   - Added FIRECRAWL_API_KEY placeholder

3. **`api/.env`**:
   - Added commented FIRECRAWL_API_KEY with instructions

4. **`api/package.json`**:
   - Added `@mendable/firecrawl-js` dependency

## Testing

### Test Products

These products should now show prices instead of "Price varies":

1. **Coca Cola Orange Vanilla** - JS-rendered price
2. **Coca Cola Starlight** - JS-rendered price
3. **Nike Air Max** - Dynamic React content
4. **DTC brand products** - Many use JavaScript

### Test Command

```bash
# In extension, search for:
"best sodas"

# Check console logs:
cd api
npm run dev

# Look for:
[Tavily] Extracted X chars from https://...
[Tavily] No price in static content, trying Firecrawl...
[Firecrawl] Scraping https://... for Coca Cola Orange Vanilla
[Firecrawl] ✓ Got price $X.XX from page
```

## Cost Analysis

### Per Product
- Tavily extract: $0 (included in search plan)
- Firecrawl: $0.001 per request (only when Tavily fails)

### Per Search (5 products)
- **Best case** (all Tavily): $0
- **Worst case** (all Firecrawl): ~$0.005
- **Typical** (60% Tavily, 40% Firecrawl): ~$0.002

### Monthly (1000 products)
- **Free tier**: 500 requests/month = $0
- **After free tier**: ~$0.50/month

**Verdict**: Very cost-effective for significant improvement

## Monitoring

### Success Indicators

Watch logs for:
- `[Tavily] ✓ Got price` - Static price extraction worked
- `[Firecrawl] ✓ Got price` - Dynamic price extraction worked
- `[PriceExtract] ✗ No price found` - Both methods failed

### Expected Results

**Before Firecrawl**:
- ~60-70% price extraction success rate
- Many "Price varies" for brand sites

**After Firecrawl**:
- ~85-95% price extraction success rate
- Most products show real prices

## Troubleshooting

### "Firecrawl not configured" in logs
- Check that `FIRECRAWL_API_KEY` is set in `.env`
- Restart API server after adding key

### "Firecrawl scraping failed"
- Check API key is valid
- Check free tier limit (500/month)
- May need to upgrade plan

### Still seeing "Price varies"
- Some sites block all scrapers
- Price might be behind login/paywall
- Better to show "Price varies" than wrong price

## Next Steps (Optional)

If 2-tier isn't enough, consider adding:

### Tier 3: Puppeteer
For the most stubborn sites:
- Full browser automation
- Slowest but most reliable
- See `/Users/tyler/.claude/plans/dynamic-price-extraction.md` Phase 2

### Tier 4: Official APIs
Long-term solution:
- Amazon Product Advertising API
- Walmart API
- Most reliable, but requires approval

## Rollback

To disable Firecrawl:
```bash
# Comment out in api/.env:
# FIRECRAWL_API_KEY=fc-your-key

# Or remove package:
cd api && npm uninstall @mendable/firecrawl-js
```

System will gracefully fall back to Tavily-only extraction.
