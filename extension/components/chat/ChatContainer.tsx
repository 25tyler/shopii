import React, { useEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useUserStore } from '../../stores/userStore';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { WelcomeMessage } from './WelcomeMessage';

export function ChatContainer() {
  const { conversations, activeConversationId, isLoading, error, sendMessage, clearError, initialize } =
    useChatStore();
  const { user, guestSearchesUsed, incrementGuestSearches } = useUserStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    await sendMessage(content);
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
        <div className="mx-5 mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
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
        <div className="mx-5 mb-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-amber-800 text-sm">
            {5 - guestSearchesUsed} searches remaining today.{' '}
            <button className="underline hover:text-amber-900 transition-colors">
              Sign up for more
            </button>
          </p>
        </div>
      )}

      {/* Input Area */}
      <div className="p-5 border-t border-border-light bg-background-secondary">
        <ChatInput
          onSend={handleSendMessage}
          disabled={isLoading || !canSendMessage}
          placeholder={
            !canSendMessage
              ? "You've reached your daily limit. Sign up for more!"
              : 'Ask about any product...'
          }
        />
        <div className="mt-2 flex items-center justify-between text-xs text-text-tertiary">
          <span>
            {!user && `${searchesRemaining} free searches left today`}
          </span>
          <span>AI-powered</span>
        </div>
      </div>
    </div>
  );
}
