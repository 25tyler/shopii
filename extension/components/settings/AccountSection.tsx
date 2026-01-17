import React, { useState } from 'react';
import { useUserStore } from '../../stores/userStore';

export function AccountSection() {
  const { user, signOut } = useUserStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Profile Info */}
      <section className="p-5 bg-glass backdrop-blur-sm rounded-2xl shadow-glass-sm">
        <h2 className="text-lg font-medium text-text-primary mb-4">Profile</h2>

        <div className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-accent-orange/10 backdrop-blur-sm flex items-center justify-center ring-2 ring-accent-orange/30">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || user.email}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-2xl font-medium text-accent-orange">
                  {(user.name || user.email)[0].toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <p className="font-medium text-text-primary">
                {user.name || 'User'}
              </p>
              <p className="text-sm text-text-secondary">{user.email}</p>
            </div>
          </div>

          {/* Plan Badge */}
          <div className="pt-4 border-t border-border-light">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary mb-1">Current Plan</p>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    user.plan === 'pro'
                      ? 'bg-accent-orange/10 text-accent-orange ring-1 ring-accent-orange/30'
                      : 'bg-glass-dark text-text-tertiary'
                  }`}>
                    {user.plan === 'pro' ? 'Pro' : 'Free'}
                  </span>
                  {user.plan === 'free' && (
                    <span className="text-xs text-text-tertiary">
                      20 searches/day
                    </span>
                  )}
                  {user.plan === 'pro' && (
                    <span className="text-xs text-text-tertiary">
                      Unlimited searches
                    </span>
                  )}
                </div>
              </div>
              {user.plan === 'free' && (
                <button
                  onClick={() => {
                    // Dispatch custom event to switch to upgrade tab
                    window.dispatchEvent(new CustomEvent('switchToUpgrade'));
                  }}
                  className="px-4 py-2 bg-accent-orange hover:bg-accent-orange-dark text-white text-sm font-medium rounded-xl transition-all"
                >
                  Upgrade
                </button>
              )}
            </div>
          </div>

          {/* Account Stats */}
          <div className="pt-4 border-t border-border-light">
            <p className="text-sm font-medium text-text-primary mb-3">Account Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-tertiary mb-1">Member Since</p>
                <p className="text-sm text-text-primary">
                  {new Date(user.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary mb-1">Email Verified</p>
                <p className="text-sm text-accent-green">✓ Verified</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Actions */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-text-primary mb-3">Account Actions</h2>

        <button
          onClick={handleSignOut}
          className="w-full p-4 bg-glass backdrop-blur-sm hover:bg-glass-dark rounded-2xl shadow-glass-sm transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-background-tertiary flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-text-secondary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-text-primary">Sign Out</p>
                <p className="text-xs text-text-secondary">Sign out of your account</p>
              </div>
            </div>
            <svg
              className="w-5 h-5 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* Delete Account */}
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full p-4 bg-glass backdrop-blur-sm hover:bg-red-50 rounded-2xl shadow-glass-sm transition-all text-left border border-transparent hover:border-red-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-red-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-red-600">Delete Account</p>
                  <p className="text-xs text-red-500">Permanently delete your account</p>
                </div>
              </div>
              <svg
                className="w-5 h-5 text-text-tertiary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ) : (
          <div className="p-5 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-sm font-medium text-red-800 mb-1">
              Are you sure you want to delete your account?
            </p>
            <p className="text-xs text-red-600 mb-4">
              This action cannot be undone. All your data will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 px-4 bg-white border border-border-light hover:bg-background-tertiary text-text-primary text-sm font-medium rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  // TODO: Implement delete account
                  alert('Delete account functionality not yet implemented');
                }}
                className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-all"
              >
                Delete Account
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
