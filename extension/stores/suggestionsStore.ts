import { create } from 'zustand';
import { ProductCard } from '../types';

interface SuggestionsState {
  products: ProductCard[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  page: number;
  hasMore: boolean;
  learnedCategories: string[];
  learnedBrands: string[];
  lastFetchedAt: number | null;
}

interface SuggestionsStore extends SuggestionsState {
  setProducts: (products: ProductCard[]) => void;
  appendProducts: (products: ProductCard[]) => void;
  setLoading: (isLoading: boolean) => void;
  setLoadingMore: (isLoadingMore: boolean) => void;
  setError: (error: string | null) => void;
  setPage: (page: number) => void;
  setHasMore: (hasMore: boolean) => void;
  setLearnedPreferences: (categories: string[], brands: string[]) => void;
  setLastFetchedAt: (timestamp: number) => void;
  reset: () => void;
}

const initialState: SuggestionsState = {
  products: [],
  isLoading: false,
  isLoadingMore: false,
  error: null,
  page: 1,
  hasMore: true,
  learnedCategories: [],
  learnedBrands: [],
  lastFetchedAt: null,
};

export const useSuggestionsStore = create<SuggestionsStore>((set) => ({
  ...initialState,

  setProducts: (products) => set({ products }),

  appendProducts: (newProducts) =>
    set((state) => ({
      products: [...state.products, ...newProducts],
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setLoadingMore: (isLoadingMore) => set({ isLoadingMore }),

  setError: (error) => set({ error }),

  setPage: (page) => set({ page }),

  setHasMore: (hasMore) => set({ hasMore }),

  setLearnedPreferences: (categories, brands) =>
    set({
      learnedCategories: categories,
      learnedBrands: brands,
    }),

  setLastFetchedAt: (timestamp) => set({ lastFetchedAt: timestamp }),

  reset: () => set(initialState),
}));
