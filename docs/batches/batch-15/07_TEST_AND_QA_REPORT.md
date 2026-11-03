# Batch 15 — Test & QA Report

All DB-mutating tests run against the isolated disposable TEST database; media storage forced local. No
Aiven/production R2 access.

## Commands & results (actual)
| Check | Command | Result |
|---|---|---|
| Prisma schema | `npx prisma validate` | valid (no schema change this batch) |
| TypeScript | `npx tsc --noEmit` | clean (exit 0) |
| Full suite | `MEDIA_STORAGE_PROVIDER=local npx vitest run` | **32 files, 242 tests, all passed** |
| FTS/migration gate | `npm run test:migration` | 5/5 (searchVector + GIN + FTS preserved) |
| Production build | `MEDIA_STORAGE_PROVIDER=local APP_ENV=development npx next build` | success; `/competitors`, `/venues`, `/admin/competition` present |

## New Batch 15 tests
- `tests/batch15-editor.test.ts` (9): demo-content removal source guards + "Demo Stage" removed +
  placeholders present + empty new draft cannot be published.
- `tests/batch15.test.ts` (3, isolated DB): competitor directory name-search + discipline-filter + bounded
  pagination + public-only fields; venue directory name-search + country-filter; admin `updateResult`
  edits in place without resetting unrelated fields.
- Existing Batch 14 coverage (correction archives original, publication gate, cross-edition rejection)
  remains green within the 242.

## Regression (preserved)
Auth/RBAC, editorial workflow, existing public routes, rodeo hubs/events/editions, competitor/venue
profiles, Media Library + R2 adapter, SEO/FAQ, FTS/GIN, Batch-13 env isolation + health/readiness,
Batch-14 competition coverage. permissions-unit remains at 15 CMS modules (no module added this batch).

## Browser QA status
**Not performed** in this batch (no claim made). The public directories and the cleaned article editor
were validated via typecheck, the production build, unit/integration tests, and source guards. A live
authenticated admin + public walkthrough with disposable verified records is recommended before launch.

## Data/storage safety
No schema/migration change; no Aiven or R2 write; no media object touched; local dev + test data intact.
