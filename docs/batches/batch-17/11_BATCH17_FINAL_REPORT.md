# Batch 17 — Final Report

Answers the Batch 17 prompt §14 delivery format. **Date:** 2026-11-04.

## 1. Git state
- **Start:** `main @ 6da137d` (clean).
- **End:** `main @ 6da137d` — **nothing committed or pushed** (stop rule). Working tree now carries Batch 17 changes (uncommitted), ready for owner review.

## 2. Change summary
**Modified (10):**
`apps/web/prisma/schema.prisma`, `apps/web/lib/cms/competitionService.ts`, `apps/web/app/admin/competition-actions.ts`, `apps/web/views/admin/AdminCompetitionPage.tsx`, `apps/web/next.config.mjs`, `apps/web/app/admin/auth-actions.ts`, `apps/web/app/api/admin/media/upload/route.ts`, `apps/web/lib/auth/rateLimit.ts`, `apps/web/components/SiteHeader.tsx`, `KNOWN_LIMITATIONS.md`.
**New (6):**
`apps/web/lib/auth/durableRateLimit.ts`, `apps/web/prisma/migrations/20261104120000_batch17_hardening/migration.sql`, `apps/web/tests/batch17-concurrency.test.ts`, `apps/web/tests/batch17-sanitization.test.ts`, `docs/batches/batch-17/` (12 reports), `docs/audits/2026-11-04-full-project-audit/` (prior audit, already present).
~185 insertions / ~40 deletions across code (docs excluded).

## 3. Prisma migration + safety
`20261104120000_batch17_hardening` — **additive**: `ADD COLUMN version` ×3 (default 1) + `CREATE TABLE RateLimitHit`. Backward/forward-compatible, zero-downtime. Applied **only** to disposable `nfrguide_test` (clean on existing 12 + data). NOT applied to dev/Aiven. See report 02.

## 4. Competition concurrency verification
Atomic version-guarded `updateMany`; conflict on stale version; correction lineage intact. `tests/batch17-concurrency.test.ts` 8/8 pass (incl. concurrent-editors race → exactly one wins). See report 01.

## 5. CSP / HSTS
`Content-Security-Policy-Report-Only` added (non-blocking); all existing headers retained; HSTS `preload` intentionally not enabled. Report 03.

## 6. Rate-limiting architecture + tests
Durable Postgres-backed fixed-window limiter (`RateLimitHit`); login (5/15min, IP+email) + media upload (30/5min per user id, 429+Retry-After). Fail-open on storage error. Multi-instance correct, no external provider. Login still covered by `auth.test.ts`. Report 04.

## 7. Sanitization findings
No vulnerability — structured-block body rendered as escaped React children, `safeHref` allowlist blocks `javascript:`/`data:`/`vbscript:`, JSON-LD escaped. Locked by `tests/batch17-sanitization.test.ts` (5/5). Report 05.

## 8. Dependency audit findings
`npm audit`: 6 total (2 critical, 3 high, 1 moderate). **No production-runtime-reachable critical/high** — criticals are dev-only (`vitest`→`tinypool`); highs are Prisma-CLI build-time (`@prisma/config`→`deepmerge-ts`). No `audit fix`. Proposed CI gate: `npm audit --omit=dev --audit-level=critical`. Report 06.

## 9. Responsive QA findings
Overflow root cause = desktop site header (lg-breakpoint 5-link nav in all-`shrink-0` row). Fixed in `SiteHeader.tsx`; re-verified OK at 360/390/768/1024/1280/1366/1440 with the clamp neutralized. Report 07.

## 10. Full test results
`REQUIRE_DB_TESTS=1 vitest run` → **42 files, 378 tests, 378 passed, 0 failed, 0 skipped** (isolated test DB). Report 08.

## 11. Build result
`next build` → compiled successfully, 57/57 static pages, exit 0 (test DB, local media).

## 12. Playwright / axe result
Targeted Playwright overflow probe executed (chromium installed). **Full `playwright test` e2e + axe suite NOT executed** in this batch (runs in CI). Disclosed, not claimed.

## 13. CI status
CI config unchanged and intact. **No live CI run executed** (nothing pushed). Recommend relying on CI post-commit; optionally add the dependency-audit gate.

## 14. Remaining risks
CSP report-only (not enforcing); limiter fails open; fixed-window; global `overflow-x:hidden` retained as backstop. Full list + out-of-scope P0/P1/P2 in report 10.

## 15. Documentation files created (`docs/batches/batch-17/`)
`00_BATCH17_EXECUTIVE_SUMMARY.md`, `01_COMPETITION_CONCURRENCY_REPORT.md`, `02_DATABASE_MIGRATION_SAFETY_REPORT.md`, `03_CSP_AND_SECURITY_HEADERS_REPORT.md`, `04_RATE_LIMITING_REPORT.md`, `05_CONTENT_SANITIZATION_REPORT.md`, `06_DEPENDENCY_SECURITY_REPORT.md`, `07_RESPONSIVE_OVERFLOW_REPORT.md`, `08_TEST_AND_BROWSER_QA_REPORT.md`, `09_SECURITY_AND_REGRESSION_CHECKLIST.md`, `10_REMAINING_LIMITATIONS.md`, `11_BATCH17_FINAL_REPORT.md` (this file).

## 16. Untouched confirmation
No local dev data, no Aiven production DB, no R2 objects, no credentials/`.env`, no DNS/hosting, and no Git history were modified. No deploy, no cloud connection, no secret rotation, no `npm audit fix`. Only the disposable `nfrguide_test` DB was written (migrate/seed/tests).

## 17. Recommended next work
1. **Owner:** review + commit/push Batch 17 (branch, then PR).
2. **Launch-Prep (owner/ops, P0):** rotate Admin/Aiven/R2 credentials; provision least-privilege Aiven role; `migrate deploy` the Batch 17 migration to dev + Aiven; verify `migrate status`.
3. **Deploy (P0):** choose host + CD + staging; backup/PITR + rollback; replace `rejectUnauthorized:false` with Aiven CA verification.
4. **Content (P0):** enter source-verified NFR 2026 content.
5. **Follow-up (P1):** CSP enforcing (nonce) rollout; full live axe/a11y pass; wire the npm-audit CI gate; plan prisma@7 / vitest@5 upgrades.

**STOPPED after implementation + local verification. Not committed, not pushed — awaiting owner review.**
