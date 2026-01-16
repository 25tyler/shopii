// API Client for Shopii Backend
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(['authToken']);
      return result.authToken || null;
    } catch {
      return null;
    }
  }

  async request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;

    const token = await this.getAuthToken();

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as ApiError;
      throw new Error(error.message || 'API request failed');
    }

    return data as T;
  }

  // Auth endpoints
  async getMe() {
    return this.request<{
      id: string;
      email: string;
      name: string | null;
      avatarUrl: string | null;
      plan: 'free' | 'pro';
      preferences: {
        categories: string[];
        budgetMin: number;
        budgetMax: number;
        currency: string;
        qualityPreference: string;
        brandPreferences: string[];
        brandExclusions: string[];
      } | null;
      subscription: {
        plan: string;
        status: string;
        currentPeriodEnd: string;
      } | null;
      createdAt: string;
    }>('/api/auth/me');
  }

  // User endpoints
  async getPreferences() {
    return this.request<{
      categories: string[];
      budgetMin: number;
      budgetMax: number;
      currency: string;
      qualityPreference: string;
      brandPreferences: string[];
      brandExclusions: string[];
    }>('/api/users/preferences');
  }

  async updatePreferences(preferences: Partial<{
    categories: string[];
    budgetMin: number;
    budgetMax: number;
    currency: string;
    qualityPreference: string;
    brandPreferences: string[];
    brandExclusions: string[];
  }>) {
    return this.request('/api/users/preferences', {
      method: 'PUT',
      body: preferences,
    });
  }

  async getUsage() {
    return this.request<{
      searchCount: number;
      limit: number;
      resetAt: string;
    }>('/api/users/usage');
  }

  async trackInteraction(data: {
    productId?: string;
    interactionType: 'view' | 'click_affiliate' | 'save' | 'dismiss';
    context?: Record<string, unknown>;
  }) {
    return this.request('/api/users/interactions', {
      method: 'POST',
      body: data,
    });
  }

  // Chat endpoints
  async sendMessage(data: {
    message: string;
    conversationId?: string;
    pageContext?: {
      url: string;
      title?: string;
      productName?: string;
      price?: string;
      imageUrl?: string;
      retailer?: string;
    };
  }) {
    return this.request<{
      message: string;
      products: Array<{
        id: string;
        name: string;
        description: string;
        imageUrl: string;
        price: { amount: number; currency: string };
        aiRating: number | null;
        confidence: number | null;
        pros: string[];
        cons: string[];
        affiliateUrl: string;
        retailer: string;
        isSponsored: boolean;
      }>;
      conversationId: string | null;
    }>('/api/chat/message', {
      method: 'POST',
      body: data,
    });
  }

  async getConversations() {
    return this.request<Array<{
      id: string;
      title: string;
      messageCount: number;
      createdAt: string;
      updatedAt: string;
    }>>('/api/chat/conversations');
  }

  async getConversation(id: string) {
    return this.request<{
      id: string;
      title: string;
      pageContext: unknown;
      createdAt: string;
      updatedAt: string;
      messages: Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        productsShown: string[];
        createdAt: string;
      }>;
    }>(`/api/chat/conversations/${id}`);
  }

  async deleteConversation(id: string) {
    return this.request(`/api/chat/conversations/${id}`, {
      method: 'DELETE',
    });
  }

  // Product endpoints
  async searchProducts(params: {
    q: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    limit?: number;
    offset?: number;
  }) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });
    return this.request<{
      products: Array<{
        id: string;
        name: string;
        description: string;
        imageUrl: string;
        category: string;
        brand: string;
        price: { amount: number | null; currency: string };
        aiRating: number | null;
        confidence: number | null;
        pros: string[];
        cons: string[];
        affiliateUrl: string;
        retailer: string;
      }>;
      pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      };
    }>(`/api/products/search?${searchParams.toString()}`);
  }

  async getProduct(id: string) {
    return this.request(`/api/products/${id}`);
  }

  async getProductReviews(id: string) {
    return this.request(`/api/products/${id}/reviews`);
  }

  // Suggestions endpoints
  async getSuggestions(page = 1, limit = 20) {
    return this.request<{
      products: Array<{
        id: string;
        name: string;
        description: string;
        imageUrl: string;
        category: string;
        brand: string;
        price: { amount: number | null; currency: string };
        aiRating: number | null;
        confidence: number | null;
        pros: string[];
        cons: string[];
        affiliateUrl: string;
        retailer: string;
        isSponsored: boolean;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        hasMore: boolean;
      };
    }>(`/api/suggestions?page=${page}&limit=${limit}`);
  }

  async getTrending(limit = 10) {
    return this.request(`/api/suggestions/trending?limit=${limit}`);
  }

  // Billing endpoints
  async getPlans() {
    return this.request<{
      plans: Array<{
        id: string;
        name: string;
        description: string;
        price: number;
        currency: string;
        interval: string | null;
        features: string[];
      }>;
    }>('/api/billing/plans');
  }

  async createCheckout() {
    return this.request<{
      checkoutUrl: string;
      sessionId: string;
    }>('/api/billing/checkout', { method: 'POST' });
  }

  async createPortal() {
    return this.request<{
      portalUrl: string;
    }>('/api/billing/portal', { method: 'POST' });
  }

  async getSubscription() {
    return this.request<{
      plan: string;
      status: string | null;
      currentPeriodEnd: string | null;
    }>('/api/billing/subscription');
  }

  // Tracking endpoints
  async trackClick(data: {
    productId: string;
    clickUrl: string;
  }) {
    return this.request('/api/tracking/click', {
      method: 'POST',
      body: data,
    });
  }

  async trackImpression(data: {
    sponsoredProductId: string;
    placement: 'suggestions_feed' | 'chat_results';
  }) {
    return this.request('/api/tracking/impression', {
      method: 'POST',
      body: data,
    });
  }
}

export const api = new ApiClient(API_BASE_URL);
