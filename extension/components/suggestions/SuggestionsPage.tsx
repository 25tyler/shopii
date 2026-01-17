import React, { useEffect, useCallback } from 'react';
import { ProductCard } from '../../types';
import { ProductCardComponent } from '../products/ProductCard';
import { api } from '../../services/api';
import { useSuggestionsStore } from '../../stores/suggestionsStore';

// Cache duration: 5 minutes
const CACHE_DURATION = 5 * 60 * 1000;

export function SuggestionsPage() {
  const {
    products,
    isLoading,
    isLoadingMore,
    error,
    page,
    hasMore,
    learnedCategories,
    learnedBrands,
    lastFetchedAt,
    setProducts,
    appendProducts,
    setLoading,
    setLoadingMore,
    setError,
    setPage,
    setHasMore,
    setLearnedPreferences,
    setLastFetchedAt,
  } = useSuggestionsStore();

  const loadSuggestions = useCallback(async (pageNum: number, append: boolean = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const response = await api.getSuggestions(pageNum, 20);

      const mappedProducts: ProductCard[] = response.products.map((p) => ({
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

      if (append) {
        appendProducts(mappedProducts);
      } else {
        setProducts(mappedProducts);
      }

      setLoading(false);
      setLoadingMore(false);
      setError(null);
      setPage(pageNum);
      setHasMore(response.pagination.hasMore);
      setLastFetchedAt(Date.now());

      // Store learned preferences if available
      if (response._learnedCategories || response._learnedBrands) {
        setLearnedPreferences(
          response._learnedCategories || [],
          response._learnedBrands || []
        );
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load suggestions';
      setLoading(false);
      setLoadingMore(false);
      setError(errorMessage);
    }
  }, [setProducts, appendProducts, setLoading, setLoadingMore, setError, setPage, setHasMore, setLearnedPreferences, setLastFetchedAt]);

  useEffect(() => {
    // Only fetch if we don't have cached data or cache is stale
    const isCacheStale = !lastFetchedAt || Date.now() - lastFetchedAt > CACHE_DURATION;
    const hasNoData = products.length === 0;

    if (hasNoData || isCacheStale) {
      loadSuggestions(1);
    }
  }, [loadSuggestions, lastFetchedAt, products.length]);

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      loadSuggestions(page + 1, true);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight * 1.5) {
      handleLoadMore();
    }
  };

  const handleRefresh = () => {
    loadSuggestions(1);
  };

  if (isLoading && products.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-shopii-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading suggestions...</p>
        </div>
      </div>
    );
  }

  if (error && products.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-3">{error}</p>
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

  if (products.length === 0) {
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">For You</h2>
            <p className="text-sm text-slate-400">Products tailored to your preferences</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh suggestions"
          >
            <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {/* Show learned preferences indicator */}
        {(learnedCategories.length > 0 || learnedBrands.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {learnedCategories.slice(0, 3).map((cat) => (
              <span key={cat} className="text-xs px-2 py-0.5 bg-shopii-primary/20 text-shopii-primary rounded-full">
                {cat}
              </span>
            ))}
            {learnedBrands.slice(0, 2).map((brand) => (
              <span key={brand} className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">
                {brand}
              </span>
            ))}
          </div>
        )}
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
            {products.map((product) => (
              <ProductCardComponent key={product.id} product={product} />
            ))}
          </div>
        </div>

        {/* Loading more indicator */}
        {isLoadingMore && (
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
        {!hasMore && products.length > 0 && (
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

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
