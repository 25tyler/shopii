// Development auth middleware - auto-creates and uses a test user
import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/prisma.js';
import type { User } from '@prisma/client';
import { formatArray } from '../utils/db-helpers.js';

// Test user ID for development (valid UUID format for PostgreSQL)
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';
const DEV_USER_EMAIL = 'dev@shopii.test';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
    userId?: string;
  }
}

// Create or get the development user
async function getOrCreateDevUser(): Promise<User> {
  let user = await prisma.user.findUnique({
    where: { id: DEV_USER_ID },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        id: DEV_USER_ID,
        email: DEV_USER_EMAIL,
        name: 'Dev User',
        plan: 'pro', // Pro in dev mode for unlimited testing
        preferences: {
          create: {
            categories: formatArray(['electronics', 'audio', 'computing']) as any,
            budgetMin: 0,
            budgetMax: 2000,
            currency: 'USD',
            qualityPreference: 'mid-range',
            brandPreferences: formatArray([]) as any,
            brandExclusions: formatArray([]) as any,
          },
        },
      },
    });
    console.log('Created development user:', DEV_USER_EMAIL);
  }

  return user;
}

export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  // In dev mode, always authenticate as the dev user
  const user = await getOrCreateDevUser();
  request.user = user;
  request.userId = user.id;
}

export async function optionalAuthMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  // In dev mode, always provide the dev user context
  try {
    const user = await getOrCreateDevUser();
    request.user = user;
    request.userId = user.id;
  } catch {
    // Ignore errors
  }
}

// Export the dev user ID for use in other places
export { DEV_USER_ID, DEV_USER_EMAIL };
