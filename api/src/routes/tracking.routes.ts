import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { isPostgres, formatJson } from '../utils/db-helpers.js';
import { RouteDeps } from './deps.js';

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
      try {
        const parsed = new URL(url);
        parsed.searchParams.set('tag', tag);
        return parsed.toString();
      } catch {
        return url;
      }
    },
  },
};

const AMAZON_AFFILIATE_TAG = process.env.AMAZON_AFFILIATE_TAG || 'shopii-20';

export async function trackingRoutes(fastify: FastifyInstance, deps: RouteDeps) {
  const { optionalAuthMiddleware } = deps;

  // Track affiliate click
  fastify.post(
    '/click',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request, reply) => {
      const bodySchema = z.object({
        productId: isPostgres ? z.string().uuid() : z.string(),
        clickUrl: isPostgres ? z.string().url() : z.string(),
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

      await prisma.affiliateClick.create({
        data: {
          userId,
          productId,
          affiliateNetwork,
          clickUrl,
        },
      });

      if (userId) {
        await prisma.userInteraction.create({
          data: {
            userId,
            productId,
            interactionType: 'click_affiliate',
            context: formatJson({
              url: clickUrl,
              network: affiliateNetwork,
            }) as any,
          },
        });
      }

      return { success: true };
    },
  );

  // Track ad impression
  fastify.post(
    '/impression',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request, reply) => {
      const bodySchema = z.object({
        sponsoredProductId: isPostgres ? z.string().uuid() : z.string(),
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
    },
  );

  // Generate affiliate URL for a product
  fastify.get(
    '/affiliate-url/:productId',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request, reply) => {
      const { productId } = request.params as { productId: string };

      if (isPostgres) {
        const uuidSchema = z.string().uuid();
        if (!uuidSchema.safeParse(productId).success) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Invalid product ID',
          });
        }
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

      let finalUrl = product.affiliateUrl;
      if (AFFILIATE_CONFIGS.amazon?.urlPattern.test(product.affiliateUrl)) {
        finalUrl = AFFILIATE_CONFIGS.amazon.buildUrl(product.affiliateUrl, AMAZON_AFFILIATE_TAG);
      }

      return {
        url: finalUrl,
        retailer: product.retailer,
      };
    },
  );

  // Get click stats
  fastify.get('/stats', async (request) => {
    const querySchema = z.object({
      days: z.coerce.number().min(1).max(90).default(7),
    });

    const { days } = querySchema.parse(request.query);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    if (isPostgres) {
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
    } else {
      // SQLite: fetch and aggregate in memory
      const clicks = await prisma.affiliateClick.findMany({
        where: { createdAt: { gte: startDate } },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });

      const byNetwork: Record<string, number> = {};
      for (const click of clicks) {
        const network = click.affiliateNetwork || 'unknown';
        byNetwork[network] = (byNetwork[network] || 0) + 1;
      }

      return {
        totalClicks: clicks.length,
        byNetwork: Object.entries(byNetwork).map(([network, count]) => ({
          network,
          clicks: count,
        })),
      };
    }
  });
}
