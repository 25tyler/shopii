import React, { useState, useEffect, useRef } from 'react';
import { useUserStore } from '../../stores/userStore';

interface SettingsDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: 'account' | 'preferences' | 'upgrade') => void;
}

export function SettingsDropdown({ isOpen, onClose, onSelectTab }: SettingsDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user, signOut } = useUserStore();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full right-0 mt-2 w-64 bg-background-secondary border border-border-light rounded-2xl shadow-lg overflow-hidden animate-fade-in z-50"
    >
      {/* User Info (if signed in) */}
      {user && (
        <div className="p-4 border-b border-border-light bg-glass backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-orange/10 backdrop-blur-sm flex items-center justify-center ring-2 ring-accent-orange/30">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || user.email}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-lg font-medium text-accent-orange">
                  {(user.name || user.email)[0].toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user.name || 'User'}
              </p>
              <p className="text-xs text-text-secondary truncate">{user.email}</p>
            </div>
          </div>
          {/* Plan Badge */}
          <div className="mt-3 flex items-center justify-between">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              user.plan === 'pro'
                ? 'bg-accent-orange/10 text-accent-orange ring-1 ring-accent-orange/30'
                : 'bg-glass-dark text-text-tertiary'
            }`}>
              {user.plan === 'pro' ? 'Pro' : 'Free'}
            </span>
            {user.plan === 'free' && (
              <button
                onClick={() => {
                  onSelectTab('upgrade');
                  onClose();
                }}
                className="text-xs text-accent-orange hover:text-accent-orange-dark font-medium transition-colors"
              >
                Upgrade →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Menu Items */}
      <div className="py-2">
        <MenuItem
          icon={<UserIcon />}
          label={user ? 'Account' : 'Sign In'}
          onClick={() => {
            onSelectTab('account');
            onClose();
          }}
        />
        <MenuItem
          icon={<SlidersIcon />}
          label="Preferences"
          onClick={() => {
            onSelectTab('preferences');
            onClose();
          }}
        />
        {user && (
          <MenuItem
            icon={<SparklesIcon />}
            label="Upgrade to Pro"
            onClick={() => {
              onSelectTab('upgrade');
              onClose();
            }}
          />
        )}
      </div>

      {/* Sign Out (if signed in) */}
      {user && (
        <>
          <div className="border-t border-border-light" />
          <div className="py-2">
            <MenuItem
              icon={<LogoutIcon />}
              label="Sign Out"
              onClick={handleSignOut}
              danger
            />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-2.5 flex items-center gap-3 transition-colors ${
        danger
          ? 'hover:bg-red-50 text-red-600'
          : 'hover:bg-glass backdrop-blur-sm text-text-primary'
      }`}
    >
      <div className={`w-5 h-5 flex-shrink-0 ${danger ? 'text-red-600' : 'text-text-tertiary'}`}>
        {icon}
      </div>
      <span className={`text-sm font-medium ${danger ? 'text-red-600' : 'text-text-primary'}`}>
        {label}
      </span>
    </button>
  );
}

// Icons
function UserIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
      />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );
}
