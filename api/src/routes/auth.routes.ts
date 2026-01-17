import { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { supabaseAdmin } from '../config/supabase.js';
import { formatArray, parseArray } from '../utils/db-helpers.js';
import { z } from 'zod';

// Validation schemas
const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().optional(),
  preferences: z
    .object({
      categories: z.array(z.string()).optional(),
      budgetMin: z.number().optional(),
      budgetMax: z.number().optional(),
      currency: z.string().optional(),
      qualityPreference: z.string().optional(),
      brandPreferences: z.array(z.string()).optional(),
      brandExclusions: z.array(z.string()).optional(),
    })
    .optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const googleAuthSchema = z.object({
  idToken: z.string(),
  preferences: z
    .object({
      categories: z.array(z.string()).optional(),
      budgetMin: z.number().optional(),
      budgetMax: z.number().optional(),
      currency: z.string().optional(),
      qualityPreference: z.string().optional(),
      brandPreferences: z.array(z.string()).optional(),
      brandExclusions: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function authRoutes(fastify: FastifyInstance) {
  // Sign up with email/password
  fastify.post('/signup', async (request, reply) => {
    const validation = signUpSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: validation.error.errors[0]?.message || 'Invalid input',
      });
    }

    const { email, password, name, preferences: guestPreferences } = validation.data;

    try {
      // Create user in Supabase Auth
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm in dev, remove in production
        user_metadata: {
          full_name: name || null,
        },
      });

      if (error || !data.user) {
        return reply.status(400).send({
          error: 'Sign Up Failed',
          message: error?.message || 'Failed to create account',
        });
      }

      // Merge guest preferences with defaults
      const defaultPreferences = {
        categories: [],
        budgetMin: 0,
        budgetMax: 1000,
        currency: 'USD',
        qualityPreference: 'mid-range',
        brandPreferences: [],
        brandExclusions: [],
      };

      const mergedPreferences = {
        ...defaultPreferences,
        ...guestPreferences,
      };

      // Create user in our database with transferred preferences
      await prisma.user.create({
        data: {
          id: data.user.id,
          email: data.user.email!,
          name: name || null,
          plan: 'free',
          preferences: {
            create: {
              categories: formatArray(mergedPreferences.categories) as any,
              budgetMin: mergedPreferences.budgetMin,
              budgetMax: mergedPreferences.budgetMax,
              currency: mergedPreferences.currency,
              qualityPreference: mergedPreferences.qualityPreference,
              brandPreferences: formatArray(mergedPreferences.brandPreferences) as any,
              brandExclusions: formatArray(mergedPreferences.brandExclusions) as any,
            },
          },
        },
      });

      return {
        user: {
          id: data.user.id,
          email: data.user.email,
          name,
        },
        message: 'Account created successfully. Please sign in.',
      };
    } catch (error: any) {
      console.error('Sign up error:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: error?.message || 'Failed to create account',
      });
    }
  });

  // Sign in with email/password
  fastify.post('/signin', async (request, reply) => {
    const validation = signInSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: validation.error.errors[0]?.message || 'Invalid input',
      });
    }

    const { email, password } = validation.data;

    try {
      // Sign in with Supabase
      const { data, error } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.session) {
        return reply.status(401).send({
          error: 'Sign In Failed',
          message: 'Invalid email or password',
        });
      }

      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name || null,
          avatarUrl: data.user.user_metadata?.avatar_url || null,
        },
      };
    } catch (error: any) {
      console.error('Sign in error:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to sign in',
      });
    }
  });

  // Google OAuth sign in
  fastify.post('/google', async (request, reply) => {
    const validation = googleAuthSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid Google ID token',
      });
    }

    const { idToken, preferences: guestPreferences } = validation.data;

    try {
      // Verify Google token and get user
      const { data, error } = await supabaseAdmin.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (error || !data.user) {
        return reply.status(401).send({
          error: 'Google Sign In Failed',
          message: error?.message || 'Failed to authenticate with Google',
        });
      }

      // Check if user exists in our DB (first time login)
      const existingUser = await prisma.user.findUnique({
        where: { id: data.user.id },
      });

      if (!existingUser && guestPreferences) {
        // First time login - create user with guest preferences
        const defaultPreferences = {
          categories: [],
          budgetMin: 0,
          budgetMax: 1000,
          currency: 'USD',
          qualityPreference: 'mid-range',
          brandPreferences: [],
          brandExclusions: [],
        };

        const mergedPreferences = {
          ...defaultPreferences,
          ...guestPreferences,
        };

        await prisma.user.create({
          data: {
            id: data.user.id,
            email: data.user.email!,
            name: data.user.user_metadata?.full_name || null,
            avatarUrl: data.user.user_metadata?.avatar_url || null,
            plan: 'free',
            preferences: {
              create: {
                categories: formatArray(mergedPreferences.categories) as any,
                budgetMin: mergedPreferences.budgetMin,
                budgetMax: mergedPreferences.budgetMax,
                currency: mergedPreferences.currency,
                qualityPreference: mergedPreferences.qualityPreference,
                brandPreferences: formatArray(mergedPreferences.brandPreferences) as any,
                brandExclusions: formatArray(mergedPreferences.brandExclusions) as any,
              },
            },
          },
        });
      }
      // If user exists or no guest preferences, user will be synced via authMiddleware

      return {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_in: data.session?.expires_in,
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name || null,
          avatarUrl: data.user.user_metadata?.avatar_url || null,
        },
      };
    } catch (error: any) {
      console.error('Google sign in error:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to sign in with Google',
      });
    }
  });

  // Refresh token
  fastify.post('/refresh', async (request, reply) => {
    const { refresh_token } = request.body as { refresh_token?: string };

    if (!refresh_token) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Refresh token is required',
      });
    }

    try {
      const { data, error } = await supabaseAdmin.auth.refreshSession({
        refresh_token,
      });

      if (error || !data.session) {
        return reply.status(401).send({
          error: 'Refresh Failed',
          message: 'Invalid or expired refresh token',
        });
      }

      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      };
    } catch (error: any) {
      console.error('Refresh token error:', error);
      return reply.status(500).send({
        error: 'Server Error',
        message: 'Failed to refresh token',
      });
    }
  });

  // Get current user with preferences
  fastify.get(
    '/me',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      const user = request.user!;

      const userWithPreferences = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          preferences: true,
          subscription: true,
        },
      });

      if (!userWithPreferences) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'User not found',
        });
      }

      // Parse arrays (works for both SQLite JSON strings and PostgreSQL native arrays)
      const preferences = userWithPreferences.preferences
        ? {
            categories: parseArray(userWithPreferences.preferences.categories),
            budgetMin: userWithPreferences.preferences.budgetMin,
            budgetMax: userWithPreferences.preferences.budgetMax,
            currency: userWithPreferences.preferences.currency,
            qualityPreference: userWithPreferences.preferences.qualityPreference,
            brandPreferences: parseArray(userWithPreferences.preferences.brandPreferences),
            brandExclusions: parseArray(userWithPreferences.preferences.brandExclusions),
          }
        : null;

      return {
        id: userWithPreferences.id,
        email: userWithPreferences.email,
        name: userWithPreferences.name,
        avatarUrl: userWithPreferences.avatarUrl,
        plan: userWithPreferences.plan,
        preferences,
        subscription: userWithPreferences.subscription
          ? {
              plan: userWithPreferences.subscription.plan,
              status: userWithPreferences.subscription.status,
              currentPeriodEnd: userWithPreferences.subscription.currentPeriodEnd,
            }
          : null,
        createdAt: userWithPreferences.createdAt,
      };
    }
  );

  // Logout - just returns success (actual logout happens on client via Supabase)
  fastify.post('/logout', { preHandler: authMiddleware }, async () => {
    return { success: true };
  });

  // Delete account
  fastify.delete(
    '/account',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      const user = request.user!;

      // Delete user from Supabase
      await supabaseAdmin.auth.admin.deleteUser(user.id);

      // Delete user from our database (cascades to all related data)
      await prisma.user.delete({
        where: { id: user.id },
      });

      return { success: true };
    }
  );
}
