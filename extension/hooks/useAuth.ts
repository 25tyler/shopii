import { useState, useEffect, useCallback } from 'react';
import { supabase, signInWithGoogle, signInWithEmail, signOut, getSession } from '../services/supabase';
import { api } from '../services/api';
import type { User } from '@supabase/supabase-js';

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  plan: 'free' | 'pro';
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const loadUser = useCallback(async () => {
    try {
      const session = await getSession();

      if (session) {
        // Get full user data from our API
        try {
          const userData = await api.getMe();
          setState({
            user: {
              id: userData.id,
              email: userData.email,
              name: userData.name,
              avatarUrl: userData.avatarUrl,
              plan: userData.plan,
            },
            isLoading: false,
            isAuthenticated: true,
          });
        } catch {
          // API might not have user yet, use Supabase data
          setState({
            user: {
              id: session.user.id,
              email: session.user.email || '',
              name: session.user.user_metadata?.full_name || null,
              avatarUrl: session.user.user_metadata?.avatar_url || null,
              plan: 'free',
            },
            isLoading: false,
            isAuthenticated: true,
          });
        }
      } else {
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        });
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }, []);

  useEffect(() => {
    loadUser();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await loadUser();
      } else if (event === 'SIGNED_OUT') {
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadUser]);

  const login = useCallback(async (method: 'google' | 'email', email?: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      if (method === 'google') {
        await signInWithGoogle();
      } else if (method === 'email' && email) {
        await signInWithEmail(email);
        // For magic link, we return early and wait for the link to be clicked
        setState((prev) => ({ ...prev, isLoading: false }));
        return { magicLinkSent: true };
      }

      await loadUser();
      return { success: true };
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [loadUser]);

  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      await signOut();
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  return {
    ...state,
    login,
    logout,
    refreshUser,
  };
}
