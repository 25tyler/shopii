import React from 'react';

interface RatingBadgeProps {
  rating: number; // Expect 0-100, will convert to 0-10.0
  size?: 'sm' | 'md';
}

export function RatingBadge({ rating, size = 'md' }: RatingBadgeProps) {
  // Convert 0-100 to 0-10.0
  const decimalRating = rating / 10;

  // IMDB-style color scheme with vibrant, modern colors
  const getRatingStyle = (rating: number) => {
    if (rating >= 9.0) {
      return {
        bgColor: '#065f46',
        textColor: '#6ee7b7',
        label: 'Outstanding'
      };
    }
    if (rating >= 8.0) {
      return {
        bgColor: '#047857',
        textColor: '#a7f3d0',
        label: 'Excellent'
      };
    }
    if (rating >= 7.0) {
      return {
        bgColor: '#65a30d',
        textColor: '#d9f99d',
        label: 'Great'
      };
    }
    if (rating >= 6.0) {
      return {
        bgColor: '#ca8a04',
        textColor: '#fef08a',
        label: 'Good'
      };
    }
    if (rating >= 5.0) {
      return {
        bgColor: '#d97706',
        textColor: '#fde68a',
        label: 'Average'
      };
    }
    if (rating >= 4.0) {
      return {
        bgColor: '#ea580c',
        textColor: '#fed7aa',
        label: 'Below Average'
      };
    }
    if (rating >= 3.0) {
      return {
        bgColor: '#dc2626',
        textColor: '#fca5a5',
        label: 'Poor'
      };
    }
    return {
      bgColor: '#991b1b',
      textColor: '#fca5a5',
      label: 'Very Poor'
    };
  };

  const style = getRatingStyle(decimalRating);

  const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs gap-2',
    md: 'px-3 py-1.5 text-sm gap-2.5',
  };

  return (
    <div
      className={`
        rounded-lg inline-flex items-center
        ${sizeClasses[size]}
      `}
      style={{ backgroundColor: style.bgColor }}
      title={`AI Rating: ${decimalRating.toFixed(1)}/10.0`}
    >
      <span
        className="font-bold tabular-nums"
        style={{ color: style.textColor }}
      >
        {decimalRating.toFixed(1)}
      </span>
      <span
        className="font-medium"
        style={{ color: style.textColor }}
      >
        {style.label}
      </span>
    </div>
  );
}
