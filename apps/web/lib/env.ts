import 'server-only';
import { z } from 'zod';

/**
 * Centralized, server-only environment validation (Batch 13 §4). Validates required
 * configuration per runtime mode, fails fast in production, and NEVER prints secret
 * values. Client bundles only ever receive `NEXT_PUBLIC_*` (this module is server-only).
 *
 * This module is intentionally non-throwing by default (`validateEnv()` returns a
 * structured result); the startup hook (`instrumentation.ts`) decides when to hard-fail.
 */

export type AppEnv = 'development' | 'test' | 'production';

/** Explicit environment label, falling back to NODE_ENV. Never trusted alone for DB identity. */
export function appEnv(): AppEnv {
  const v = (process.env.APP_ENV || '').toLowerCase();
  if (v === 'production' || v === 'test' || v === 'development') return v;
  const n = (process.env.NODE_ENV || 'development').toLowerCase();
  return n === 'production' ? 'production' : n === 'test' ? 'test' : 'development';
}

/** Redact a connection string / URL to host-only for safe logging. */
export function redactUrl(raw: string | undefined): string {
  if (!raw) return '(unset)';
  try { const u = new URL(raw.replace(/^psql\s+/i, '').replace(/^['"]|['"]$/g, '')); return `${u.protocol}//${u.username ? '***@' : ''}${u.hostname}:${u.port || ''}${u.pathname}`; }
  catch { return '(unparseable)'; }
}

const StorageProvider = z.enum(['local', 'r2', 's3']);

/** Base shape shared by all modes. Values are never echoed. */
const base = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXT_PUBLIC_SITE_URL: z.string().url('NEXT_PUBLIC_SITE_URL must be a valid URL'),
  MEDIA_STORAGE_PROVIDER: StorageProvider.optional().default('local'),
});

export interface EnvResult {
  ok: boolean;
  env: AppEnv;
  errors: string[];
  /** Non-secret, safe-to-log summary. */
  summary: Record<string, string>;
}

/**
 * Validate the current process environment for the active mode. Returns structured,
 * secret-free errors. Production adds stricter rules; test never requires prod secrets.
 */
export function validateEnv(): EnvResult {
  const env = appEnv();
  const errors: string[] = [];

  const parsed = base.safeParse(process.env);
  if (!parsed.success) for (const i of parsed.error.issues) errors.push(`${i.path.join('.')}: ${i.message}`);

  const provider = (process.env.MEDIA_STORAGE_PROVIDER || 'local').toLowerCase();

  // Cloud storage requires its (server-only) config — names only, never values.
  if (provider === 'r2' || provider === 's3') {
    for (const k of ['MEDIA_S3_BUCKET', 'MEDIA_S3_ACCESS_KEY_ID', 'MEDIA_S3_SECRET_ACCESS_KEY'] as const) {
      if (!process.env[k]) errors.push(`${k} is required when MEDIA_STORAGE_PROVIDER=${provider}`);
    }
    if (provider === 'r2' && !process.env.MEDIA_S3_ENDPOINT) errors.push('MEDIA_S3_ENDPOINT is required for R2');
  }

  // Production-only hard requirements.
  if (env === 'production') {
    const site = process.env.NEXT_PUBLIC_SITE_URL || '';
    if (!/^https:\/\//.test(site)) errors.push('NEXT_PUBLIC_SITE_URL must be https in production');
    if (/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
      errors.push('DATABASE_URL points at localhost in production (expected the managed cloud database)');
    }
  }

  // Never require production secrets in test.
  // (Nothing extra to assert here; test simply skips the production rules above.)

  const summary: Record<string, string> = {
    APP_ENV: env,
    NODE_ENV: process.env.NODE_ENV || '(unset)',
    DATABASE_URL: redactUrl(process.env.DATABASE_URL),
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || '(unset)',
    MEDIA_STORAGE_PROVIDER: provider,
    MONITORING: process.env.SENTRY_DSN ? 'configured' : 'disabled',
  };

  return { ok: errors.length === 0, env, errors, summary };
}

/** Throw a secret-free aggregate error if the environment is invalid (used for fail-fast). */
export function assertEnv(): void {
  const r = validateEnv();
  if (!r.ok) throw new Error(`Invalid environment (${r.env}): ${r.errors.join('; ')}`);
}
