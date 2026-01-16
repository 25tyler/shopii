// Development auth middleware - auto-creates and uses a test user
import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/prisma.js';
import type { User } from '@prisma/client';

// Test user ID for development
const DEV_USER_ID = 'dev-user-00000000-0000-0000-0000-000000000001';
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
        plan: 'free',
        preferences: {
          create: {
            categories: JSON.stringify(['electronics', 'audio', 'computing']),
            budgetMin: 0,
            budgetMax: 2000,
            currency: 'USD',
            qualityPreference: 'mid-range',
            brandPreferences: JSON.stringify([]),
            brandExclusions: JSON.stringify([]),
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
