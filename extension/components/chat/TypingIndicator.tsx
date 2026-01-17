import React from 'react';

export function TypingIndicator() {
  return (
    <div className="flex gap-1 py-1">
      <div className="w-2 h-2 bg-text-tertiary rounded-full typing-dot" />
      <div className="w-2 h-2 bg-text-tertiary rounded-full typing-dot" />
      <div className="w-2 h-2 bg-text-tertiary rounded-full typing-dot" />
    </div>
  );
}
