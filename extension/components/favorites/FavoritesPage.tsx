import React, { useEffect } from 'react';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { useUserStore } from '../../stores/userStore';
import { ProductCardComponent } from '../products/ProductCard';

export function FavoritesPage() {
  const user = useUserStore((state) => state.user);
  const { favorites, isLoading, fetchFavorites } = useFavoritesStore();

  useEffect(() => {
    const isGuest = !user;
    fetchFavorites(isGuest);
  }, [user, fetchFavorites]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent-orange border-t-transparent rounded-full animate-spin" />
          <p className="text-text-tertiary">Loading favorites...</p>
        </div>
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 py-12 bg-background-primary">
        <div className="w-16 h-16 rounded-3xl bg-glass backdrop-blur-md flex items-center justify-center mb-6 shadow-glass">
          <span className="text-3xl">⭐</span>
        </div>
        <h2 className="text-xl font-light text-text-primary mb-2">No favorites yet</h2>
        <p className="text-sm text-text-secondary text-center max-w-xs">
          Star products you like to save them here for easy access later
          {!user && (
            <>
              <br /><br />
              <span className="text-text-quaternary text-xs">
                Sign in to view full product details in your favorites
              </span>
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-light text-text-primary mb-1">Saved Products</h1>
        <p className="text-sm text-text-secondary">
          {favorites.length} {favorites.length === 1 ? 'product' : 'products'} saved
        </p>
      </div>

      <div className="space-y-4">
        {favorites.map((favorite) => (
          <ProductCardComponent
            key={favorite.id}
            product={{
              id: favorite.product.id,
              name: favorite.product.name,
              description: favorite.product.description || '',
              imageUrl: favorite.product.imageUrl || '',
              price: {
                amount: favorite.product.currentPrice,
                currency: favorite.product.currency,
              },
              aiRating: favorite.product.rating?.aiRating || 0,
              matchScore: 0,
              pros: favorite.product.rating?.pros || [],
              cons: favorite.product.rating?.cons || [],
              affiliateUrl: favorite.product.affiliateUrl || '',
              retailer: favorite.product.retailer,
            }}
          />
        ))}
      </div>
    </div>
  );
}
