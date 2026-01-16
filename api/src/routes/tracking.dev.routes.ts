// Development tracking routes - handles SQLite compatibility
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { optionalAuthMiddleware } from '../middleware/auth.dev.js';

const AMAZON_AFFILIATE_TAG = process.env.AMAZON_AFFILIATE_TAG || 'shopii-20';

export async function devTrackingRoutes(fastify: FastifyInstance) {
  // Track affiliate click
  fastify.post(
    '/click',
    {
      preHandler: optionalAuthMiddleware,
    },
    async (request, reply) => {
      const bodySchema = z.object({
        productId: z.string(),
        clickUrl: z.string(),
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
      if (/amazon\.(com|co\.uk|de|fr|es|it|ca|com\.au)/.test(clickUrl)) {
        affiliateNetwork = 'amazon';
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
            context: JSON.stringify({
              url: clickUrl,
              network: affiliateNetwork,
            }),
          },
        });
      }

      return { success: true, _devMode: true };
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
        sponsoredProductId: z.string(),
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

      return { success: true, _devMode: true };
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
      if (/amazon\.(com|co\.uk|de|fr|es|it|ca|com\.au)/.test(product.affiliateUrl)) {
        try {
          const parsed = new URL(product.affiliateUrl);
          parsed.searchParams.set('tag', AMAZON_AFFILIATE_TAG);
          finalUrl = parsed.toString();
        } catch {
          // Use original URL if parsing fails
        }
      }

      return {
        url: finalUrl,
        retailer: product.retailer,
        _devMode: true,
      };
    }
  );

  // Get click stats (simplified for dev)
  fastify.get('/stats', async () => {
    const clicks = await prisma.affiliateClick.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const byNetwork: Record<string, number> = {};
    for (const click of clicks) {
      const network = click.affiliateNetwork || 'unknown';
      byNetwork[network] = (byNetwork[network] || 0) + 1;
    }

    return {
      totalClicks: clicks.length,
      byNetwork: Object.entries(byNetwork).map(([network, count]) => ({ network, clicks: count })),
      _devMode: true,
    };
  });
}
