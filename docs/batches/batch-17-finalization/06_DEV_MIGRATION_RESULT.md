# Finalization §8 Gates 5–6 — Dev Migration Result

## Gate 5 — Apply (executed)
Command: `npx prisma migrate deploy` with `.env` `DATABASE_URL` = `nfrguide_dev` (dev server stopped → no competing writer). No seed, no reset.

Output:
```
Datasource "db": PostgreSQL database "nfrguide_dev" ... at "localhost:5432"
13 migrations found in prisma/migrations
Applying migration `20261104120000_batch17_hardening`
The following migration(s) have been applied:
  └─ 20261104120000_batch17_hardening/migration.sql
All migrations have been successfully applied.
```

## Gate 6 — Post-migration verification (read-only)
| Check | Pre | Post | Status |
|-------|-----|------|--------|
| `prisma migrate status` | 1 pending | **"Database schema is up to date!"** (13 applied) | ✅ |
| `version` columns (Session/Result/Standing) | absent | **all 3 present** | ✅ |
| `RateLimitHit` table | absent (`to_regclass` null) | **present** | ✅ |
| `Article` row count | 11 | **11** (unchanged) | ✅ |
| Competition rows with NULL/`<1` version | n/a | **0** | ✅ |
| Prisma Client vs schema | — | regenerated v6.19.3, matches | ✅ |

No unexpected tables/columns removed; existing editorial data intact. Migration applied **only** to `nfrguide_dev`.

## Rollback (if ever needed)
The pre-migration backup is at `…/scratchpad/backups/nfrguide_dev_pre_batch17_20261104_121018.dump`. The change is additive, so a forward fix is normally preferable; a full restore would use `pg_restore --clean --if-exists -d nfrguide_dev <dump>` (owner-approved, not performed here).

## Not done
- Aiven: **not** migrated (no cloud connection). Owner applies `prisma migrate deploy` to Aiven under the existing guarded flow before launch.
- No seed/reset against dev.
