import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Use chrome.storage for persistence in extension
    storage: {
      getItem: async (key: string) => {
        const result = await chrome.storage.local.get(key);
        return result[key] || null;
      },
      setItem: async (key: string, value: string) => {
        await chrome.storage.local.set({ [key]: value });
      },
      removeItem: async (key: string) => {
        await chrome.storage.local.remove(key);
      },
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Auth helper functions
export async function signInWithGoogle() {
  // For extensions, we need to use chrome.identity or a popup window
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;

  // Open auth URL in a new window
  if (data.url) {
    // In extension context, open a popup window
    const authWindow = window.open(
      data.url,
      'shopii_auth',
      'width=500,height=600,menubar=no,toolbar=no'
    );

    // Listen for the callback
    return new Promise((resolve, reject) => {
      const checkClosed = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkClosed);
          // Check if we got a session
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
              resolve(session);
            } else {
              reject(new Error('Authentication cancelled'));
            }
          });
        }
      }, 500);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkClosed);
        authWindow?.close();
        reject(new Error('Authentication timed out'));
      }, 300000);
    });
  }

  throw new Error('Failed to get auth URL');
}

export async function signInWithEmail(email: string) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;

  // Clear local storage
  await chrome.storage.local.remove(['authToken', 'user']);
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token || null;
}

// Listen for auth state changes and sync with chrome.storage
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session) {
    await chrome.storage.local.set({
      authToken: session.access_token,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.user_metadata?.full_name,
        avatarUrl: session.user.user_metadata?.avatar_url,
      },
    });
  } else {
    await chrome.storage.local.remove(['authToken', 'user']);
  }
});
