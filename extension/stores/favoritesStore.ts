import { create } from 'zustand';
import { api } from '../services/api';

const GUEST_FAVORITES_KEY = 'shopii_guest_favorites';

export interface FavoriteProduct {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
  product: {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    currentPrice: number | null;
    currency: string;
    retailer: string;
    affiliateUrl: string | null;
    rating: {
      aiRating: number | null;
      pros: string[];
      cons: string[];
    } | null;
  };
}

interface GuestFavorite {
  id: string;
  productId: string;
  createdAt: string;
  product: {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    currentPrice: number | null;
    currency: string;
    retailer: string;
    affiliateUrl: string | null;
    rating: {
      aiRating: number | null;
      pros: string[];
      cons: string[];
    } | null;
  };
}

interface FavoritesState {
  favorites: FavoriteProduct[];
  favoriteProductIds: Set<string>;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchFavorites: (isGuest: boolean) => Promise<void>;
  addFavorite: (productId: string, isGuest: boolean, productData?: any) => Promise<void>;
  removeFavorite: (productId: string, isGuest: boolean) => Promise<void>;
  isFavorite: (productId: string) => boolean;
  clearFavorites: () => void;
  syncGuestFavoritesToAccount: () => Promise<void>;
}

// Helper functions for guest favorites
const getGuestFavorites = (): GuestFavorite[] => {
  try {
    const stored = localStorage.getItem(GUEST_FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setGuestFavorites = (favorites: GuestFavorite[]) => {
  localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(favorites));
};

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: [],
  favoriteProductIds: new Set<string>(),
  isLoading: false,
  error: null,

  fetchFavorites: async (isGuest: boolean) => {
    try {
      set({ isLoading: true, error: null });

      if (isGuest) {
        // Load from localStorage
        const guestFavorites = getGuestFavorites();
        const favoriteProductIds = new Set(guestFavorites.map(f => f.productId));

        // Convert guest favorites to FavoriteProduct format
        const favorites: FavoriteProduct[] = guestFavorites.map(gf => ({
          id: gf.id,
          userId: 'guest',
          productId: gf.productId,
          createdAt: gf.createdAt,
          product: gf.product
        }));

        set({
          favorites,
          favoriteProductIds,
          isLoading: false
        });
      } else {
        // Load from API
        const favorites = await api.getFavorites();
        const favoriteProductIds = new Set(favorites.map(f => f.productId));
        set({ favorites, favoriteProductIds, isLoading: false });
      }
    } catch (error) {
      console.error('Failed to fetch favorites:', error);
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  addFavorite: async (productId: string, isGuest: boolean, productData?: any) => {
    try {
      set({ error: null });

      if (isGuest) {
        if (!productData) {
          throw new Error('Product data is required for guest favorites');
        }

        // Save to localStorage with full product data
        const guestFavorites = getGuestFavorites();
        if (!guestFavorites.some(f => f.productId === productId)) {
          const newFavorite: GuestFavorite = {
            id: crypto.randomUUID(),
            productId,
            createdAt: new Date().toISOString(),
            product: {
              id: productData.id,
              name: productData.name,
              description: productData.description || null,
              imageUrl: productData.imageUrl || null,
              currentPrice: productData.price?.amount || null,
              currency: productData.price?.currency || 'USD',
              retailer: productData.retailer,
              affiliateUrl: productData.affiliateUrl || null,
              rating: productData.aiRating !== undefined ? {
                aiRating: productData.aiRating,
                pros: productData.pros || [],
                cons: productData.cons || []
              } : null
            }
          };
          guestFavorites.push(newFavorite);
          setGuestFavorites(guestFavorites);

          // Update local state
          const favoriteProductIds = new Set(get().favoriteProductIds);
          favoriteProductIds.add(productId);

          // Add to favorites array
          const favorites = [...get().favorites, {
            id: newFavorite.id,
            userId: 'guest',
            productId: newFavorite.productId,
            createdAt: newFavorite.createdAt,
            product: newFavorite.product
          }];

          set({ favoriteProductIds, favorites });
        }
      } else {
        // Save to API
        await api.addFavorite(productId);

        // Optimistically update the local state
        const favoriteProductIds = new Set(get().favoriteProductIds);
        favoriteProductIds.add(productId);
        set({ favoriteProductIds });

        // Refresh the full list to get complete product data
        await get().fetchFavorites(false);
      }
    } catch (error) {
      console.error('Failed to add favorite:', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  removeFavorite: async (productId: string, isGuest: boolean) => {
    try {
      set({ error: null });

      if (isGuest) {
        // Remove from localStorage
        const guestFavorites = getGuestFavorites();
        const filtered = guestFavorites.filter(f => f.productId !== productId);
        setGuestFavorites(filtered);

        // Update local state
        const favoriteProductIds = new Set(get().favoriteProductIds);
        favoriteProductIds.delete(productId);
        set({ favoriteProductIds });
      } else {
        // Remove from API
        await api.removeFavorite(productId);

        // Optimistically update the local state
        const favoriteProductIds = new Set(get().favoriteProductIds);
        favoriteProductIds.delete(productId);
        const favorites = get().favorites.filter(f => f.productId !== productId);
        set({ favorites, favoriteProductIds });
      }
    } catch (error) {
      console.error('Failed to remove favorite:', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  isFavorite: (productId: string) => {
    return get().favoriteProductIds.has(productId);
  },

  clearFavorites: () => {
    set({ favorites: [], favoriteProductIds: new Set(), error: null });
  },

  syncGuestFavoritesToAccount: async () => {
    try {
      const guestFavorites = getGuestFavorites();

      // Sync each guest favorite to the account
      for (const favorite of guestFavorites) {
        try {
          await api.addFavorite(favorite.productId);
        } catch (error) {
          console.error(`Failed to sync favorite ${favorite.productId}:`, error);
        }
      }

      // Clear guest favorites after syncing
      localStorage.removeItem(GUEST_FAVORITES_KEY);

      // Fetch the updated favorites from the server
      await get().fetchFavorites(false);
    } catch (error) {
      console.error('Failed to sync guest favorites:', error);
    }
  },
}));
