import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useUserStore } from '../../stores/userStore';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { WelcomeMessage } from './WelcomeMessage';
import { SignupPrompt } from '../auth/SignupPrompt';
import { AuthModal } from '../auth/AuthModal';

export function ChatContainer() {
  const { conversations, activeConversationId, isLoading, error, sendMessage, clearError, initialize } =
    useChatStore();
  const { user, guestSearchesUsed, incrementGuestSearches } = useUserStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [maxBudget, setMaxBudget] = useState<number | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages || [];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    // Track guest searches
    if (!user) {
      incrementGuestSearches();
    }
    await sendMessage(content, maxBudget ?? undefined);
  };

  const searchesRemaining = user ? (user.plan === 'pro' ? '∞' : 'unlimited') : `${5 - guestSearchesUsed}`;
  const canSendMessage = user || guestSearchesUsed < 5;

  return (
    <div className="flex flex-col h-full bg-background-primary">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        {messages.length === 0 ? (
          <WelcomeMessage onSuggestionClick={handleSendMessage} />
        ) : (
          <MessageList messages={messages} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-5 mb-3 px-4 py-3 bg-red-50/80 backdrop-blur-sm rounded-2xl shadow-glass-sm flex items-center justify-between">
          <span className="text-red-700 text-sm">{error}</span>
          <button
            onClick={clearError}
            className="text-red-500 hover:text-red-700 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search Limit Warning */}
      {!user && guestSearchesUsed >= 3 && guestSearchesUsed < 5 && (
        <div className="mx-5 mb-3 px-4 py-3 bg-amber-50/80 backdrop-blur-sm rounded-2xl shadow-glass-sm">
          <p className="text-amber-700 text-sm">
            {5 - guestSearchesUsed} searches remaining today.{' '}
            <button className="underline hover:text-amber-900">
              Sign up for more
            </button>
          </p>
        </div>
      )}

      {/* Budget Filter */}
      <div className="mx-5 mb-3">
        <div className="p-4 bg-glass backdrop-blur-sm rounded-2xl shadow-glass-sm">
          <div className="flex items-center gap-3">
            <label htmlFor="max-budget" className="text-sm font-medium text-text-primary flex-shrink-0">
              Max Budget:
            </label>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
              <input
                id="max-budget"
                type="number"
                value={maxBudget ?? ''}
                onChange={(e) => setMaxBudget(e.target.value ? Number(e.target.value) : null)}
                placeholder="No limit"
                min={0}
                className="w-full pl-7 pr-3 py-2 bg-background-secondary border border-border-light rounded-xl text-sm text-text-primary placeholder:text-text-quaternary focus:outline-none focus:border-accent-orange focus:ring-2 focus:ring-accent-orange/20 transition-all"
              />
            </div>
            {maxBudget !== null && (
              <button
                onClick={() => setMaxBudget(null)}
                className="flex-shrink-0 text-text-tertiary hover:text-text-primary transition-colors"
                title="Clear budget filter"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="p-5 bg-glass backdrop-blur-lg">
        <ChatInput
          onSend={handleSendMessage}
          disabled={isLoading || !canSendMessage}
          placeholder={
            !canSendMessage
              ? "You've reached your daily limit. Sign up for more!"
              : 'Ask about any product...'
          }
        />
        <div className="mt-2 flex items-center justify-between text-xs text-text-quaternary">
          <span>
            {!user && `${searchesRemaining} free searches left today`}
          </span>
          <span className="text-text-quaternary">Powered by AI</span>
        </div>
      </div>
    </div>
  );
}
