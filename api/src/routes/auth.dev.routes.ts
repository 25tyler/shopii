// Development auth routes - uses mock authentication (no Supabase needed)
import { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma.js';
import { authMiddleware, DEV_USER_EMAIL, DEV_USER_ID } from '../middleware/auth.dev.js';
import { z } from 'zod';
import { formatArray, parseArray } from '@/utils/db-helpers.js';
import crypto from 'crypto';

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
  // Sign up - creates user directly in database (no Supabase)
  fastify.post('/signup', async (request, reply) => {
    const body = signUpSchema.parse(request.body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      return reply.status(400).send({
        error: 'Signup Failed',
        message: 'User with this email already exists',
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
    const userId = crypto.randomUUID();

    const user = await prisma.user.create({
      data: {
        id: userId,
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
        id: user.id,
        email: user.email,
        name: body.name,
      },
      message: 'Account created successfully. Please sign in.',
    };
  });

  // Sign in - mock authentication (accepts any password in dev mode)
  fastify.post('/signin', async (request, reply) => {
    const body = signInSchema.parse(request.body);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user) {
      return reply.status(401).send({
        error: 'Authentication Failed',
        message: 'Invalid email or password',
      });
    }

    // In dev mode, generate mock JWT tokens
    const accessToken = `dev_access_${user.id}_${Date.now()}`;
    const refreshToken = `dev_refresh_${user.id}_${Date.now()}`;

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
    };
  });

  // Google OAuth - mock implementation
  fastify.post('/google', async (request, reply) => {
    const body = googleAuthSchema.parse(request.body);

    // In dev mode, create or get user based on a mock Google response
    // The idToken would normally be validated against Google
    const mockEmail = `google_${Date.now()}@shopii.test`;

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
    const userId = crypto.randomUUID();

    const user = await prisma.user.create({
      data: {
        id: userId,
        email: mockEmail,
        name: 'Google User',
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

  // Refresh token - mock implementation
  fastify.post('/refresh', async (request, reply) => {
    const body = z.object({ refresh_token: z.string() }).parse(request.body);

    // In dev mode, just generate new mock tokens
    // Extract user ID from the refresh token if it follows our dev format
    const match = body.refresh_token.match(/dev_refresh_([^_]+)_/);
    if (!match) {
      return reply.status(401).send({
        error: 'Refresh Failed',
        message: 'Invalid refresh token',
      });
    }

    const userId = match[1];
    const newAccessToken = `dev_access_${userId}_${Date.now()}`;
    const newRefreshToken = `dev_refresh_${userId}_${Date.now()}`;

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in: 3600,
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
