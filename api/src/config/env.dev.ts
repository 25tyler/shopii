import { z } from 'zod';

// Development environment schema - allows optional values with defaults
const envSchema = z.object({
  // Server
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database - uses SQLite in dev mode
  DATABASE_URL: z.string().default('file:./prisma/dev.db'),

  // Redis - optional in dev (uses in-memory mock)
  REDIS_URL: z.string().optional(),

  // Supabase - optional in dev (uses mock auth)
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Anthropic (Claude) - optional in dev (uses mock AI)
  ANTHROPIC_API_KEY: z.string().optional(),

  // Stripe - optional in dev (uses mock billing)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_PRICE_ID: z.string().optional(),

  // Affiliate
  AMAZON_AFFILIATE_TAG: z.string().default('shopii-20'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Dev mode flag
  DEV_MODE: z.string().optional().transform((v) => v === 'true' || v === '1'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();

// Helper to check if we're in mock/dev mode
export const isDevMode = env.NODE_ENV === 'development' && (!env.ANTHROPIC_API_KEY || env.DEV_MODE);
