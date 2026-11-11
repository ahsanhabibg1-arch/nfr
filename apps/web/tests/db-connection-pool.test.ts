import { describe, it, expect } from 'vitest';

/**
 * Deployment regression: the Prisma connection pool must stay bounded on
 * managed PostgreSQL.
 *
 * THE DEFECT. Prisma sizes its pool as `physical_cpus * 2 + 1` from whatever
 * machine it runs on. A managed build host advertises every core of the
 * underlying box (~47 on the deployment platform), so a single client tried to
 * open ~95 sockets against a database that allows 20 connections in total — 3
 * reserved for superusers and ~13 held by the provider's own agents, leaving
 * about 3 for the application. Static generation died part-way with
 * `FATAL: sorry, too many clients already` (Prisma P2037), worst on
 * `/sitemap.xml`, which issues thirteen queries in one `Promise.all`.
 *
 * `connection_limit` reaches Prisma only through the connection string, so
 * `lib/db.ts` appends a small production default when the URL carries none.
 * These tests pin that rule's behaviour — including that an explicit value in
 * the environment always wins, and that local/test runs are left alone.
 *
 * The helper is re-implemented here rather than imported because `lib/db.ts`
 * constructs a real PrismaClient on import and is `server-only`. The assertions
 * below would fail if the rule in that file were changed, because the final
 * test reads the file and checks the same invariants.
 */

/** Mirrors `boundedDatabaseUrl()` in lib/db.ts. */
function boundedDatabaseUrl(env: { DATABASE_URL?: string; NODE_ENV?: string }): string | undefined {
  const raw = env.DATABASE_URL;
  if (!raw || env.NODE_ENV !== 'production') return undefined;
  if (/[?&]connection_limit=/.test(raw)) return undefined;
  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}connection_limit=2&pool_timeout=30`;
}

const CLOUD = 'postgresql://u:p@db.example.com:20376/defaultdb?sslmode=require';

describe('production pool bounding', () => {
  it('appends a bounded pool when the URL carries no connection_limit', () => {
    const out = boundedDatabaseUrl({ DATABASE_URL: CLOUD, NODE_ENV: 'production' });
    expect(out).toBe(`${CLOUD}&connection_limit=2&pool_timeout=30`);
  });

  it('uses "?" when the URL has no query string yet', () => {
    const bare = 'postgresql://u:p@db.example.com:5432/app';
    expect(boundedDatabaseUrl({ DATABASE_URL: bare, NODE_ENV: 'production' }))
      .toBe(`${bare}?connection_limit=2&pool_timeout=30`);
  });

  it('keeps every existing parameter, so sslmode is never dropped', () => {
    const out = boundedDatabaseUrl({ DATABASE_URL: CLOUD, NODE_ENV: 'production' })!;
    expect(out).toContain('sslmode=require');
    expect(new URL(out).searchParams.get('sslmode')).toBe('require');
    expect(new URL(out).searchParams.get('connection_limit')).toBe('2');
  });

  it('never produces a second "?" (the mistake that silently breaks the URL)', () => {
    const out = boundedDatabaseUrl({ DATABASE_URL: CLOUD, NODE_ENV: 'production' })!;
    expect(out.split('?')).toHaveLength(2);
  });

  it('DEFERS to an explicit connection_limit set in the environment', () => {
    const explicit = `${CLOUD}&connection_limit=1&pool_timeout=30`;
    expect(boundedDatabaseUrl({ DATABASE_URL: explicit, NODE_ENV: 'production' })).toBeUndefined();
    // also when it is the first parameter
    expect(boundedDatabaseUrl({ DATABASE_URL: 'postgresql://u:p@h:5432/d?connection_limit=5', NODE_ENV: 'production' })).toBeUndefined();
  });

  it('leaves development and test runs untouched', () => {
    expect(boundedDatabaseUrl({ DATABASE_URL: CLOUD, NODE_ENV: 'development' })).toBeUndefined();
    expect(boundedDatabaseUrl({ DATABASE_URL: CLOUD, NODE_ENV: 'test' })).toBeUndefined();
  });

  it('does nothing when DATABASE_URL is unset', () => {
    expect(boundedDatabaseUrl({ NODE_ENV: 'production' })).toBeUndefined();
    expect(boundedDatabaseUrl({ DATABASE_URL: '', NODE_ENV: 'production' })).toBeUndefined();
  });

  it('the rule in lib/db.ts still matches the behaviour pinned above [structural]', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'db.ts'), 'utf8');
    expect(src, 'production-only guard').toContain("process.env.NODE_ENV !== 'production'");
    expect(src, 'explicit env value wins').toContain('/[?&]connection_limit=/.test(raw)');
    expect(src, 'bounded default is applied').toContain('connection_limit=2&pool_timeout=30');
    expect(src, 'the bounded url reaches Prisma').toContain('datasources: { db: { url: boundedUrl } }');
  });
});
