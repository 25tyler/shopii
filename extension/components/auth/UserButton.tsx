import React, { useState } from 'react';
import { useUserStore } from '../../stores/userStore';
import { AuthModal } from './AuthModal';

export function UserButton() {
  const { user, signOut } = useUserStore();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setShowDropdown(false);
  };

  if (!user) {
    return (
      <>
        <button
          onClick={() => setShowAuthModal(true)}
          className="px-3 py-1.5 bg-gradient-to-r from-shopii-primary to-shopii-secondary text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          Sign In
        </button>
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-700 transition-colors"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name || user.email}
            className="w-7 h-7 rounded-full"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-shopii-primary to-shopii-secondary flex items-center justify-center">
            <span className="text-white text-sm font-medium">
              {(user.name || user.email)[0].toUpperCase()}
            </span>
          </div>
        )}
        <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />

          {/* Dropdown Menu */}
          <div className="absolute right-0 mt-2 w-64 bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden z-20">
            <div className="p-3 border-b border-slate-700">
              <p className="text-white font-medium truncate">{user.name || 'User'}</p>
              <p className="text-slate-400 text-sm truncate">{user.email}</p>
              <div className="mt-2 inline-flex items-center px-2 py-1 bg-shopii-primary/20 text-shopii-primary text-xs font-medium rounded">
                {user.plan === 'pro' ? '✨ Pro' : '🆓 Free'}
              </div>
            </div>

            <div className="p-2">
              {user.plan === 'free' && (
                <button
                  onClick={() => setShowDropdown(false)}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-700 rounded-md transition-colors flex items-center gap-2"
                >
                  <SparklesIcon className="w-4 h-4 text-shopii-primary" />
                  Upgrade to Pro
                </button>
              )}
              <button
                onClick={() => setShowDropdown(false)}
                className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 rounded-md transition-colors flex items-center gap-2"
              >
                <SettingsIcon className="w-4 h-4" />
                Settings
              </button>
              <button
                onClick={handleSignOut}
                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 rounded-md transition-colors flex items-center gap-2"
              >
                <LogoutIcon className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}