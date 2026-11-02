import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appEnv, validateEnv, redactUrl } from '../lib/env';
import { classifyDatabase, classifyStorage, checkEnvConsistency, assertEnvConsistency } from '../lib/env-guard';
import { redact, report, monitoringEnabled } from '../lib/logger';

/**
 * Batch 13 — infrastructure hardening (env validation, isolation guard, safe logging).
 * No database mutation; pure logic over a controlled process.env snapshot.
 */
const KEYS = ['APP_ENV', 'NODE_ENV', 'DATABASE_URL', 'NEXT_PUBLIC_SITE_URL', 'MEDIA_STORAGE_PROVIDER', 'MEDIA_S3_BUCKET', 'MEDIA_S3_ENDPOINT', 'MEDIA_S3_ACCESS_KEY_ID', 'MEDIA_S3_SECRET_ACCESS_KEY', 'APP_MAINTENANCE', 'SENTRY_DSN'];
let saved: Record<string, string | undefined>;
const set = (o: Record<string, string | undefined>) => { for (const k of KEYS) delete process.env[k]; for (const [k, v] of Object.entries(o)) if (v !== undefined) process.env[k] = v; };

beforeEach(() => { saved = {}; for (const k of KEYS) saved[k] = process.env[k]; });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('Batch 13 — env validation', () => {
  it('appEnv honors APP_ENV then falls back to NODE_ENV', () => {
    set({ APP_ENV: 'production' }); expect(appEnv()).toBe('production');
    set({ NODE_ENV: 'test' }); expect(appEnv()).toBe('test');
    set({ NODE_ENV: 'production' }); expect(appEnv()).toBe('production');
    set({}); expect(appEnv()).toBe('development');
  });

  it('flags missing DATABASE_URL and invalid site URL', () => {
    set({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' });
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/DATABASE_URL/);
  });

  it('production requires https site + non-local DB', () => {
    set({ APP_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://nfrguide.com', DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/https/);
    expect(r.errors.join(' ')).toMatch(/localhost/);
  });

  it('cloud storage requires MEDIA_S3_* (names only)', () => {
    set({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000', MEDIA_STORAGE_PROVIDER: 'r2' });
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/MEDIA_S3_BUCKET/);
    expect(r.errors.join(' ')).toMatch(/MEDIA_S3_ENDPOINT/);
  });

  it('test mode does not require production secrets; valid local passes', () => {
    set({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://u:p@localhost:5432/db', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' });
    expect(validateEnv().ok).toBe(true);
  });

  it('summary + redactUrl never expose credentials', () => {
    set({ DATABASE_URL: 'postgresql://user:SECRETPW@localhost:5432/db', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' });
    const s = validateEnv().summary;
    expect(JSON.stringify(s)).not.toMatch(/SECRETPW/);
    expect(redactUrl('postgresql://user:SECRETPW@h:5432/db')).not.toMatch(/SECRETPW/);
  });
});

describe('Batch 13 — isolation guard', () => {
  it('classifies databases by destination, not label alone', () => {
    expect(classifyDatabase('postgresql://u:p@localhost:5432/db')).toBe('local');
    expect(classifyDatabase('postgresql://u:p@pg-x.aivencloud.com:20376/defaultdb')).toBe('cloud');
    expect(classifyDatabase('not-a-url')).toBe('unknown');
  });
  it('classifies storage backend', () => {
    expect(classifyStorage('local')).toBe('local');
    expect(classifyStorage('r2')).toBe('cloud');
    expect(classifyStorage('s3')).toBe('cloud');
    expect(classifyStorage(undefined)).toBe('local');
  });
  it('blocks unsafe combinations', () => {
    set({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db', MEDIA_STORAGE_PROVIDER: 'r2' });
    expect(checkEnvConsistency().ok).toBe(false); // local DB + cloud storage
    expect(() => assertEnvConsistency()).toThrow();

    set({ DATABASE_URL: 'postgresql://u:p@pg-x.aivencloud.com:20376/db', MEDIA_STORAGE_PROVIDER: 'local' });
    expect(checkEnvConsistency().ok).toBe(false); // cloud DB + local media

    set({ APP_ENV: 'production', DATABASE_URL: 'postgresql://u:p@localhost:5432/db', MEDIA_STORAGE_PROVIDER: 'local' });
    expect(checkEnvConsistency().problems.join(' ')).toMatch(/production/);

    set({ APP_ENV: 'test', DATABASE_URL: 'postgresql://u:p@localhost:5432/db', MEDIA_STORAGE_PROVIDER: 'r2' });
    expect(checkEnvConsistency().problems.join(' ')).toMatch(/test/);
  });
  it('allows safe combinations and an explicit maintenance escape', () => {
    set({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db', MEDIA_STORAGE_PROVIDER: 'local' });
    expect(checkEnvConsistency().ok).toBe(true);
    set({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db', MEDIA_STORAGE_PROVIDER: 'r2', APP_MAINTENANCE: '1' });
    const r = checkEnvConsistency();
    expect(r.ok).toBe(true);
    expect(r.maintenance).toBe(true);
  });
});

describe('Batch 13 — safe logging', () => {
  it('redacts sensitive keys, connection strings and tokens', () => {
    const out = redact({ password: 'x', nested: { token: 'y', url: 'postgresql://u:pw@h/db' }, note: 'Bearer abc.def.ghi', ok: 'fine' }) as Record<string, unknown>;
    expect(out.password).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).token).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).url).toBe('[redacted]');
    expect(out.note).toMatch(/\[redacted\]/);
    expect(out.ok).toBe('fine');
  });
  it('handles cycles without throwing and report() is safe when monitoring is off', () => {
    const a: Record<string, unknown> = {}; a.self = a;
    expect(() => redact(a)).not.toThrow();
    set({});
    expect(monitoringEnabled()).toBe(false);
    expect(() => report('database', new Error('boom'))).not.toThrow();
  });
});

describe('Batch 13 — health endpoint', () => {
  it('liveness returns ok without touching the database', async () => {
    const { GET } = await import('../app/api/health/route');
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
