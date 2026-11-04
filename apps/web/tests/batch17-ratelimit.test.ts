import { describe, it, expect, beforeAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
type Limiter = typeof import('../lib/auth/durableRateLimit');

/**
 * Batch 17 finalization §5 — durable rate limiter integration.
 * Exercises the Postgres-backed fixed-window limiter against the ISOLATED test DB:
 * allow → threshold → exceed → window reset → atomic concurrent increments →
 * Retry-After → reset helper. Self-skips without DATABASE_URL.
 */
let available = false;
let prisma: PrismaClient;
let lim: Limiter;

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    lim = await import('../lib/auth/durableRateLimit');
    available = true;
  } catch { available = false; }
}
const suite = available ? describe : describe.skip;
const key = () => `test:rl:${Math.random().toString(36).slice(2, 10)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

suite('Batch 17 — durable rate limiter', () => {
  it('allows the first attempt and up to the limit, then denies', async () => {
    const k = key();
    for (let i = 1; i <= 5; i++) {
      const r = await lim.checkDurableRateLimit(k, 5, 60_000);
      expect(r.allowed).toBe(true);
    }
    const blocked = await lim.checkDurableRateLimit(k, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('rolls over to a fresh window after expiry', async () => {
    // Deny-within-window is covered deterministically by the long-window tests above;
    // here we isolate the rollover behavior with a short window + a generous wait so it
    // is not sensitive to how long the DB round-trips take under load.
    const k = key();
    const first = await lim.checkDurableRateLimit(k, 1, 80); // consume the single slot
    expect(first.allowed).toBe(true);
    await sleep(400); // comfortably past the 80ms window
    const afterExpiry = await lim.checkDurableRateLimit(k, 1, 80);
    expect(afterExpiry.allowed).toBe(true); // window rolled over → allowed again
  });

  it('increments atomically under concurrency: exactly `limit` allowed', async () => {
    const k = key();
    const limit = 5;
    const results = await Promise.all(Array.from({ length: 20 }, () => lim.checkDurableRateLimit(k, limit, 60_000)));
    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(limit); // no double-allow despite 20 concurrent calls
  });

  it('reset helper clears the bucket', async () => {
    const k = key();
    for (let i = 0; i < 5; i++) await lim.checkDurableRateLimit(k, 5, 60_000);
    expect((await lim.checkDurableRateLimit(k, 5, 60_000)).allowed).toBe(false);
    await lim.resetDurableRateLimit(k);
    expect((await lim.checkDurableRateLimit(k, 5, 60_000)).allowed).toBe(true);
  });

  it('retryAfterSeconds reflects the remaining window', async () => {
    const k = key();
    for (let i = 0; i < 2; i++) await lim.checkDurableRateLimit(k, 2, 60_000);
    const r = await lim.checkDurableRateLimit(k, 2, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
