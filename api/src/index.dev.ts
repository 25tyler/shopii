// Development server - uses real GPT AI with SQLite database
import dotenv from 'dotenv';
dotenv.config({ override: true });
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { prisma } from './config/prisma.js';
import { redis } from './config/redis.mock.js';
import { authMiddleware, optionalAuthMiddleware } from './middleware/auth.dev.js';
import type { RouteDeps } from './routes/deps.js';

// Unified routes (products, users, tracking work for both dev and prod)
import { productsRoutes } from './routes/products.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { trackingRoutes } from './routes/tracking.routes.js';

// Dev-specific routes (fundamentally different implementations)
import { devAuthRoutes } from './routes/auth.dev.routes.js';
import { devChatRoutes } from './routes/chat.dev.routes.js';
import { devSuggestionsRoutes } from './routes/suggestions.dev.routes.js';
import { devBillingRoutes } from './routes/billing.dev.routes.js';

const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: 'debug',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  },
});

// Register CORS - allow everything in dev
await fastify.register(cors, {
  origin: true,
  credentials: true,
});

// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok', mode: 'development', timestamp: new Date().toISOString() };
});

// API info endpoint
fastify.get('/', async () => {
  return {
    name: 'Shopii API',
    version: '0.1.0',
    description: 'AI-Powered Shopping Assistant',
    mode: 'development',
    note: 'Running with mock AI and auth',
  };
});

// Inject dev auth middleware into all routes via RouteDeps
const routeDeps: RouteDeps = { authMiddleware, optionalAuthMiddleware };

// Register routes — unified files reuse the same code for dev and prod
await fastify.register(devAuthRoutes, { prefix: '/api/auth', ...routeDeps });
await fastify.register(usersRoutes, { prefix: '/api/users', ...routeDeps });
await fastify.register(devChatRoutes, { prefix: '/api/chat', ...routeDeps });
await fastify.register(productsRoutes, { prefix: '/api/products', ...routeDeps });
await fastify.register(devSuggestionsRoutes, { prefix: '/api/suggestions', ...routeDeps });
await fastify.register(trackingRoutes, { prefix: '/api/tracking', ...routeDeps });
await fastify.register(devBillingRoutes, { prefix: '/api/billing', ...routeDeps });

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);

  if (error.name === 'ZodError') {
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error,
    });
  }

  reply.status(error.statusCode || 500).send({
    error: error.name || 'Internal Server Error',
    message: error.message,
    stack: error.stack,
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
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   Shopii API - DEVELOPMENT MODE                              ║
║                                                              ║
║   Server: http://${HOST}:${PORT}                             ║
║                                                              ║
║   Real GPT-4o-mini AI responses                              ║
║   Mock authentication (auto-login as dev user)               ║
║   In-memory rate limiting (no Redis needed)                  ║
║   SQLite database (no PostgreSQL needed)                     ║
║                                                              ║
║   Test endpoints:                                            ║
║   - GET  /health                                             ║
║   - POST /api/chat/message                                   ║
║   - GET  /api/products/search?q=headphones                   ║
║   - GET  /api/suggestions                                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
