# Shopii - AI-Powered Shopping Assistant

A browser extension that helps users find products based on real user opinions from Reddit, YouTube, expert reviews, and forums.

## Quick Start (Development Mode)

Development mode runs without any external services - no API keys, no database server, no Redis required.

### 1. Start the API

```bash
cd api
npm install
npm run setup    # Creates SQLite database and seeds test data
npm run dev      # Starts server at http://localhost:3001
```

### 2. Build the Extension

```bash
cd extension
npm install
npm run build
```

### 3. Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/.output/chrome-mv3` folder

### 4. Test It

1. Click the Shopii extension icon in Chrome
2. The side panel will open
3. Complete the onboarding flow
4. Try chatting: "I need good wireless headphones"
5. Check the "For You" tab for product suggestions

## Development Mode Features

The API runs in a special dev mode with:
- **Mock AI responses** - Pre-built responses for common queries
- **SQLite database** - No PostgreSQL needed
- **In-memory rate limiting** - No Redis needed
- **Auto-authentication** - Automatically logged in as a test user
- **Seeded test data** - 8 sample products with ratings

## Test Endpoints

While the API is running, you can test:

```bash
# Health check
curl http://localhost:3001/health

# Get suggestions
curl http://localhost:3001/api/suggestions

# Search products
curl "http://localhost:3001/api/products/search?q=headphones"

# Chat
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "I need good headphones"}'

# Get current user
curl http://localhost:3001/api/auth/me
```

## Project Structure

```
shopii/
├── api/                    # Backend API (Node.js + Fastify)
│   ├── prisma/            # Database schema and migrations
│   └── src/
│       ├── routes/        # API endpoints
│       ├── services/      # Business logic
│       ├── config/        # Configuration
│       └── middleware/    # Auth, rate limiting, etc.
│
├── extension/              # Browser extension (WXT + React)
│   ├── components/        # React components
│   ├── stores/           # Zustand state management
│   ├── services/         # API client
│   └── entrypoints/      # Extension entry points
│
└── scraper/               # Web scraping service (Python - not needed for dev)
```

## Sample Products Included

| Product | Rating | Category |
|---------|--------|----------|
| MacBook Pro 14" M3 Pro | 94/100 | Computing |
| Sony WH-1000XM5 | 92/100 | Audio |
| Logitech MX Master 3S | 91/100 | Peripherals |
| Keychron Q1 Pro | 89/100 | Peripherals |
| Apple AirPods Max | 88/100 | Audio |
| Bose QuietComfort Ultra | 87/100 | Audio |
| Samsung Odyssey G9 | 86/100 | Monitors |
| Dell XPS 15 | 85/100 | Computing |

## Production Setup

For production, you'll need:
- PostgreSQL database
- Redis for rate limiting
- Supabase project for authentication
- Anthropic API key for Claude
- Stripe account for billing

See the plan file at `~/.claude/plans/bubbly-mapping-otter.md` for full architecture details.
