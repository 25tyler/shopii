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
      <div className="flex flex-col h-full p-6">
        <div className="flex-1 flex flex-col items-center justify-center">
          {/* Logo */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-shopii-primary to-shopii-secondary flex items-center justify-center mb-6 shadow-xl shadow-shopii-primary/20">
            <span className="text-white text-3xl font-bold">S</span>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Welcome to Shopii</h1>
          <p className="text-slate-400 text-center mb-8 max-w-xs">
            Your AI shopping assistant that finds products people actually love.
          </p>

          {/* Features */}
          <div className="w-full space-y-3 mb-8">
            <FeatureItem
              icon="🔍"
              title="Smart Search"
              description="Ask for any product in natural language"
            />
            <FeatureItem
              icon="⭐"
              title="Real Ratings"
              description="AI-powered scores from Reddit, YouTube & experts"
            />
            <FeatureItem
              icon="💰"
              title="Best Deals"
              description="Find the best prices across retailers"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => setStep('categories')}
            className="w-full py-3 bg-gradient-to-r from-shopii-primary to-shopii-secondary hover:from-shopii-primary/90 hover:to-shopii-secondary/90 text-white font-medium rounded-xl transition-colors"
          >
            Get Started
          </button>
          <button
            onClick={handleSkip}
            className="w-full py-3 text-slate-400 hover:text-slate-300 text-sm transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  if (step === 'categories') {
    return (
      <div className="flex flex-col h-full p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-1 bg-shopii-primary rounded-full" />
            <div className="w-8 h-1 bg-slate-700 rounded-full" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">What do you shop for?</h2>
          <p className="text-slate-400 text-sm">Select your interests for better recommendations</p>
        </div>

        {/* Categories Grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => toggleCategory(category.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedCategories.includes(category.id)
                    ? 'bg-shopii-primary/20 border-shopii-primary text-white'
                    : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                <span className="text-xl mb-1 block">{category.emoji}</span>
                <span className="text-sm">{category.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-3">
          <button
            onClick={() => setStep('preferences')}
            disabled={selectedCategories.length === 0}
            className="w-full py-3 bg-gradient-to-r from-shopii-primary to-shopii-secondary hover:from-shopii-primary/90 hover:to-shopii-secondary/90 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-colors"
          >
            Continue ({selectedCategories.length} selected)
          </button>
          <button
            onClick={handleSkip}
            className="w-full py-3 text-slate-400 hover:text-slate-300 text-sm transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // Preferences step
  return (
    <div className="flex flex-col h-full p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-1 bg-shopii-primary rounded-full" />
          <div className="w-8 h-1 bg-shopii-primary rounded-full" />
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Your preferences</h2>
        <p className="text-slate-400 text-sm">Help us find the right products for you</p>
      </div>

      {/* Quality Preference */}
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-300 mb-3">What matters most to you?</p>
        <div className="space-y-2">
          {QUALITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setQualityPreference(option.id as typeof qualityPreference)}
              className={`w-full p-4 rounded-xl border text-left transition-all ${
                qualityPreference === option.id
                  ? 'bg-shopii-primary/20 border-shopii-primary'
                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`}
            >
              <p className="font-medium text-white">{option.label}</p>
              <p className="text-sm text-slate-400">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 space-y-3">
        <button
          onClick={handleComplete}
          className="w-full py-3 bg-gradient-to-r from-shopii-primary to-shopii-secondary hover:from-shopii-primary/90 hover:to-shopii-secondary/90 text-white font-medium rounded-xl transition-colors"
        >
          Start Shopping
        </button>
        <button
          onClick={() => setStep('categories')}
          className="w-full py-3 text-slate-400 hover:text-slate-300 text-sm transition-colors"
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
    <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-xl">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="font-medium text-white text-sm">{title}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
    </div>
  );
}
