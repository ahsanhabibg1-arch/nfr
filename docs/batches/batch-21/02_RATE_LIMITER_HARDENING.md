# Batch 21 §B — Rate-Limiter Hardening

## Change 1 — Fail CLOSED on storage error
`lib/auth/durableRateLimit.ts`:
- `checkDurableRateLimit` now returns `{ allowed, retryAfterSeconds, storageError }`.
- On a storage exception it returns `{ allowed: false, retryAfterSeconds: 30, storageError: true }` (was `allowed:true`) and logs via `report('database', …)` (redacted, key prefix only).
- **Rationale:** the limiter shares the application Postgres. A limiter failure coincides with a DB outage during which `prisma.user.findUnique` / `uploadMedia` also fail — so failing open removes abuse protection *without* restoring availability. Failing closed denies cleanly; the 30 s retry makes it self-healing once storage recovers.
- Added an injectable `client` param (default `prisma`) so the failure path is unit-testable without a DOM/outage.

## Change 2 — Per-account (cross-IP) login limit
`app/admin/auth-actions.ts` now runs **two** durable limits in parallel:
| Key | Limit | Window | Purpose |
|-----|-------|--------|---------|
| `login:<ip>:<email>` | 5 | 15 min | single-source brute force; one IP can't lock an account it doesn't own |
| `login-acct:<email>` | 50 | 60 min | **distributed** brute force on one account across many IPs |
- Either limit tripping → generic "Too many attempts…" with the larger retry.
- Either limit reporting `storageError` → generic **"Service temporarily unavailable"** (fail-closed; checked **before** the user lookup, so no account enumeration).
- Both buckets reset on a successful login.
- Uses the existing `RateLimitHit` table — **no schema change**.

### Residual trade-off (documented, not silently accepted)
A per-account limit introduces a theoretical **victim-lockout DoS**: an attacker could deliberately spend the 50/hour account budget to block a legitimate login. The threshold is deliberately generous (a real user almost never fails 50×/hour), and the per-IP+email limit already throttles any single source. The robust long-term control is a **CAPTCHA / exponential backoff after N global failures** (recommended for Batch 22) rather than a hard account lockout. We chose a bounded ceiling over an easy lockout.

## Change 3 — Upload storage-failure response
`app/api/admin/media/upload/route.ts`: on `!allowed`, a `storageError` now returns **503** ("temporarily unavailable", `Retry-After`) and logs `media.upload.limiter_degraded`; a genuine threshold hit returns **429** (`media.upload.rate_limited`). Keeps protection without misreporting a transient outage as abuse.

## Tests — `tests/batch21-ratelimit.test.ts` (6, all pass)
1. Permit-to-limit then deny; `storageError=false` on real hits.
2. **Per-account key is IP-independent** — attempts accumulate across simulated IPs; blocked past the limit.
3. Atomic under concurrency — exactly `limit` allowed of 20 parallel.
4. **Fails closed on storage error** (injected throwing client → `allowed:false, storageError:true, retry>0`).
5. **Recovery** — healthy client allows a fresh key after a prior storage-error call.
6. **No account-enumeration divergence** — unknown vs known-style account keys behave identically.

Existing `batch17-ratelimit.test.ts` (window/threshold/reset/retry) still passes with the extended return shape (backward-compatible `.allowed`/`.retryAfterSeconds`).

## No schema change
All limiting reuses the Batch 17 `RateLimitHit` table with additional key namespaces. No migration proposed.
