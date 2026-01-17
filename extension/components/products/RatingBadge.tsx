import React from 'react';

interface RatingBadgeProps {
  rating: number;
  size?: 'sm' | 'md';
}

export function RatingBadge({ rating, size = 'md' }: RatingBadgeProps) {
  const getBackgroundColor = (rating: number) => {
    if (rating >= 85) return 'bg-accent-green/10';
    if (rating >= 70) return 'bg-accent-orange/10';
    if (rating >= 55) return 'bg-accent-amber/10';
    return 'bg-accent-red/10';
  };

  const getTextColor = (rating: number) => {
    if (rating >= 85) return 'text-accent-green';
    if (rating >= 70) return 'text-accent-orange';
    if (rating >= 55) return 'text-accent-amber';
    return 'text-accent-red';
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-2.5 py-1.5 text-sm',
  };

  return (
    <div
      className={`
        rounded-xl backdrop-blur-sm shadow-glass-sm flex-shrink-0
        ${getBackgroundColor(rating)}
        ${sizeClasses[size]}
      `}
      title={`AI Rating: ${rating}/100`}
    >
      <span className={`font-semibold ${getTextColor(rating)}`}>{rating}</span>
    </div>
  );
}
