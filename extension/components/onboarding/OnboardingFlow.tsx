import React, { useState } from 'react';
import { useUserStore } from '../../stores/userStore';
import { UserPreferences } from '../../types';

type Step = 'welcome' | 'categories' | 'preferences';

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

export function OnboardingFlow() {
  const [step, setStep] = useState<Step>('welcome');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [qualityPreference, setQualityPreference] = useState<'budget' | 'mid-range' | 'premium'>('mid-range');
  const { setPreferences, setOnboarded } = useUserStore();

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleComplete = () => {
    const preferences: UserPreferences = {
      categories: selectedCategories,
      budgetRange: { min: 0, max: 500, currency: 'USD' },
      qualityPreference,
      brandPreferences: [],
      brandExclusions: [],
    };
    setPreferences(preferences);
    setOnboarded(true);
  };

  const handleSkip = () => {
    setOnboarded(true);
  };

  if (step === 'welcome') {
    return (
      <div className="flex flex-col h-full px-8 py-12 bg-background-primary">
        <div className="flex-1 flex flex-col items-center justify-center">
          {/* Logo */}
          <div className="w-24 h-24 mb-8 flex items-center justify-center">
            <img
              src="/icon/128.png"
              alt="Shopii"
              className="w-full h-full"
            />
          </div>

          <h1 className="text-3xl font-light text-text-primary mb-4 text-center">Welcome to Shopii</h1>
          <p className="text-base text-text-secondary text-center mb-10 max-w-sm">
            Your AI-powered shopping assistant that finds products people actually love
          </p>

          {/* Features */}
          <div className="w-full space-y-3 mb-10">
            <FeatureItem
              icon="🔍"
              title="Smart product search"
              description="Ask for any product in natural language"
            />
            <FeatureItem
              icon="⭐"
              title="Honest ratings from real people"
              description="AI-powered scores from Reddit, YouTube & experts"
            />
            <FeatureItem
              icon="💰"
              title="Best deals across retailers"
              description="Find the best prices and get personalized recommendations"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => setStep('categories')}
            className="w-full py-3 bg-accent-orange hover:bg-accent-orange-dark text-white font-medium rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md"
          >
            Get Started
          </button>
          <button
            onClick={handleSkip}
            className="w-full py-3 text-text-tertiary hover:text-text-secondary text-sm transition-all duration-200"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  if (step === 'categories') {
    return (
      <div className="flex flex-col h-full px-6 py-8 bg-background-primary">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-1 bg-accent-orange rounded-full" />
            <div className="w-8 h-1 bg-glass-dark backdrop-blur-sm rounded-full" />
          </div>
          <h2 className="text-2xl font-light text-text-primary mb-2">What are you shopping for?</h2>
          <p className="text-sm text-text-secondary">Select categories you're interested in</p>
        </div>

        {/* Categories Grid */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          <div className="grid grid-cols-2 gap-3 mb-8">
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
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-3">
          <button
            onClick={() => setStep('preferences')}
            disabled={selectedCategories.length === 0}
            className="w-full py-3 bg-accent-orange hover:bg-accent-orange-dark disabled:bg-glass-dark disabled:text-text-quaternary text-white font-medium rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md"
          >
            Continue ({selectedCategories.length} selected)
          </button>
          <button
            onClick={handleSkip}
            className="w-full py-3 text-text-tertiary hover:text-text-secondary text-sm transition-all duration-200"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // Preferences step
  return (
    <div className="flex flex-col h-full px-6 py-8 bg-background-primary">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-1 bg-accent-orange rounded-full" />
          <div className="w-8 h-1 bg-accent-orange rounded-full" />
        </div>
        <h2 className="text-2xl font-light text-text-primary mb-2">Your preferences</h2>
        <p className="text-sm text-text-secondary">Help us find the right products for you</p>
      </div>

      {/* Quality Preference */}
      <div className="flex-1 px-2 py-1">
        <p className="text-sm font-medium text-text-primary mb-3">What matters most to you?</p>
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
      </div>

      {/* Actions */}
      <div className="mt-6 space-y-3">
        <button
          onClick={handleComplete}
          className="w-full py-3 bg-accent-orange hover:bg-accent-orange-dark text-white font-medium rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md"
        >
          Start Shopping
        </button>
        <button
          onClick={() => setStep('categories')}
          className="w-full py-3 text-text-tertiary hover:text-text-secondary text-sm transition-all duration-200"
        >
          Back
        </button>
      </div>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-glass backdrop-blur-sm rounded-2xl shadow-glass-sm">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="font-medium text-text-primary text-sm">{title}</p>
        <p className="text-xs text-text-secondary">{description}</p>
      </div>
    </div>
  );
}
