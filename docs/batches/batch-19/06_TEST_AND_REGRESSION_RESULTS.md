# Batch 19 §D — Test & Regression Results

All automated DB writes ran against the **isolated disposable test DB** (`nfrguide_test`), guarded by `decideTestDatabase`. `nfrguide_dev` and Aiven were never written by tests.

| Check | Command | Result |
|-------|---------|--------|
| Prisma schema validate | `npx prisma validate` | ✅ valid (no schema change) |
| TypeScript typecheck | `npx tsc --noEmit` | ✅ exit 0 |
| Batch 19 UI test | `vitest run tests/batch19-admin-ui.test.ts` | ✅ 3/3 |
| **Full Vitest** | `REQUIRE_DB_TESTS=1 npx vitest run` | ✅ **45 files, 388 tests, 388 passed, 0 failed, 0 skipped** (+3 vs Batch 18's 385) |
| Production build | `next build` (test DB, local media) | ✅ compiled, **57/57** static pages |
| **Playwright + axe** | `npx playwright test` | ✅ **45 passed** (public + admin smoke + a11y) |

## Regression coverage relevant to Batch 19
- **RBAC/ownership:** `rbac.test.ts`, `permissions-unit.test.ts`, `governance.test.ts`, `team.test.ts` — green.
- **Competition concurrency:** `batch17-concurrency.test.ts` (8), `batch14.test.ts` (4) — green (concurrency not weakened).
- **Editorial workflow:** `cms.test.ts`, `batch16.test.ts`, `phase2-editorial.test.ts` — green.
- **Audit log:** exercised by the above DB suites (every mutation audits).
- **Admin routes/no dead routes:** Playwright *"every sidebar module loads (no mock or dead admin routes exposed)"* — pass.
- **Admin a11y:** axe subset over `/admin/*` filters/fields + editor + invite dialog — pass.

## Not executed / notes
- Skip-guard honored: `allowed-skips.json = []`, 0 skipped.
- The admin loading skeleton's transient appearance and the error boundary's `reset()` are runtime behaviors; the deterministic unit test asserts the loading a11y contract + that both boundaries compile/export. The Playwright admin suite confirms the surrounding chrome renders.
- No destructive tests against `nfrguide_dev`/Aiven; no commit/push; no migration (none needed).
