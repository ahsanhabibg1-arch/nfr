# Finalization §8 Gates 1–4 — Dev DB Preflight & Backup

## Gate 1 — Positive database identification ✅
Effective `DATABASE_URL` (from `apps/web/.env`, password masked):
`postgresql://nfrguide_dev_user:***@localhost:5432/nfrguide_dev?schema=public`
- Host **localhost** ✅ · database **`nfrguide_dev`** (expected dev) ✅
- Not Aiven ✅ · not staging/production ✅ · not the test DB (`nfrguide_test`) ✅
- No proxy/tunnel; direct localhost:5432 ✅
No secret printed.

## Gate 2 — Existing migration state ✅
`npx prisma migrate status` (read-only) against `nfrguide_dev`:
- 13 migrations found; **12 applied, 1 pending: `20261104120000_batch17_hardening`**.
- No failed / divergent migrations; no schema drift reported.

## Gate 3 — Backup ✅
Tool: `C:\Program Files\PostgreSQL\17\bin\pg_dump.exe` (custom format `-Fc`).
- Output (outside Git, scratchpad): `…/scratchpad/backups/nfrguide_dev_pre_batch17_20261104_121018.dump`
- Size: **216,076 bytes** (~211 KB).
- Verified readable: `pg_restore --list` → **406 objects**; key tables present (`Article`, `CompetitionSession`, `CompetitionResult`, `User`, `Session`).
- Not overwriting any existing backup (timestamped name); no old backups deleted.
- Password supplied via a runtime variable (stripped of the Prisma `?schema` query param, which `pg_dump` rejects); never echoed.

> Restorability: validated structurally via `pg_restore --list`. A full restore into a scratch database was not performed (would require creating a disposable DB); structural verification + custom-format integrity is the evidence recorded.

## Gate 4 — Migration review ✅
`prisma/migrations/20261104120000_batch17_hardening/migration.sql` contains exactly:
- `ALTER TABLE "CompetitionSession" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;`
- `ALTER TABLE "CompetitionResult" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;`
- `ALTER TABLE "CompetitionStanding" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;`
- `CREATE TABLE "RateLimitHit" (...)` + `CREATE INDEX "RateLimitHit_resetAt_idx"`.
No `DROP`, `TRUNCATE`, `RENAME`, type change, or data mutation. Matches the approved additive scope.

**All four gates passed → migration apply authorized (Gate 5, report 06).**
