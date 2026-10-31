/**
 * In-memory token-bucket rate limiter + rapid-duplicate suppression for the public
 * analytics ingest endpoint (Batch 07 §7/§17).
 *
 * LIMITATION (documented, §17): this is per-process state. On a multi-instance
 * deployment each instance keeps its own buckets, so the effective limit is
 * `instances × limit`. A shared backend (e.g. Redis) would be required for true
 * distributed rate limiting — NOT claimed here. Keys are transient and derived from
 * a hash that is never persisted; no raw IP is stored.
 */
interface Bucket {
  tokens: number;
  updated: number;
}

const buckets = new Map<string, Bucket>();
const dedup = new Map<string, number>();
const MAX_ENTRIES = 50_000;

export interface RateLimitOptions {
  capacity: number; // burst size
  refillPerSec: number; // sustained rate
}

function sweep(map: Map<string, number | Bucket>, maxAgeMs: number): void {
  if (map.size < MAX_ENTRIES) return;
  const cutoff = Date.now() - maxAgeMs;
  for (const [k, v] of map) {
    const ts = typeof v === 'number' ? v : v.updated;
    if (ts < cutoff) map.delete(k);
  }
}

/** Returns true when the action is ALLOWED, false when the bucket is exhausted. */
export function rateLimit(key: string, opts: RateLimitOptions): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: opts.capacity, updated: now };
  const elapsedSec = (now - b.updated) / 1000;
  b.tokens = Math.min(opts.capacity, b.tokens + elapsedSec * opts.refillPerSec);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  sweep(buckets, 60 * 60 * 1000);
  return true;
}

/** True when `signature` was seen within `windowMs` (a rapid duplicate to drop). */
export function isDuplicate(signature: string, windowMs: number): boolean {
  const now = Date.now();
  const prev = dedup.get(signature);
  dedup.set(signature, now);
  sweep(dedup, windowMs * 4);
  return prev !== undefined && now - prev < windowMs;
}

/** Test-only reset of the shared in-memory state. */
export function __resetRateLimiterForTests(): void {
  buckets.clear();
  dedup.clear();
}
