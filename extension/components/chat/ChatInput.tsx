import React, { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder || 'Ask about any product...'}
        rows={1}
        className="w-full px-4 py-3 pr-12 bg-background-secondary border border-border-light rounded-xl text-sm text-text-primary placeholder:text-text-quaternary focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20 resize-none overflow-y-hidden transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || disabled}
        className="absolute right-2 bottom-2.5 w-8 h-8 rounded-lg bg-accent-blue hover:bg-blue-600 disabled:bg-background-tertiary flex items-center justify-center transition-colors"
      >
        <SendIcon className="w-4 h-4 text-white" />
      </button>
    </div>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}
