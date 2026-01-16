import React from 'react';

interface RatingBadgeProps {
  rating: number;
  size?: 'sm' | 'md' | 'lg';
}

export function RatingBadge({ rating, size = 'md' }: RatingBadgeProps) {
  // Determine color based on rating
  const getColor = () => {
    if (rating >= 85) return 'from-green-500 to-emerald-500';
    if (rating >= 70) return 'from-lime-500 to-green-500';
    if (rating >= 55) return 'from-yellow-500 to-amber-500';
    if (rating >= 40) return 'from-orange-500 to-amber-500';
    return 'from-red-500 to-orange-500';
  };

  const sizeClasses = {
    sm: 'w-10 h-10 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-lg',
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-lg bg-gradient-to-br ${getColor()} flex items-center justify-center font-bold text-white shadow-lg`}
      title={`AI Rating: ${rating}/100`}
    >
      {rating}
    </div>
  );
}
