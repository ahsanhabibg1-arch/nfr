# Migration Replay & FTS Preservation Verification (Batch 09 §24/§25)

A repeatable gate that protects the Batch 07 PostgreSQL full-text search from being dropped by
a future generated migration (the Batch 08 incident).

## Run it

```bash
npm run test:migration           # scripts/migration-replay.mts
```

## What it does

1. Attempts to create a **new, disposable** database `<db>_migration_replay` from a maintenance
   connection (`MIGRATION_REPLAY_ADMIN_URL` if provided, else the dev credentials).
2. If created: runs `prisma migrate deploy` from zero onto it, then asserts:
   - all expected tables exist,
   - `Article."searchVector"` exists with PostgreSQL type **tsvector** and is a generated column,
   - the GIN index `Article_searchVector_idx` exists,
   - `websearch_to_tsquery` + `@@` work, and a freshly-inserted article's generated vector
     matches a query,
   - the deploy output contains no `DROP COLUMN` / `DROP INDEX`.
   Then it drops the disposable database.
3. If the connecting role lacks `CREATEDB` (the current least-privilege setup), it **does not**
   claim a clean replay. It instead verifies the same FTS artifacts on `TEST_DATABASE_URL`
   (which already has every migration applied) and prints that this is a fallback.

## Current result

The dev/test roles lack `CREATEDB`, so the gate ran the fallback and verified **5/5**
(searchVector tsvector + generated, GIN index, functional query, all expected tables) on the
fully-migrated test database. To run the full from-zero replay, provide a `CREATEDB`-capable
maintenance URL:

```bash
MIGRATION_REPLAY_ADMIN_URL="postgresql://<superuser>:<pw>@localhost:5432/postgres" npm run test:migration
```

A permanent automated regression also exists in `tests/governance.test.ts`
("preserves PostgreSQL full-text search …"), which runs in the normal Vitest suite.

## Safe migration workflow (§25)

1. Edit `schema.prisma`.
2. Generate SQL offline: `prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --script`.
3. **Inspect the SQL.** Remove any `DROP INDEX "Article_searchVector_idx"`,
   `DROP COLUMN "searchVector"`, or `ALTER COLUMN "searchVector" …` — Prisma cannot model the
   generated `tsvector` column (declared `Unsupported("tsvector")`) or its GIN index, so it
   emits spurious drops. Keep the migration additive.
4. Apply with `prisma migrate deploy` to dev + test.
5. Run `npm run test:migration` and the Vitest FTS regression.
6. Never silently modify an already-applied historical migration; if history is inconsistent,
   document it and request owner approval first.
