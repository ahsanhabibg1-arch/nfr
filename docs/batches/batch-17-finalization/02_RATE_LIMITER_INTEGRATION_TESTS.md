# Finalization §5 — Durable Rate Limiter Integration Tests

## New suite: `tests/batch17-ratelimit.test.ts` (isolated test DB, 5 cases — all pass)
1. **Allow then deny** — first attempt and up to the limit allowed; next denied with `retryAfterSeconds > 0`.
2. **Rollover after expiry** — a consumed short window is allowed again after a generous wait (deterministic; deny-within-window is covered by the long-window cases).
3. **Atomic concurrency** — 20 parallel `checkDurableRateLimit` calls against one key with limit 5 → **exactly 5 allowed** (no double-allow).
4. **Reset helper** — `resetDurableRateLimit` clears a bucket; a previously-blocked key is allowed again.
5. **Retry-After bound** — when denied, `retryAfterSeconds` is in `(0, window]`.

## Real bug found and fixed
The first full run failed `retryAfterSeconds` with **21660s** (≈6h) for a 60s window. Root cause: the `RateLimitHit.resetAt` column is `timestamp(3)` (tz-naive); reading it back into a JS `Date` and subtracting `Date.now()` added the local **UTC+6** offset. This would have inflated the login "try again in N minutes" message and the upload `Retry-After` header in production.

**Fix (`lib/auth/durableRateLimit.ts`):** all time math now runs on the **database clock** (`now()`) inside the SQL — store (`now() + interval`), compare (`resetAt < now()`), and compute remaining (`EXTRACT(EPOCH FROM (resetAt - now()))`). No JS timestamp crosses the tz boundary, so offsets cancel. Re-verified: all 5 cases pass; retry-after now bounded by the window.

## Login/upload wiring (verified by inspection + live smoke)
- **Login** (`auth-actions.ts`): `checkDurableRateLimit('login:<ip>:<email>', 5, 15min)`; generic failure message (no account enumeration); `resetDurableRateLimit` on success.
- **Upload** (`api/admin/media/upload/route.ts`): `checkDurableRateLimit('media-upload:<actorId>', 30, 5min)` → 429 + `Retry-After`. Keyed by **authenticated actor id**, never a forwarded header → no spoofing, no shared-proxy collateral.
- Fail-open on limiter storage error (availability over strictness) — documented.

## Fail-open test note
A forced storage-failure test was **not** added (would require mocking the shared Prisma client mid-suite). Fail-open is verified by code inspection: the `try/catch` returns `{ allowed: true }` on any query error, logged via the redacting logger. Marked as inspection-verified, not integration-tested.

## Distributed brute-force finding (documented, see §3 report)
The login key `login:<ip>:<email>` is per IP+email. An attacker controlling many IPs can still attempt many passwords against **one** email (each IP+email bucket is separate). A per-email (IP-independent) throttle would mitigate this but introduces a **victim-lockout DoS** vector, so it is **documented as a recommended, carefully-designed follow-up** (e.g., account-level exponential backoff or CAPTCHA after N global failures) rather than implemented blindly here.
