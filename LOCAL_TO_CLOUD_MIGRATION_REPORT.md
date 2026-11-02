# NFRGuide.com — Local → Cloud Migration Report (executed)

**Date:** 2026-11-02. **Baseline:** `7e1c310`. **Owner decisions:** full faithful copy + copy admin row.
**Written for:** the project owner. Companions: `LOCAL_TO_CLOUD_MIGRATION_AUDIT.md`, `…_PLAN.md`.

> **Result: SUCCESS.** The approved local content was imported into Aiven data-only (schema untouched).
> **All 26 content/identity tables match exactly**, FTS works on the cloud, the admin + RBAC were copied,
> dev sessions were excluded, and **no R2 upload was needed** (no managed media blobs existed). Local DB
> untouched; a validated pre-migration backup exists.

## 1. What ran
- **Backup first:** `pg_dump -Fc` of `localhost/nfrguide_dev` → `…\nfrguide-db-backups\nfrguide_dev_premigration_20261102093534.dump`
  (199 KB, `pg_restore --list` VALID 71 entries, SHA-256 `051c9ba0…` in a sidecar). Outside the repo.
- **Import:** `scripts/cloud-data-import.mts --confirm` — `pg_dump --data-only` of local (excluding
  `Session` + `_prisma_migrations`) → `pg_restore --data-only --single-transaction --no-owner -d defaultdb`
  into Aiven. Single transaction = all-or-nothing (a failure would have left the cloud at its clean
  baseline). No `--clean`, no reset, no truncate; schema never modified.

## 2. Row-count parity (local → Aiven) — ALL MATCH
| Table | L=C | Table | L=C | Table | L=C |
|---|--:|---|--:|---|--:|
| User | 1 | Article | 11 | Discipline | 7 |
| Role | 5 | ArticleBlock | 48 | RodeoHub/Event/Edition | 3/3/3 |
| Permission | 43 | ArticleSeo | 11 | NavigationItem | 15 |
| UserRole | 1 | Category | 5 | SeoRule | 55 |
| RolePermission | 131 | Tag | 42 | AnalyticsProviderConnection | 2 |
| AuditLog | 41 | ArticleTag | 45 | ArticleMedia | 11 |
| Author | 6 | Source | 6 | MediaAsset | 4 |
| ArticleSource | 2 | ArticleDiscipline | 2 | RodeoHubEvent | 3 |
| **Session** | **local 2 → cloud 0 (excluded)** | | | | |

## 3. Integrity & behavior verified (read-only, post-import)
- **Schema/FTS** (`cloud-db.mts verify`): all 17 expected tables incl. Venue/Competitor/EntitySeo/EntityFaq;
  `Article.searchVector` is `tsvector` + `GENERATED`; GIN index present; `websearch_to_tsquery` works;
  `LandingEntityType` has VENUE+COMPETITOR; **70 FKs**; 11 migrations, 0 rolled back.
- **FTS content:** generated `searchVector` **repopulated automatically** on insert — a cloud query for
  "rodeo" matches 5 articles (no generated-column data was inserted; Postgres computed it).
- **Identity/RBAC:** admin `mo***@gmail.com` = `super_admin`; roles/permissions/role-grants all present.
- **Relationships:** FK restore succeeded in one transaction (dependency-ordered), so article↔author/
  category/tags/sources/disciplines/hubs/events/media associations are intact.

## 4. Media
- No R2 upload: the 4 `MediaAsset` rows are `legacy-local` static `/assets/` images (shipped with the app
  and served by it); their rows were copied as-is. The 33 `var/media` files remain **orphans** (no DB
  rows) and were **not** migrated. **R2 bucket `nfr` is unchanged (0 objects).**
- The gated `/api/media/<key>` delivery proxy and private-bucket design remain enforced (no change).

## 5. Acceptance criteria — met
Approved source rows match cloud ✓ · IDs/relationships preserved ✓ · counts/consistency pass ✓ · required
media refs present (R2 upload N/A) ✓ · no unapproved cloud rows deleted/overwritten (insert-only into an
empty baseline) ✓ · no sessions/dev secrets copied ✓ · Aiven searchVector + GIN functional ✓ · private
media proxy enforced ✓ · **local development data intact** ✓ · backup + manifest/docs available ✓.

## 6. Rollback / recovery
- **Local:** restore from the validated `pg_dump` backup (§1) if ever needed.
- **Cloud:** return Aiven to the clean baseline with owner-approved, reverse-FK-ordered `DELETE`s (schema
  + migrations stay); or drop/recreate content via the same import. No destructive command was used.

## 7. Security notes / remaining owner actions
- ⚠️ **The admin password was copied to the cloud and was earlier exposed in chat.** Change it after
  first cloud login (`/admin/account/`) **and** rotate the Aiven DB password + R2 token (all were handled
  in chat during setup). Update local `.env` + the host's secrets afterward.
- Keep local dev on `MEDIA_STORAGE_PROVIDER="local"` and confirm the R2 Public Development URL is disabled.
- `AnalyticsProviderConnection` (2 rows) were copied; analytics **collection stays disabled by default** —
  review provider config before enabling anything in production.
- Website not deployed; local default storage unchanged; Batch 13 not started.

---
*Tooling committed: `scripts/cloud-data-import.mts` (guarded, --confirm, single-transaction),
`scripts/cloud-db.mts` (audit/verify). No secrets, dumps or media committed.*
