# Batch 22 — Executive Summary

**Production Readiness Foundation & Operational Resilience** · 2026-11-04 · `main @ 6da137d` (unchanged; Batch 17–21 uncommitted work preserved).

## Approach
Audit-first. Two small, well-tested code improvements (auth failure-only counting + request correlation ids) plus production-readiness **assessments and owner checklists**. No deploy, no external service, no cloud/credential/migration/CSP-enforcement/upgrade/cleanup changes.

## Implemented (code)
1. **Auth resilience — failure-only counting (Stage 2).** Login now gates with a read-only `peek` **before** the bcrypt verify and `record`s a failure **only when authentication fails**; a successful login records nothing and resets both buckets. A legitimate user therefore never consumes their own rate-limit budget → materially fewer false lockouts, with no new DoS and fail-closed behavior preserved. Dual limits (per-IP+email 5/15 min, per-account 50/60 min) and enumeration-safety retained.
2. **Request correlation (Stage 3).** Added `newCorrelationId()` + `correlationIdFrom(headers)` (honors a safe inbound `x-request-id`/`x-correlation-id`, else mints a UUID; rejects unsafe tokens). Threaded a `cid` into the structured login / upload / CSP-violation logs. No dynamic-rendering change; Next's error `digest` is kept as the render-error correlation handle (not replaced).

## Assessed (documented, no code change)
- **Production configuration (Stage 4):** env validation, Aiven SSL, migration strategy, cookie security, R2, health/ready, hosting/CI, backup/rollback, secrets → concrete readiness checklist + owner actions (no secrets displayed).
- **CSP staging (Stage 5):** receiver (Batch 21) verified; staged nonce enforcement procedure + rollback; **stays report-only**; no static/ISR→dynamic conversion.
- **Media/images (Stage 6):** `next/image` feasibility + a benchmark plan (no blind switch; no measured gains invented).
- **Dependencies/repo (Stage 7):** advisories reassessed (no runtime-reachable critical/high); reversible major-upgrade + Vite-cleanup plans; nothing removed/upgraded.

## Verification (all green)
`tsc` ✅ · Prisma validate ✅ (no schema change) · **Vitest 406/406, 0 skipped** (48 files, +8) · build ✅ 57/57 · **Playwright + axe 45/45**.

## Files changed (2 added, 4 edited)
Added: `tests/batch22-auth.test.ts`, `docs/batches/batch-22/*`. Edited: `lib/auth/durableRateLimit.ts` (peek/record/deleteMany), `lib/logger.ts` (correlation helpers), `app/admin/auth-actions.ts` (failure-only + cid), `app/api/admin/media/upload/route.ts` + `app/api/csp-report/route.ts` (cid).

## Safety
Stayed on `main`; no commit/push/branch/deploy/external-service; no Aiven/R2/DNS/hosting/credential/schema/migration changes; no CSP enforcement; no dependency upgrade; no destructive cleanup; Batch 17–21 intact.
