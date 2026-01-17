# Shopii Recommendation Strategy

## Philosophy: Adaptive Preferences

User preferences should be **guides, not constraints**. The system learns from behavior and adapts over time.

## Recommendation Scoring System

### Weight Distribution

```
Total Score = (Preference Match × 0.25) +
              (Behavioral Signals × 0.50) +
              (Context Relevance × 0.15) +
              (Quality/Rating × 0.10)
```

### 1. Preference Match (25% weight)

**Early Stage (< 10 interactions)**
- Use stated preferences heavily
- Categories: Hard filter if specified
- Budget: Soft constraint (±20% acceptable)
- Quality preference: Guide tier selection
- Brand preferences: Boost score +15%
- Brand exclusions: Hard filter

**Growth Stage (10-50 interactions)**
- Stated preferences weight: 15%
- Observed category affinity: 10%
- Budget becomes more flexible (±30%)

**Mature Stage (50+ interactions)**
- Stated preferences weight: 5%
- Behavioral patterns dominate
- Budget is informational only
- Categories can be ignored if behavior suggests otherwise

### 2. Behavioral Signals (50% weight)

Track user interactions with scoring:
- **Product view**: +1 point
- **Click through to retailer**: +5 points
- **Save/bookmark**: +8 points
- **Dismiss/not interested**: -10 points
- **Repeated views**: +3 points per view

**Category Affinity Score:**
```javascript
categoryAffinity[category] = (
  (views × 1) +
  (clicks × 5) +
  (saves × 8) -
  (dismisses × 10)
) / totalInteractions
```

**Brand Affinity:** Same calculation per brand

**Price Range Detection:**
```javascript
observedBudget = {
  min: percentile(clickedPrices, 10),  // 10th percentile
  max: percentile(clickedPrices, 90),  // 90th percentile
  sweet_spot: median(clickedPrices)
}
```

### 3. Context Relevance (15% weight)

- **Current page context**: If on Amazon product page, prioritize alternatives
- **Search query**: Parse intent (comparison, best, cheap, premium)
- **Time of day**: Different products for different times
- **Recent searches**: Topic continuity bonus

### 4. Quality/Rating (10% weight)

- AI Rating (from Reddit/forums)
- Number of sources analyzed
- Recency of reviews
- Confidence score

## Implementation Phases

### Phase 1: Cold Start (Guest/New Users)
**Goal:** Get user started quickly
- Show onboarding preferences form
- Use stated preferences as primary signal
- Track every interaction for fast learning
- Show diverse products to learn taste

**Storage:** `chrome.storage.local`
```json
{
  "guestPreferences": {
    "categories": ["electronics"],
    "budgetRange": [100, 500],
    "qualityPreference": "mid-range"
  },
  "interactions": []
}
```

### Phase 2: Learning (10-50 interactions)
**Goal:** Refine understanding
- Blend stated + observed preferences
- Start suggesting adjacent categories
- Detect price comfort zone
- Build brand affinity map

### Phase 3: Mature (50+ interactions)
**Goal:** Personalized discovery
- Behavior-driven recommendations
- Suggest products outside stated preferences
- Predict needs based on patterns
- Proactive suggestions

## Database Schema for Behavioral Tracking

Already exists in `UserInteraction` model:
```prisma
model UserInteraction {
  id              String   @id @default(uuid())
  userId          String
  productId       String?
  interactionType String   // 'view', 'click', 'save', 'dismiss'
  context         String?  // JSON: page URL, search query, etc.
  createdAt       DateTime @default(now())
}
```

## AI Prompt Enhancement

When generating recommendations, include:

```
BEHAVIORAL CONTEXT:
- User has viewed X products in categories: [list]
- User typically clicks products in price range: $X-$Y
- User shows preference for brands: [list]
- User has dismissed: [list]
- Recent searches: [list]

STATED PREFERENCES (reference only, not constraints):
- Categories: [list]
- Budget: $X-$Y
- Quality: mid-range

INSTRUCTION:
Prioritize recommendations that match behavioral patterns.
Stated preferences are guides, not hard filters.
Feel free to suggest products outside stated categories if behavior suggests interest.
```

## Privacy Considerations

- All behavioral data stored locally until signup
- After signup, encrypted in database
- User can view/clear their interaction history
- User can reset recommendations to start fresh

## A/B Testing Ideas

1. **Adaptive vs Static:** Compare conversion rates
2. **Weight tuning:** Test different weight distributions
3. **Context awareness:** Measure impact of contextual signals
4. **Discovery mode:** Test showing 20% "out of preference" products

## Next Steps

1. ✅ Implement guest preference storage
2. ✅ Transfer preferences on signup
3. ⏳ Track interactions in extension
4. ⏳ Build scoring algorithm in API
5. ⏳ Add behavioral signals to recommendation endpoint
6. ⏳ Create dashboard for users to view their patterns
