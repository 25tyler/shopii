import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Client for server-side operations with service role key
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Client for verifying user tokens (uses anon key)
export const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Verify a JWT token and return the user
export async function verifyToken(token: string) {
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}
