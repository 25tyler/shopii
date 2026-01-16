// Development billing routes - mocked Stripe
import { FastifyInstance } from 'fastify';
import { authMiddleware, DEV_USER_ID } from '../middleware/auth.dev.js';
import { prisma } from '../config/prisma.js';

export async function devBillingRoutes(fastify: FastifyInstance) {
  // Get available plans
  fastify.get('/plans', async () => {
    return {
      plans: [
        {
          id: 'free',
          name: 'Free',
          description: 'Great for trying out Shopii',
          price: 0,
          currency: 'usd',
          interval: null,
          features: [
            '20 searches per day',
            'Full AI ratings',
            '7-day conversation history',
            'Basic recommendations',
          ],
        },
        {
          id: 'pro',
          name: 'Pro',
          description: 'For serious shoppers',
          price: 999,
          currency: 'usd',
          interval: 'month',
          features: [
            'Unlimited searches',
            'Full AI ratings',
            'Unlimited conversation history',
            'Price drop alerts',
            'Priority support',
            'No ads',
          ],
        },
      ],
      _devMode: true,
    };
  });

  // Create checkout session (mock)
  fastify.post(
    '/checkout',
    {
      preHandler: authMiddleware,
    },
    async () => {
      return {
        checkoutUrl: 'https://checkout.stripe.com/mock-session',
        sessionId: 'mock_session_' + Date.now(),
        _devMode: true,
        _note: 'In dev mode, use /api/billing/mock-upgrade to simulate upgrading',
      };
    }
  );

  // Create customer portal session (mock)
  fastify.post(
    '/portal',
    {
      preHandler: authMiddleware,
    },
    async () => {
      return {
        portalUrl: 'https://billing.stripe.com/mock-portal',
        _devMode: true,
      };
    }
  );

  // Get current subscription
  fastify.get(
    '/subscription',
    {
      preHandler: authMiddleware,
    },
    async (request) => {
      const userId = request.userId!;

      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        return {
          plan: 'free',
          status: null,
          currentPeriodEnd: null,
          _devMode: true,
        };
      }

      return {
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        _devMode: true,
      };
    }
  );

  // Mock webhook endpoint (no-op in dev)
  fastify.post('/webhook', async () => {
    return {
      received: true,
      _devMode: true,
      _note: 'Webhooks are mocked in dev mode',
    };
  });

  // DEV ONLY: Mock upgrade to pro
  fastify.post('/mock-upgrade', { preHandler: authMiddleware }, async (request) => {
    const userId = request.userId!;

    // Update user plan
    await prisma.user.update({
      where: { id: userId },
      data: { plan: 'pro' },
    });

    // Create or update subscription
    const existingSubscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (existingSubscription) {
      await prisma.subscription.update({
        where: { userId },
        data: {
          plan: 'pro',
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId,
          stripeSubscriptionId: 'mock_sub_' + Date.now(),
          plan: 'pro',
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    return {
      success: true,
      plan: 'pro',
      _devMode: true,
      _note: 'User upgraded to Pro (mock)',
    };
  });

  // DEV ONLY: Mock downgrade to free
  fastify.post('/mock-downgrade', { preHandler: authMiddleware }, async (request) => {
    const userId = request.userId!;

    await prisma.user.update({
      where: { id: userId },
      data: { plan: 'free' },
    });

    await prisma.subscription.deleteMany({
      where: { userId },
    });

    return {
      success: true,
      plan: 'free',
      _devMode: true,
      _note: 'User downgraded to Free (mock)',
    };
  });
}
