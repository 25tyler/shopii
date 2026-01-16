import React from 'react';

export function TypingIndicator() {
  return (
    <div className="flex gap-1 py-1">
      <div className="w-2 h-2 bg-slate-400 rounded-full typing-dot" />
      <div className="w-2 h-2 bg-slate-400 rounded-full typing-dot" />
      <div className="w-2 h-2 bg-slate-400 rounded-full typing-dot" />
    </div>
  );
}
