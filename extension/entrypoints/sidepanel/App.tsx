import React, { useState, useEffect } from 'react';
import { ChatContainer } from '../../components/chat/ChatContainer';
import { SuggestionsPage } from '../../components/suggestions/SuggestionsPage';
import { OnboardingFlow } from '../../components/onboarding/OnboardingFlow';
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-shopii-primary to-shopii-secondary flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <h1 className="text-lg font-semibold text-white">Shopii</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
            title="Settings"
          >
            <SettingsIcon className="w-5 h-5 text-slate-400" />
          </button>
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

      {/* Main Content - Both components stay mounted to preserve state */}
      <main className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${activeTab === 'chat' ? 'visible' : 'invisible'}`}>
          <ChatContainer />
        </div>
        <div className={`absolute inset-0 ${activeTab === 'suggestions' ? 'visible' : 'invisible'}`}>
          <SuggestionsPage />
        </div>
      </main>
    </div>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}
