# Batch 22 §8 — Test & Regression Results

All automated DB writes ran against the **isolated disposable test DB** (`nfrguide_test`). `nfrguide_dev` and Aiven untouched; no migration (no schema change).

| Check | Command | Result |
|-------|---------|--------|
| Prisma schema validate | `npx prisma validate` | ✅ valid |
| TypeScript typecheck | `npx tsc --noEmit` | ✅ exit 0 |
| Batch 22 auth test | `vitest run tests/batch22-auth.test.ts` | ✅ 8/8 |
| **Full Vitest** | `REQUIRE_DB_TESTS=1 npx vitest run` | ✅ **48 files, 406 tests, 406 passed, 0 failed, 0 skipped** (+8 vs Batch 21's 398) |
| Production build | `next build` (test DB, local media) | ✅ compiled, **57/57** static pages |
| **Playwright + axe** | `npx playwright test` | ✅ **45 passed** |
| Dependency audit gate | `npm audit --omit=dev --audit-level=critical` | ✅ exit 0 (Stage 7) |
| Security headers + CSP receiver | live (Batch 21) | ✅ report-only + `report-uri`; receiver 204 |

## Regression coverage relevant to Batch 22
- **Authentication / limiter:** `batch22-auth.test.ts` (peek no-increment, record→deny, reset, fail-closed, success-keeps-budget) + `batch21-ratelimit.test.ts` (check-and-increment for uploads, cross-IP account, storage failure, recovery) + `auth.test.ts` — all green. The new failure-only login flow did not regress auth.
- **RBAC / editorial workflow:** `rbac`, `governance`, `cms`, `team`, `batch16`, `phase2-editorial` — green.
- **Competition concurrency:** `batch17-concurrency.test.ts` (8) — green.
- **Correlation helper:** `batch22-auth.test.ts` (safe header passthrough, unsafe rejected, mint-on-absent).
- **Admin a11y / routes:** Playwright admin smoke + axe — green.

## Notes
- Skip-guard honored: `allowed-skips.json = []`, 0 skipped.
- Expected redacted `[database] Error: boom` stderr appears from the injected-storage-failure tests (`report()` logging) — designed behavior, not a failure.
- No commit/push; no dev/Aiven migration; no deletions; no CSP enforcement; no dependency upgrade.
