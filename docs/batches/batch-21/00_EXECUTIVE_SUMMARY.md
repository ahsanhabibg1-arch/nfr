# Batch 21 — Executive Summary

**Security, Observability & Production Engineering** · 2026-11-04 · `main @ 6da137d` (unchanged; Batch 17–20 uncommitted work preserved).

## Approach
Audit-first. Fixed the two confirmed rate-limiter weaknesses from Batch 20, added first-party observability for CSP + security events, and assessed CSP/performance/deps/legacy-cleanup with no risky changes (no enforcing CSP, no major dependency upgrade, no file deletions, no schema/migration/cloud changes).

## Implemented (code)
1. **Rate-limiter fail-closed (Stage B)** — `checkDurableRateLimit` now returns `storageError` and **fails CLOSED** on a storage error (denies, not silently allows). Justified: the limiter shares the app Postgres, so its failure coincides with a DB outage during which login/upload cannot succeed anyway.
2. **Distributed per-account login limit (Stage B)** — login now enforces a second, IP-independent limit (`login-acct:<email>`, 50/60 min) alongside the per-IP+email limit (5/15 min), bounding distributed brute-force on one account. Both reset on success; generous threshold avoids locking out legitimate users (residual trade-off documented).
3. **Upload storage-failure handling (Stage B)** — media upload now returns **503** (transient) on limiter storage failure vs **429** on a real threshold hit.
4. **First-party CSP report receiver (Stage D)** — `app/api/csp-report/route.ts` (size-capped, schema-tolerant, sanitized logging, always 204, no DB writes); report-only CSP now carries `report-uri /api/csp-report/`.
5. **Structured operational logging (Stage C)** — login rate-limit, upload rate-limit/degraded, limiter storage errors, and CSP violations now log via the redacting `lib/logger.ts` with categories/fields (no secrets).

## Assessed (no code change — documented)
- **Observability (Stage C):** logger already redacts + supports `report()` with correlation id; external APM designed but **not connected** (approval-gated).
- **CSP enforcement (Stage D):** staged nonce rollout plan; **stays report-only**.
- **Performance (Stage E):** ISR/static tuning sound, no N+1, no measured regression → no change; `next/image` pass documented as future work.
- **Dependencies (Stage F):** re-audited; no prod-runtime critical/high; CI gate passes; major prisma/vitest upgrades deferred with a plan.
- **Legacy Vite cleanup (Stage G):** root Vite files are a **tracked, interdependent unit tied to the root workspace manifests** → deferred to an approval-gated plan (per the stop-for-approval rule); **nothing deleted**.

## Verification (all green)
`tsc` ✅ · Prisma validate ✅ (no schema change) · **Vitest 398/398, 0 skipped** (47 files, +6) · build ✅ 57/57 · **Playwright + axe 45/45** · CSP receiver live (204/oversized/malformed) · security headers + `report-uri` verified.

## Files changed (3 added, 3 edited)
Added: `app/api/csp-report/route.ts`, `tests/batch21-ratelimit.test.ts`, `docs/batches/batch-21/*`. Edited: `lib/auth/durableRateLimit.ts`, `app/admin/auth-actions.ts`, `app/api/admin/media/upload/route.ts`, `next.config.mjs`.

## Safety
Stayed on `main`; no commit/push/branch; no Aiven/R2/DNS/hosting/credential/schema/migration changes; no CSP enforcement; no dependency upgrade; no file deletions; Batch 17–20 intact.
