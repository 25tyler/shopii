import { create } from 'zustand';
import { User, UserPreferences } from '../types';

interface UserState {
  user: User | null;
  preferences: UserPreferences | null;
  isLoading: boolean;
  isOnboarded: boolean;
  guestSearchesUsed: number;

  // Actions
  setUser: (user: User | null) => void;
  setPreferences: (preferences: UserPreferences) => void;
  setOnboarded: (value: boolean) => void;
  incrementGuestSearches: () => void;
  resetGuestSearches: () => void;
  initialize: () => Promise<void>;
  signOut: () => void;
}

const GUEST_SEARCH_LIMIT = 5;
const FREE_SEARCH_LIMIT = 15;

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  preferences: null,
  isLoading: true,
  isOnboarded: false,
  guestSearchesUsed: 0,

  setUser: (user) => set({ user }),

  setPreferences: (preferences) => {
    set({ preferences });
    // Persist to chrome.storage
    chrome.storage.local.set({ userPreferences: preferences });
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
        'user',
        'userPreferences',
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
        isOnboarded: result.isOnboarded || false,
        guestSearchesUsed: result.guestSearchesUsed || 0,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to initialize user store:', error);
      set({ isLoading: false });
    }
  },

  signOut: () => {
    set({
      user: null,
      preferences: null,
      isOnboarded: false,
    });
    chrome.storage.local.remove(['user', 'userPreferences', 'isOnboarded']);
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
