import { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

const PLANS = {
  pro: {
    id: 'pro',
    name: 'Shopii Pro',
    description: 'Unlimited searches, no ads, price alerts, and more',
    price: 9.99,
    currency: 'USD',
    interval: 'month',
    features: [
      'Unlimited searches',
      'No ads in suggestions',
      'Price drop alerts',
      'Priority scraping on-demand',
      'Export favorites',
      'Forever conversation history',
      'Priority support',
    ],
  },
};

export async function billingRoutes(fastify: FastifyInstance) {
  // Get available plans
  fastify.get('/plans', async () => {
    return {
      plans: [
        {
          id: 'free',
          name: 'Free',
          description: 'Get started with Shopii',
          price: 0,
          currency: 'USD',
          interval: null,
          features: ['20 searches per day', '7-day conversation history', 'AI-powered ratings', 'Product recommendations'],
        },
        PLANS.pro,
      ],
    };
  });

  // Create checkout session
  fastify.post(
    '/checkout',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      const user = request.user!;

      // Check if user already has an active subscription
      const existingSubscription = await prisma.subscription.findUnique({
        where: { userId: user.id },
      });

      if (existingSubscription?.status === 'active') {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'You already have an active subscription',
        });
      }

      // Get or create Stripe customer
      let customerId = user.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name || undefined,
          metadata: {
            userId: user.id,
          },
        });

        customerId = customer.id;

        await prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: customerId },
        });
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: env.STRIPE_PRO_PRICE_ID,
            quantity: 1,
          },
        ],
        success_url: `chrome-extension://{EXTENSION_ID}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `chrome-extension://{EXTENSION_ID}/billing`,
        subscription_data: {
          metadata: {
            userId: user.id,
          },
        },
      });

      return {
        checkoutUrl: session.url,
        sessionId: session.id,
      };
    }
  );

  // Create customer portal session
  fastify.post(
    '/portal',
    {
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      const user = request.user!;

      if (!user.stripeCustomerId) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'No billing account found',
        });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `chrome-extension://{EXTENSION_ID}/settings`,
      });

      return {
        portalUrl: session.url,
      };
    }
  );

  // Get current subscription status
  fastify.get(
    '/subscription',
    {
      preHandler: authMiddleware,
    },
    async (request) => {
      const user = request.user!;

      const subscription = await prisma.subscription.findUnique({
        where: { userId: user.id },
      });

      if (!subscription) {
        return {
          plan: 'free',
          status: null,
          currentPeriodEnd: null,
        };
      }

      return {
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      };
    }
  );

  // Stripe webhook handler
  fastify.post(
    '/webhook',
    {
      config: {
        rawBody: true,
      },
    },
    async (request, reply) => {
      const sig = request.headers['stripe-signature'];
      const rawBody = (request as any).rawBody;

      if (!sig || !rawBody) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Missing signature or body',
        });
      }

      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.error('Webhook signature verification failed:', err);
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid signature',
        });
      }

      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const userId = subscription.metadata.userId;

          if (!userId) {
            console.error('No userId in subscription metadata');
            break;
          }

          await prisma.subscription.upsert({
            where: { userId },
            update: {
              stripeSubscriptionId: subscription.id,
              plan: 'pro',
              status: subscription.status,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            },
            create: {
              userId,
              stripeSubscriptionId: subscription.id,
              plan: 'pro',
              status: subscription.status,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            },
          });

          // Update user plan
          if (subscription.status === 'active' || subscription.status === 'trialing') {
            await prisma.user.update({
              where: { id: userId },
              data: { plan: 'pro' },
            });
          }

          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const userId = subscription.metadata.userId;

          if (!userId) {
            console.error('No userId in subscription metadata');
            break;
          }

          await prisma.subscription.update({
            where: { userId },
            data: {
              status: 'canceled',
            },
          });

          // Downgrade user to free
          await prisma.user.update({
            where: { id: userId },
            data: { plan: 'free' },
          });

          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          const user = await prisma.user.findFirst({
            where: { stripeCustomerId: customerId },
          });

          if (user) {
            await prisma.subscription.update({
              where: { userId: user.id },
              data: { status: 'past_due' },
            });
          }

          break;
        }
      }

      return { received: true };
    }
  );
}
