import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { config as loadDotenvFile } from 'dotenv';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const hourOfDay = z.coerce.number().int().min(0).max(23);

const PLACEHOLDER = /change[-_]?me|replace[-_]?me|placeholder|dev[-_]?only/i;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    APP_VERSION: z.string().default('1.0.0'),

    WEB_URL: z.string().url().default('http://localhost:5173'),
    API_URL: z.string().url().default('http://localhost:3000'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGINS: optionalString,
    TRUST_PROXY: booleanString,

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(14),
    ENCRYPTION_KEY: z
      .string()
      .regex(
        /^[A-Za-z0-9+/]{43}=$/,
        'ENCRYPTION_KEY must be a base64-encoded 32-byte key (openssl rand -base64 32)',
      ),
    COOKIE_DOMAIN: optionalString,
    COOKIE_SECURE: booleanString,

    INTEGRATION_MODE: z.enum(['mock', 'google']).default('mock'),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GOOGLE_OAUTH_REDIRECT_URI: optionalString,
    GOOGLE_INTEGRATION_REDIRECT_URI: optionalString,
    GOOGLE_ADS_DEVELOPER_TOKEN: optionalString,
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: optionalString,
    GOOGLE_ADS_API_VERSION: z.string().default('v21'),

    STORAGE_PROVIDER: z.enum(['local', 'azure']).default('local'),
    LOCAL_STORAGE_PATH: z.string().default('./storage'),
    AZURE_STORAGE_CONNECTION_STRING: optionalString,
    AZURE_STORAGE_CONTAINER: z.string().default('reports'),

    APPLICATIONINSIGHTS_CONNECTION_STRING: optionalString,
    SENTRY_DSN: optionalString,

    EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
    EMAIL_FROM: z.string().default('ADPULSE <no-reply@adpulse.local>'),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_SECURE: booleanString,

    SWAGGER_ENABLED: booleanString,
    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

    SYNC_LOCAL_HOUR: hourOfDay.default(6),
    REPORT_LOCAL_HOUR: hourOfDay.default(7),
    SYNC_LOOKBACK_DAYS: z.coerce.number().int().min(1).max(90).default(3),
    INITIAL_SYNC_DAYS: z.coerce.number().int().min(1).max(730).default(180),
    SCHEDULER_ENABLED: booleanString,
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
    WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3001),
    PUPPETEER_EXECUTABLE_PATH: optionalString,

    SEED_ADMIN_EMAIL: z.string().email().default('admin@adpulse.local'),
    SEED_ADMIN_PASSWORD: optionalString,
    SEED_DEMO_PASSWORD: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'] as const) {
      if (PLACEHOLDER.test(env[key])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} still contains a placeholder value`,
        });
      }
    }
    if (PLACEHOLDER.test(Buffer.from(env.ENCRYPTION_KEY, 'base64').toString('latin1'))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ENCRYPTION_KEY'],
        message: 'ENCRYPTION_KEY is the development placeholder key',
      });
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'Access and refresh secrets must differ',
      });
    }
    if (env.STORAGE_PROVIDER === 'azure' && !env.AZURE_STORAGE_CONNECTION_STRING) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AZURE_STORAGE_CONNECTION_STRING'],
        message: 'Required when STORAGE_PROVIDER=azure',
      });
    }
    if (env.EMAIL_PROVIDER === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'Required when EMAIL_PROVIDER=smtp',
      });
    }
    if (env.INTEGRATION_MODE === 'google') {
      for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'Required when INTEGRATION_MODE=google',
          });
        }
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`),
    );
  }
  return result.data;
}

/** Locates the nearest `.env` walking up from `start` (monorepo root when running from a workspace). */
export function findEnvFile(start = process.cwd(), maxDepth = 4): string | undefined {
  let dir = resolve(start);
  for (let i = 0; i <= maxDepth; i += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

let cached: AppEnv | undefined;

export function loadEnv(options: { reload?: boolean } = {}): AppEnv {
  if (cached && !options.reload) return cached;
  const file = findEnvFile();
  if (file) loadDotenvFile({ path: file, override: false });
  const env = parseEnv(process.env);
  // API and worker run from different workspace directories; anchoring relative paths to the .env
  // location makes both processes share one storage folder.
  if (file && !isAbsolute(env.LOCAL_STORAGE_PATH))
    env.LOCAL_STORAGE_PATH = resolve(dirname(file), env.LOCAL_STORAGE_PATH);
  cached = env;
  return cached;
}
