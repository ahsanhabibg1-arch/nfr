# Batch 16 — Test & Build Report

Isolated TEST database; media storage forced local; no Aiven/R2 connection.

| Check | Command | Result |
|---|---|---|
| Prisma schema | `npx prisma validate` | valid |
| TypeScript | `npx tsc --noEmit` | clean (exit 0) |
| Full suite | `MEDIA_STORAGE_PROVIDER=local npx vitest run` | **33 files, 249 tests, all passed** |
| FTS/migration gate | `npm run test:migration` | 5/5 |
| Production build | `MEDIA_STORAGE_PROVIDER=local APP_ENV=development npx next build` | success |
| Browser QA | browser-automation (Chromium headless) | performed — see `07` |

## New Batch 16 tests (`tests/batch16.test.ts`, +7)
- Source guards: editor no longer imports/uses the mock `AUTHORS`; dropdown driven by the `authors` prop;
  `legacyBylineName` preservation present; both article pages load `listAuthors`.
- Integration (isolated DB): a created DB author appears in the editor list; an article byline **resolves
  to the matching Author id (no duplicate)**; deleting an in-use byline is **blocked**; author management
  requires `author.manage` (an `author`-role user is rejected).

## Regression
242 → 249 (all prior green within the 249): auth/RBAC, editorial workflow, rodeo/competition coverage,
competitor/venue profiles + directories, media, SEO/FAQ, FTS/GIN, Batch-13 env isolation + health/ready.
No accidental cloud connection (tests use TEST DB; build uses local).
