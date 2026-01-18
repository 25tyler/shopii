import React from 'react';
import { Message } from '../../types';
import { TypingIndicator } from './TypingIndicator';
import { ResearchProgress } from './ResearchProgress';
import { ComparisonView } from './ComparisonView';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (message.isLoading) {
    // Show research progress if sources are being tracked
    if (message.researchSources && message.researchSources.length > 0) {
      return <ResearchProgress sources={message.researchSources} />;
    }
    // Fall back to simple typing indicator
    return (
      <div className="w-full py-4 px-5">
        <TypingIndicator />
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 px-5">
        <div className="max-w-[85%] bg-accent-orange/10 backdrop-blur-md rounded-3xl rounded-tr-lg px-5 py-3 shadow-glass-sm">
          <p className="text-text-primary text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant message with comparison data
  if (message.comparisonData) {
    return (
      <div className="w-full py-4 px-5 mb-2">
        {/* Mode badge */}
        {message.mode && (
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-lg">
              <span>⚖️</span>
              Comparison Mode
            </span>
          </div>
        )}

        <ComparisonView comparisonData={message.comparisonData} summary={message.content} />
      </div>
    );
  }

  // Regular assistant message - full width, no bubble
  return (
    <div className="w-full py-4 px-5 mb-2">
      {/* Mode badge */}
      {message.mode && message.mode !== 'auto' && (
        <div className="mb-3 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg ${
            message.mode === 'ask' ? 'bg-blue-100 text-blue-700' :
            message.mode === 'search' ? 'bg-orange-100 text-orange-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            <span>{message.mode === 'ask' ? '💬' : message.mode === 'search' ? '🔍' : '✨'}</span>
            {message.mode === 'ask' ? 'Ask Mode' : message.mode === 'search' ? 'Search Mode' : 'Auto Mode'}
          </span>
        </div>
      )}

      <p className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
      {message.researchSummary && (
        <p className="text-text-secondary text-xs mt-3 italic">
          Searched {message.researchSummary.totalSearches} queries across {message.researchSummary.totalSources} sources
        </p>
      )}
    </div>
  );
}
