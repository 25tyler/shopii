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
      <div className="flex gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-background-secondary border border-border-light flex items-center justify-center flex-shrink-0">
          <span className="text-text-secondary text-sm">S</span>
        </div>
        <div className="bg-background-secondary border border-border-light rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
          <TypingIndicator />
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] bg-background-tertiary border border-border-light rounded-2xl rounded-tr-md px-4 py-3">
          <p className="text-text-primary text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-6">
      <div className="w-8 h-8 rounded-full bg-background-secondary border border-border-light flex items-center justify-center flex-shrink-0">
        <span className="text-text-secondary text-sm">S</span>
      </div>
      <div className="max-w-[80%] bg-background-secondary border border-border-light rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
        <p className="text-text-primary text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}
