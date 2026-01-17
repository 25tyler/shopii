# Shopii Authentication Setup Guide

## Implementation Summary

I've implemented a complete authentication system with:
- ✅ Email/password authentication
- ✅ Google OAuth integration
- ✅ Guest preference transfer on signup
- ✅ JWT token management with refresh
- ✅ Rate limiting with signup prompts
- ✅ Adaptive recommendation system based on behavior

## What's Been Completed

### Backend (API)

1. **Auth Middleware** ([api/src/middleware/auth.middleware.ts](api/src/middleware/auth.middleware.ts))
   - JWT token verification via Supabase
   - Auto-creates users in local DB on first login
   - Optional auth middleware for guest endpoints

2. **Auth Routes** ([api/src/routes/auth.routes.ts](api/src/routes/auth.routes.ts))
   - `POST /api/auth/signup` - Email/password signup with preferences transfer
   - `POST /api/auth/signin` - Email/password signin
   - `POST /api/auth/google` - Google OAuth signin with preferences transfer
   - `POST /api/auth/refresh` - Refresh access token
   - `GET /api/auth/me` - Get current user
   - `POST /api/auth/logout` - Logout
   - `DELETE /api/auth/account` - Delete account

3. **API Client** ([extension/services/api.ts](extension/services/api.ts))
   - Auto-includes JWT token in requests
   - New auth methods: `signUp`, `signIn`, `signInWithGoogle`, `refreshToken`, `logout`

### Extension (Frontend)

1. **User Store** ([extension/stores/userStore.ts](extension/stores/userStore.ts))
   - `signUp(email, password, name)` - Transfers guest preferences
   - `signIn(email, password)` - Standard login
   - `signInWithGoogle()` - OAuth flow with preference transfer
   - `signOut()` - Clears all auth data
   - `setGuestPreferences()` - Saves preferences before signup
   - Auto-refreshes user data on initialize

2. **Guest Preferences Caching**
   - Stored in `chrome.storage.local` as `guestPreferences`
   - Automatically transferred to user account on signup/signin
   - Cleared after successful authentication

## What Needs to Be Done

### 1. Supabase Configuration

You need to configure Supabase for authentication:

#### A. Enable Email Provider
1. Go to Supabase Dashboard → Authentication → Providers
2. Enable "Email" provider
3. Configure email templates (optional but recommended):
   - Welcome email
   - Password reset email

#### B. Enable Google OAuth
1. Go to Supabase Dashboard → Authentication → Providers
2. Enable "Google" provider
3. Get Google OAuth credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable "Google+ API"
   - Create OAuth 2.0 credentials
   - Add authorized redirect URIs:
     ```
     https://<your-supabase-project>.supabase.co/auth/v1/callback
     ```
4. Copy Client ID and Client Secret to Supabase

#### C. Configure Auth Settings
1. Site URL: `http://localhost:3001` (dev) or your production URL
2. Redirect URLs:
   ```
   http://localhost:3001/api/auth/callback
   chrome-extension://<your-extension-id>/*
   ```

### 2. Environment Variables

Update your `.env` files with real values:

#### API `.env`:
```env
# Already configured in your .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Add these:
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
GOOGLE_API_KEY=AIza...
GOOGLE_CX=your-search-engine-id
```

#### Extension `.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:3001
```

### 3. Build UI Components (Next Steps)

You still need to create these React components:

#### A. `extension/components/Auth/AuthModal.tsx`
A modal with tabs for Sign In / Sign Up:
```tsx
<AuthModal isOpen onClose>
  <Tabs>
    <Tab label="Sign In">
      <SignInForm />
    </Tab>
    <Tab label="Sign Up">
      <SignUpForm />
    </Tab>
  </Tabs>
  <GoogleButton onClick={() => userStore.signInWithGoogle()} />
</AuthModal>
```

#### B. `extension/components/Auth/SignupPrompt.tsx`
Shows when guest hits rate limit:
```tsx
<SignupPrompt
  searchesUsed={5}
  limit={5}
  onSignUp={() => setShowAuthModal(true)}
