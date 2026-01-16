import { FastifyRequest, FastifyReply } from 'fastify';
import { checkRateLimit, redis } from '../config/redis.js';
import { prisma } from '../config/prisma.js';

// Rate limits by plan
const RATE_LIMITS = {
  guest: { searches: 5, windowSeconds: 86400 }, // 5 per day
  free: { searches: 20, windowSeconds: 86400 }, // 20 per day
  pro: { searches: Infinity, windowSeconds: 86400 }, // Unlimited
};

export async function searchRateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.userId;
  const user = request.user;

  // Determine rate limit based on user plan
  const plan = user?.plan || 'guest';
  const limits = RATE_LIMITS[plan as keyof typeof RATE_LIMITS] || RATE_LIMITS.guest;

  // Pro users have no limit
  if (limits.searches === Infinity) {
    return;
  }

  // Use user ID or IP for rate limiting key
  const key = userId ? `ratelimit:search:${userId}` : `ratelimit:search:ip:${request.ip}`;

  const result = await checkRateLimit(key, limits.searches, limits.windowSeconds);

  // Set rate limit headers
  reply.header('X-RateLimit-Limit', limits.searches);
  reply.header('X-RateLimit-Remaining', result.remaining);
  reply.header('X-RateLimit-Reset', result.resetAt);

  if (!result.allowed) {
    const upgradeMessage =
      plan === 'guest'
        ? 'Sign up for a free account to get 20 searches per day, or upgrade to Pro for unlimited searches.'
        : plan === 'free'
          ? 'Upgrade to Pro for unlimited searches.'
          : '';

    return reply.status(429).send({
      error: 'Too Many Requests',
      message: `You've reached your daily search limit of ${limits.searches} searches. ${upgradeMessage}`,
      resetAt: new Date(result.resetAt * 1000).toISOString(),
    });
  }
}

// Track usage in database for analytics
export async function trackUsage(userId: string, type: 'search' | 'api_call') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    await prisma.usageTracking.upsert({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
      update: {
        searchCount: {
          increment: type === 'search' ? 1 : 0,
        },
      },
      create: {
        userId,
        date: today,
        searchCount: type === 'search' ? 1 : 0,
      },
    });
  } catch (error) {
    console.error('Failed to track usage:', error);
    // Don't fail the request if tracking fails
  }
}

// Get usage stats for a user
export async function getUsageStats(userId: string, plan: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const limits = RATE_LIMITS[plan as keyof typeof RATE_LIMITS] || RATE_LIMITS.free;

  const usage = await prisma.usageTracking.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    searchCount: usage?.searchCount || 0,
    limit: limits.searches === Infinity ? -1 : limits.searches,
    resetAt: tomorrow,
  };
}
