import { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getUsageStats } from '../middleware/rateLimit.middleware.js';
import { UpdatePreferencesRequestSchema } from '../types/index.js';
import { z } from 'zod';

export async function usersRoutes(fastify: FastifyInstance) {
  // Get user preferences
  fastify.get(
    '/preferences',
    {
      preHandler: authMiddleware,
    },
    async (request) => {
      const user = request.user!;

      const preferences = await prisma.userPreferences.findUnique({
        where: { userId: user.id },
      });

      if (!preferences) {
        // Return defaults if no preferences exist
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

      return {
        categories: preferences.categories,
        budgetMin: preferences.budgetMin,
        budgetMax: preferences.budgetMax,
        currency: preferences.currency,
        qualityPreference: preferences.qualityPreference,
        brandPreferences: preferences.brandPreferences,
        brandExclusions: preferences.brandExclusions,
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
      const user = request.user!;

      // Validate request body
      const parseResult = UpdatePreferencesRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const updates = parseResult.data;

      // Validate budget range
      if (updates.budgetMin !== undefined && updates.budgetMax !== undefined) {
        if (updates.budgetMin > updates.budgetMax) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'budgetMin cannot be greater than budgetMax',
          });
        }
      }

      const preferences = await prisma.userPreferences.upsert({
        where: { userId: user.id },
        update: {
          ...(updates.categories !== undefined && { categories: updates.categories }),
          ...(updates.budgetMin !== undefined && { budgetMin: updates.budgetMin }),
          ...(updates.budgetMax !== undefined && { budgetMax: updates.budgetMax }),
          ...(updates.currency !== undefined && { currency: updates.currency }),
          ...(updates.qualityPreference !== undefined && {
            qualityPreference: updates.qualityPreference,
          }),
          ...(updates.brandPreferences !== undefined && {
            brandPreferences: updates.brandPreferences,
          }),
          ...(updates.brandExclusions !== undefined && { brandExclusions: updates.brandExclusions }),
        },
        create: {
          userId: user.id,
          categories: updates.categories || [],
          budgetMin: updates.budgetMin || 0,
          budgetMax: updates.budgetMax || 1000,
          currency: updates.currency || 'USD',
          qualityPreference: updates.qualityPreference || 'mid-range',
          brandPreferences: updates.brandPreferences || [],
          brandExclusions: updates.brandExclusions || [],
        },
      });

      return {
        categories: preferences.categories,
        budgetMin: preferences.budgetMin,
        budgetMax: preferences.budgetMax,
        currency: preferences.currency,
        qualityPreference: preferences.qualityPreference,
        brandPreferences: preferences.brandPreferences,
        brandExclusions: preferences.brandExclusions,
      };
    }
  );

  // Get usage stats
  fastify.get(
    '/usage',
    {
      preHandler: authMiddleware,
    },
    async (request) => {
      const user = request.user!;
      return getUsageStats(user.id, user.plan);
    }
  );

  // Track user interaction
  fastify.post(
    '/interactions',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      const user = request.user!;

      const bodySchema = z.object({
        productId: z.string().uuid().optional(),
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
          userId: user.id,
          productId,
          interactionType,
          context: context || null,
        },
      });

      return { success: true };
    }
  );
}
