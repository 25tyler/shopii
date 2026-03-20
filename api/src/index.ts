// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config({ override: true });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { redis } from './config/redis.js';
import { prisma } from './config/prisma.js';
import { authMiddleware, optionalAuthMiddleware } from './middleware/auth.middleware.js';
import { authRoutes } from './routes/auth.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { productsRoutes } from './routes/products.routes.js';
import { suggestionsRoutes } from './routes/suggestions.routes.js';
import { trackingRoutes } from './routes/tracking.routes.js';
import type { RouteDeps } from './routes/deps.js';

const routeDeps: RouteDeps = { authMiddleware, optionalAuthMiddleware };

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
            },
          }
        : undefined,
  },
});

// Register plugins
await fastify.register(cors, {
  origin: (origin, cb) => {
    // No origin (e.g. server-to-server, curl) — allow
    if (!origin) {
      return cb(null, true);
    }

    // In development, allow any chrome extension and localhost
    if (env.NODE_ENV === 'development') {
      if (origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost')) {
        return cb(null, true);
      }
    }

    // In production, only allow the specific extension ID configured in CHROME_EXTENSION_ID
    // Falls back to allowing any chrome-extension:// if no ID is configured
    if (origin.startsWith('chrome-extension://')) {
      if (env.CHROME_EXTENSION_ID) {
        const allowed = origin === `chrome-extension://${env.CHROME_EXTENSION_ID}`;
        return cb(allowed ? null : new Error('Not allowed by CORS'), allowed);
      }
      // No specific ID configured — allow any extension (legacy behavior)
      return cb(null, true);
    }

    cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
});

// Global rate limit (per IP)
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis,
});

// Liveness probe — lightweight, always responds if process is up
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Readiness probe — checks database and Redis connectivity
fastify.get('/health/ready', async (_request, reply) => {
  const checks: Record<string, 'ok' | 'error'> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');
  return reply.status(allOk ? 200 : 503).send({
    status: allOk ? 'ready' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// API info endpoint
fastify.get('/', async () => {
  return {
    name: 'Shopii API',
    version: '0.1.0',
    description: 'AI-Powered Shopping Assistant',
  };
});

// Register routes — all route files receive RouteDeps for middleware injection
await fastify.register(authRoutes, { prefix: '/api/auth', ...routeDeps });
await fastify.register(usersRoutes, { prefix: '/api/users', ...routeDeps });
await fastify.register(chatRoutes, { prefix: '/api/chat', ...routeDeps });
await fastify.register(productsRoutes, { prefix: '/api/products', ...routeDeps });
await fastify.register(suggestionsRoutes, { prefix: '/api/suggestions', ...routeDeps });
await fastify.register(trackingRoutes, { prefix: '/api/tracking', ...routeDeps });

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);

  const isProduction = env.NODE_ENV === 'production';

  // Handle Zod validation errors
  if (error.name === 'ZodError') {
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      // Only include field-level errors in dev, never full Zod error object
      ...(isProduction ? {} : { details: error.flatten?.() || error.issues }),
    });
  }

  // Handle Prisma errors — never leak schema details
  if (error.name === 'PrismaClientKnownRequestError' || error.name === 'PrismaClientValidationError') {
    return reply.status(400).send({
      error: 'Database Error',
      message: 'A database error occurred',
    });
  }

  // Default error response — generic message in production, no stack traces, no internal error names
  reply.status(error.statusCode || 500).send({
    error: isProduction ? 'Internal Server Error' : (error.name || 'Internal Server Error'),
    message: isProduction ? 'An unexpected error occurred' : error.message,
  });
});

// Graceful shutdown
const shutdown = async () => {
  fastify.log.info('Shutting down...');
  await fastify.close();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
try {
  await redis.connect();
  await fastify.listen({ port: parseInt(env.PORT), host: env.HOST });
  fastify.log.info(`Shopii API running at http://${env.HOST}:${env.PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
