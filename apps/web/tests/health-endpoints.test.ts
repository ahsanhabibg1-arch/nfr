import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Batch 02 Task H — the two probes Render and any uptime monitor depend on.
 *
 * These endpoints already existed and are deliberately NOT duplicated here. What
 * was missing was cover for the properties that make them safe to poll every
 * five minutes, forever:
 *
 *   - `/api/health/` must stay a LIVENESS probe: no database work, no writes, no
 *     analytics, no view counting, no secrets — and it must never be answered
 *     from a cache, or the monitor would see a stale 200 from a dead process.
 *   - `/api/ready/` must stay a bounded, read-only DEPENDENCY check that reports
 *     failure as a category rather than an error message, so a probe response
 *     cannot disclose a connection string.
 *
 * The "no database work" claim is asserted structurally, against the route's own
 * source, because that is what makes it cheap: a mocked query would prove the
 * call count of one implementation, not the absence of the import.
 */

const HEALTH_SRC = readFileSync(resolve(__dirname, '../app/api/health/route.ts'), 'utf8');
const READY_SRC = readFileSync(resolve(__dirname, '../app/api/ready/route.ts'), 'utf8');

const KEYS = ['APP_ENV', 'NODE_ENV', 'DATABASE_URL', 'NEXT_PUBLIC_SITE_URL', 'MEDIA_STORAGE_PROVIDER', 'APP_MAINTENANCE'] as const;
/** `process.env` is typed read-only for NODE_ENV in this project's tsconfig. */
const envStore = process.env as unknown as Record<string, string | undefined>;
let saved: Record<string, string | undefined>;
beforeEach(() => { saved = {}; for (const k of KEYS) saved[k] = envStore[k]; });
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete envStore[k]; else envStore[k] = saved[k]; }
  vi.restoreAllMocks();
});

describe('Batch 02 — liveness probe (/api/health/)', () => {
  it('answers 200 with no-store, so a monitor can never see a cached 200 from a dead process', async () => {
    const { GET } = await import('../app/api/health/route');
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('is declared dynamic on the Node runtime, not prerendered', () => {
    expect(HEALTH_SRC).toContain("export const dynamic = 'force-dynamic'");
    expect(HEALTH_SRC).toContain("export const runtime = 'nodejs'");
  });

  it('does no database work at all — it imports neither Prisma nor the db module', () => {
    expect(HEALTH_SRC).not.toMatch(/from\s+['"]@?\/?lib\/db['"]/);
    expect(HEALTH_SRC).not.toMatch(/prisma/i);
  });

  it('triggers no analytics, no view counting and no background write', () => {
    for (const forbidden of [/analytics/i, /viewCount/i, /increment/i, /\.create\(/, /\.update/, /revalidat/i]) {
      expect(HEALTH_SRC).not.toMatch(forbidden);
    }
  });

  it('discloses only a status and a timestamp — no version, host or environment detail', async () => {
    const { GET } = await import('../app/api/health/route');
    const body = await GET().json();
    expect(Object.keys(body).sort()).toEqual(['status', 'time']);
    expect(body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });

  it('is answered fresh each time (the timestamp is not frozen into a cached body)', async () => {
    const { GET } = await import('../app/api/health/route');
    const first = await GET().json();
    vi.setSystemTime(new Date(Date.parse(first.time) + 1500));
    const second = await GET().json();
    vi.useRealTimers();
    expect(second.time).not.toBe(first.time);
  });
});

describe('Batch 02 — readiness probe (/api/ready/)', () => {
  it('bounds its dependency check instead of hanging the probe', () => {
    expect(READY_SRC).toMatch(/TIMEOUT_MS\s*=\s*\d+/);
    expect(READY_SRC).toContain('withTimeout');
  });

  it('checks the database read-only — SELECT 1, never a write', () => {
    expect(READY_SRC).toContain('SELECT 1');
    for (const forbidden of [/\.create\(/, /\.update\(/, /\.delete\(/, /\.upsert\(/]) {
      expect(READY_SRC).not.toMatch(forbidden);
    }
  });

  it('reports an unsafe environment as not-ready, as a CATEGORY and never as a connection string', async () => {
    // The isolation guard's own rule: `APP_ENV=test` must never be paired with
    // cloud media. The database stays the isolated test database, so `SELECT 1`
    // still succeeds and this case needs no network and no unreachable host —
    // it isolates the ENVIRONMENT verdict from the dependency verdict.
    envStore.APP_ENV = 'test';
    envStore.NEXT_PUBLIC_SITE_URL = 'http://localhost:3100';
    envStore.MEDIA_STORAGE_PROVIDER = 'r2';
    delete process.env.APP_MAINTENANCE;
    vi.resetModules();

    const { GET } = await import('../app/api/ready/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe('not-ready');
    expect(body.checks.environment).toBe('misconfigured');
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    // Whatever the real connection string is, no part of it may appear in a
    // probe response — this is the property a leak would break, and it holds
    // without this test ever having to know the credential.
    const printed = JSON.stringify(body);
    const url = process.env.DATABASE_URL || '';
    if (url) {
      expect(printed).not.toContain(url);
      const { password, hostname } = new URL(url);
      if (password) expect(printed).not.toContain(password);
      expect(printed).not.toContain(hostname);
    }
  });
});
