// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config({ override: true });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { redis } from './config/redis.js';
import { prisma } from './config/prisma.js';
import { authRoutes } from './routes/auth.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { productsRoutes } from './routes/products.routes.js';
import { suggestionsRoutes } from './routes/suggestions.routes.js';
import { trackingRoutes } from './routes/tracking.routes.js';

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

// Register routes
await fastify.register(authRoutes, { prefix: '/api/auth' });
await fastify.register(usersRoutes, { prefix: '/api/users' });
await fastify.register(chatRoutes, { prefix: '/api/chat' });
await fastify.register(productsRoutes, { prefix: '/api/products' });
await fastify.register(suggestionsRoutes, { prefix: '/api/suggestions' });
await fastify.register(trackingRoutes, { prefix: '/api/tracking' });

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
