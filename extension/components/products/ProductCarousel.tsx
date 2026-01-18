import React from 'react';
import { ProductCard } from '../../types';
import { ProductCardComponent } from './ProductCard';
import { useChatStore } from '../../stores/chatStore';

interface ProductCarouselProps {
  products: ProductCard[];
}

export function ProductCarousel({ products }: ProductCarouselProps) {
  const selectedMode = useChatStore((state) => state.selectedMode);
  const selectedProductsForComparison = useChatStore((state) => state.selectedProductsForComparison);
  const toggleProductSelection = useChatStore((state) => state.toggleProductSelection);
  const clearProductSelection = useChatStore((state) => state.clearProductSelection);
  const sendMessage = useChatStore((state) => state.sendMessage);

  const isComparisonModeActive = selectedMode === 'comparison';
  const selectedCount = selectedProductsForComparison.length;

  const handleCompare = async () => {
    if (selectedCount >= 2) {
      // Get full product data for selected products
      const selectedProductData = products.filter(p =>
        selectedProductsForComparison.includes(p.name)
      );

      // Send comparison request with full product data
      await sendMessage(
        `Compare these products: ${selectedProductsForComparison.join(', ')}`,
        'comparison',
        selectedProductsForComparison,
        selectedProductData
      );
      // Clear selection after comparison
      clearProductSelection();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Compare button - shows when in comparison mode and 2+ products selected */}
      {isComparisonModeActive && selectedCount >= 2 && (
        <div className="sticky top-0 z-20 bg-glass backdrop-blur-lg rounded-2xl p-4 shadow-glass-sm border-2 border-purple-500/30 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-700">
                {selectedCount} product{selectedCount > 1 ? 's' : ''} selected
              </p>
              <p className="text-xs text-text-tertiary">Click to deselect, or compare below</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={clearProductSelection}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:bg-glass-dark/30 rounded-xl transition-all"
              >
                Clear
              </button>
              <button
                onClick={handleCompare}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-xl transition-all flex items-center gap-2 shadow-sm"
              >
                <ScaleIcon className="w-4 h-4" />
                Compare Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hint message when in comparison mode with 0-1 products selected */}
      {isComparisonModeActive && selectedCount < 2 && (
        <div className="bg-purple-50/80 backdrop-blur-sm rounded-2xl p-3 border border-purple-200/50">
          <p className="text-xs text-purple-700">
            <span className="font-medium">Comparison Mode:</span> Select at least 2 products to compare
            {selectedCount === 1 && ' (1 selected)'}
          </p>
        </div>
      )}

      {/* Product cards */}
      {products.map((product) => (
        <ProductCardComponent
          key={product.id}
          product={product}
          isSelected={isComparisonModeActive && selectedProductsForComparison.includes(product.name)}
          onToggleSelection={isComparisonModeActive ? toggleProductSelection : undefined}
        />
      ))}
    </div>
  );
}

// Scale icon for compare button
function ScaleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
    </svg>
  );
}
