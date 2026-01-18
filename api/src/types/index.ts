import { z } from 'zod';

// User types
export const UserPlanSchema = z.enum(['free', 'pro']);
export type UserPlan = z.infer<typeof UserPlanSchema>;

export const QualityPreferenceSchema = z.enum(['budget', 'mid-range', 'premium']);
export type QualityPreference = z.infer<typeof QualityPreferenceSchema>;

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  plan: UserPlan;
  stripeCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  userId: string;
  categories: string[];
  budgetMin: number;
  budgetMax: number;
  currency: string;
  qualityPreference: QualityPreference;
  brandPreferences: string[];
  brandExclusions: string[];
}

// Product types
export interface Product {
  id: string;
  externalId: string | null;
  retailer: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  brand: string | null;
  currentPrice: number | null;
  currency: string;
  affiliateUrl: string | null;
  metadata: Record<string, unknown> | null;
  lastScrapedAt: Date | null;
  createdAt: Date;
}

export interface ProductRating {
  productId: string;
  aiRating: number;
  confidence: number;
  sentimentScore: number;
  reliabilityScore: number;
  valueScore: number;
  popularityScore: number;
  sourcesAnalyzed: number;
  pros: string[];
  cons: string[];
  summary: string | null;
  calculatedAt: Date;
}

export interface ProductWithRating extends Product {
  rating: ProductRating | null;
}

// Chat types
export const MessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  pageContext: PageContext | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  productsShown: string[];
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface PageContext {
  url: string;
  title?: string;
  productName?: string;
  price?: string;
  imageUrl?: string;
  retailer?: string;
}

// Mode types
export const ChatModeSchema = z.enum(['ask', 'search', 'comparison', 'auto']);
export type ChatMode = z.infer<typeof ChatModeSchema>;

// Comparison visualization types
export interface SentimentChartData {
  products: Array<{
    name: string;
    reddit: { positive: number; negative: number; neutral: number };
    youtube: { positive: number; negative: number; neutral: number };
    expertReviews: { positive: number; negative: number; neutral: number };
  }>;
}

export interface FeatureMatrixData {
  products: string[];
  features: string[];
  values: (string | number)[][];
}

export interface PriceComparisonData {
  products: Array<{
    name: string;
    price: number;
    retailer: string;
  }>;
}

export interface MentionTrendsData {
  products: Array<{
    name: string;
    totalMentions: number;
    trends?: Array<{ month: string; count: number }>;
  }>;
}

export interface ComparisonData {
  products: string[];
  visualizations: {
    sentiment: SentimentChartData;
    features: FeatureMatrixData;
    prices: PriceComparisonData;
    mentions: MentionTrendsData;
  };
  summary: string;
}

// API Request/Response types
export const ChatMessageRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  pageContext: z
    .object({
      url: z.string().url(),
      title: z.string().optional(),
      productName: z.string().optional(),
      price: z.string().optional(),
      imageUrl: z.string().optional(),
      retailer: z.string().optional(),
    })
    .optional(),
  mode: ChatModeSchema.optional().default('auto'),
  selectedProducts: z.array(z.string()).optional(),
});

export type ChatMessageRequest = z.infer<typeof ChatMessageRequestSchema>;

export interface ChatMessageResponse {
  message: string;
  products: ProductWithRating[];
  conversationId: string;
}

export const UpdatePreferencesRequestSchema = z.object({
  categories: z.array(z.string()).optional(),
  budgetMin: z.number().min(0).optional(),
  budgetMax: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  qualityPreference: QualityPreferenceSchema.optional(),
  brandPreferences: z.array(z.string()).optional(),
  brandExclusions: z.array(z.string()).optional(),
});

export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequestSchema>;

// Search types
export const ProductSearchRequestSchema = z.object({
  query: z.string().min(1).max(200),
  category: z.string().optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  minRating: z.number().min(0).max(100).optional(),
  limit: z.number().min(1).max(50).default(20),
  offset: z.number().min(0).default(0),
});

export type ProductSearchRequest = z.infer<typeof ProductSearchRequestSchema>;

// Tracking types
export const TrackClickRequestSchema = z.object({
  productId: z.string().uuid(),
  affiliateNetwork: z.string().optional(),
  clickUrl: z.string().url(),
});

export type TrackClickRequest = z.infer<typeof TrackClickRequestSchema>;

// Subscription types
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

export interface Subscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  plan: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  createdAt: Date;
}

// Usage tracking
export interface UsageStats {
  searchCount: number;
  limit: number;
  resetAt: Date;
}

// Intent detection
export type SearchIntent =
  | { type: 'product_search'; category?: string; features?: string[]; priceRange?: { min?: number; max?: number } }
  | { type: 'product_question'; productId?: string }
  | { type: 'comparison'; products?: string[] }
  | { type: 'general_chat' };
