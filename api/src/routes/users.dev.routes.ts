// Development users routes - handles SQLite JSON array storage
import { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.dev.js';
import { z } from 'zod';

const UpdatePreferencesRequestSchema = z.object({
  categories: z.array(z.string()).optional(),
  budgetMin: z.number().min(0).optional(),
  budgetMax: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  qualityPreference: z.enum(['budget', 'mid-range', 'premium', 'luxury']).optional(),
  brandPreferences: z.array(z.string()).optional(),
  brandExclusions: z.array(z.string()).optional(),
});

export async function devUsersRoutes(fastify: FastifyInstance) {
  // Get user preferences
  fastify.get(
    '/preferences',
    {
      preHandler: authMiddleware,
    },
    async (request) => {
      const userId = request.userId!;

      const preferences = await prisma.userPreferences.findUnique({
        where: { userId },
      });

      if (!preferences) {
        return {
          categories: [],
          budgetMin: 0,
          budgetMax: 1000,
          currency: 'USD',
          qualityPreference: 'mid-range',
          brandPreferences: [],
          brandExclusions: [],
        };
      }

      // Parse JSON strings for SQLite
      return {
        categories: JSON.parse(preferences.categories as string),
        budgetMin: preferences.budgetMin,
        budgetMax: preferences.budgetMax,
        currency: preferences.currency,
        qualityPreference: preferences.qualityPreference,
        brandPreferences: JSON.parse(preferences.brandPreferences as string),
        brandExclusions: JSON.parse(preferences.brandExclusions as string),
      };
    }
  );

  // Update user preferences
  fastify.put(
    '/preferences',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      const userId = request.userId!;

      const parseResult = UpdatePreferencesRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const updates = parseResult.data;

      if (updates.budgetMin !== undefined && updates.budgetMax !== undefined) {
        if (updates.budgetMin > updates.budgetMax) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'budgetMin cannot be greater than budgetMax',
          });
        }
      }

      const preferences = await prisma.userPreferences.upsert({
        where: { userId },
        update: {
          ...(updates.categories !== undefined && { categories: JSON.stringify(updates.categories) }),
          ...(updates.budgetMin !== undefined && { budgetMin: updates.budgetMin }),
          ...(updates.budgetMax !== undefined && { budgetMax: updates.budgetMax }),
          ...(updates.currency !== undefined && { currency: updates.currency }),
          ...(updates.qualityPreference !== undefined && {
            qualityPreference: updates.qualityPreference,
          }),
          ...(updates.brandPreferences !== undefined && {
            brandPreferences: JSON.stringify(updates.brandPreferences),
          }),
          ...(updates.brandExclusions !== undefined && {
            brandExclusions: JSON.stringify(updates.brandExclusions),
          }),
        },
        create: {
          userId,
          categories: JSON.stringify(updates.categories || []),
          budgetMin: updates.budgetMin || 0,
          budgetMax: updates.budgetMax || 1000,
          currency: updates.currency || 'USD',
          qualityPreference: updates.qualityPreference || 'mid-range',
          brandPreferences: JSON.stringify(updates.brandPreferences || []),
          brandExclusions: JSON.stringify(updates.brandExclusions || []),
        },
      });

      return {
        categories: JSON.parse(preferences.categories as string),
        budgetMin: preferences.budgetMin,
        budgetMax: preferences.budgetMax,
        currency: preferences.currency,
        qualityPreference: preferences.qualityPreference,
        brandPreferences: JSON.parse(preferences.brandPreferences as string),
        brandExclusions: JSON.parse(preferences.brandExclusions as string),
      };
    }
  );

  // Get usage stats (mock for dev)
  fastify.get(
    '/usage',
    {
      preHandler: authMiddleware,
    },
    async (request) => {
      const user = request.user!;

      // Return mock usage stats
      return {
        searchCount: 3,
        limit: user.plan === 'pro' ? Infinity : 20,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        _devMode: true,
      };
    }
  );

  // Track user interaction
  fastify.post(
    '/interactions',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      const userId = request.userId!;

      const bodySchema = z.object({
        productId: z.string().optional(),
        interactionType: z.enum(['view', 'click_affiliate', 'save', 'dismiss']),
        context: z.record(z.unknown()).optional(),
      });

      const parseResult = bodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { productId, interactionType, context } = parseResult.data;

      await prisma.userInteraction.create({
        data: {
          userId,
          productId,
          interactionType,
          context: context ? JSON.stringify(context) : null,
        },
      });

      return { success: true };
    }
  );
}
