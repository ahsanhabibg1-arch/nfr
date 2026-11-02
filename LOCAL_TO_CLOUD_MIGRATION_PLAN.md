# NFRGuide.com — Local → Cloud Migration Plan & Dry-Run

**Status:** AUDIT + BACKUP + DRY-RUN complete. **No Aiven/R2 write performed. Awaiting owner approval.**
**Companion:** `LOCAL_TO_CLOUD_MIGRATION_AUDIT.md`. **Date:** 2026-11-02.

## A. What is actually being migrated
From the audit: the local DB holds **seed/demo + reference data** (not a corpus of original production
articles), Aiven is an **empty-content clean baseline**, and there are **no managed media blobs** to move
to R2 (DB media are static `/assets/` files; the 33 `var/media` files are DB-less orphans).

So the real question is a **content-policy decision**, below (§B), not a hard technical migration.

## B. Owner decision — what should production start with?
- **Option 1 — Clean production start (recommended).** Keep Aiven's schema (already deployed); do **not**
  copy the demo articles. Migrate only what production genuinely needs now, and author real content on the
  cloud. Simplest, cleanest, no demo data in production.
  - Sub-options for "what production needs now": **reference data only** — the 5 Categories, 7 Disciplines
    (+ their guide content), 15 NavigationItems, 55 SeoRules, 2 AnalyticsProviderConnections — without the
    11 demo Articles/blocks/authors/sources/tags.
- **Option 2 — Full faithful copy.** Data-only import of the entire local content set (11 demo articles,
  authors, tags, sources, hubs/events/editions, nav, SEO rules) into Aiven, excluding dev-only rows (§D).
  Production then contains the demo dataset.
- Either way: **sessions are excluded**, orphans are **not** uploaded, and the generated `searchVector`
  repopulates itself on the cloud.

## C. Identity decision (owner)
- **Admin account:** either (a) **copy** the existing `super_admin` user row (keeps the same login/
  password on cloud), or (b) **bootstrap a fresh** cloud Super Admin (`DATABASE_URL=<cloud> npm run
  bootstrap:admin`) and do **not** copy the local user. Recommended: **(b) fresh bootstrap** — avoids
  moving a dev password hash into production and lets you set a production-only credential. *(The password
  was also exposed in chat earlier; a fresh cloud credential is cleaner.)*
- **Exclude always:** `Session` (2 dev sessions), any dev-only `SystemSetting`, rate-limit/transient state.

## D. Database migration method (when §B/§C are chosen)
Data-only, schema untouched (schemas are identical — see audit §6):
1. Re-confirm source + destination fingerprints and backup validity.
2. Generate `pg_dump --data-only` of the **approved tables only** (per §B/§C), **excluding** `Session`,
   `_prisma_migrations`, and any excluded identity rows. Generated columns (`searchVector`) are omitted by
   pg_dump automatically.
3. Import into Aiven with FK-safe ordering (dependency-ordered dump; single transaction; **no** global
   constraint disabling, **no** `--clean`, **no** reset). Restrict/strict error handling — abort on any error.
4. Fix identity/sequence values where any sequence-backed columns exist (most PKs are UUID strings).
5. Verify (read-only): row counts per table match the approved set; FK/relationship integrity; FTS +
   generated column + GIN behavior; publication status, slugs, SEO, audit preserved.

## E. Media
- **No R2 upload.** The 4 DB assets are static `/assets/` files shipped with the app (the deployed app
  serves them). The 33 `var/media` orphans are **not** migrated (no DB record). R2 stays at 0 objects
  until real managed uploads happen in production via the existing gated pipeline.
- If, later, production uploads managed media, they flow through the existing Batch 05 → R2 adapter +
  `/api/media` gated proxy (already verified). No new uploader.

## F. Resumability, consistency, rollback
- A data-only import of this size is a single short transaction; if it fails it rolls back wholly (Aiven
  left at 0 business rows — the clean baseline). Re-runnable because PKs are explicit (same ids → a second
  run would conflict, which is the desired guard against duplicates; the plan checks counts first).
- **Rollback:** Aiven can be returned to the clean baseline by deleting the imported rows (owner-approved,
  scoped `DELETE` per table in reverse-FK order) — the schema + migrations remain. The local source backup
  (audit §5) is the authoritative recovery point for local.
- **No source drift during cutover:** the import runs from the validated `pg_dump` snapshot, not a live
  read, so local changes during the window do not corrupt the copy (and would simply not be included).

## G. Acceptance criteria (for the execution phase, later)
Approved-set row counts match source; required IDs/relationships preserved; FTS/GIN functional on Aiven;
gated media proxy still enforced; **no** unapproved cloud rows deleted/overwritten; **no** sessions/dev
secrets copied; local data intact; backup + manifest available.

## H. Dry-run summary (for approval)
1. **Source:** `localhost/nfrguide_dev` (office dev) — 11 Articles + seed/reference data; 1 super_admin;
   2 dev sessions; 4 legacy-local media (static); 33 orphan disk blobs.
2. **Destination DB:** Aiven PG 18.6, schema (11 migrations), **0 business rows** (clean).
3. **Proposed DB method:** data-only import of the **approved** subset (Option 1 or 2), excluding sessions
   + dev identity; no schema change; no reset.
4. **Media:** **0 objects to upload** to R2 (bucket currently 0); orphans excluded.
5. **Schema conflicts:** none (identical migration history).
6. **Missing media files:** none required (static assets ship with app).
7. **Proposed exclusions:** `Session` (2), 33 `var/media` orphans, optionally the local `super_admin` row
   (prefer fresh cloud bootstrap), optionally the 11 demo Articles (Option 1).
8. **Expected cloud changes:** INSERT-only into the approved content tables (0 → N); R2 unchanged.
9. **Recovery:** local `pg_dump` backup (valid, checksummed); Aiven rollback via scoped deletes to baseline.
10. **Approval required:** choose **§B option** + **§C identity option**, then I prepare the exact
    data-only import, show the precise per-table plan + command (secrets redacted), and **stop again**
    before the first Aiven INSERT.

**No cloud write occurs until the owner approves §B and §C.**
