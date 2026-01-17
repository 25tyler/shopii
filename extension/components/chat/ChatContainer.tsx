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
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <WelcomeMessage />
        ) : (
          <MessageList messages={messages} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mb-2 px-4 py-2 bg-red-900/50 border border-red-700 rounded-lg flex items-center justify-between">
          <span className="text-red-200 text-sm">{error}</span>
          <button
            onClick={clearError}
            className="text-red-400 hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Rate Limit Reached - Show Signup Prompt */}
      {!user && guestSearchesUsed >= 5 ? (
        <SignupPrompt searchesUsed={guestSearchesUsed} limit={5} />
      ) : (
        <>
          {/* Search Limit Warning */}
          {!user && guestSearchesUsed >= 3 && (
            <div className="mx-4 mb-2 px-4 py-2 bg-amber-900/50 border border-amber-700 rounded-lg">
              <p className="text-amber-200 text-sm">
                {5 - guestSearchesUsed} searches remaining today.{' '}
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="underline hover:text-amber-100"
                >
                  Sign up for more
                </button>
              </p>
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 border-t border-slate-700 bg-slate-900/50">
            <ChatInput
              onSend={handleSendMessage}
              disabled={isLoading || !canSendMessage}
              placeholder={
                !canSendMessage
                  ? "You've reached your daily limit. Sign up for more!"
                  : 'Ask about any product...'
              }
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>
                {!user && `${searchesRemaining} free searches left today`}
              </span>
              <span className="text-slate-600">Powered by AI</span>
            </div>
          </div>
        </>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultTab="signup"
      />
    </div>
  );
}
