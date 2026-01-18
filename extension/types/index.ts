// User types
export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  plan: 'guest' | 'free' | 'pro';
  createdAt: string;
}

export interface UserPreferences {
  categories: string[];
  budgetRange: {
    min: number;
    max: number;
    currency: string;
  };
  qualityPreference: 'budget' | 'mid-range' | 'premium';
  brandPreferences: string[];
  brandExclusions: string[];
}

// Research progress types
export interface ResearchSource {
  name: string; // "Reddit", "YouTube", "Expert Reviews", "Forums", "AI Analysis"
  status: 'searching' | 'found' | 'complete';
  count?: number; // Number of results found
  timestamp: number;
}

export interface ResearchProgressEvent {
  type: 'search_start' | 'search_complete' | 'source_found' | 'ai_analysis_start' | 'ai_analysis_complete' | 'research_summary';
  source?: string;
  query?: string;
  count?: number;
  timestamp: number;
  totalSearches?: number;
  totalSources?: number;
}

// Mode types
export type ChatMode = 'ask' | 'search' | 'comparison' | 'auto';

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
    trends?: Array<{ month: string; count: number }>; // Optional temporal data
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
  summary: string; // AI-generated comparison summary
}

// Chat types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  products?: ProductCard[];
  comparisonData?: ComparisonData; // For comparison mode
  mode?: ChatMode; // Which mode was used to generate this message
  isLoading?: boolean;
  researchSources?: ResearchSource[]; // For loading messages to show research progress
  researchSummary?: { totalSearches: number; totalSources: number }; // Summary shown after loading
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// Product types
export interface ProductCard {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  imageUrls?: string[]; // Multiple product images for carousel
  price: {
    amount: number | null; // null when price not known (shows "Price varies")
    currency: string;
  };
  aiRating: number; // General product quality (0-100)
  matchScore: number; // How well it matches the search query (0-100)
  confidence: number; // Legacy - kept for backwards compat
  pros: string[];
  cons: string[];
  affiliateUrl: string;
  retailer: string;
  isSponsored?: boolean;
}

export interface ProductRating {
  overall: number;
  sentiment: number;
  reliability: number;
  value: number;
  popularity: number;
  confidence: number;
  sourcesAnalyzed: number;
}

// API types
export interface ChatRequest {
  message: string;
  conversationId?: string;
  pageContext?: PageContext;
}

export interface ChatResponse {
  message: string;
  products?: ProductCard[];
  conversationId: string;
}

export interface PageContext {
  url: string;
  title: string;
  productName?: string;
  price?: string;
  imageUrl?: string;
  retailer?: string;
}

// Search types
export interface SearchFilters {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
}
