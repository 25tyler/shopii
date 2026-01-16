import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Supabase
  SUPABASE_URL: z.string(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),

  // Anthropic (Claude)
  ANTHROPIC_API_KEY: z.string(),

  // Stripe
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
  STRIPE_PRO_PRICE_ID: z.string(),

  // Affiliate
  AMAZON_AFFILIATE_TAG: z.string().default('shopii-20'),

  // CORS
  CORS_ORIGIN: z.string().default('chrome-extension://*'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);

    // In development, provide helpful defaults message
    if (process.env.NODE_ENV !== 'production') {
      console.error('\nCreate a .env file with the required variables.');
    }

    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