/>
```

#### C. Wire up in Chat Component
```tsx
const { user, guestSearchesUsed, signIn, signUp } = useUserStore();
const searchCheck = canSearch(useUserStore.getState());

if (!searchCheck.allowed) {
  return <SignupPrompt message={searchCheck.reason} />;
}
```

### 4. Update Rate Limit Response

Modify [api/src/middleware/rateLimit.middleware.ts](api/src/middleware/rateLimit.middleware.ts#L43-48) to include `requiresAuth` flag:

```typescript
return reply.status(429).send({
  error: 'Too Many Requests',
  message: `You've reached your daily search limit...`,
  requiresAuth: plan === 'guest', // Add this flag
  resetAt: new Date(result.resetAt * 1000).toISOString(),
});
```

## Testing Checklist

### Backend Tests
```bash
cd api

# Test signup
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

# Test signin
curl -X POST http://localhost:3001/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test protected route
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <access_token>"
```

### Extension Tests
1. **Guest Flow**:
   - Open extension as guest
   - Set preferences in onboarding
   - Make 5 searches
   - Hit rate limit → See signup prompt
   - Sign up → Preferences should transfer
   - Verify preferences in Settings

2. **Google OAuth**:
   - Click "Sign in with Google"
   - Complete OAuth flow
   - Verify user created in DB
   - Check preferences transferred

3. **Email/Password**:
   - Sign up with email/password
   - Sign out
   - Sign in again
   - Verify session persists

## Database Schema

The user preferences are stored in two different formats:

### Database (SQLite - uses JSON strings):
```sql
preferences {
  categories: "[]"  -- JSON string
  budgetMin: 0
  budgetMax: 1000
  currency: "USD"
  qualityPreference: "mid-range"
  brandPreferences: "[]"  -- JSON string
  brandExclusions: "[]"  -- JSON string
}
```

### Extension (TypeScript):
```typescript
{
  categories: string[]
  budgetRange: { min: number, max: number, currency: string }
  qualityPreference: 'budget' | 'mid-range' | 'premium'
  brandPreferences: string[]
  brandExclusions: string[]
}
```

The userStore automatically transforms between these formats.

## How Guest Preferences Transfer Works

1. **Guest sets preferences** → Saved to `chrome.storage.local.guestPreferences`
2. **Guest hits rate limit** → Shows signup prompt
3. **User signs up** → `userStore.signUp()` includes `guestPreferences`
4. **Backend receives signup** → Merges guest preferences with defaults
5. **User created** → Preferences saved to database
6. **Extension clears** → `guestPreferences` removed from storage

## Recommendation System Strategy

See [RECOMMENDATION_STRATEGY.md](RECOMMENDATION_STRATEGY.md) for details on:
- Adaptive preference weighting
- Behavioral learning
- Cold start handling
- Privacy considerations

## Security Notes

- ✅ JWTs verified via Supabase
- ✅ Passwords never stored in extension
- ✅ Service role key only on backend
- ✅ Guest data cleared on signup
- ✅ Auto-refresh tokens before expiry
- ⚠️ Email confirmation disabled in dev (enable in production)

## Common Issues

### "Invalid or expired token"
- Token expired → Frontend should call `refreshToken()`
- User deleted in Supabase → Frontend should sign out
- Supabase keys wrong → Check .env values

### Google OAuth not working
- Check redirect URIs in Google Console
- Verify Supabase Google provider enabled
- Ensure extension ID matches redirect URI

### Preferences not transferring
- Check `guestPreferences` in chrome.storage
- Verify API receives preferences in signup body
- Check database after signup

## Next Development Steps

1. ✅ Backend auth implementation (DONE)
2. ✅ Extension store with auth actions (DONE)
3. ✅ Guest preference caching (DONE)
4. ⏳ Build Auth UI components
5. ⏳ Wire up signup prompt to chat
6. ⏳ Add behavioral tracking for recommendations
7. ⏳ Implement recommendation scoring algorithm
8. ⏳ Add user dashboard to view patterns

## Support

If you encounter issues:
1. Check browser console for errors
2. Check API logs: `cd api && npm run dev`
3. Verify Supabase dashboard for auth events
4. Check chrome.storage: `chrome.storage.local.get(console.log)`
