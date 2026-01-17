import React, { useState, useEffect } from 'react';
import { ChatContainer } from '../../components/chat/ChatContainer';
import { SuggestionsPage } from '../../components/suggestions/SuggestionsPage';
import { OnboardingFlow } from '../../components/onboarding/OnboardingFlow';
import { UserButton } from '../../components/auth/UserButton';
import { useUserStore } from '../../stores/userStore';

type Tab = 'chat' | 'suggestions';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const { isOnboarded, isLoading, initialize } = useUserStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-shopii-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400">Loading Shopii...</p>
        </div>
      </div>
    );
  }

  if (!isOnboarded) {
    return <OnboardingFlow />;
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-shopii-primary to-shopii-secondary flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <h1 className="text-lg font-semibold text-white">Shopii</h1>
        </div>
        <div className="flex items-center gap-2">
          <UserButton />
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex border-b border-slate-700 bg-slate-900/30">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'chat'
              ? 'text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Chat
          {activeTab === 'chat' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-shopii-primary to-shopii-secondary" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('suggestions')}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'suggestions'
              ? 'text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          For You
          {activeTab === 'suggestions' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-shopii-primary to-shopii-secondary" />
          )}
        </button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' ? <ChatContainer /> : <SuggestionsPage />}
      </main>
    </div>
  );
}
