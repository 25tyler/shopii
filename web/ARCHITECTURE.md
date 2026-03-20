# Shopii Web / Mobile Companion — Architecture Decision

## Decision: Progressive Web App (Option A)

### Why PWA over alternatives

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **PWA** | Reuses React + Tailwind, works on all platforms, no app store approval, shares API layer | Lacks native features (push on iOS limited), no Chrome extension APIs | **Chosen** |
| React Native | True native feel, push notifications, app store distribution | Separate component library, new build toolchain, doubles maintenance | Deferred to V3 |
| Telegram/Discord Bot | Lowest effort, zero install | Very limited UI, can't show product images/comparisons well | Separate initiative |

### Architecture

```
shopii/
├── extension/           # Chrome Extension (existing)
│   ├── components/      # React components (WXT + Chrome APIs)
│   └── stores/          # Zustand stores (chrome.storage)
├── web/                 # PWA (new)
│   ├── src/
│   │   ├── components/  # Responsive wrappers around shared components
│   │   ├── pages/       # Route-based pages
│   │   ├── stores/      # Zustand stores (localStorage instead of chrome.storage)
│   │   └── services/    # API client (same endpoints, web auth flow)
│   ├── public/
│   │   └── manifest.json
│   └── vite.config.ts
├── shared/              # (future) Extracted shared components
│   ├── components/      # Pure UI components (no platform deps)
│   ├── types/           # Shared TypeScript types
│   └── utils/           # Shared utilities
└── api/                 # Backend (unchanged)
```

### Key Differences from Extension

| Concern | Extension | Web PWA |
|---------|-----------|---------|
| **Storage** | `chrome.storage.local` | `localStorage` / IndexedDB |
| **Auth** | `chrome.identity` for Google OAuth | Standard OAuth redirect flow |
| **Side panel** | Chrome side panel API | Full-page layout, responsive |
| **Page context** | `chrome.tabs` content script injection | N/A (standalone experience) |
| **Offline** | N/A | Service worker caching |

### Component Reuse Strategy

**Phase 1 (this PR):** Set up the web app project with its own copies of critical
components, adapted for responsive web. The extension components are tightly coupled
to `chrome.*` APIs and WXT, so direct sharing isn't possible without extraction.

**Phase 2:** Extract platform-independent components into a `shared/` package:
- `ChatContainer`, `MessageBubble`, `MessageList` — pure React, no platform deps
- `ProductCard`, `ComparisonView` — display components
- Zustand store logic (with pluggable storage adapters)

**Phase 3:** Both extension and web import from `shared/`, platform-specific code
stays in each app.

### Auth Flow for Web

1. User visits `app.shopii.com`
2. Clicks "Sign in with Google" → redirects to Supabase OAuth
3. Supabase redirects back with tokens
4. Tokens stored in `localStorage`, attached to API requests via `Authorization: Bearer`
5. Token refresh handled by Supabase JS client (same as extension but without chrome.identity)

### Pages

- `/` — Chat interface (primary experience, mirrors extension side panel)
- `/search` — Product search results
- `/favorites` — Saved products
- `/settings` — Account, preferences, billing
- `/auth/callback` — OAuth return handler
