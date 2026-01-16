import React, { useEffect, useState, useCallback } from 'react';
import { ProductCard } from '../../types';
import { ProductCardComponent } from '../products/ProductCard';
import { api } from '../../services/api';

interface SuggestionsState {
  products: ProductCard[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  page: number;
  hasMore: boolean;
}

export function SuggestionsPage() {
  const [state, setState] = useState<SuggestionsState>({
    products: [],
    isLoading: true,
    isLoadingMore: false,
    error: null,
    page: 1,
    hasMore: true,
  });

  const loadSuggestions = useCallback(async (page: number, append: boolean = false) => {
    try {
      if (append) {
        setState((prev) => ({ ...prev, isLoadingMore: true }));
      } else {
        setState((prev) => ({ ...prev, isLoading: true }));
      }

      const response = await api.getSuggestions(page, 20);

      const products: ProductCard[] = response.products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        price: {
          amount: p.price.amount || 0,
          currency: p.price.currency,
        },
        aiRating: p.aiRating || 0,
        confidence: p.confidence || 0,
        pros: p.pros,
        cons: p.cons,
        affiliateUrl: p.affiliateUrl,
        retailer: p.retailer,
        isSponsored: p.isSponsored,
      }));

      setState((prev) => ({
        ...prev,
        products: append ? [...prev.products, ...products] : products,
        isLoading: false,
        isLoadingMore: false,
        error: null,
        page,
        hasMore: response.pagination.hasMore,
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load suggestions';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isLoadingMore: false,
        error: errorMessage,
      }));
    }
  }, []);

  useEffect(() => {
    loadSuggestions(1);
  }, [loadSuggestions]);

  const handleLoadMore = () => {
    if (!state.isLoadingMore && state.hasMore) {
      loadSuggestions(state.page + 1, true);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight * 1.5) {
      handleLoadMore();
    }
  };

  if (state.isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-shopii-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading suggestions...</p>
        </div>
      </div>
    );
  }

  if (state.error && state.products.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-3">{state.error}</p>
          <button
            onClick={() => loadSuggestions(1)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (state.products.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-slate-400 mb-2">No suggestions yet</p>
          <p className="text-sm text-slate-500">
            Start chatting to get personalized recommendations!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" onScroll={handleScroll}>
      {/* Header */}
      <div className="sticky top-0 bg-gradient-to-b from-slate-900 to-slate-900/95 backdrop-blur-sm px-4 py-4 border-b border-slate-700/50 z-10">
        <h2 className="text-lg font-semibold text-white">For You</h2>
        <p className="text-sm text-slate-400">Products tailored to your preferences</p>
      </div>

      {/* Products Grid */}
      <div className="p-4 space-y-4">
        {/* Trending Section */}
        <div>
          <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
            <TrendingIcon className="w-4 h-4 text-shopii-accent" />
            Recommended for You
          </h3>
          <div className="space-y-3">
            {state.products.map((product) => (
              <ProductCardComponent key={product.id} product={product} />
            ))}
          </div>
        </div>

        {/* Loading more indicator */}
        {state.isLoadingMore && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 border-2 border-shopii-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Deal Alert - upgrade prompt */}
        <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 border border-amber-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <DealIcon className="w-5 h-5 text-amber-400" />
            <h3 className="font-medium text-amber-200">Deal Alert</h3>
          </div>
          <p className="text-sm text-amber-100/80">
            Upgrade to Pro to get notified when products you like go on sale!
          </p>
          <button className="mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors">
            Try Pro Free
          </button>
        </div>

        {/* End of list message */}
        {!state.hasMore && state.products.length > 0 && (
          <div className="text-center py-8">
            <p className="text-slate-500 text-sm">
              Keep chatting to improve your recommendations
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TrendingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function DealIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
