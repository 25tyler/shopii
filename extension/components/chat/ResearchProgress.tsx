import React from 'react';
import { ResearchSource } from '../../types';

interface ResearchProgressProps {
  sources: ResearchSource[];
}

export function ResearchProgress({ sources }: ResearchProgressProps) {
  return (
    <div className="w-full py-4 px-5">
      <div className="space-y-2">
        {sources.map((source, index) => (
          <div
            key={`${source.name}-${source.timestamp}`}
            className="flex items-center gap-3 animate-fade-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Status Icon */}
            {source.status === 'searching' && (
              <div className="w-4 h-4 border-2 border-accent-orange border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
            {(source.status === 'found' || source.status === 'complete') && (
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}

            {/* Source Text */}
            <span className="text-sm text-text-secondary">
              {source.status === 'searching' && source.name}
              {(source.status === 'found' || source.status === 'complete') && source.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
