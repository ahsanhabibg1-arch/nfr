import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
type Limiter = typeof import('../lib/auth/durableRateLimit');

/**
 * Batch 21 §B — rate-limiter hardening: fail-closed on storage error, per-account
 * (cross-IP) limiting, concurrency, recovery, and no account-enumeration divergence.
 * DB cases use the ISOLATED test DB; the storage-failure case injects a throwing
 * client and needs no DB. Self-skips without DATABASE_URL.
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
const key = () => `test:b21:${Math.random().toString(36).slice(2, 10)}`;

suite('Batch 21 — rate-limiter hardening', () => {
  it('permits up to the limit then denies (no storageError on a real hit)', async () => {
    const k = key();
    for (let i = 0; i < 3; i++) {
      const r = await lim.checkDurableRateLimit(k, 3, 60_000);
      expect(r.allowed).toBe(true);
      expect(r.storageError).toBe(false);
    }
    const blocked = await lim.checkDurableRateLimit(k, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.storageError).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('per-account key is IP-independent: attempts accumulate across (simulated) IPs', async () => {
    // The login action keys the account limit as `login-acct:<email>` with NO IP, so
    // attempts from many IPs share one bucket. Here we drive that same key directly.
    const acct = `login-acct:${key()}@example.com`;
    for (let i = 0; i < 5; i++) expect((await lim.checkDurableRateLimit(acct, 5, 60_000)).allowed).toBe(true);
    expect((await lim.checkDurableRateLimit(acct, 5, 60_000)).allowed).toBe(false); // 6th across "all IPs" blocked
  });

  it('increments atomically under concurrency: exactly `limit` allowed', async () => {
    const k = key();
    const results = await Promise.all(Array.from({ length: 20 }, () => lim.checkDurableRateLimit(k, 5, 60_000)));
    expect(results.filter((r) => r.allowed).length).toBe(5);
  });

  it('FAILS CLOSED when storage errors (injected throwing client)', async () => {
    const throwing = { $queryRaw: () => Promise.reject(new Error('boom')) } as unknown as PrismaClient;
    const r = await lim.checkDurableRateLimit(key(), 5, 60_000, throwing);
    expect(r.allowed).toBe(false);        // denied, not silently allowed
    expect(r.storageError).toBe(true);    // caller can surface 503 / "unavailable"
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('recovers once storage works again (real client allows a fresh key)', async () => {
    const throwing = { $queryRaw: () => Promise.reject(new Error('boom')) } as unknown as PrismaClient;
    expect((await lim.checkDurableRateLimit(key(), 5, 60_000, throwing)).allowed).toBe(false);
    // Same code path, healthy client → allowed again.
    const r = await lim.checkDurableRateLimit(key(), 5, 60_000);
    expect(r.allowed).toBe(true);
    expect(r.storageError).toBe(false);
  });

  it('no account-enumeration divergence: unknown vs known-style keys behave identically', async () => {
    const a = await lim.checkDurableRateLimit(`login-acct:nobody-${key()}@example.com`, 50, 3_600_000);
    const b = await lim.checkDurableRateLimit(`login-acct:someone-${key()}@example.com`, 50, 3_600_000);
    expect(a.allowed).toBe(b.allowed); // limiter decision does not depend on whether the account exists
    expect(a.storageError).toBe(b.storageError);
  });
});
