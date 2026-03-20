import { FastifyRequest, FastifyReply, FastifyPluginOptions } from 'fastify';

/**
 * Shared dependencies injected into route handlers by the entry point.
 * This lets the same route file work in both development and production —
 * the entry point decides which concrete middleware/services to provide.
 *
 * Extends FastifyPluginOptions so it can be passed directly to fastify.register().
 */
export interface RouteDeps extends FastifyPluginOptions {
  authMiddleware: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  optionalAuthMiddleware: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}
