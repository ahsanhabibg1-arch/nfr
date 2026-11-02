# Batch 14 — Test & QA Report

All DB-mutating tests run against the isolated disposable TEST database; media storage forced local. No
Aiven/production R2 access.

## Commands & results (actual)
| Check | Command | Result |
|---|---|---|
| Prisma schema | `npx prisma validate` | valid |
| TypeScript | `npx tsc --noEmit` | clean (exit 0) |
| Full suite | `MEDIA_STORAGE_PROVIDER=local npx vitest run` | **30 files, 230 tests, all passed** |
| FTS/migration gate | `npm run test:migration` | 5/5 (test-db fallback; searchVector + GIN + FTS) |
| Production build | `MEDIA_STORAGE_PROVIDER=local APP_ENV=development npx next build` | success; coverage routes present |

## New Batch 14 tests
- `tests/batch14-unit.test.ts` (no DB): public-eligibility rule — public only when PUBLISHED **and** VERIFIED.
- `tests/batch14.test.ts` (isolated DB):
  - Schedule: create requires `rodeo.manage` (author forbidden); publish blocked until VERIFIED; public
    read shows only published+verified.
  - Results: TIME requires a time value; NO_TIME allowed empty; **wrong-edition competitor rejected**
    (no participation); **session from another edition rejected**; decimal time preserved as string.
  - Corrections: new result links `correctionOfId`; original ARCHIVED.
  - Standings: created → verified → published → public; earnings decimal preserved; un-verifying a
    published standing removes it from public view.

## Regression (preserved)
Full prior baseline green within the 230 total (auth, RBAC, editorial workflow, rodeo/venue/competitor,
media + R2 adapter, SEO/FAQ, FTS, Batch-13 env/isolation/health). permissions-unit updated to 15 modules.

## Browser / E2E
Not performed in this batch (no claim made). Admin routes return 200 under the existing admin smoke
pattern (authenticated); public coverage pages build as dynamic routes and render empty states when no
published+verified coverage exists. A live browser QA with seeded verified data is recommended before
launch (and must use only verified official data — never fabricated).

## Data safety
No existing DB records modified; no Aiven/R2 write; local dev + test data intact.
