import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
type Limiter = typeof import('../lib/auth/durableRateLimit');

/**
 * Batch 23 §4.1 — login gate uses the ATOMIC check-and-increment so the rate-limit
 * ceiling is strictly enforced under concurrency (no peek→record TOCTOU bypass) and
 * fails closed on storage error, while a successful login (reset) never accumulates.
 * Self-skips without DATABASE_URL (isolated test DB only).
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
const key = () => `test:b23:${Math.random().toString(36).slice(2, 10)}`;

suite('Batch 23 — login gate concurrency ceiling', () => {
  it('a burst of concurrent attempts cannot exceed the ceiling', async () => {
    const k = key();
    // 50 parallel attempts, limit 5 → the atomic gate admits EXACTLY 5 (a read-only peek
    // would have let many more through before any increment landed).
    const results = await Promise.all(Array.from({ length: 50 }, () => lim.checkDurableRateLimit(k, 5, 60_000)));
    expect(results.filter((r) => r.allowed).length).toBe(5);
    expect(results.filter((r) => !r.allowed).length).toBe(45);
  });

  it('a successful login (reset) does not accumulate toward the ceiling', async () => {
    const k = key();
    // model a legitimate login: gate passes (counts 1) → verify ok → reset.
    expect((await lim.checkDurableRateLimit(k, 5, 60_000)).allowed).toBe(true);
    await lim.resetDurableRateLimit(k);
    // budget is full again after success.
    for (let i = 0; i < 5; i++) expect((await lim.checkDurableRateLimit(k, 5, 60_000)).allowed).toBe(true);
  });

  it('gate fails closed when limiter storage errors', async () => {
    const throwing = { $queryRaw: () => Promise.reject(new Error('boom')) } as unknown as PrismaClient;
    const r = await lim.checkDurableRateLimit(key(), 5, 60_000, throwing);
    expect(r.allowed).toBe(false);
    expect(r.storageError).toBe(true);
  });
});
