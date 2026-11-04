# Batch 17 Finalization — Executive Summary

**Date:** 2026-11-04 · **Branch:** `main` · **HEAD:** `6da137d` (unchanged — nothing committed/pushed).

## Scope executed
1. Reviewed Batch 17; closed the concurrency **bypass** (optional `expectedVersion`).
2. Added dedicated **durable rate-limiter integration tests** (+ fixed a real timezone bug they surfaced).
3. Added a scoped **CI dependency-audit gate**.
4. Ran full safe regression (validate, generate, typecheck, Vitest, build, Playwright+axe).
5. Verified the dev DB target and migration state.
6. Created + verified a **recoverable dev DB backup**.
7. Applied the additive Batch 17 migration to the **local development database only** (all gates passed).
8. Restarted the local dev server on the dev DB and ran read-only functional smoke tests.

## Results at a glance
| Check | Result |
|-------|--------|
| `prisma validate` | ✅ valid |
| `prisma generate` | ✅ v6.19.3 |
| `tsc --noEmit` | ✅ exit 0 |
| Vitest (isolated test DB) | ✅ **383 passed / 0 failed / 0 skipped** (43 files) |
| Production build | ✅ compiled, 57/57 static pages |
| Playwright + axe | ✅ **45 passed** |
| Dev DB identity | `localhost:5432/nfrguide_dev` (positively confirmed, not Aiven/test/prod) |
| Dev backup | ✅ custom-format dump, 406 objects, verified readable |
| Dev migration | ✅ all 13 applied; `version` ×3 + `RateLimitHit` present |
| Dev data integrity | ✅ articles still 11; no invalid versions |
| Local server | ✅ http://localhost:3000 (dev DB); health/ready 200 |
| Smoke tests | ✅ all public + admin gating + CSP/headers |

## Changes made in finalization (on top of Batch 17)
- `competitionService.ts`: `expectedVersion` **required** + validated (missing/invalid/negative/non-integer → `validation`).
- `competition-actions.ts`: update actions require `expectedVersion`.
- `durableRateLimit.ts`: **fixed** retry-after timezone inflation (all time math on the DB clock).
- `tests/batch17-ratelimit.test.ts`: new (5 cases).
- `tests/batch17-concurrency.test.ts`: added missing/invalid-version rejection case.
- `tests/batch15.test.ts`: pass `expectedVersion` to the now-required update.
- `.github/workflows/ci.yml`: `npm audit --omit=dev --audit-level=critical` gate.

## GO / NO-GO
**GO** for Git commit + push (owner-performed). All acceptance criteria met; no cloud/credential/deploy actions taken; dev data intact with a verified backup. Full rationale in `09_FINAL_GO_NO_GO_REPORT.md`.
