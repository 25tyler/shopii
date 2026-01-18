import React from 'react';
import { Message } from '../../types';
import { TypingIndicator } from './TypingIndicator';
import { ResearchProgress } from './ResearchProgress';

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

  // Assistant message - full width, no bubble
  return (
    <div className="w-full py-4 px-5 mb-2">
      <p className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
      {message.researchSummary && (
        <p className="text-text-secondary text-xs mt-3 italic">
          Searched {message.researchSummary.totalSearches} queries across {message.researchSummary.totalSources} sources
        </p>
      )}
    </div>
  );
}
