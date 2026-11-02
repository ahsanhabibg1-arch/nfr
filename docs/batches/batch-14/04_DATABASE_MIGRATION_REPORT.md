# Batch 14 — Database Migration Report

**Migration:** `20261102120000_batch14_competition_coverage` — additive.

## SQL review (generated offline via `prisma migrate diff`, reviewed before apply)
- `CREATE TYPE` ×5 (CoverageStatus, CoverageVerification, CompetitionSessionStatus, CompetitionResultType,
  StandingCategory).
- `CREATE TABLE` ×3 (CompetitionSession, CompetitionResult, CompetitionStanding).
- `CREATE INDEX` on the documented composite keys; `ADD FOREIGN KEY` to Edition/Discipline/Venue/
  Competitor/Session (self-ref ResultCorrection).
- **Zero** DROP TABLE / DROP COLUMN / DROP INDEX / column-type change (verified by grep). **No**
  `Article.searchVector` drift (the `Unsupported("tsvector")` declaration suppresses it) — no hand-strip
  needed.

## Local apply results
- Applied to **local dev** (`localhost/nfrguide_dev`) and the **test DB** via `prisma migrate deploy`.
- Verified: 3 new tables present; **FTS preserved** — `Article.searchVector` tsvector + GENERATED + GIN
  index intact, `websearch_to_tsquery` returns matches (5). Prisma client delegates present.
- `npm run test:migration` (FTS/GIN replay gate): **5/5 passed** on the test DB.

## Data safety
- No existing table/column/index changed; no data reset; local dev + test content intact. `pg_dump`
  backups remain available (see batch-13 / migration reports).

## Cloud migration — PENDING (deferred, not applied)
- **Not applied to Aiven** this batch (per scope). When approved, deploy via the existing guarded path
  (`DATABASE_URL=<cloud> prisma migrate deploy`) then `scripts/cloud-db.mts verify`. Migration is additive
  and FTS-preserving, so it is safe to apply to the cloud later with no data risk.
