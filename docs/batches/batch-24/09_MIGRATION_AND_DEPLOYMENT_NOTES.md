# 09 — Migration & Deployment Notes

## The Batch 24 migration

`prisma/migrations/20261105120000_batch24_reader_comments/migration.sql`

- **Additive only:** `CREATE TYPE "CommentStatus"`, `ALTER TABLE "User" ADD COLUMN
  "emailVerifiedAt"`, `CREATE TABLE "EmailVerificationToken"`, `CREATE TABLE
  "ArticleComment"`, their indexes, and 4 foreign keys. Nothing is dropped or
  destructively altered.
- Applied cleanly to the local **dev** (`nfrguide_dev`) and **test**
  (`nfrguide_test`) databases via `prisma migrate deploy`.

## Safety rules observed (from the Batch 24 brief)

- ✅ Additive migration; existing Admin accounts and sessions preserved.
- ✅ No database reset; no `prisma db push`; no `migrate reset`.
- ✅ **Aiven (production) was not touched.** Migrations were applied only to the
  explicitly verified local dev/test databases.
- ✅ Isolated test database used for automated tests (guarded — see below).

## Test-database isolation (why the DB suites are gated)

`tests/support/testDbGuard.ts` + `vitest.config.ts` / `playwright.config.ts` require
`TEST_DATABASE_URL` to be:

- a **local** host (localhost / 127.0.0.1 / ::1),
- a database **name containing `test` or `ci`**,
- **not equal** to `DATABASE_URL` (dev) or `CLOUD_DATABASE_URL`.

Otherwise DB suites self-skip (Vitest) or refuse to run (Playwright). **`TEST_DATABASE_URL`
is already set in `apps/web/.env`** (role `nfrguide_test_user`, db `nfrguide_test`), loaded
via `nextEnv.loadEnvConfig`, so both the Vitest DB suites and Playwright run with no extra
setup. They executed and passed this session (DB suite 14/14, Playwright 49/49).

### Running the DB + e2e suites

1. `npm run test` — Vitest incl. the Batch 24 DB tests (reads `TEST_DATABASE_URL` from `.env`).
2. For e2e: `DATABASE_URL=<TEST_DATABASE_URL value> APP_ENV=test npx next build`, then
   `npx playwright test` (webServer runs `next start -p 3100` on the test DB; `global-setup`
   seeds ephemeral fixtures and syncs roles/permissions).

The `nfrguide_test` DB already has every migration (incl. Batch 24) applied. If its
credentials are ever lost, re-provision locally (Postgres superuser
`ALTER USER nfrguide_test_user WITH PASSWORD '<new>';`, update `.env`) — it is a
**local, disposable** database; never do this to dev or production data.

## `render.yaml` (from Batch 23, present, uncommitted)

A Render free-tier staging blueprint exists at the repo root. It is **not** a
production deploy; deployment remains an explicit owner action.

## Explicitly NOT done (per the brief)

No Git commit, no Git push, no Render deploy, no Aiven/R2/Cloudflare/DNS changes,
no credential rotation, no destructive DB operations, no major dependency upgrades,
no unrelated refactoring.
