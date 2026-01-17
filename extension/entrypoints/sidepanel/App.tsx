import React, { useState, useEffect } from 'react';
import { ChatContainer } from '../../components/chat/ChatContainer';
import { SuggestionsPage } from '../../components/suggestions/SuggestionsPage';
import { OnboardingFlow } from '../../components/onboarding/OnboardingFlow';
import { useUserStore } from '../../stores/userStore';

type Route = 'search' | 'saved' | 'for-you';

export default function App() {
  const [activeRoute, setActiveRoute] = useState<Route>('search');
  const { isOnboarded, isLoading, initialize } = useUserStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent-blue border-t-transparent rounded-full animate-spin" />
          <p className="text-text-tertiary">Loading Shopii...</p>
        </div>
      </div>
    );
  }

  if (!isOnboarded) {
    return <OnboardingFlow />;
  }

  return (
    <div className="flex flex-col h-full bg-background-primary">
      {/* Header */}
      <header className="h-14 px-5 border-b border-border-light bg-background-secondary flex items-center justify-between flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg border-2 border-border-light bg-background-secondary flex items-center justify-center">
            <span className="text-text-primary font-light text-lg">S</span>
          </div>
          <h1 className="text-base font-medium text-text-primary">Shopii</h1>
        </div>

        {/* Navigation buttons - centered */}
        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          <NavButton
            icon={SearchIcon}
            active={activeRoute === 'search'}
            onClick={() => setActiveRoute('search')}
            title="Search"
          />
          <NavButton
            icon={TargetIcon}
            active={activeRoute === 'for-you'}
            onClick={() => setActiveRoute('for-you')}
            title="For You"
          />
          <NavButton
            icon={StarIcon}
            active={activeRoute === 'saved'}
            onClick={() => setActiveRoute('saved')}
            title="Saved"
          />
        </nav>

        {/* Settings */}
        <button
          className="p-2 hover:bg-background-tertiary rounded-lg transition-colors"
          title="Settings"
        >
          <SettingsIcon className="w-5 h-5 text-text-tertiary" />
        </button>
      </header>

      {/* Content - Both components stay mounted to preserve state */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            activeRoute === 'search' ? 'opacity-100 visible' : 'opacity-0 invisible'
          }`}
        >
          <ChatContainer />
        </div>
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            activeRoute === 'for-you' ? 'opacity-100 visible' : 'opacity-0 invisible'
          }`}
        >
          <SuggestionsPage />
        </div>
        {/* Placeholder screen for saved */}
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            activeRoute === 'saved' ? 'opacity-100 visible' : 'opacity-0 invisible'
          }`}
        >
          <PlaceholderScreen title="Saved Products" description="Your saved products will appear here" />
        </div>
      </div>
    </div>
  );
}

function NavButton({
  icon: Icon,
  active,
  onClick,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        px-3 h-9 flex items-center justify-center rounded-lg
        transition-all duration-200 ease-out
        ${active ? 'bg-accent-blue text-white' : 'text-text-tertiary hover:bg-background-tertiary'}
      `}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}

function PlaceholderScreen({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-12 bg-background-primary">
      <div className="w-16 h-16 rounded-2xl border-2 border-border-light bg-background-secondary flex items-center justify-center mb-6">
        <span className="text-3xl">📦</span>
      </div>
      <h2 className="text-xl font-light text-text-primary mb-2">{title}</h2>
      <p className="text-sm text-text-secondary text-center max-w-xs">{description}</p>
    </div>
  );
}

// Icons
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
      />
    </svg>
  );
}

function TargetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
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
