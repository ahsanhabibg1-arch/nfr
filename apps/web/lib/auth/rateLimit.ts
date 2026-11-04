import 'server-only';

/**
 * Minimal in-memory fixed-window rate limiter (Batch 03 §3). Per-process only.
 *
 * As of Batch 17 the login and media-upload hot paths use the DURABLE,
 * multi-instance limiter in `durableRateLimit.ts` (Postgres-backed) instead of
 * this one, so abuse protection survives horizontal scaling. This module is
 * retained as a dependency-free in-process utility/fallback and remains covered by
 * tests/auth.test.ts. Prefer `checkDurableRateLimit` for any new request path.
 */
type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();

export function checkRateLimit(
  key: string,
  limit = 5,
  windowMs = 15 * 60 * 1000,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
