# Batch 23 §4.1 — Security & Authentication Audit

## Confirmed finding → fixed: rate-limit ceiling not strictly enforced under concurrency
Batch 22 moved the login gate to a **read-only `peek` → verify → `record` (failure-only)** split. Audit of that path found two ways the intended ceiling could be undermined:

1. **TOCTOU concurrency bypass.** `peek` does not increment. A burst of N parallel login requests arriving when a bucket is just under its limit all read "allowed", all proceed to `verifyPassword`, and all record afterwards — so the effective ceiling is exceeded by the concurrency burst (and N bcrypt verifies run).
2. **Failed-record fail-open.** `recordDurableRateLimitFailure` swallows storage errors (best-effort). If recording fails during a storage blip, the failed attempt is **not counted**, so the attacker is not throttled — the opposite of the intended fail-closed posture.

### Fix (`app/admin/auth-actions.ts`)
Reverted the login gate to the **atomic `checkDurableRateLimit` (check-and-increment)** performed **before** the bcrypt verify, for both the per-IP+email (5/15 min) and per-account (50/60 min) buckets:
- Counting is a single atomic SQL statement → **concurrency-safe**: a burst cannot exceed the ceiling (proven below: 5 of 50 parallel admitted).
- A storage error at the gate returns `storageError` → the attempt is **refused** (fail closed, generic "temporarily unavailable", no enumeration).
- A **successful** login still **resets** both buckets, so a legitimate user's own successful attempts never accumulate.
- Failed attempts stay counted until the window rolls over.

The `peek`/`record` primitives remain exported, tested utilities but are no longer on the login critical path.

### Regression tests — `tests/batch23-auth.test.ts` (3, pass)
- **Burst of 50 concurrent attempts, limit 5 → exactly 5 allowed, 45 denied** (ceiling strictly enforced).
- A successful login (reset) leaves the budget full (no accumulation).
- Gate fails closed on injected storage error (`allowed:false, storageError:true`).
Plus `batch21-ratelimit.test.ts` (atomic concurrency, cross-IP account, recovery) and `batch22-auth.test.ts` (peek/record utilities + correlation id) remain green.

## Other auth controls (verified secure — unchanged)
| Control | Status |
|---------|--------|
| Session auth (SHA-256 token, HttpOnly/Secure-prod/SameSite=Lax, expiry, suspended-user check) | ✅ |
| Logout revokes server session + clears cookie | ✅ |
| RBAC default-deny (`requireActor`) + audit log on every mutation | ✅ |
| Admin route gate (`requireUser` → redirect to login) | ✅ |
| Upload: RBAC + durable rate limit (429 threshold / 503 storage) + size cap + MIME/signature re-check | ✅ |
| Unauthorized API access → 401/403 | ✅ |
| Fail-closed limiter + per-account distributed-brute-force cap | ✅ |
| Generic login messages (no account enumeration) | ✅ |

## Residual (documented, not a new regression)
- **Attacker-driven account lockout** — any account-based failure cap can, in theory, be filled by an attacker to block a victim (bounded at 50/hr; the per-IP cap also throttles). The long-term control is **CAPTCHA / exponential backoff after N global failures** (approval-gated; recommended Batch 24). Not a DoS introduced by Batch 23 — the atomic gate strictly *reduces* the attack surface vs the Batch 22 peek path.
