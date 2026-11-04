# Batch 21 §H — Test & Regression Results

All automated DB writes ran against the **isolated disposable test DB** (`nfrguide_test`). `nfrguide_dev` and Aiven were not written; no migration run (no schema change).

| Check | Command | Result |
|-------|---------|--------|
| Prisma schema validate | `npx prisma validate` | ✅ valid |
| TypeScript typecheck | `npx tsc --noEmit` | ✅ exit 0 |
| Batch 21 rate-limiter test | `vitest run tests/batch21-ratelimit.test.ts` | ✅ 6/6 |
| **Full Vitest** | `REQUIRE_DB_TESTS=1 npx vitest run` | ✅ **47 files, 398 tests, 398 passed, 0 failed, 0 skipped** (+6 vs Batch 20's 392) |
| Production build | `next build` (test DB, local media) | ✅ compiled, **57/57** static pages; `/api/csp-report` registered (ƒ) |
| **Playwright + axe** | `npx playwright test` | ✅ **45 passed** |
| CSP report endpoint | live POST | ✅ valid→204, 20 KB→204 (ignored), malformed→204 |
| Security headers + `report-uri` | `curl -I /` | ✅ nosniff/X-Frame/HSTS/Referrer/Permissions + CSP-Report-Only incl. `report-uri /api/csp-report/` |
| Dependency audit gate | `npm audit --omit=dev --audit-level=critical` | ✅ exit 0 |

## Regression coverage relevant to Batch 21
- **Rate limiter:** `batch21-ratelimit.test.ts` (fail-closed, per-account cross-IP, concurrency, recovery, no-enumeration) + `batch17-ratelimit.test.ts` (threshold/window/reset) — all green with the extended `{storageError}` return shape.
- **Auth / RBAC:** `auth.test.ts`, `cms.test.ts`, `rbac.test.ts`, `governance.test.ts`, `team.test.ts` — green (new dual-limit login path did not regress auth).
- **Competition optimistic concurrency:** `batch17-concurrency.test.ts` (8) green.
- **Editorial workflow:** `cms.test.ts`, `batch16.test.ts`, `phase2-editorial.test.ts` — green.
- **Admin a11y / routes:** Playwright admin smoke + axe — green.

## Notes
- Skip-guard honored: `allowed-skips.json = []`, 0 skipped.
- Fail-closed test logs an expected redacted `[database] Error: boom` via `report()` (stderr) — that is the designed behavior, not a failure.
- No commit/push; no dev/Aiven migration; no file deletions; no CSP enforcement; no dependency upgrade.
