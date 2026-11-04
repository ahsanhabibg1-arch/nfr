# Batch 20 §8 — Test & Regression Results

All automated DB writes ran against the **isolated disposable test DB** (`nfrguide_test`). `nfrguide_dev` and Aiven were not written by tests; no migration run.

| Check | Command | Result |
|-------|---------|--------|
| Prisma schema validate | `npx prisma validate` | ✅ valid (no schema change) |
| TypeScript typecheck | `npx tsc --noEmit` | ✅ exit 0 |
| Batch 20 unsaved-change test | `vitest run tests/batch20-unsaved.test.ts` | ✅ 4/4 |
| **Full Vitest** | `REQUIRE_DB_TESTS=1 npx vitest run` | ✅ **46 files, 392 tests, 392 passed, 0 failed, 0 skipped** (+4 vs Batch 19's 388) |
| Production build | `next build` (test DB, local media) | ✅ compiled, **57/57** static pages |
| **Playwright + axe** | `npx playwright test` | ✅ **45 passed** (public + admin + a11y) |
| Dependency audit gate | `npm audit --omit=dev --audit-level=critical` | ✅ exit 0 (no prod critical) |
| Security headers | re-verified live (Batch 17/19) | ✅ CSP report-only + nosniff/X-Frame/HSTS/Referrer/Permissions present |

## Relevant regression coverage
- **Admin form resilience:** new `batch20-unsaved.test.ts` (hook registers/removes listener; disabled no-op; handler triggers prompt; SSR no-op).
- **Competition concurrency (not weakened):** `batch17-concurrency.test.ts` (8) green — the dirty-tracking additions are UI-only and did not touch the service guard.
- **RBAC / workflow / audit:** `rbac`, `governance`, `cms`, `team`, `batch14/16` suites green.
- **Admin routes / a11y:** Playwright admin smoke + axe green (editor, invite dialog, every sidebar module, labelled fields).

## Notes
- The `beforeunload` guard and in-app navigation limitation are verified at the unit level (DOM-free). The native browser prompt itself is browser-managed and not asserted in Playwright (it would require per-test dialog handling and isn't a reliable cross-run assertion); the hook's wiring + the dirty-reporting effect are what Batch 20 adds and are covered.
- Skip-guard honored: `allowed-skips.json = []`, 0 skipped.
- No commit/push; no dev/Aiven migration; no file deletions.
