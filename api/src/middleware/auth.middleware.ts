import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../config/supabase.js';
import { prisma } from '../config/prisma.js';
import { formatArray } from '../utils/db-helpers.js';
import type { User } from '@prisma/client';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
    userId?: string;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header',
    });
  }

  const token = authHeader.slice(7);

  try {
    const supabaseUser = await verifyToken(token);

    if (!supabaseUser) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    // Get or create user in our database
    let user = await prisma.user.findUnique({
      where: { id: supabaseUser.id },
    });

    if (!user) {
      // Create user if they don't exist (first login)
      user = await prisma.user.create({
        data: {
          id: supabaseUser.id,
          email: supabaseUser.email!,
          name: supabaseUser.user_metadata?.full_name || null,
          avatarUrl: supabaseUser.user_metadata?.avatar_url || null,
          preferences: {
            create: {
              categories: formatArray([]) as any,
              budgetMin: 0,
              budgetMax: 1000,
              currency: 'USD',
              qualityPreference: 'mid-range',
              brandPreferences: formatArray([]) as any,
              brandExclusions: formatArray([]) as any,
            },
          },
        },
      });
    }

    request.user = user;
    request.userId = user.id;
  } catch (error) {
    console.error('Auth middleware error:', error);
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication failed',
    });
  }
}

// Optional auth - doesn't fail if no token, just doesn't set user
export async function optionalAuthMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return;
  }

  const token = authHeader.slice(7);

  try {
    const supabaseUser = await verifyToken(token);

    if (supabaseUser) {
      const user = await prisma.user.findUnique({
        where: { id: supabaseUser.id },
      });

      if (user) {
        request.user = user;
        request.userId = user.id;
      }
    }
  } catch {
    // Ignore errors for optional auth
  }
}
