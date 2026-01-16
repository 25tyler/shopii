// Development auth routes - no real authentication
import { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma.js';
import { DEV_USER_ID, DEV_USER_EMAIL } from '../middleware/auth.dev.js';

export async function devAuthRoutes(fastify: FastifyInstance) {
  // Get current user - always returns dev user
  fastify.get('/me', async () => {
    // Ensure dev user exists
    let user = await prisma.user.findUnique({
      where: { id: DEV_USER_ID },
      include: {
        preferences: true,
        subscription: true,
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: DEV_USER_ID,
          email: DEV_USER_EMAIL,
          name: 'Dev User',
          plan: 'free',
          preferences: {
            create: {
              categories: JSON.stringify(['electronics', 'audio', 'computing']),
              budgetMin: 0,
              budgetMax: 2000,
              currency: 'USD',
              qualityPreference: 'mid-range',
              brandPreferences: JSON.stringify([]),
              brandExclusions: JSON.stringify([]),
            },
          },
        },
        include: {
          preferences: true,
          subscription: true,
        },
      });
    }

    // Parse JSON arrays for SQLite compatibility
    const preferences = user.preferences
      ? {
          categories: JSON.parse(user.preferences.categories as string),
          budgetMin: user.preferences.budgetMin,
          budgetMax: user.preferences.budgetMax,
          currency: user.preferences.currency,
          qualityPreference: user.preferences.qualityPreference,
          brandPreferences: JSON.parse(user.preferences.brandPreferences as string),
          brandExclusions: JSON.parse(user.preferences.brandExclusions as string),
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
      _devMode: true,
      _note: 'This is a development user. No real authentication is required.',
    };
  });

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
