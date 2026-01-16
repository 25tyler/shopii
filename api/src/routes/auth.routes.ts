import { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export async function authRoutes(fastify: FastifyInstance) {
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

      return {
        id: userWithPreferences.id,
        email: userWithPreferences.email,
        name: userWithPreferences.name,
        avatarUrl: userWithPreferences.avatarUrl,
        plan: userWithPreferences.plan,
        preferences: userWithPreferences.preferences
          ? {
              categories: userWithPreferences.preferences.categories,
              budgetMin: userWithPreferences.preferences.budgetMin,
              budgetMax: userWithPreferences.preferences.budgetMax,
              currency: userWithPreferences.preferences.currency,
              qualityPreference: userWithPreferences.preferences.qualityPreference,
              brandPreferences: userWithPreferences.preferences.brandPreferences,
              brandExclusions: userWithPreferences.preferences.brandExclusions,
            }
          : null,
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

      // Delete user (cascades to all related data)
      await prisma.user.delete({
        where: { id: user.id },
      });

      return { success: true };
    }
  );
}
