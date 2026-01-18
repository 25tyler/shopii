import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChatContainer } from '../../components/chat/ChatContainer';
import { SuggestionsPage } from '../../components/suggestions/SuggestionsPage';
import { OnboardingFlow } from '../../components/onboarding/OnboardingFlow';
import { SettingsPage } from '../../components/settings/SettingsPage';
import { useUserStore } from '../../stores/userStore';

type Route = 'search' | 'saved' | 'for-you';
type SettingsTab = 'account' | 'preferences' | 'upgrade';

export default function App() {
  const [activeRoute, setActiveRoute] = useState<Route>('search');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('account');
  const { isOnboarded, isLoading, initialize, user } = useUserStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Close modal when user signs in
  useEffect(() => {
    if (user && showSettingsModal) {
      setShowSettingsModal(false);
    }
  }, [user]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showSettingsModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showSettingsModal]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent-orange border-t-transparent rounded-full animate-spin" />
          <p className="text-text-tertiary">Loading Shopii...</p>
        </div>
      </div>
    );
  }

  if (!isOnboarded) {
    return <OnboardingFlow />;
  }

  return (
    <div className="flex flex-col h-full relative bg-background-primary">
      {/* Header */}
      <header className="h-14 px-5 bg-glass backdrop-blur-lg flex items-center justify-between flex-shrink-0 shadow-glass-sm">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <img
            src="/icon/48.png"
            alt="Shopii"
            className="w-7 h-7"
          />
          <h1 className="text-base font-medium text-text-primary">Shopii</h1>
        </div>

        {/* Navigation buttons - centered in pill */}
        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-glass-dark backdrop-blur-md rounded-full p-1 shadow-glass-sm">
          <NavButton
            icon={SearchIcon}
            active={activeRoute === 'search'}
            onClick={() => setActiveRoute('search')}
            title="Search"
          />
          <NavButton
            icon={TrendingIcon}
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

        {/* Sign In Button or Profile Picture */}
        <div className="relative">
          {!user ? (
            // Sign In Button for non-authenticated users
            <button
              onClick={() => {
                setSettingsTab('account');
                setShowSettingsModal(true);
              }}
              className="px-4 py-2 bg-accent-orange hover:bg-accent-orange-dark text-white text-sm font-medium rounded-xl transition-all shadow-sm"
            >
              Sign In
            </button>
          ) : (
            // Profile Picture for authenticated users - opens preferences directly
            <button
              onClick={() => {
                setSettingsTab('preferences');
                setShowSettingsModal(true);
              }}
              className="w-9 h-9 rounded-full bg-accent-orange/10 backdrop-blur-sm flex items-center justify-center ring-2 ring-accent-orange/30 hover:ring-accent-orange/50 transition-all"
              title="Preferences & Settings"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || user.email}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-sm font-medium text-accent-orange">
                  {(user.name || user.email)[0].toUpperCase()}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Content - Both components stay mounted to preserve state */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className={`absolute inset-0 transition-all duration-300 ease-out ${
            activeRoute === 'search' ? 'opacity-100 visible translate-x-0' : 'opacity-0 invisible translate-x-4'
          }`}
        >
          <ChatContainer />
        </div>
        <div
          className={`absolute inset-0 transition-all duration-300 ease-out ${
            activeRoute === 'for-you' ? 'opacity-100 visible translate-x-0' : 'opacity-0 invisible translate-x-4'
          }`}
        >
          <SuggestionsPage />
        </div>
        {/* Placeholder screen for saved */}
        <div
          className={`absolute inset-0 transition-all duration-300 ease-out ${
            activeRoute === 'saved' ? 'opacity-100 visible translate-x-0' : 'opacity-0 invisible translate-x-4'
          }`}
        >
          <PlaceholderScreen title="Saved Products" description="Your saved products will appear here" />
        </div>
      </div>

      {/* Settings Modal - Using portal to render at body level */}
      {showSettingsModal && createPortal(
        <div
          className="fixed inset-0 z-[999999]"
          style={{ isolation: 'isolate' }}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowSettingsModal(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
            <div
              className="relative w-full max-w-3xl max-h-[90vh] bg-background-primary rounded-2xl shadow-2xl overflow-hidden animate-slide-up pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => setShowSettingsModal(false)}
                className="absolute top-4 right-4 z-10 p-2 bg-glass backdrop-blur-sm hover:bg-glass-dark rounded-xl transition-all shadow-glass-sm"
              >
                <svg className="w-5 h-5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Scrollable Content Wrapper */}
              <div className="overflow-y-auto max-h-[90vh]">
                <SettingsPageWrapper initialTab={settingsTab} />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Wrapper to pass initial tab to SettingsPage
function SettingsPageWrapper({ initialTab }: { initialTab: SettingsTab }) {
  return <SettingsPage initialTab={initialTab} />;
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
        px-3 h-8 flex items-center justify-center rounded-full
        transition-all duration-200 ease-out
        ${
          active
            ? 'bg-accent-orange text-white shadow-sm'
            : 'text-text-tertiary hover:bg-glass-dark backdrop-blur-sm'
        }
      `}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}

function PlaceholderScreen({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-12 bg-background-primary">
      <div className="w-16 h-16 rounded-3xl bg-glass backdrop-blur-md flex items-center justify-center mb-6 shadow-glass">
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

function TrendingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

