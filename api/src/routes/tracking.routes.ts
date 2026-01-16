import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { env } from '../config/env.js';

// Affiliate network configurations
const AFFILIATE_CONFIGS: Record<
  string,
  {
    name: string;
    urlPattern: RegExp;
    buildUrl: (originalUrl: string, tag: string) => string;
  }
> = {
  amazon: {
    name: 'Amazon Associates',
    urlPattern: /amazon\.(com|co\.uk|de|fr|es|it|ca|com\.au)/,
    buildUrl: (url, tag) => {
      const parsed = new URL(url);
      parsed.searchParams.set('tag', tag);
      return parsed.toString();
    },
  },
  // Add more affiliate networks as needed
};

export async function trackingRoutes(fastify: FastifyInstance) {
  // Track affiliate click
  fastify.post(
    '/click',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request, reply) => {
      const bodySchema = z.object({
        productId: z.string().uuid(),
        clickUrl: z.string().url(),
      });

      const parseResult = bodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { productId, clickUrl } = parseResult.data;
      const userId = request.userId;

      // Determine affiliate network
      let affiliateNetwork = 'unknown';
      for (const [network, config] of Object.entries(AFFILIATE_CONFIGS)) {
        if (config.urlPattern.test(clickUrl)) {
          affiliateNetwork = network;
          break;
        }
      }

      // Record the click
      await prisma.affiliateClick.create({
        data: {
          userId,
          productId,
          affiliateNetwork,
          clickUrl,
        },
      });

      // Track as user interaction if authenticated
      if (userId) {
        await prisma.userInteraction.create({
          data: {
            userId,
            productId,
            interactionType: 'click_affiliate',
            context: {
              url: clickUrl,
              network: affiliateNetwork,
            },
          },
        });
      }

      return { success: true };
    }
  );

  // Track ad impression
  fastify.post(
    '/impression',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request, reply) => {
      const bodySchema = z.object({
        sponsoredProductId: z.string().uuid(),
        placement: z.enum(['suggestions_feed', 'chat_results']),
      });

      const parseResult = bodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { sponsoredProductId, placement } = parseResult.data;
      const userId = request.userId;

      await prisma.adImpression.create({
        data: {
          sponsoredProductId,
          userId,
          placement,
        },
      });

      return { success: true };
    }
  );

  // Generate affiliate URL for a product
  fastify.get(
    '/affiliate-url/:productId',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request, reply) => {
      const { productId } = request.params as { productId: string };

      // Validate UUID
      const uuidSchema = z.string().uuid();
      if (!uuidSchema.safeParse(productId).success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid product ID',
        });
      }

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          affiliateUrl: true,
          retailer: true,
        },
      });

      if (!product || !product.affiliateUrl) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Product or affiliate URL not found',
        });
      }

      // Build affiliate URL with tracking tag
      let finalUrl = product.affiliateUrl;

      // Check if it's an Amazon URL
      if (AFFILIATE_CONFIGS.amazon?.urlPattern.test(product.affiliateUrl)) {
        finalUrl = AFFILIATE_CONFIGS.amazon.buildUrl(product.affiliateUrl, env.AMAZON_AFFILIATE_TAG);
      }

      return {
        url: finalUrl,
        retailer: product.retailer,
      };
    }
  );

  // Get click stats (internal/admin use)
  fastify.get('/stats', async (request, reply) => {
    // This would typically be protected by admin auth
    const querySchema = z.object({
      days: z.coerce.number().min(1).max(90).default(7),
    });

    const { days } = querySchema.parse(request.query);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const stats = await prisma.affiliateClick.groupBy({
      by: ['affiliateNetwork'],
      where: {
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    const dailyStats = await prisma.$queryRaw`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as clicks
      FROM affiliate_clicks
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    return {
      byNetwork: stats.map((s) => ({
        network: s.affiliateNetwork,
        clicks: s._count,
      })),
      daily: dailyStats,
    };
  });
}
