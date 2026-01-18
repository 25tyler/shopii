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

// Chat types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  products?: ProductCard[];
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
