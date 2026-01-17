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

      // Validate response structure
      if (!response || !response.products || !Array.isArray(response.products)) {
        throw new Error('Invalid response from suggestions API');
      }

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
        matchScore: 0,
        pros: p.pros || [],
        cons: p.cons || [],
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
      setHasMore(response.pagination?.hasMore ?? false);
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
      <div className="h-full flex items-center justify-center bg-background-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-accent-blue border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-tertiary">Loading suggestions...</p>
        </div>
      </div>
    );
  }

  if (error && products.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4 bg-background-primary">
        <div className="text-center">
          <p className="text-red-600 mb-3">{error}</p>
          <button
            onClick={() => loadSuggestions(1)}
            className="px-4 py-2 bg-accent-blue hover:bg-blue-600 text-white rounded-lg text-sm transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4 bg-background-primary">
        <div className="text-center">
          <p className="text-text-secondary mb-2">No suggestions yet</p>
          <p className="text-sm text-text-tertiary">
            Start chatting to get personalized recommendations!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background-primary" onScroll={handleScroll}>
      {/* Header */}
      <div className="sticky top-0 bg-background-secondary border-b border-border-light px-6 py-5 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-light text-text-primary mb-1">For You</h2>
            <p className="text-sm text-text-secondary">Personalized product recommendations</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 text-text-tertiary hover:text-text-primary hover:bg-background-tertiary rounded-lg transition-colors disabled:opacity-50"
            title="Refresh suggestions"
          >
            <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {/* Show learned preferences indicator */}
        {(learnedCategories.length > 0 || learnedBrands.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {learnedCategories.slice(0, 3).map((cat) => (
              <span key={cat} className="text-xs px-2.5 py-1 bg-accent-blue/10 text-accent-blue border border-accent-blue/20 rounded-full">
                {cat}
              </span>
            ))}
            {learnedBrands.slice(0, 2).map((brand) => (
              <span key={brand} className="text-xs px-2.5 py-1 bg-accent-green/10 text-accent-green border border-accent-green/20 rounded-full">
                {brand}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Products Grid */}
      <div className="px-6 py-6 space-y-8">
        {/* Trending Section */}
        <section>
          <div className="space-y-4">
            {products.map((product) => (
              <ProductCardComponent key={product.id} product={product} />
            ))}
          </div>
        </section>

        {/* Loading more indicator */}
        {isLoadingMore && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 border-4 border-accent-blue border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Deal Alert - upgrade prompt */}
        <div className="p-5 bg-background-tertiary border border-border-light rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-blue/10 flex items-center justify-center flex-shrink-0">
              <DealIcon className="w-5 h-5 text-accent-blue" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary mb-1">
                Unlock More Features
              </p>
              <p className="text-xs text-text-secondary">
                Get unlimited searches and personalized recommendations
              </p>
            </div>
            <button className="px-4 py-2 bg-accent-blue hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
              Upgrade
            </button>
          </div>
        </div>

        {/* End of list message */}
        {!hasMore && products.length > 0 && (
          <div className="text-center py-8">
            <p className="text-text-tertiary text-sm">
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
