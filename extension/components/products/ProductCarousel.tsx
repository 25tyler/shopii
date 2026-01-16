import React from 'react';
import { ProductCard } from '../../types';
import { ProductCardComponent } from './ProductCard';

interface ProductCarouselProps {
  products: ProductCard[];
}

export function ProductCarousel({ products }: ProductCarouselProps) {
  return (
    <div className="flex flex-col gap-3">
      {products.map((product) => (
        <ProductCardComponent key={product.id} product={product} />
      ))}
    </div>
  );
}
