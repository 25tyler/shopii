// Development server - uses real GPT AI with SQLite database
import dotenv from 'dotenv';
dotenv.config({ override: true });
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { prisma } from './config/prisma.js';
import { redis } from './config/redis.mock.js';

// Import dev-specific routes (all routes adapted for SQLite/mock services)
import { devAuthRoutes } from './routes/auth.dev.routes.js';
import { devUsersRoutes } from './routes/users.dev.routes.js';
import { devChatRoutes } from './routes/chat.dev.routes.js';
import { devProductsRoutes } from './routes/products.dev.routes.js';
import { devSuggestionsRoutes } from './routes/suggestions.dev.routes.js';
import { devBillingRoutes } from './routes/billing.dev.routes.js';
import { devTrackingRoutes } from './routes/tracking.dev.routes.js';

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

// Register all dev routes (adapted for SQLite/mock services)
await fastify.register(devAuthRoutes, { prefix: '/api/auth' });
await fastify.register(devUsersRoutes, { prefix: '/api/users' });
await fastify.register(devChatRoutes, { prefix: '/api/chat' });
await fastify.register(devProductsRoutes, { prefix: '/api/products' });
await fastify.register(devSuggestionsRoutes, { prefix: '/api/suggestions' });
await fastify.register(devBillingRoutes, { prefix: '/api/billing' });
await fastify.register(devTrackingRoutes, { prefix: '/api/tracking' });

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
║   🛍️  Shopii API - DEVELOPMENT MODE                          ║
║                                                              ║
║   Server: http://${HOST}:${PORT}                              ║
║                                                              ║
║   ✓ Real GPT-4o-mini AI responses                            ║
║   ✓ Mock authentication (auto-login as dev user)             ║
║   ✓ In-memory rate limiting (no Redis needed)                ║
║   ✓ SQLite database (no PostgreSQL needed)                   ║
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
