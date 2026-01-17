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
  const { signIn, signUp, signInWithGoogle } = useUserStore();

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

  const handleGoogleAuth = async () => {
    setError('');
    setLoading(true);

    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google sign in failed');
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
              ? 'bg-background-secondary text-text-primary shadow-glass-sm'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => setMode('signup')}
          className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all ${
            mode === 'signup'
              ? 'bg-background-secondary text-text-primary shadow-glass-sm'
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

      {/* Divider */}
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-light"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-background-primary text-text-tertiary">or</span>
        </div>
      </div>

      {/* Google Sign In */}
      <button
        onClick={handleGoogleAuth}
        disabled={loading}
        className="w-full py-3 px-4 bg-background-secondary border border-border-light hover:border-border-medium hover:shadow-sm disabled:opacity-50 rounded-2xl transition-all flex items-center justify-center gap-3"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        <span className="text-sm font-medium text-text-primary">
          Continue with Google
        </span>
      </button>

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
