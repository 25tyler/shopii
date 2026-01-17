import React, { useEffect, useCallback, useRef } from 'react';
import { ProductCard } from '../../types';
import { ProductCardComponent } from '../products/ProductCard';
import { api } from '../../services/api';
import { useSuggestionsStore } from '../../stores/suggestionsStore';

// Cache duration: 5 minutes
const CACHE_DURATION = 5 * 60 * 1000;

export function SuggestionsPage() {
  const hasFetchedRef = useRef(false);
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
          amount: p.price.amount, // Keep null for "Price varies" display
          currency: p.price.currency,
        },
        aiRating: p.aiRating || 0,
        confidence: p.confidence || 0,
        matchScore: 75, // Default matchScore for suggestions
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
    // Prevent fetching while already loading to avoid infinite loops
    if (isLoading || isLoadingMore) {
      return;
    }

    // Prevent infinite loop: only fetch once on mount if no data
    if (products.length === 0 && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      loadSuggestions(1);
      return;
    }

    // Only re-fetch if cache is stale and we have data already
    const isCacheStale = lastFetchedAt && Date.now() - lastFetchedAt > CACHE_DURATION;
    if (isCacheStale && products.length > 0) {
      loadSuggestions(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastFetchedAt, products.length]);

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
    // Clear products first to show loading state
    setProducts([]);
    setLoading(true);
    loadSuggestions(1);
  };

  if (isLoading && products.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-background-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-accent-orange border-t-transparent rounded-full animate-spin" />
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
            className="px-4 py-2 bg-accent-orange hover:bg-accent-orange-dark text-white rounded-2xl text-sm transition-all shadow-sm"
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
      <div className="sticky top-0 bg-glass backdrop-blur-lg px-5 py-4 z-10 shadow-glass-sm">
        {/* Show learned preferences indicator */}
        {(learnedCategories.length > 0 || learnedBrands.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {learnedCategories.slice(0, 3).map((cat) => (
              <span key={cat} className="text-xs px-2 py-0.5 bg-accent-orange/10 text-accent-orange backdrop-blur-sm rounded-full">
                {cat}
              </span>
            ))}
            {learnedBrands.slice(0, 2).map((brand) => (
              <span key={brand} className="text-xs px-2 py-0.5 bg-accent-green/10 text-accent-green backdrop-blur-sm rounded-full">
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
            <div className="w-6 h-6 border-4 border-accent-orange border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Deal Alert - upgrade prompt */}
        <div className="p-5 bg-glass backdrop-blur-md rounded-3xl shadow-glass-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-orange/10 flex items-center justify-center flex-shrink-0">
              <DealIcon className="w-5 h-5 text-accent-orange" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary mb-1">
                Unlock More Features
              </p>
              <p className="text-xs text-text-secondary">
                Get unlimited searches and personalized recommendations
              </p>
            </div>
            <button className="px-4 py-2 bg-accent-orange hover:bg-accent-orange-dark text-white text-sm font-medium rounded-2xl transition-all shadow-sm">
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
