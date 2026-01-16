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
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-shopii-primary to-shopii-secondary flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">S</span>
        </div>
        <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3">
          <TypingIndicator />
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-gradient-to-r from-shopii-primary to-shopii-secondary rounded-2xl rounded-tr-sm px-4 py-3">
          <p className="text-white text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-shopii-primary to-shopii-secondary flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">S</span>
      </div>
      <div className="max-w-[85%] bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3">
        <p className="text-slate-100 text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}
