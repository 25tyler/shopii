import { useState, useCallback } from 'react';

interface UseApiState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

interface UseApiOptions {
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
}

export function useApi<T>(
  apiFunction: (...args: unknown[]) => Promise<T>,
  options: UseApiOptions = {}
) {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: unknown[]) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const data = await apiFunction(...args);
        setState({ data, isLoading: false, error: null });
        options.onSuccess?.(data);
        return data;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('An error occurred');
        setState((prev) => ({ ...prev, isLoading: false, error: error.message }));
        options.onError?.(error);
        throw error;
      }
    },
    [apiFunction, options]
  );

  const reset = useCallback(() => {
    setState({ data: null, isLoading: false, error: null });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

// Hook for paginated data
interface UsePaginatedApiState<T> {
  data: T[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  page: number;
}

export function usePaginatedApi<T>(
  apiFunction: (page: number, limit: number) => Promise<{ items: T[]; hasMore: boolean }>,
  limit = 20
) {
  const [state, setState] = useState<UsePaginatedApiState<T>>({
    data: [],
    isLoading: false,
    isLoadingMore: false,
    error: null,
    hasMore: true,
    page: 1,
  });

  const loadInitial = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await apiFunction(1, limit);
      setState({
        data: result.items,
        isLoading: false,
        isLoadingMore: false,
        error: null,
        hasMore: result.hasMore,
        page: 1,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An error occurred');
      setState((prev) => ({ ...prev, isLoading: false, error: error.message }));
    }
  }, [apiFunction, limit]);

  const loadMore = useCallback(async () => {
    if (state.isLoadingMore || !state.hasMore) return;

    setState((prev) => ({ ...prev, isLoadingMore: true }));

    try {
      const nextPage = state.page + 1;
      const result = await apiFunction(nextPage, limit);
      setState((prev) => ({
        ...prev,
        data: [...prev.data, ...result.items],
        isLoadingMore: false,
        hasMore: result.hasMore,
        page: nextPage,
      }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An error occurred');
      setState((prev) => ({ ...prev, isLoadingMore: false, error: error.message }));
    }
  }, [apiFunction, limit, state.isLoadingMore, state.hasMore, state.page]);

  const refresh = useCallback(async () => {
    await loadInitial();
  }, [loadInitial]);

  return {
    ...state,
    loadInitial,
    loadMore,
    refresh,
  };
}
