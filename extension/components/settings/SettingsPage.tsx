import React, { useState, useEffect } from 'react';
import { useUserStore } from '../../stores/userStore';
import { AuthSection } from './AuthSection';
import { PreferencesSection } from './PreferencesSection';
import { UpgradeSection } from './UpgradeSection';
import { AccountSection } from './AccountSection';

type SettingsTab = 'account' | 'preferences' | 'upgrade';

interface SettingsPageProps {
  initialTab?: SettingsTab;
}

export function SettingsPage({ initialTab = 'account' }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const { user } = useUserStore();

  // Update active tab when initialTab changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Listen for upgrade tab switch event
  useEffect(() => {
    const handleSwitchToUpgrade = () => {
      setActiveTab('upgrade');
    };

    window.addEventListener('switchToUpgrade', handleSwitchToUpgrade);
    return () => window.removeEventListener('switchToUpgrade', handleSwitchToUpgrade);
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-background-primary">
      {/* Header */}
      <div className="sticky top-0 bg-glass backdrop-blur-lg border-b border-border-light px-6 py-5 z-10 shadow-glass-sm">
        <h1 className="text-2xl font-light text-text-primary mb-1">Settings</h1>
        <p className="text-sm text-text-secondary">
          {user ? `Manage your account and preferences` : 'Sign in to unlock more features'}
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-border-light bg-background-secondary">
        <div className="flex px-6">
          <TabButton
            label="Account"
            active={activeTab === 'account'}
            onClick={() => setActiveTab('account')}
          />
          <TabButton
            label="Preferences"
            active={activeTab === 'preferences'}
            onClick={() => setActiveTab('preferences')}
          />
          {user && (
            <TabButton
              label="Upgrade"
              active={activeTab === 'upgrade'}
              onClick={() => setActiveTab('upgrade')}
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {activeTab === 'account' && (
          user ? <AccountSection /> : <AuthSection />
        )}
        {activeTab === 'preferences' && <PreferencesSection />}
        {activeTab === 'upgrade' && user && <UpgradeSection />}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${
        active
          ? 'border-accent-orange text-accent-orange'
          : 'border-transparent text-text-tertiary hover:text-text-secondary'
      }`}
    >
      {label}
    </button>
  );
}
