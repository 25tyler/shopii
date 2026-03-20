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
  DATABASE_URL: z.string({ required_error: 'DATABASE_URL is required' }),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Supabase (required for auth)
  SUPABASE_URL: z.string({ required_error: 'SUPABASE_URL is required' }),
  SUPABASE_ANON_KEY: z.string({ required_error: 'SUPABASE_ANON_KEY is required' }),
  SUPABASE_SERVICE_ROLE_KEY: z.string({ required_error: 'SUPABASE_SERVICE_ROLE_KEY is required' }),

  // AI providers — at least one should be set for chat to work
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  // Research / search
  TAVILY_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_CX: z.string().optional(),

  // Web scraping (optional — fallback for JS-rendered pages)
  FIRECRAWL_API_KEY: z.string().optional(),

  // Stripe (optional — not needed for dev)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRO_PRICE_ID: z.string().optional(),

  // Affiliate
  AMAZON_AFFILIATE_TAG: z.string().default('shopii-20'),

  // CORS
  CORS_ORIGIN: z.string().default('chrome-extension://*'),

  // Chrome Extension ID — set in production to restrict CORS to a single extension
  CHROME_EXTENSION_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    console.error('');
    console.error('=== Missing or invalid environment variables ===');
    for (const [field, messages] of Object.entries(errors)) {
      console.error(`  ${field}: ${(messages as string[]).join(', ')}`);
    }
    console.error('');
    console.error('Copy api/.env.example to api/.env and fill in the required values.');
    console.error('');
    process.exit(1);
  }

  const env = result.data;

  // Warn about missing optional but important vars
  if (env.NODE_ENV === 'production') {
    const warnings: string[] = [];
    if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY) {
      warnings.push('No AI provider key set (OPENAI_API_KEY or ANTHROPIC_API_KEY) — chat will not work');
    }
    if (!env.TAVILY_API_KEY) {
      warnings.push('TAVILY_API_KEY not set — product research will not work');
    }
    if (!env.STRIPE_SECRET_KEY) {
      warnings.push('STRIPE_SECRET_KEY not set — billing will not work');
    }
    if (!env.CHROME_EXTENSION_ID) {
      warnings.push('CHROME_EXTENSION_ID not set — CORS allows any chrome extension');
    }
    if (warnings.length > 0) {
      console.warn('');
      console.warn('=== Environment warnings (production) ===');
      for (const w of warnings) {
        console.warn(`  ⚠ ${w}`);
      }
      console.warn('');
    }
  }

  return env;
}

export const env = loadEnv();
