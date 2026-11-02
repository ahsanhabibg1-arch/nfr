# Batch 13 — Backup & Recovery Runbook

No production restore was performed; no Aiven backup configuration was changed; no paid service enabled.
This runbook distinguishes **application rollback**, **database rollback**, **data recovery** and **media
recovery**. **Never reset a production database as a "normal" rollback.**

## 1. Local PostgreSQL backups
- Create: `pg_dump -Fc --no-owner --no-privileges` → store OUTSIDE the repo (e.g.
  `D:\MoynullHasan\personal\nfrguide-db-backups\`). Record **SHA-256** + verify with `pg_restore --list`.
- A validated pre-migration backup already exists (see `LOCAL_TO_CLOUD_MIGRATION_REPORT.md`).
- Restore (to a NEW/empty local DB, never over production): `pg_restore -d <freshdb> <file.dump>`.

## 2. Aiven PostgreSQL backups
- Aiven provides **managed automated backups** (+ PITR on eligible plans) — verify in Console → Backups.
  Trial/hobby plans have **shorter retention / limited PITR** than paid plans; confirm before relying on it.
- Manual logical snapshot (anytime, read-only): `pg_dump -Fc` against the cloud URL (TLS), stored off-repo.
- **Do not** change Aiven backup settings without owner approval.

## 3. Database rollback vs data recovery
- **Application rollback:** redeploy the previous app build/commit. The schema is **backward-additive**
  (all migrations additive), so an older app runs against the current schema. This is the normal rollback.
- **Database rollback (schema):** only if a migration must be undone — write a new **additive** reverse
  migration or a scoped, reviewed change. **Never** `migrate reset` / `pg_restore --clean` on production.
- **Data recovery:** restore a logical dump into a **staging** database, extract the needed rows, and
  import them with owner approval. Aiven PITR (if available) can recover to a timestamp.

## 4. Media (Cloudflare R2) recovery
- Postgres stores only metadata/URLs; **R2 holds the bytes** (system of record for media).
- R2 has no automatic cross-region backup by itself. Options: enable **object versioning** and/or a
  periodic `aws s3 sync` (S3-compatible) to a second bucket. Legacy `/assets/` images ship with the repo.
- Recovery: re-upload originals from a backup bucket under the SAME storage keys; derivatives regenerate
  via the existing Sharp pipeline on next processing. Never overwrite an existing object blindly.

## 5. Migration verification (after any cloud migration)
- `scripts/cloud-db.mts verify` (read-only): tables, `searchVector` tsvector + GENERATED, GIN index,
  `websearch_to_tsquery`, enums, FK count, migration history. Must be ALL PASSED before trusting a deploy.

## 6. Approval gates
- Any production **restore**, **data import**, or **schema rollback** requires explicit owner approval and
  a fresh verified backup first. Document who approved, what changed, and the verification result.
