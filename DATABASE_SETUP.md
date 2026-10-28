# NFRGuide.com — Database Setup (Phase 1 / Batch 02)

Local PostgreSQL + Prisma setup for `apps/web`.

## Prerequisites (detected on this machine)

| Tool | Status |
|---|---|
| Node.js | v22.16.0 ✅ |
| npm | 10.9.2 ✅ |
| PostgreSQL server | **Running** — a `postgres` process is listening on `127.0.0.1:5432` ✅ |
| `psql` CLI | not on PATH (not required) |
| Docker daemon | not running (not required) |
| Prisma | 6.19.3 (CLI + client) ✅ |

> **Credentials were not auto-discovered.** The agent is not permitted to guess
> database passwords, so `DATABASE_URL` must be provided by you (see below).

## 1. Configure environment

Copy the template and set a real connection string:

```bash
cd apps/web
cp .env.example .env
```

Edit `apps/web/.env` and set `DATABASE_URL` to your local Postgres. Examples:

```
# Use an existing role/db you control:
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/nfrguide_dev?schema=public"
# Disposable DB for integration tests (the test suite writes/cleans temp rows):
TEST_DATABASE_URL="postgresql://<user>:<password>@localhost:5432/nfrguide_test?schema=public"
```

`.env` is git-ignored; never commit credentials. `DATABASE_URL` is read only on
the server (`lib/db.ts` is `server-only`) and is never exposed to the browser.

### Creating a dedicated dev database (optional, recommended)

With a superuser connection (`psql` or any client):

```sql
CREATE ROLE nfrguide WITH LOGIN PASSWORD 'change-me';
CREATE DATABASE nfrguide_dev OWNER nfrguide;
CREATE DATABASE nfrguide_test OWNER nfrguide;
```

Then point `DATABASE_URL` / `TEST_DATABASE_URL` at those.

## 2. Apply schema + seed

```bash
cd apps/web
npm run db:deploy     # prisma migrate deploy — applies prisma/migrations/*
npm run db:generate   # prisma generate (already run, safe to repeat)
npm run db:seed       # prisma db seed — loads demonstration content (idempotent)
# or all three:
npm run db:setup
```

For iterative schema work during development use `npm run db:migrate`
(`prisma migrate dev`). Do **not** use `prisma db push` — migrations are
version-controlled in `prisma/migrations/`.

## 3. Run the app + verification

```bash
npm run build         # next build (SSG pre-renders published DB content)
npm run start         # serve the production build on :3000
npm run test          # vitest: non-DB suites + DB integration (auto-skips if no DB)
npm run test:routes   # HTTP route smoke (needs `npm run start` running)
npm run db:studio     # optional: browse data in Prisma Studio
```

The DB integration suite (`tests/content.test.ts`) runs its real assertions only
when `DATABASE_URL` points at a reachable, seeded database; otherwise it skips.

## 4. Reset (destructive — dev only)

```bash
npm run db:reset      # drops, re-migrates and re-seeds the dev database
```

Never run `db:reset` against a database you do not own.

## Available scripts

| Script | Purpose |
|---|---|
| `db:generate` | Generate Prisma client |
| `db:migrate` | Create + apply a dev migration |
| `db:deploy` | Apply committed migrations (CI/prod-style) |
| `db:seed` | Run idempotent seed (`prisma/seed.ts`) |
| `db:setup` | deploy + generate + seed |
| `db:reset` | Drop + re-migrate + re-seed (destructive) |
| `db:studio` | Prisma Studio GUI |
