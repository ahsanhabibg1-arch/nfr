# Batch 17 §10 — Test & Browser QA Report

**Date:** 2026-11-04. Every DB-writing step used the **isolated disposable test database** (`nfrguide_test`), positively confirmed via `TEST_DATABASE_URL` + the vitest `decideTestDatabase` guard. **Dev and Aiven were never written to.**

## 10.1 Static checks
| Check | Command | Result |
|-------|---------|--------|
| Prisma schema validation | `npx prisma validate` | ✅ valid |
| Prisma client generate | `npx prisma generate` | ✅ v6.19.3 (new `version` fields + `RateLimitHit`) |
| TypeScript typecheck | `npx tsc --noEmit` | ✅ exit 0 (after fixing a dropped `headers()` line) |
| Migration SQL review | manual | ✅ additive only (see report 02) |

## 10.2 Database verification (disposable test DB)
| Step | Command | Result |
|------|---------|--------|
| Apply all migrations in order | `DATABASE_URL=<test> npx prisma migrate deploy` | ✅ 13/13; new `20261104120000_batch17_hardening` applied on top of existing 12 + existing seeded data |
| Seed representative fixtures | `DATABASE_URL=<test> npx prisma db seed` | ✅ 16 published / 7 disciplines / 5 categories / 12 authors / 15 nav |
| Competition version conflicts | `tests/batch17-concurrency.test.ts` | ✅ 8/8 |
| Existing correction behavior | `tests/batch14.test.ts` + batch17 case | ✅ lineage intact |
| Article editing concurrency | `tests/cms.test.ts` | ✅ |
| RBAC & publishing gates | `tests/rbac.test.ts`, `governance.test.ts`, `batch14.test.ts` | ✅ |

## 10.3 Unit & integration tests (full suite, no skips)
```
REQUIRE_DB_TESTS=1 npx vitest run
```
| Metric | Value |
|--------|-------|
| Test files | **42 passed** / 42 |
| Tests | **378 passed** / 378 |
| Failed | 0 |
| **Skipped** | **0** (Phase 2 skip-guard policy honored; `allowed-skips.json` = `[]`) |
| Environment | Node 22, isolated `nfrguide_test` DB |
| New this batch | `batch17-concurrency.test.ts` (8), `batch17-sanitization.test.ts` (5) |

No test was skipped or silently excluded. Pre-existing suites all pass → no regression.

## 10.4 Production build
```
DATABASE_URL=<test> MEDIA_STORAGE_PROVIDER=local next build
```
- ✅ `Compiled successfully in 37.5s`; 57/57 static pages generated; full route manifest emitted; exit 0.
- No accidental dev/prod DB access (pointed at test DB); `MEDIA_STORAGE_PROVIDER=local` (no R2). No secret leakage in output.

## 10.5 Browser QA (Playwright + chromium)
- Installed the chromium headless binary (`npx playwright install chromium`) — browser binary only, **no dependency/package.json change**.
- Ran an overflow probe across **360/390/768/1024/1280/1366/1440** with the global clamp neutralized (report 07): overflow found (desktop header), fixed, re-verified **OK at every breakpoint**.
- Public static pages (`/`, `/competitors/`, `/venues/`) + `/admin/login/` render at 200 across all viewports.
- **Not executed:** the project's full `playwright test` e2e + axe suite (`e2e/*.spec.ts`) was not run in this batch — it requires the Playwright test harness with seeded auth fixtures and a dedicated server; it runs in CI. The targeted overflow probe is reported honestly as the browser work actually performed here. CSP is report-only so it cannot regress rendering.

## 10.6 Dependency security
`npm audit` executed (read-only). See report 06: no production-runtime-reachable critical/high; criticals are dev-only (`vitest`→`tinypool`). No `audit fix` run.

## 10.7 CI verification
CI config (`.github/workflows/ci.yml`) is **unchanged** by this batch and remains intact: postgres:18 service, migrate deploy, seed, typecheck, Vitest, skip-guard, build, route smoke, Playwright + axe. The new migration and tests slot into the existing pipeline. **A live CI run on these changes has NOT been executed** (nothing pushed); recommend relying on CI after the owner commits. Adding the `npm audit` gate (report 06) is a proposed CI addition, not yet wired.
