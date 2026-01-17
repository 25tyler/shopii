import { create } from 'zustand';
import { User, UserPreferences } from '../types';
import { api } from '../services/api';
import { signInWithGoogle as supabaseSignInWithGoogle, signOut as supabaseSignOut } from '../services/supabase';

interface UserState {
  user: User | null;
  preferences: UserPreferences | null;
  isLoading: boolean;
  isOnboarded: boolean;
  guestSearchesUsed: number;
  guestPreferences: UserPreferences | null;

  // Actions
  setUser: (user: User | null) => void;
  setPreferences: (preferences: UserPreferences) => void;
  setGuestPreferences: (preferences: UserPreferences) => void;
  setOnboarded: (value: boolean) => void;
  incrementGuestSearches: () => void;
  resetGuestSearches: () => void;
  initialize: () => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchUserData: () => Promise<void>;
}

const GUEST_SEARCH_LIMIT = 5;
const FREE_SEARCH_LIMIT = 15;

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  preferences: null,
  isLoading: true,
  isOnboarded: false,
  guestSearchesUsed: 0,
  guestPreferences: null,

  setUser: (user) => set({ user }),

  setPreferences: (preferences) => {
    set({ preferences });
    // Persist to chrome.storage
    chrome.storage.local.set({ userPreferences: preferences });
  },

  setGuestPreferences: (preferences) => {
    set({ guestPreferences: preferences });
    chrome.storage.local.set({ guestPreferences: preferences });
  },

  setOnboarded: (value) => {
    set({ isOnboarded: value });
    chrome.storage.local.set({ isOnboarded: value });
  },

  incrementGuestSearches: () => {
    const current = get().guestSearchesUsed;
    const newCount = current + 1;
    set({ guestSearchesUsed: newCount });
    chrome.storage.local.set({ guestSearchesUsed: newCount });
  },

  resetGuestSearches: () => {
    set({ guestSearchesUsed: 0 });
    chrome.storage.local.set({ guestSearchesUsed: 0 });
  },

  initialize: async () => {
    try {
      const result = await chrome.storage.local.get([
        'authToken',
        'user',
        'userPreferences',
        'guestPreferences',
        'isOnboarded',
        'guestSearchesUsed',
        'guestSearchesResetDate',
      ]);

      // Check if guest searches should be reset (new day)
      const today = new Date().toDateString();
      if (result.guestSearchesResetDate !== today) {
        await chrome.storage.local.set({
          guestSearchesUsed: 0,
          guestSearchesResetDate: today,
        });
        result.guestSearchesUsed = 0;
      }

      set({
        user: result.user || null,
        preferences: result.userPreferences || null,
        guestPreferences: result.guestPreferences || null,
        isOnboarded: result.isOnboarded || false,
        guestSearchesUsed: result.guestSearchesUsed || 0,
        isLoading: false,
      });

      // If user has auth token, fetch fresh user data
      if (result.authToken) {
        await get().fetchUserData();
      }
    } catch (error) {
      console.error('Failed to initialize user store:', error);
      set({ isLoading: false });
    }
  },

  fetchUserData: async () => {
    try {
      const userData = await api.getMe();

      // Transform API preferences to match extension type
      const preferences = userData.preferences
        ? {
            categories: userData.preferences.categories,
            budgetRange: {
              min: userData.preferences.budgetMin,
              max: userData.preferences.budgetMax,
              currency: userData.preferences.currency,
            },
            qualityPreference: userData.preferences.qualityPreference as
              | 'budget'
              | 'mid-range'
              | 'premium',
            brandPreferences: userData.preferences.brandPreferences,
            brandExclusions: userData.preferences.brandExclusions,
          }
        : null;

      set({
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name || undefined,
          avatarUrl: userData.avatarUrl || undefined,
          plan: userData.plan,
          createdAt: userData.createdAt,
        },
        preferences,
      });

      // Save to storage
      await chrome.storage.local.set({
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name || undefined,
          avatarUrl: userData.avatarUrl || undefined,
          plan: userData.plan,
          createdAt: userData.createdAt,
        },
        userPreferences: preferences,
      });
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      // If fetch fails, clear auth (token might be expired)
      await get().signOut();
    }
  },

  signUp: async (email: string, password: string, name?: string) => {
    const { guestPreferences } = get();

    try {
      // Transform guest preferences to API format
      const apiPreferences = guestPreferences
        ? {
            categories: guestPreferences.categories,
            budgetMin: guestPreferences.budgetRange.min,
            budgetMax: guestPreferences.budgetRange.max,
            currency: guestPreferences.budgetRange.currency,
            qualityPreference: guestPreferences.qualityPreference,
            brandPreferences: guestPreferences.brandPreferences,
            brandExclusions: guestPreferences.brandExclusions,
          }
        : undefined;

      // Sign up with guest preferences
      await api.signUp({
        email,
        password,
        name,
        preferences: apiPreferences,
      });

      // Note: User needs to sign in after signup
      // Clear guest data
      set({ guestPreferences: null });
      await chrome.storage.local.remove(['guestPreferences']);
    } catch (error: any) {
      console.error('Sign up error:', error);
      throw new Error(error.message || 'Failed to sign up');
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      const response = await api.signIn({ email, password });

      // Save tokens
      await chrome.storage.local.set({
        authToken: response.access_token,
        refreshToken: response.refresh_token,
      });

      // Fetch user data
      await get().fetchUserData();

      // Clear guest data
      set({ guestSearchesUsed: 0, guestPreferences: null });
      await chrome.storage.local.remove(['guestSearchesUsed', 'guestPreferences']);
    } catch (error: any) {
      console.error('Sign in error:', error);
      throw new Error(error.message || 'Failed to sign in');
    }
  },

  signInWithGoogle: async () => {
    const { guestPreferences } = get();

    try {
      // Trigger Google OAuth flow
      const session = await supabaseSignInWithGoogle();

      if (!session || typeof session !== 'object' || !('access_token' in session)) {
        throw new Error('Google sign in cancelled');
      }

      // Transform guest preferences to API format
      const apiPreferences = guestPreferences
        ? {
            categories: guestPreferences.categories,
            budgetMin: guestPreferences.budgetRange.min,
            budgetMax: guestPreferences.budgetRange.max,
            currency: guestPreferences.budgetRange.currency,
            qualityPreference: guestPreferences.qualityPreference,
            brandPreferences: guestPreferences.brandPreferences,
            brandExclusions: guestPreferences.brandExclusions,
          }
        : undefined;

      // Send Google token to backend with guest preferences
      const response = await api.signInWithGoogle({
        idToken: session.access_token as string,
        preferences: apiPreferences,
      });

      // Save tokens
      await chrome.storage.local.set({
        authToken: response.access_token,
        refreshToken: response.refresh_token,
      });

      // Fetch user data
      await get().fetchUserData();

      // Clear guest data
      set({ guestSearchesUsed: 0, guestPreferences: null });
      await chrome.storage.local.remove(['guestSearchesUsed', 'guestPreferences']);
    } catch (error: any) {
      console.error('Google sign in error:', error);
      throw new Error(error.message || 'Failed to sign in with Google');
    }
  },

  signOut: async () => {
    try {
      // Sign out from Supabase
      await supabaseSignOut();

      // Call API logout
      await api.logout();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      // Clear local state regardless of API call result
      set({
        user: null,
        preferences: null,
        isOnboarded: false,
      });
      await chrome.storage.local.remove([
        'authToken',
        'refreshToken',
        'user',
        'userPreferences',
        'isOnboarded',
      ]);
    }
  },
}));

// Helper function to check if user can search
export function canSearch(state: UserState): { allowed: boolean; reason?: string } {
  const { user, guestSearchesUsed } = state;

  if (!user) {
    // Guest mode
    if (guestSearchesUsed >= GUEST_SEARCH_LIMIT) {
      return {
        allowed: false,
        reason: `You've used all ${GUEST_SEARCH_LIMIT} free searches today. Sign up for more!`,
      };
    }
    return { allowed: true };
  }

  if (user.plan === 'free') {
    // Free tier - could add daily limit tracking here
    return { allowed: true };
  }

  // Pro users have unlimited searches
  return { allowed: true };
}
