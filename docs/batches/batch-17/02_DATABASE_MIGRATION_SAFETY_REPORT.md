# Batch 17 §A/C — Database Migration Safety Report

**Date:** 2026-11-04 · **Migration:** `20261104120000_batch17_hardening`

## Contents (single additive migration)
```sql
-- Workstream A: optimistic-concurrency version columns
ALTER TABLE "CompetitionSession"  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CompetitionResult"   ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CompetitionStanding" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Workstream C: durable, multi-instance rate limiter
CREATE TABLE "RateLimitHit" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 0, "resetAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "RateLimitHit_resetAt_idx" ON "RateLimitHit"("resetAt");
```

## Safety assessment
| Property | Status |
|----------|--------|
| Additive only (ADD COLUMN / CREATE TABLE / CREATE INDEX) | ✅ |
| No DROP / RENAME / type change | ✅ |
| No data mutation beyond new-column defaults | ✅ |
| Existing rows remain valid (version defaults to 1) | ✅ |
| Backward-compatible (old code ignores `version`/`RateLimitHit`) | ✅ |
| Forward-compatible (new code atomically increments) | ✅ |
| Zero-downtime deployable against live data | ✅ (add-column-with-default is a metadata-only default in PG 11+) |

## Where it was applied
| Target | Applied? | Evidence |
|--------|:--------:|----------|
| Disposable **test** DB (`nfrguide_test`) | ✅ YES | `prisma migrate deploy` → "Applying migration `20261104120000_batch17_hardening` … All migrations have been successfully applied." Applied cleanly on top of the existing 12 migrations and existing seeded data (proves additive-on-existing-data). |
| Local **dev** DB (`nfrguide_dev`) | ❌ NO | Deliberately not applied (batch safety rule). Owner applies via `prisma migrate deploy` when ready. |
| **Aiven** production | ❌ NO | Deliberately not applied. No cloud connection made in this batch. |

## Prisma client
`prisma generate` → Client v6.19.3 regenerated with the new `version` fields and `RateLimitHit` model. `prisma validate` → schema valid.

## Owner action required before launch
1. `prisma migrate deploy` against **dev** (safe; additive).
2. `prisma migrate deploy` against **Aiven** (under the existing guarded flow) — additive, zero-downtime. Verify with a read-only `prisma migrate status` afterward.
3. (Housekeeping, optional) a periodic prune of expired `RateLimitHit` rows (`DELETE WHERE "resetAt" < now()`); table stays small (bounded by active IP+email / user keys), so not urgent.

## Additive-migration risk
None identified. The add-column-with-constant-default is metadata-only in PostgreSQL 11+ (no full table rewrite), so it is safe even on large `CompetitionResult` tables.
