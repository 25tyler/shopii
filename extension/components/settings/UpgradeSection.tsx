import React, { useState, useEffect } from 'react';
import { useUserStore } from '../../stores/userStore';
import { api } from '../../services/api';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: string | null;
  features: string[];
}

export function UpgradeSection() {
  const { user } = useUserStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const response = await api.getPlans();
      setPlans(response.plans);
    } catch (err: any) {
      setError('Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    setError('');

    try {
      const response = await api.createCheckoutSession();
      // Open Stripe checkout in new tab
      window.open(response.checkoutUrl, '_blank');
    } catch (err: any) {
      setError(err.message || 'Failed to start upgrade');
    } finally {
      setUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    try {
      const response = await api.createPortalSession();
      window.open(response.portalUrl, '_blank');
    } catch (err: any) {
      setError(err.message || 'Failed to open billing portal');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-3 border-accent-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const freePlan = plans.find((p) => p.id === 'free');
  const proPlan = plans.find((p) => p.id === 'pro');

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-light text-text-primary mb-2">
          {user?.plan === 'pro' ? "You're on Pro!" : 'Upgrade to Pro'}
        </h2>
        <p className="text-text-secondary">
          {user?.plan === 'pro'
            ? 'Enjoy unlimited searches and premium features'
            : 'Get unlimited searches and unlock all features'}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Plans Comparison */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Free Plan */}
        {freePlan && (
          <div className={`p-6 rounded-2xl border-2 transition-all ${
            user?.plan === 'free'
              ? 'border-accent-orange bg-accent-orange/5'
              : 'border-border-light bg-glass backdrop-blur-sm'
          }`}>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-medium text-text-primary">{freePlan.name}</h3>
                {user?.plan === 'free' && (
                  <span className="px-3 py-1 bg-accent-orange/10 text-accent-orange text-xs font-medium rounded-full ring-1 ring-accent-orange/30">
                    Current
                  </span>
                )}
              </div>
              <p className="text-text-secondary text-sm mb-4">{freePlan.description}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-semibold text-text-primary">Free</span>
              </div>
            </div>

            <ul className="space-y-3 mb-6">
              {freePlan.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                  <svg
                    className="w-5 h-5 text-text-tertiary mt-0.5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            {user?.plan !== 'free' && (
              <button
                disabled
                className="w-full py-3 bg-glass-dark text-text-quaternary font-medium rounded-xl cursor-not-allowed"
              >
                Current Plan
              </button>
            )}
          </div>
        )}

        {/* Pro Plan */}
        {proPlan && (
          <div className={`p-6 rounded-2xl border-2 transition-all ${
            user?.plan === 'pro'
              ? 'border-accent-orange bg-accent-orange/5'
              : 'border-accent-orange bg-gradient-to-br from-accent-orange/5 to-accent-orange/10'
          }`}>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-medium text-text-primary">{proPlan.name}</h3>
                {user?.plan === 'pro' ? (
                  <span className="px-3 py-1 bg-accent-orange/10 text-accent-orange text-xs font-medium rounded-full ring-1 ring-accent-orange/30">
                    Current
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-accent-orange text-white text-xs font-medium rounded-full">
                    Popular
                  </span>
                )}
              </div>
              <p className="text-text-secondary text-sm mb-4">{proPlan.description}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-semibold text-text-primary">
                  ${proPlan.price}
                </span>
                <span className="text-text-tertiary">/{proPlan.interval}</span>
              </div>
            </div>

            <ul className="space-y-3 mb-6">
              {proPlan.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                  <svg
                    className="w-5 h-5 text-accent-orange mt-0.5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            {user?.plan === 'pro' ? (
              <button
                onClick={handleManageBilling}
                className="w-full py-3 bg-background-secondary border border-border-light hover:border-accent-orange text-text-primary font-medium rounded-xl transition-all"
              >
                Manage Subscription
              </button>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="w-full py-3 bg-accent-orange hover:bg-accent-orange-dark disabled:bg-glass-dark disabled:text-text-quaternary text-white font-medium rounded-xl transition-all shadow-sm hover:shadow-md"
              >
                {upgrading ? 'Loading...' : 'Upgrade to Pro'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* FAQ */}
      <div className="p-6 bg-glass backdrop-blur-sm rounded-2xl shadow-glass-sm">
        <h3 className="text-lg font-medium text-text-primary mb-4">Frequently Asked Questions</h3>
        <div className="space-y-4">
          <FAQItem
            question="Can I cancel anytime?"
            answer="Yes! You can cancel your subscription at any time from the billing portal. You'll keep Pro access until the end of your billing period."
          />
          <FAQItem
            question="What payment methods do you accept?"
            answer="We accept all major credit and debit cards through Stripe, our secure payment processor."
          />
          <FAQItem
            question="Do you offer refunds?"
            answer="We offer a 7-day money-back guarantee. If you're not satisfied, contact support for a full refund."
          />
          <FAQItem
            question="What happens to my data if I downgrade?"
            answer="Your data is always safe. If you downgrade, you'll keep your preferences and history, but search limits will apply."
          />
        </div>
      </div>
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border-light last:border-0 pb-4 last:pb-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="font-medium text-text-primary text-sm">{question}</span>
        <svg
          className={`w-5 h-5 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <p className="mt-2 text-sm text-text-secondary leading-relaxed">
          {answer}
        </p>
      )}
    </div>
  );
}
