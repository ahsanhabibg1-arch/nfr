# Batch 22 §2 — Authentication Resilience

## Residual trade-off addressed
Batch 21's dual limiter incremented on **every** login attempt (before the password check). That meant a legitimate user's own attempts, and even successful logins, consumed budget — and the per-account cap could be filled by non-malicious traffic. The victim-lockout concern was documented but not reduced.

## Change — failure-only counting (peek → verify → record)
`lib/auth/durableRateLimit.ts` gains two read/write-split primitives (reusing the `RateLimitHit` table; **no schema change**):
- `peekDurableRateLimit(key, limit)` — read-only SELECT (active window only), **no increment**; `allowed = failures < limit`; **fails closed** on storage error.
- `recordDurableRateLimitFailure(key, windowMs)` — the atomic upsert increment; best-effort (logged, not thrown, on error).

`app/admin/auth-actions.ts` new flow:
1. `peek` both buckets (per-IP+email 5, per-account 50) — **before** the expensive bcrypt verify, so an attacker cannot force CPU work past the limit.
2. `storageError` on either → fail closed, generic "temporarily unavailable" (no enumeration).
3. Over limit → generic "Too many attempts…".
4. Look up user + verify password.
5. **Failure** → `record` a failure on both buckets + `log.warn('auth.login.failed', {cid})` → generic "Invalid email or password."
6. **Success** → `reset` both buckets; no failure recorded.

### Why this reduces risk without a new DoS
- A legitimate user's **successful** logins never consume budget and reset it — their own activity can't lock them out.
- The limits now purely track **failed** attempts, which is exactly the brute-force signal.
- The gate is still **before** bcrypt (peek is a cheap indexed SELECT), so no CPU-exhaustion vector is introduced.
- Fail-closed is preserved on both peek and the (best-effort) record.

### Evaluated, NOT implemented (documented)
- **Progressive backoff:** server-side delay on a Server Action is awkward and risks tying up server resources; the fixed-window retry already communicates a wait. Deferred.
- **CAPTCHA:** connecting a provider is explicitly out of scope / needs approval. Recommended as the real long-term answer to the *attacker-driven* account-failure lockout (which any account-based failure limit shares) — Batch 23 candidate.
- **Account vs IP thresholds:** kept the dual design (tight per-IP 5/15 min; generous per-account 50/60 min) — the generous account cap plus failure-only counting makes legitimate lockout very unlikely.

## Accessibility & enumeration
- All three outcomes (invalid / too-many / temporarily-unavailable) are plain text messages surfaced in the existing accessible login form; no new interactive element.
- The "temporarily unavailable" and "too many" messages are returned **before** the user lookup (or without revealing it), so they never disclose whether an account exists.

## Tests — `tests/batch22-auth.test.ts` (failure-only suite)
- `peek` does not increment (10 peeks stay allowed).
- Record then peek-denies once failures reach the limit; retry-after > 0.
- Reset clears recorded failures (success path).
- `peek` fails closed on injected storage error.
- Successful-login model (peek-allowed → reset) leaves the budget full.
Existing `batch21-ratelimit.test.ts` (check-and-increment for uploads) and `auth.test.ts` remain green.

## Availability during storage failure
Unchanged policy: fail closed. The limiter shares the app Postgres, so a storage failure coincides with login being impossible anyway; a 30 s retry self-heals.
