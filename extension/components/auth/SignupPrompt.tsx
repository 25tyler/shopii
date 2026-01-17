import React, { useState } from 'react';
import { AuthModal } from './AuthModal';

interface SignupPromptProps {
  searchesUsed: number;
  limit: number;
  onDismiss?: () => void;
}

export function SignupPrompt({ searchesUsed, limit, onDismiss }: SignupPromptProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <div className="m-4 p-6 bg-gradient-to-br from-shopii-primary/20 to-shopii-secondary/20 border border-shopii-primary/50 rounded-2xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-shopii-primary to-shopii-secondary flex items-center justify-center flex-shrink-0">
            <LockIcon className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-2">
              You've reached your daily limit
            </h3>
            <p className="text-slate-300 text-sm mb-4">
              You've used all {limit} free searches today. Create a free account to get 20 searches per day, or upgrade to Pro for unlimited searches!
            </p>

            <div className="grid gap-3 sm:grid-cols-2 mb-4">
              <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-5 h-5 rounded bg-slate-700 flex items-center justify-center">
                    <span className="text-xs">✓</span>
                  </div>
                  <span className="text-sm font-medium text-white">Free Account</span>
                </div>
                <p className="text-xs text-slate-400">20 searches per day</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-shopii-primary/10 to-shopii-secondary/10 rounded-lg border border-shopii-primary/30">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-5 h-5 rounded bg-gradient-to-br from-shopii-primary to-shopii-secondary flex items-center justify-center">
                    <span className="text-xs">✨</span>
                  </div>
                  <span className="text-sm font-medium text-white">Pro</span>
                </div>
                <p className="text-xs text-slate-400">Unlimited searches</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowAuthModal(true)}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-shopii-primary to-shopii-secondary text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                Create Free Account
              </button>
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="px-4 py-2.5 text-slate-400 hover:text-white transition-colors"
                >
                  Maybe Later
                </button>
              )}
            </div>

            <p className="text-xs text-slate-500 mt-3 text-center">
              By signing up, your guest preferences will be automatically saved to your account.
            </p>
          </div>
        </div>
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultTab="signup"
      />
    </>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}