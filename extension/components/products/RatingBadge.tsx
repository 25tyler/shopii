import React from 'react';

interface RatingBadgeProps {
  rating: number;
  size?: 'sm' | 'md';
}

export function RatingBadge({ rating, size = 'md' }: RatingBadgeProps) {
  const getBorderColor = (rating: number) => {
    if (rating >= 85) return 'border-accent-green';
    if (rating >= 70) return 'border-accent-blue';
    if (rating >= 55) return 'border-accent-amber';
    return 'border-accent-red';
  };

  const getTextColor = (rating: number) => {
    if (rating >= 85) return 'text-accent-green';
    if (rating >= 70) return 'text-accent-blue';
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
        rounded-lg border-2 bg-background-secondary shadow-xs flex-shrink-0
        ${getBorderColor(rating)}
        ${sizeClasses[size]}
      `}
      title={`AI Rating: ${rating}/100`}
    >
      <span className={`font-semibold ${getTextColor(rating)}`}>{rating}</span>
    </div>
  );
}
