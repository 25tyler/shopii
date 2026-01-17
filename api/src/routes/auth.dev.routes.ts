// Development auth routes - uses real Supabase authentication
import { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma.js';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import { formatArray, parseArray } from '@/utils/db-helpers.js';
import { DEV_USER_EMAIL, DEV_USER_ID } from '@/middleware/auth.dev.js';

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

export async function devAuthRoutes(fastify: FastifyInstance) {
  // Sign up
  fastify.post('/signup', async (request, reply) => {
    const body = signUpSchema.parse(request.body);

    // Create user in Supabase
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true, // Auto-confirm in dev
      user_metadata: {
        full_name: body.name,
      },
    });

    if (error) {
      return reply.status(400).send({
        error: 'Signup Failed',
        message: error.message,
      });
    }

    // Create user in our database with preferences
    const defaultPreferences = {
      categories: [] as string[],
      budgetMin: 0,
      budgetMax: 1000,
      currency: 'USD',
      qualityPreference: 'mid-range',
      brandPreferences: [] as string[],
      brandExclusions: [] as string[],
    };

    const mergedPreferences = { ...defaultPreferences, ...body.preferences };

    await prisma.user.create({
      data: {
        id: data.user.id,
        email: body.email,
        name: body.name,
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
        name: body.name,
      },
      message: 'Account created successfully. Please sign in.',
    };
  });

  // Sign in
  fastify.post('/signin', async (request, reply) => {
    const body = signInSchema.parse(request.body);

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error) {
      return reply.status(401).send({
        error: 'Authentication Failed',
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
        name: data.user.user_metadata?.full_name,
        avatarUrl: data.user.user_metadata?.avatar_url,
      },
    };
  });

  // Google OAuth
  fastify.post('/google', async (request, reply) => {
    const body = googleAuthSchema.parse(request.body);

    const { data, error } = await supabaseAdmin.auth.getUser(body.idToken);

    if (error) {
      return reply.status(401).send({
        error: 'Authentication Failed',
        message: 'Invalid Google token',
      });
    }

    // Create or update user in our database
    let user = await prisma.user.findUnique({
      where: { id: data.user.id },
    });

    if (!user) {
      const defaultPreferences = {
        categories: [] as string[],
        budgetMin: 0,
        budgetMax: 1000,
        currency: 'USD',
        qualityPreference: 'mid-range',
        brandPreferences: [] as string[],
        brandExclusions: [] as string[],
      };

      const mergedPreferences = { ...defaultPreferences, ...body.preferences };

      user = await prisma.user.create({
        data: {
          id: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata?.full_name,
          avatarUrl: data.user.user_metadata?.avatar_url,
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

    // For dev mode, generate simple session tokens
    // In production, this would use proper Supabase session creation
    const devAccessToken = `dev_access_${user.id}_${Date.now()}`;
    const devRefreshToken = `dev_refresh_${user.id}_${Date.now()}`;

    return {
      access_token: devAccessToken,
      refresh_token: devRefreshToken,
      expires_in: 3600,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    };
  });

  // Refresh token
  fastify.post('/refresh', async (request, reply) => {
    const body = z.object({ refresh_token: z.string() }).parse(request.body);

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token: body.refresh_token,
    });

    if (error || !data.session) {
      return reply.status(401).send({
        error: 'Refresh Failed',
        message: 'Invalid refresh token',
      });
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    };
  });

  // Get current user
  fastify.get(
    '/me',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.userId! },
        include: {
          preferences: true,
          subscription: true,
        },
      });

      if (!user) {
        return reply.status(404).send({
          error: 'User Not Found',
          message: 'User not found in database',
        });
      }

      // Parse arrays (works for both SQLite and PostgreSQL)
      const preferences = user.preferences
        ? {
            categories: parseArray(user.preferences.categories),
            budgetMin: user.preferences.budgetMin,
            budgetMax: user.preferences.budgetMax,
            currency: user.preferences.currency,
            qualityPreference: user.preferences.qualityPreference,
            brandPreferences: parseArray(user.preferences.brandPreferences),
            brandExclusions: parseArray(user.preferences.brandExclusions),
          }
        : null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        plan: user.plan,
        preferences,
        subscription: user.subscription
          ? {
              plan: user.subscription.plan,
              status: user.subscription.status,
              currentPeriodEnd: user.subscription.currentPeriodEnd,
            }
          : null,
        createdAt: user.createdAt,
      };
    }
  );

  // Mock logout
  fastify.post('/logout', async () => {
    return {
      success: true,
      _devMode: true,
      _note: 'In dev mode, logout is a no-op',
    };
  });

  // Mock callback (for OAuth flows)
  fastify.post('/callback', async () => {
    return {
      success: true,
      user: {
        id: DEV_USER_ID,
        email: DEV_USER_EMAIL,
      },
      _devMode: true,
      _note: 'OAuth is mocked in dev mode',
    };
  });
}
