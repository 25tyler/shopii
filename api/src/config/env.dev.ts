import { z } from 'zod';

// Development environment schema — allows optional values with defaults
// Mirrors env.ts but makes most things optional for easy local development
const envSchema = z.object({
  // Server
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database — uses SQLite in dev mode
  DATABASE_URL: z.string().default('file:./prisma/dev.db'),

  // Redis — optional in dev (uses in-memory mock)
  REDIS_URL: z.string().optional(),

  // Supabase — optional in dev (uses mock auth)
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // AI providers — optional in dev (can use mock AI)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  // Research / search
  TAVILY_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_CX: z.string().optional(),

  // Web scraping
  FIRECRAWL_API_KEY: z.string().optional(),

  // Stripe — optional in dev (uses mock billing)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_PRICE_ID: z.string().optional(),

  // Affiliate
  AMAZON_AFFILIATE_TAG: z.string().default('shopii-20'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Chrome Extension ID
  CHROME_EXTENSION_ID: z.string().optional(),

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
