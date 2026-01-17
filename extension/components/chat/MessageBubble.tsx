import React from 'react';
import { Message } from '../../types';
import { TypingIndicator } from './TypingIndicator';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (message.isLoading) {
    return (
      <div className="w-full py-4 px-5">
        <div className="flex gap-3 items-start">
          <div className="w-8 h-8 rounded-full bg-glass backdrop-blur-md flex items-center justify-center flex-shrink-0 shadow-glass-sm">
            <span className="text-accent-orange text-sm font-medium">S</span>
          </div>
          <div className="flex-1 py-1">
            <TypingIndicator />
          </div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 px-5">
        <div className="max-w-[85%] bg-glass backdrop-blur-md rounded-3xl rounded-tr-lg px-5 py-3 shadow-glass-sm">
          <p className="text-text-primary text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant message - full width, no bubble
  return (
    <div className="w-full py-4 px-5 mb-2">
      <div className="flex gap-3 items-start">
        <div className="w-8 h-8 rounded-full bg-glass backdrop-blur-md flex items-center justify-center flex-shrink-0 shadow-glass-sm">
          <span className="text-accent-orange text-sm font-medium">S</span>
        </div>
        <div className="flex-1 py-1">
          <p className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </div>
  );
}
