# Batch 23 §4.2 — Database & Migration Readiness

## Migration chain (13, verified)
```
20261028000000_init → … → 20261102120000_batch14_competition_coverage
→ 20261104120000_batch17_hardening   (latest: competition *.version + RateLimitHit)
```
- `prisma validate` → **valid**.
- `prisma migrate status` against the isolated **test DB** → **"Database schema is up to date!"** (13/13 applied).
- From-zero replay (`npm run test:migration`): locally **fell back** to FTS-artifact + table-presence verification because the local test role lacks `CREATEDB` (cannot create a throwaway DB). It verified: `searchVector` is a generated `tsvector`, GIN index present, `websearch_to_tsquery` matches, all expected tables present (5/5). **The full clean-from-zero replay runs in CI** (its Postgres superuser has `CREATEDB`) — see `ci.yml` "Full-text search / migration replay gate".

## Schema integrity
- ~70 models; FKs, `@unique`, `@@index`, cascade rules declared throughout.
- FTS: generated `Article.searchVector` (weighted) + GIN index.
- Optimistic concurrency: `Article.version` and `Competition{Session,Result,Standing}.version`.
- `RateLimitHit` (key PK + `resetAt` index) for the durable limiter.
- Correction lineage: `CompetitionResult.correctionOfId`.

## Production-safe migration commands
- Deploy: **`prisma migrate deploy`** only (never `db push` / `migrate reset` in prod).
- The Batch 17 migration is **additive** (ADD COLUMN with constant default + CREATE TABLE/INDEX) → zero-downtime, metadata-only on PG 11+.
- Applied to **dev** (Batch 17 finalization). **Aiven: still PENDING — owner-approved deploy only** (not run here).

## Connection, isolation, transactions
- Single Prisma client (`lib/db.ts`); Prisma manages a connection pool. On a free/managed host, set a bounded pool via the `connection_limit` query param if the DB caps connections (noted in deployment config).
- Environment isolation: `lib/env.ts` (Zod) + `lib/env-guard.ts`; the guard classifies the real `DATABASE_URL` + storage provider, and **blocks a localhost `DATABASE_URL` in production**.
- Transactions: article save + competition updates use atomic statements / `$transaction`; the limiter uses a single atomic upsert.

## Seed & bootstrap
- `prisma/seed.ts` (reference data + synthetic `fixture-` records) — idempotent; **staging seed is approval-gated** (report 07).
- `prisma/bootstrap-admin.ts` — initial Super Admin (interactive; never commit credentials).

## Backup / restore
- Tooling verified locally (`pg_dump -Fc` / `pg_restore`). **Scheduled Aiven backup/PITR + a restore test are owner actions** (report 04 / 09). Render free Postgres has **no backups** and expires in 30 days → not a staging DB of record (report 05/07).

## Safety in this batch
No migration applied to dev or Aiven; no reset/reseed; the test DB was only read (`migrate status`) + the replay fallback read FTS metadata. No destructive command run.
