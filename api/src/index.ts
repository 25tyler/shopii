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
import { billingRoutes } from './routes/billing.routes.js';
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

// Register routes
await fastify.register(authRoutes, { prefix: '/api/auth' });
await fastify.register(usersRoutes, { prefix: '/api/users' });
await fastify.register(chatRoutes, { prefix: '/api/chat' });
await fastify.register(productsRoutes, { prefix: '/api/products' });
await fastify.register(suggestionsRoutes, { prefix: '/api/suggestions' });
await fastify.register(billingRoutes, { prefix: '/api/billing' });
await fastify.register(trackingRoutes, { prefix: '/api/tracking' });

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
