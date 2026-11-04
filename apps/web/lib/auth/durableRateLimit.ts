import 'server-only';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../db';
import { report } from '../logger';

/**
 * Durable, multi-instance fixed-window rate limiter (Batch 17 §C; hardened Batch 21 §B).
 *
 * Backed by the `RateLimitHit` table so the limit is shared across every app
 * instance. All time math runs on the DATABASE clock (`now()`) so a tz-naive
 * column round-trip can't skew the remaining-seconds calc.
 *
 * FAIL-CLOSED policy (Batch 21): if the limiter's storage errors, the request is
 * DENIED (`allowed:false, storageError:true`) rather than allowed. Rationale: the
 * limiter shares the application Postgres, so a limiter failure coincides with a
 * database outage during which login/upload cannot succeed anyway — failing open
 * would only remove abuse protection without restoring availability. Callers
 * inspect `storageError` to return a 503 / "temporarily unavailable" rather than a
 * 429, and the error is logged (redacted) for operators. A short retry keeps the
 * outage self-healing once storage recovers.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  /** True when the decision came from a storage failure (fail-closed), not a real threshold hit. */
  storageError: boolean;
}

const FAIL_CLOSED_RETRY_SECONDS = 30;

export async function checkDurableRateLimit(
  key: string,
  limit = 5,
  windowMs = 15 * 60 * 1000,
  client: Pick<PrismaClient, '$queryRaw'> = prisma,
): Promise<RateLimitResult> {
  try {
    const windowSql = Prisma.sql`(${windowMs}::double precision * interval '1 millisecond')`;
    const rows = await client.$queryRaw<{ count: number; retry: number }[]>`
      INSERT INTO "RateLimitHit" ("key", "count", "resetAt")
      VALUES (${key}, 1, now() + ${windowSql})
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "RateLimitHit"."resetAt" < now() THEN 1 ELSE "RateLimitHit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitHit"."resetAt" < now() THEN now() + ${windowSql} ELSE "RateLimitHit"."resetAt" END
      RETURNING "count"::int AS count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetAt" - now()))))::int AS retry;`;
    const row = rows[0];
    if (!row) return { allowed: true, retryAfterSeconds: 0, storageError: false };
    const count = Number(row.count);
    const allowed = count <= limit;
    return { allowed, retryAfterSeconds: allowed ? 0 : Number(row.retry), storageError: false };
  } catch (e) {
    // Fail CLOSED: do not grant the request when we cannot account for it.
    report('database', e, { fields: { scope: 'rate-limit', keyPrefix: key.split(':')[0] } });
    return { allowed: false, retryAfterSeconds: FAIL_CLOSED_RETRY_SECONDS, storageError: true };
  }
}

/**
 * Read-only "peek" (Batch 22 §2): report whether `key` is at/over `limit` WITHOUT
 * incrementing. Used to gate login BEFORE the expensive bcrypt verify, so counting can
 * be moved to failures only (see `recordDurableRateLimitFailure`). Fails CLOSED on a
 * storage error (same rationale as `checkDurableRateLimit`). A row whose window has
 * expired counts as zero.
 */
export async function peekDurableRateLimit(
  key: string,
  limit = 5,
  client: Pick<PrismaClient, '$queryRaw'> = prisma,
): Promise<RateLimitResult> {
  try {
    const rows = await client.$queryRaw<{ count: number; retry: number }[]>`
      SELECT "count"::int AS count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetAt" - now()))))::int AS retry
      FROM "RateLimitHit" WHERE "key" = ${key} AND "resetAt" > now();`;
    const row = rows[0];
    if (!row) return { allowed: true, retryAfterSeconds: 0, storageError: false };
    const count = Number(row.count);
    const allowed = count < limit; // deny once recorded failures have reached the limit
    return { allowed, retryAfterSeconds: allowed ? 0 : Number(row.retry), storageError: false };
  } catch (e) {
    report('database', e, { fields: { scope: 'rate-limit-peek', keyPrefix: key.split(':')[0] } });
    return { allowed: false, retryAfterSeconds: FAIL_CLOSED_RETRY_SECONDS, storageError: true };
  }
}

/**
 * Record one failure against `key` within its fixed window (Batch 22 §2). Best-effort:
 * a storage error is logged, not thrown — the deny decision was already made by `peek`.
 */
export async function recordDurableRateLimitFailure(
  key: string,
  windowMs = 15 * 60 * 1000,
  client: Pick<PrismaClient, '$queryRaw'> = prisma,
): Promise<void> {
  try {
    const windowSql = Prisma.sql`(${windowMs}::double precision * interval '1 millisecond')`;
    await client.$queryRaw`
      INSERT INTO "RateLimitHit" ("key", "count", "resetAt")
      VALUES (${key}, 1, now() + ${windowSql})
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "RateLimitHit"."resetAt" < now() THEN 1 ELSE "RateLimitHit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitHit"."resetAt" < now() THEN now() + ${windowSql} ELSE "RateLimitHit"."resetAt" END;`;
  } catch (e) {
    report('database', e, { fields: { scope: 'rate-limit-record', keyPrefix: key.split(':')[0] } });
  }
}

/** Clear a bucket after a legitimate success (e.g. a correct login). Best-effort. */
export async function resetDurableRateLimit(key: string, client: Pick<PrismaClient, 'rateLimitHit'> = prisma): Promise<void> {
  try {
    // deleteMany (not delete) so clearing an absent bucket is a no-op, not a P2025 throw.
    await client.rateLimitHit.deleteMany({ where: { key } });
  } catch {
    /* transient error — reset is best-effort */
  }
}
