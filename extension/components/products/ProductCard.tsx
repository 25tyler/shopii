import React, { useState } from 'react';
import { ProductCard } from '../../types';
import { RatingBadge } from './RatingBadge';
import { api } from '../../services/api';

interface ProductCardProps {
  product: ProductCard;
}

export function ProductCardComponent({ product }: ProductCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Get all available images (use imageUrls if available, fallback to single imageUrl)
  const images = product.imageUrls && product.imageUrls.length > 0
    ? product.imageUrls
    : product.imageUrl ? [product.imageUrl] : [];

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

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div className="bg-glass backdrop-blur-md rounded-3xl hover:shadow-glass transition-all overflow-hidden shadow-glass-sm">
      {/* Product Header */}
      <div className="p-4 flex gap-3">
        {/* Image Carousel */}
        <div className="w-24 h-24 bg-glass-dark backdrop-blur-sm rounded-2xl overflow-hidden flex-shrink-0 relative group">
          {images.length > 0 ? (
            <>
              <img
                src={images[currentImageIndex]}
                alt={`${product.name} - Image ${currentImageIndex + 1}`}
                className="w-full h-full object-cover transition-opacity duration-300"
              />

              {/* Navigation arrows - show on hover when multiple images */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      prevImage();
                    }}
                    className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    aria-label="Previous image"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      nextImage();
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    aria-label="Next image"
                  >
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>

                  {/* Image dots indicator */}
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
                    {images.map((_, idx) => (
                      <div
                        key={idx}
                        className={`w-1 h-1 rounded-full transition-all ${
                          idx === currentImageIndex ? 'bg-white w-2' : 'bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-quaternary">
              <ImagePlaceholder className="w-10 h-10" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-medium text-text-primary text-base leading-tight">
              {product.name}
            </h3>
            <RatingBadge rating={product.aiRating} size="sm" />
          </div>
          <p className="text-lg font-semibold text-text-primary mt-1">
            {product.price.amount !== null ? `$${product.price.amount.toFixed(2)}` : 'Price varies'}
          </p>
          <p className="text-xs text-text-tertiary">{product.retailer}</p>
        </div>
      </div>

      {/* Sponsored Badge */}
      {product.isSponsored && (
        <div className="px-4 pb-2">
          <span className="text-xs text-text-tertiary bg-glass-dark backdrop-blur-sm px-2 py-1 rounded-lg">
            Sponsored
          </span>
        </div>
      )}

      {/* Description */}
      <div className="px-4 pb-3">
        <p className="text-sm text-text-secondary line-clamp-2">{product.description}</p>
      </div>

      {/* Expandable Pros/Cons Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 text-sm text-text-secondary hover:bg-glass-dark/30 backdrop-blur-sm flex items-center justify-center gap-2 transition-all"
      >
        {isExpanded ? 'Hide details' : 'Show pros & cons'}
        <ChevronIcon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-3 animate-fade-in bg-glass-light/30 backdrop-blur-sm">
          {/* Pros */}
          {product.pros && product.pros.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-accent-green mb-2">Pros</p>
              <ul className="space-y-1.5">
                {product.pros.map((pro, i) => (
                  <li key={i} className="text-sm text-text-secondary flex gap-2">
                    <CheckIcon className="w-4 h-4 text-accent-green flex-shrink-0 mt-0.5" />
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cons */}
          {product.cons && product.cons.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-accent-red mb-2">Cons</p>
              <ul className="space-y-1.5">
                {product.cons.map((con, i) => (
                  <li key={i} className="text-sm text-text-secondary flex gap-2">
                    <XIcon className="w-4 h-4 text-accent-red flex-shrink-0 mt-0.5" />
                    <span>{con}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Match Score */}
          {product.matchScore !== undefined && (
            <div className="pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-text-tertiary">Match</span>
                <span className="font-medium text-accent-orange">{product.matchScore}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Buy Button */}
      <div className="p-4">
        <button
          onClick={handleBuyClick}
          className="w-full py-3 bg-accent-orange hover:bg-accent-orange-dark text-white text-sm font-medium rounded-2xl transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
        >
          View on {product.retailer}
          <ExternalLinkIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Icons
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
