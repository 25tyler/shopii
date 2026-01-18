import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file before validating
dotenv.config({ override: true });

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

  // OpenAI (GPT-4)
  OPENAI_API_KEY: z.string().optional(),

  // Anthropic (Claude)
  ANTHROPIC_API_KEY: z.string().optional(),

  // Google Gemini
  GEMINI_API_KEY: z.string().optional(),

  // Stripe (optional - not needed for hackathon)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_PRICE_ID: z.string().optional(),

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


    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
