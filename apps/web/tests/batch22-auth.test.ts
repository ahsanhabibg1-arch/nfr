import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { newCorrelationId, correlationIdFrom } from '../lib/logger';
type Limiter = typeof import('../lib/auth/durableRateLimit');

/**
 * Batch 22 §2/§3 — failure-only limiter (peek + record) and request-correlation helper.
 */
describe('Batch 22 — correlation id helper', () => {
  it('mints a non-empty id and accepts a safe inbound header', () => {
    expect(newCorrelationId()).toMatch(/[0-9a-f-]{10,}/i);
    const h = (val: string | null) => ({ get: (n: string) => (n === 'x-request-id' ? val : null) });
    expect(correlationIdFrom(h('abc-123_DEF'))).toBe('abc-123_DEF'); // safe token passed through
  });
  it('rejects unsafe/oversized header values and mints its own', () => {
    const bad = 'x'.repeat(100) + ' <script>';
    const h = { get: () => bad };
    const out = correlationIdFrom(h);
    expect(out).not.toBe(bad);
    expect(out).toMatch(/[0-9a-f-]{10,}/i);
  });
  it('mints when no header present', () => {
    expect(correlationIdFrom({ get: () => null })).toMatch(/[0-9a-f-]{10,}/i);
    expect(correlationIdFrom(null)).toMatch(/[0-9a-f-]{10,}/i);
  });
});

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
const key = () => `test:b22:${Math.random().toString(36).slice(2, 10)}`;

suite('Batch 22 — failure-only limiter (peek + record)', () => {
  it('peek does NOT increment — repeated peeks stay allowed', async () => {
    const k = key();
    for (let i = 0; i < 10; i++) expect((await lim.peekDurableRateLimit(k, 3)).allowed).toBe(true);
  });

  it('records failures; peek denies once the limit is reached', async () => {
    const k = key();
    for (let i = 0; i < 3; i++) {
      expect((await lim.peekDurableRateLimit(k, 3)).allowed).toBe(true); // still room
      await lim.recordDurableRateLimitFailure(k, 60_000);               // a failure occurred
    }
    const blocked = await lim.peekDurableRateLimit(k, 3);
    expect(blocked.allowed).toBe(false); // 3 recorded failures → denied
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('reset clears recorded failures (successful login path)', async () => {
    const k = key();
    for (let i = 0; i < 3; i++) await lim.recordDurableRateLimitFailure(k, 60_000);
    expect((await lim.peekDurableRateLimit(k, 3)).allowed).toBe(false);
    await lim.resetDurableRateLimit(k);
    expect((await lim.peekDurableRateLimit(k, 3)).allowed).toBe(true);
  });

  it('peek FAILS CLOSED on storage error (injected throwing client)', async () => {
    const throwing = { $queryRaw: () => Promise.reject(new Error('boom')) } as unknown as PrismaClient;
    const r = await lim.peekDurableRateLimit(key(), 5, throwing);
    expect(r.allowed).toBe(false);
    expect(r.storageError).toBe(true);
  });

  it('a successful login consumes no budget (no record on success is simulated by reset)', async () => {
    // Model: gate passes → verify ok → reset (no record). Budget must remain full afterwards.
    const k = key();
    expect((await lim.peekDurableRateLimit(k, 5)).allowed).toBe(true);
    await lim.resetDurableRateLimit(k); // success path
    for (let i = 0; i < 4; i++) expect((await lim.peekDurableRateLimit(k, 5)).allowed).toBe(true);
  });
});
