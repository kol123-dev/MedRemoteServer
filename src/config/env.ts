import 'dotenv/config';
import { z } from 'zod';

const SmsProvider = z.enum(['log', 'africastalking', 'twilio']).default('log');
type SmsProviderId = z.infer<typeof SmsProvider>;

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  PORT: z.coerce.number().int().positive().default(8000),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  BACKEND_URL: z.string().url().default('http://localhost:8000'),
  CORS_ORIGINS_ADDITIONAL: z.string().default('').transform(s => s.split(',').map(x => x.trim()).filter(Boolean)).describe('comma separated additional CORS origins, supports * wildcard like https://*.vercel.app'),
  COOKIE_SECURE_IN_PRODUCTION: z.coerce.boolean().default(true),

  JWT_SECRET: z.string().min(12, 'JWT_SECRET must be >= 12 chars'),
  JWT_REFRESH_SECRET: z.string().min(12, 'JWT_REFRESH_SECRET must be >= 12 chars'),

  DATABASE_URL: z.string().min(5, 'DATABASE_URL required (prisma mysql or sqlite file)'),
  SQLITE_FALLBACK_AUTO: z.coerce.boolean().default(true).describe('If NODE_ENV=development + DATABASE_URL starts mysql:// + prisma migrate fails, suggest switching to sqlite:///./prisma/dev.db automatically in dev logs'),
  REDIS_URL: z.string().optional(),

  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORTCODE: z.string().default('4082347'),
  MPESA_PASSKEY: z.string().optional(),
  MPESA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),

  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  // AES-256 key used to encrypt secrets stored by the admin interface
  // (LLM API keys, secret config values). Must be >= 32 chars.
  SECRETS_ENCRYPTION_KEY: z.string().min(32, 'SECRETS_ENCRYPTION_KEY must be >= 32 chars').default('dev-only-secrets-encryption-key-change-me-0000001'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  SMS_ENABLED: z.coerce.boolean().default(false),
  SMS_PROVIDER: SmsProvider,
  LLM_PROVIDER: z.enum(['openai', 'anthropic', 'gemini', 'mock', 'auto']).optional(),
  PAYMENT_PROVIDER: z.enum(['mpesa', 'paystack', 'mock']).optional(),
  AT_API_KEY: z.string().optional(),
  AT_USERNAME: z.string().default('sandbox'),
  AT_SENDER_ID: z.string().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
});

type Env = z.infer<typeof EnvSchema> & { readonly SMS_PROVIDER: SmsProviderId };

const raw = process.env;
const parsed = EnvSchema.safeParse(raw);

if (!parsed.success) {
  const flat = parsed.error.flatten();
  const fieldMsg = Object.entries(flat.fieldErrors)
    .map(([k, vs]) => `  · ${k}: ${vs?.join('; ')}`)
    .join('\n');
  throw new Error(
    `[config/env.ts] BACKEND ENVIRONMENT MISSING OR INVALID — fix backend/.env or copy .env.example → .env\n${fieldMsg}${flat.formErrors.length ? '\n  ' + flat.formErrors.join('\n  ') : ''}`
  );
}

export const env: Env = Object.freeze(parsed.data) as Env;

export function isSmsEnabled(): boolean {
  return env.SMS_ENABLED === true;
}
export function smsProviderId(): SmsProviderId {
  return env.SMS_PROVIDER;
}

export default env;
