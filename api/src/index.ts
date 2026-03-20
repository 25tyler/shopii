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
    // Allow chrome extension and localhost in development
    if (
      !origin ||
      origin.startsWith('chrome-extension://') ||
      (env.NODE_ENV === 'development' && origin.startsWith('http://localhost'))
    ) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
});

// Global rate limit (per IP)
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis,
});

// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
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

  // Handle Zod validation errors
  if (error.name === 'ZodError') {
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error,
    });
  }

  // Handle Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    return reply.status(400).send({
      error: 'Database Error',
      message: 'A database error occurred',
    });
  }

  // Default error response
  reply.status(error.statusCode || 500).send({
    error: error.name || 'Internal Server Error',
    message: env.NODE_ENV === 'production' ? 'An error occurred' : error.message,
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
