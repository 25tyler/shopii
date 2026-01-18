import React, { useState } from 'react';
import { useUserStore } from '../../stores/userStore';

type AuthMode = 'signin' | 'signup';

export function AuthSection() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useUserStore();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password, name || undefined);
        // After signup, switch to signin mode
        setMode('signin');
        setPassword('');
        setError('Account created! Please sign in.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      {/* Sign in/Sign up toggle */}
      <div className="flex gap-2 mb-6 p-1 bg-glass backdrop-blur-sm rounded-2xl">
        <button
          onClick={() => setMode('signin')}
          className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all ${
            mode === 'signin'
              ? 'bg-accent-orange text-white shadow-sm'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => setMode('signup')}
          className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all ${
            mode === 'signup'
              ? 'bg-accent-orange text-white shadow-sm'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Sign Up
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className={`mb-4 p-3 rounded-xl text-sm ${
          error.includes('created')
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {error}
        </div>
      )}

      {/* Email/Password form */}
      <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
        {mode === 'signup' && (
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-background-secondary border border-border-light rounded-xl text-sm text-text-primary placeholder-text-quaternary focus:outline-none focus:border-accent-orange focus:ring-2 focus:ring-accent-orange/20 transition-all"
              placeholder="Your name"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 bg-background-secondary border border-border-light rounded-xl text-sm text-text-primary placeholder-text-quaternary focus:outline-none focus:border-accent-orange focus:ring-2 focus:ring-accent-orange/20 transition-all"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-3 bg-background-secondary border border-border-light rounded-xl text-sm text-text-primary placeholder-text-quaternary focus:outline-none focus:border-accent-orange focus:ring-2 focus:ring-accent-orange/20 transition-all"
            placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-accent-orange hover:bg-accent-orange-dark disabled:bg-glass-dark disabled:text-text-quaternary text-white font-medium rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md"
        >
          {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      {/* Benefits */}
      <div className="mt-8 p-4 bg-glass backdrop-blur-sm rounded-2xl">
        <p className="text-sm font-medium text-text-primary mb-3">Why sign in?</p>
        <ul className="space-y-2">
          <BenefitItem text="Save your preferences and search history" />
          <BenefitItem text="Get personalized product recommendations" />
          <BenefitItem text="More searches per day (20 vs 5)" />
          <BenefitItem text="Sync across devices" />
        </ul>
      </div>
    </div>
  );
}

function BenefitItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-text-secondary">
      <svg
        className="w-4 h-4 text-accent-orange mt-0.5 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      {text}
    </li>
  );
}
