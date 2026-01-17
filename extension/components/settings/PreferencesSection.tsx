import React, { useState, useEffect } from 'react';
import { useUserStore } from '../../stores/userStore';
import { UserPreferences } from '../../types';
import { api } from '../../services/api';

const CATEGORIES = [
  { id: 'electronics', label: 'Electronics & Gadgets', emoji: '📱' },
  { id: 'home', label: 'Home & Kitchen', emoji: '🏠' },
  { id: 'fashion', label: 'Fashion & Accessories', emoji: '👗' },
  { id: 'health', label: 'Health & Fitness', emoji: '💪' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮' },
  { id: 'beauty', label: 'Beauty & Personal Care', emoji: '✨' },
  { id: 'outdoor', label: 'Outdoor & Sports', emoji: '⛺' },
  { id: 'books', label: 'Books & Media', emoji: '📚' },
];

const QUALITY_OPTIONS = [
  { id: 'budget', label: 'Budget-friendly', description: 'I prefer the cheapest option that works' },
  { id: 'mid-range', label: 'Best value', description: 'Balance of price and quality' },
  { id: 'premium', label: 'Premium quality', description: "I'll pay more for the best" },
];

export function PreferencesSection() {
  const { user, preferences, guestPreferences, setPreferences, setGuestPreferences } = useUserStore();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [qualityPreference, setQualityPreference] = useState<'budget' | 'mid-range' | 'premium'>('mid-range');
  const [budgetMin, setBudgetMin] = useState(0);
  const [budgetMax, setBudgetMax] = useState(500);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Initialize from stored preferences
  useEffect(() => {
    const prefs = user ? preferences : guestPreferences;
    if (prefs) {
      setSelectedCategories(prefs.categories || []);
      setQualityPreference(prefs.qualityPreference || 'mid-range');
      setBudgetMin(prefs.budgetRange?.min || 0);
      setBudgetMax(prefs.budgetRange?.max || 500);
    }
  }, [user, preferences, guestPreferences]);

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');

    const newPreferences: UserPreferences = {
      categories: selectedCategories,
      budgetRange: { min: budgetMin, max: budgetMax, currency: 'USD' },
      qualityPreference,
      brandPreferences: preferences?.brandPreferences || guestPreferences?.brandPreferences || [],
      brandExclusions: preferences?.brandExclusions || guestPreferences?.brandExclusions || [],
    };

    try {
      if (user) {
        // Update on backend
        await api.updatePreferences({
          categories: selectedCategories,
          budgetMin,
          budgetMax,
          currency: 'USD',
          qualityPreference,
        });
        setPreferences(newPreferences);
        setSaveMessage('Preferences saved!');
      } else {
        // Save as guest preferences
        setGuestPreferences(newPreferences);
        setSaveMessage('Preferences saved locally. Sign in to sync across devices.');
      }
    } catch (error: any) {
      setSaveMessage(error.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Categories */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-medium text-text-primary mb-1">Shopping Categories</h2>
          <p className="text-sm text-text-secondary">
            Select the categories you're most interested in
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => toggleCategory(category.id)}
              className={`p-4 rounded-2xl text-left transition-all duration-200 ${
                selectedCategories.includes(category.id)
                  ? 'bg-accent-orange/10 backdrop-blur-sm shadow-glass-sm ring-2 ring-accent-orange/30'
                  : 'bg-glass backdrop-blur-sm shadow-glass-sm hover:shadow-glass'
              }`}
            >
              <span className="text-2xl mb-2 block">{category.emoji}</span>
              <span className="text-sm font-medium text-text-primary">{category.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Quality Preference */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-medium text-text-primary mb-1">Quality Preference</h2>
          <p className="text-sm text-text-secondary">
            What matters most to you when shopping?
          </p>
        </div>

        <div className="space-y-3">
          {QUALITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setQualityPreference(option.id as typeof qualityPreference)}
              className={`w-full p-4 rounded-2xl text-left transition-all duration-200 ${
                qualityPreference === option.id
                  ? 'bg-accent-orange/10 backdrop-blur-sm shadow-glass-sm ring-2 ring-accent-orange/30'
                  : 'bg-glass backdrop-blur-sm shadow-glass-sm hover:shadow-glass'
              }`}
            >
              <p className="font-medium text-text-primary">{option.label}</p>
              <p className="text-sm text-text-secondary">{option.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Budget Range */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-medium text-text-primary mb-1">Budget Range</h2>
          <p className="text-sm text-text-secondary">
            Typical price range for products you're looking for
          </p>
        </div>

        <div className="p-5 bg-glass backdrop-blur-sm rounded-2xl shadow-glass-sm space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Minimum
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">
                  $
                </span>
                <input
                  type="number"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(Number(e.target.value))}
                  min={0}
                  className="w-full pl-8 pr-4 py-3 bg-background-secondary border border-border-light rounded-xl text-sm text-text-primary focus:outline-none focus:border-accent-orange focus:ring-2 focus:ring-accent-orange/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Maximum
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">
                  $
                </span>
                <input
                  type="number"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(Number(e.target.value))}
                  min={budgetMin}
                  className="w-full pl-8 pr-4 py-3 bg-background-secondary border border-border-light rounded-xl text-sm text-text-primary focus:outline-none focus:border-accent-orange focus:ring-2 focus:ring-accent-orange/20 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <div className="flex justify-between text-sm text-text-tertiary mb-2">
              <span>${budgetMin}</span>
              <span>${budgetMax}</span>
            </div>
            <div className="h-2 bg-background-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent-orange to-accent-orange-dark"
                style={{
                  width: `${((budgetMax - budgetMin) / budgetMax) * 100}%`,
                  marginLeft: `${(budgetMin / budgetMax) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="sticky bottom-0 bg-background-primary pt-4 pb-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-accent-orange hover:bg-accent-orange-dark disabled:bg-glass-dark disabled:text-text-quaternary text-white font-medium rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>

        {saveMessage && (
          <div className={`mt-3 p-3 rounded-xl text-sm text-center ${
            saveMessage.includes('Failed')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {saveMessage}
          </div>
        )}
      </div>
    </div>
  );
}
