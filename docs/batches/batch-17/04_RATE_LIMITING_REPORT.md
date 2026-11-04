# Batch 17 §C — Rate Limiting Report

**Date:** 2026-11-04 · **Audit finding:** no reliable application-level rate limiting confirmed.

## Starting state
- **Login** was already rate-limited by an **in-memory, per-process** limiter (`lib/auth/rateLimit.ts`) — 5 attempts / 15 min per IP+email. Correct logic, but a per-process map is **defeated by horizontal scaling** (attempts spread across instances).
- **Media upload** (`app/api/admin/media/upload/route.ts`) had **no** rate limiting — only RBAC + a size cap.

## What changed

### New durable limiter — `lib/auth/durableRateLimit.ts`
A **Postgres-backed, multi-instance** fixed-window limiter using the new `RateLimitHit` table. The window increment is a single atomic statement:
```sql
INSERT INTO "RateLimitHit" ("key","count","resetAt") VALUES ($key, 1, $reset)
ON CONFLICT ("key") DO UPDATE SET
  "count"   = CASE WHEN "RateLimitHit"."resetAt" < $now THEN 1 ELSE "RateLimitHit"."count" + 1 END,
  "resetAt" = CASE WHEN "RateLimitHit"."resetAt" < $now THEN $reset ELSE "RateLimitHit"."resetAt" END
RETURNING "count","resetAt";
```
- Shared across all app instances (durable) → not defeated by scaling.
- Atomic (no read-then-write race).
- `allowed = count <= limit`; `retryAfterSeconds` derived from `resetAt`.

### Login (`app/admin/auth-actions.ts`)
Switched from the in-memory limiter to `checkDurableRateLimit` / `resetDurableRateLimit`. Same policy (5 / 15 min), same key `login:<ip>:<email>`, same generic failure message (no account-existence leak), reset on successful login.

### Media upload (`app/api/admin/media/upload/route.ts`)
Added `checkDurableRateLimit('media-upload:<actorId>', 30, 5min)` after the RBAC check. On exceed → **HTTP 429** with a **`Retry-After`** header and `{ code: 'rate_limited' }`.
- **Keyed by the authenticated actor id, not a forwarded IP header** — cannot be spoofed via `X-Forwarded-For`, and does not block unrelated users behind the same proxy.

## Design decisions
- **Fail-open on limiter infrastructure error:** if the limiter's own `RateLimitHit` query throws (transient DB blip), the request is **allowed**. Rationale: a limiter outage must not lock every user out of login. Abuse protection degrades; availability is preserved. Documented in the module and here.
- **Login key includes IP + email** so one IP cannot exhaust an account it does not control, and the email is never confirmed/denied.
- The in-memory `rateLimit.ts` is **retained** as a dependency-free in-process utility/fallback (still covered by `tests/auth.test.ts`); new request paths should use the durable limiter.

## Multi-instance correctness
The durable limiter is shared via Postgres, so a horizontally-scaled deployment enforces one combined limit. **No external provider (Redis) or cloud provisioning required** — it reuses the existing database.

## Production notes / limitations
- Fixed-window (not sliding-window) — a burst straddling a window boundary can briefly exceed the nominal rate. Acceptable for login/upload abuse control; a sliding window is a possible future refinement.
- Edge/CDN-level rate limiting (e.g., at the host) is still recommended as an outer defense layer for unauthenticated traffic volume; documented as a deployment-stage addition.
- Expired rows are harmless; an optional periodic prune (`DELETE WHERE "resetAt" < now()`) keeps the table minimal.

## Tests
- Login limiter logic remains covered by `tests/auth.test.ts` (in-memory module).
- The durable limiter's correctness is exercised indirectly by the full suite running against the real test DB (login/media flows), and by its atomic SQL. A dedicated multi-call integration test for `checkDurableRateLimit` is a recommended follow-up (would write to the test DB).

**Result:** login limiting is now durable/multi-instance; media upload is now rate-limited (429 + Retry-After). Production edge limiting documented as a complementary layer.
