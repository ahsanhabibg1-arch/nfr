# NFRGuide.com — Local → Cloud Migration Audit (read-only)

**Type:** infrastructure migration audit + backup + dry-run. **No Aiven/R2 write performed.**
**Date:** 2026-11-02. **Baseline:** `f821d5a`. **Written for:** the project owner.

> **Headline:** the local source is **seed-level content** (no large hand-authored dataset), Aiven is a
> **clean schema baseline (0 business rows)**, and **there is essentially nothing to upload to R2** — all
> DB media are static `/assets/` files, and the blobs on disk are **orphans with no DB records**. So the
> decision is mostly *whether to copy the demo/seed data into production at all* (see the Plan).

## 1. Source environment (confirmed)
- **Source DB:** `localhost / nfrguide_dev` (user `nfrguide_dev_user`) — this machine = **office dev**.
  `_prisma_migrations` present. *(Owner: please confirm this is the intended source, not the home machine.)*
- **Row counts (business/content):**
  | Table | Rows | | Table | Rows |
  |---|--:|---|---|--:|
  | Article | 11 | | Discipline | 7 |
  | ArticleBlock | 48 | | RodeoHub / Event / Edition | 3 / 3 / 3 |
  | Category | 5 | | Venue / Competitor | 0 / 0 |
  | Tag | 42 | | EntitySeo / EntityFaq | 0 / 0 |
  | Author | 6 | | NavigationItem | 15 |
  | Source | 6 | | SeoRule | 55 |
  | ArticleMedia | 11 | | AnalyticsProviderConnection | 2 |
- **Identity:** 1 user — `mo***@gmail.com`, ACTIVE, `super_admin`. **2 Sessions** (dev test sessions).
  41 AuditLog rows. *(No hashes/tokens printed.)*
- **Nature:** this matches the idempotent **seed** plus a bootstrapped admin — i.e. demo/reference data,
  not a corpus of originally-authored production articles.

## 2. Media audit (important)
- **MediaAsset rows: 4 — all `storageProvider = legacy-local`**, URLs `/assets/images/…jpg`. These are
  **static files in the repo's `/public/assets`**, served directly by the deployed app — **not managed
  blobs**, so **nothing to upload to R2** for them.
- **`var/media` on disk: 33 files** (11 × original.png + `__md.webp` + `__thumb.webp`) that have **no
  corresponding MediaAsset DB rows** → **ORPHANS** (leftovers from smoke tests / pre-reset uploads whose
  DB rows were wiped). These must **not** be migrated (no approved record) — tracked as orphans.
- Net: **0 managed media assets to migrate**; the media-library R2 transfer is a no-op beyond the orphan
  report.

## 3. Destination — Aiven PostgreSQL (read-only audit)
- Host `pg-255de366…` / `defaultdb`, PostgreSQL **18.6**, TLS 1.3.
- `_prisma_migrations`: **11 applied, 0 rolled back** (schema identical to source migration history).
- **Business/content rows: 0 across every content table** → **clean baseline, no conflict**, safe for a
  data-only import. `Article.searchVector` (generated tsvector) + GIN index + FTS verified present.

## 4. Destination — Cloudflare R2 (read-only)
- Bucket `nfr`: **0 objects** (ListObjectsV2). Token verified working (round-trip 7/7 earlier).
- `/api/media/<key>` gated proxy enforced; adapter `publicUrl` returns the gated path (no direct bucket
  URLs for private/draft). *(Owner to confirm the Public Development URL is disabled and token is
  bucket-scoped — see Plan.)*

## 5. Backup (source, pre-migration)
- `pg_dump -Fc` of `nfrguide_dev` → `D:\MoynullHasan\personal\nfrguide-db-backups\nfrguide_dev_premigration_20261102093534.dump`
  (199,224 bytes). `pg_restore --list`: **VALID, 71 TABLE DATA entries**. SHA-256 recorded in the sidecar
  `.sha256` file. Stored **outside** the repository. *(No Aiven backup needed — Aiven has 0 business rows.)*

## 6. Schema compatibility
- Source and destination share the **same 11 migrations** (identical history) → **fully compatible**; a
  **data-only** import is the correct method (no schema restore, no migration regeneration).
- `Article.searchVector` is a **GENERATED** column — `pg_dump --data-only` omits generated columns
  automatically, so the cloud column repopulates itself on insert (no attempt to write it). FTS/GIN
  preserved by construction.
- PKs are mostly UUID strings (few sequences); timestamps/slugs/SEO/publication/audit are plain columns
  that copy as-is.

---
*Read-only audit. No Aiven or R2 write occurred. Local databases untouched. No secrets printed.*
