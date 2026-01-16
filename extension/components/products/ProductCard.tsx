import React, { useState } from 'react';
import { ProductCard } from '../../types';
import { RatingBadge } from './RatingBadge';
import { api } from '../../services/api';

interface ProductCardProps {
  product: ProductCard;
}

export function ProductCardComponent({ product }: ProductCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleBuyClick = async () => {
    // Track affiliate click via API
    try {
      await api.trackClick({
        productId: product.id,
        clickUrl: product.affiliateUrl,
      });
    } catch {
      // Still open the link even if tracking fails
    }
    // Open affiliate link
    window.open(product.affiliateUrl, '_blank');
  };

  return (
    <div className="bg-slate-800/80 rounded-xl border border-slate-700 overflow-hidden hover:border-slate-600 transition-colors">
      {/* Product Header */}
      <div className="p-3 flex gap-3">
        {/* Image */}
        <div className="w-20 h-20 bg-slate-700 rounded-lg overflow-hidden flex-shrink-0">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500">
              <ImagePlaceholder className="w-8 h-8" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-white text-sm leading-tight line-clamp-2">
              {product.name}
            </h3>
            <RatingBadge rating={product.aiRating} size="sm" />
          </div>
          <p className="text-lg font-semibold text-white mt-1">
            ${product.price.amount.toFixed(2)}
          </p>
          <p className="text-xs text-slate-400">{product.retailer}</p>
        </div>
      </div>

      {/* Sponsored Badge */}
      {product.isSponsored && (
        <div className="px-3 pb-1">
          <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">
            Sponsored
          </span>
        </div>
      )}

      {/* Description */}
      <div className="px-3 pb-3">
        <p className="text-xs text-slate-300 line-clamp-2">{product.description}</p>
      </div>

      {/* Expandable Pros/Cons */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 text-xs text-slate-400 hover:text-slate-300 border-t border-slate-700 flex items-center justify-center gap-1 transition-colors"
      >
        {isExpanded ? 'Hide details' : 'Show pros & cons'}
        <ChevronIcon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 border-t border-slate-700 pt-3 animate-fade-in">
          {/* Pros */}
          <div className="mb-3">
            <p className="text-xs font-medium text-green-400 mb-1">Pros</p>
            <ul className="space-y-1">
              {product.pros.map((pro, i) => (
                <li key={i} className="text-xs text-slate-300 flex items-start gap-1">
                  <span className="text-green-400 mt-0.5">✓</span>
                  {pro}
                </li>
              ))}
            </ul>
          </div>

          {/* Cons */}
          <div>
            <p className="text-xs font-medium text-red-400 mb-1">Cons</p>
            <ul className="space-y-1">
              {product.cons.map((con, i) => (
                <li key={i} className="text-xs text-slate-300 flex items-start gap-1">
                  <span className="text-red-400 mt-0.5">✗</span>
                  {con}
                </li>
              ))}
            </ul>
          </div>

          {/* Confidence */}
          <div className="mt-3 pt-3 border-t border-slate-700">
            <p className="text-xs text-slate-500">
              Confidence: {Math.round(product.confidence * 100)}% based on aggregated reviews
            </p>
          </div>
        </div>
      )}

      {/* Buy Button */}
      <div className="p-3 border-t border-slate-700">
        <button
          onClick={handleBuyClick}
          className="w-full py-2.5 bg-gradient-to-r from-shopii-primary to-shopii-secondary hover:from-shopii-primary/90 hover:to-shopii-secondary/90 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          View on {product.retailer}
          <ExternalLinkIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function ImagePlaceholder({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}
