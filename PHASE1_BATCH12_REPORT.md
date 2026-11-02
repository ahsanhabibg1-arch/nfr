# NFRGuide.com — Phase 1 / Batch 12 Implementation Report
## Venue & Competitor Entity Management

**Baseline:** `702746f` · **Branch:** `batch-01-nextjs-migration` · **Date:** 2026-11-02
**Written for:** the project owner, as the acceptance record for Batch 12.

Implemented per the approved plan and owner decisions D1–D7. Additive only; no database reset; no
destructive migration; no fabricated content; no secrets committed; not deployed.

---

## 1. Implementation summary
Venue (extended) and Competitor (new) entities with public profile pages, dedicated CMS management,
edition-level participation, discipline/article links, media-library integration, and reuse of the
Batch 11 polymorphic SEO/FAQ layer (no competing system). All owner decisions honored:
- **D1** routes `/venues/[slug]/` + `/competitors/[slug]/` (trailing-slash canonical preserved).
- **D2** participation is edition-level only; never the recurring event; no auto-transfer.
- **D3** richer Venue (summary, description, nickname, website, capacity, openedYear, lat/long).
- **D4** venue stays at edition level; no permanent venue on `RodeoEvent`.
- **D5** reuses `rodeo.manage`; no new permission strings; five roles unchanged.
- **D6** full Competitor CMS + model, but **no invented** profiles/results/rankings/prize money.
- **D7** replay role is owner-provisioned (see §8); not run here (dev role lacks CREATEDB).

## 2. Venue & Competitor schema
- **`Venue`** (extended, additive): `nickname?`, `summary?`, `description?`, `websiteUrl?`,
  `capacity? Int`, `openedYear? Int`, `latitude? Float`, `longitude? Float`, `sortOrder Int @default(0)`
  — plus existing `slug/name/city/state/country/editions/media`.
- **`Competitor`** (new): `id`, `slug @unique`, `fullName`, `knownAs?`, `summary?`, `guide? Json`,
  `hometownCity?`, `state?`, `country?`, `birthYear? Int`, `status?`, `heroImage?`, `imageCredit?`,
  `sortOrder`.
- **`CompetitorDiscipline`** `(competitorId, disciplineId)`; **`CompetitorParticipation`**
  `(competitorId, editionId)` + `result?`/`placement?`/`note?`; **`ArticleCompetitor`**
  `(articleId, competitorId)`; **`CompetitorMedia`** `(competitorId, mediaId)`.
- **`LandingEntityType`** enum += `VENUE`, `COMPETITOR` (7 values total).

## 3. Relationships & data integrity
- All junctions are composite-PK with `onDelete: Cascade` FKs to their parents.
- `Competitor` delete is **reference-safe**: blocked if any PUBLISHED article links it; junctions
  cascade; polymorphic `EntitySeo`/`EntityFaq` rows are cleaned in the service (no orphans).
- `Venue` delete is blocked while editions reference it; cleans its landing SEO/FAQ rows.
- Participation integrity enforced in `competitorService` (edition must exist; discipline/competitor
  ids validated on set); zod validation on all inputs (URL, year/capacity ranges, HTML rejected).
- Verified by `tests/batch12.test.ts` (delete cascade + no-orphan assertions).

## 4. CMS feature coverage
- **`/admin/venues/`** — list + create/edit (all rich fields) + delete (guarded by edition links).
- **`/admin/competitors/`** — master-detail: core fields, discipline multi-select, edition-level
  participation (add/update/remove with result/placement), delete; "View page" links.
- **Landing-Page SEO & FAQ** manager extended to the two new types (SEO overrides, intro, FAQs).
- **Media Library** extended (`assignRodeoMedia`/`unassignRodeoMedia` `kind: 'competitor'|'venue'`).
- Sidebar + module registry gained `venues` and `competitors` (now **14 CMS modules**; metadata only).
- Authorization: actions authenticate then the services require `rodeo.manage`; all mutations audited.

## 5. Public routes & SEO coverage
- `/venues/[slug]/` and `/competitors/[slug]/` — `generateStaticParams` + `dynamicParams` +
  `revalidate=300`, trailing-slash canonical; only PUBLISHED articles surfaced.
- `generateMetadata` via `mergeSeoMeta` (editor overrides + fallback; `noindex` additive-only).
- Conditional structured data from **verified fields only**: `Place` (venue; omits unknown
  address/geo/capacity), `Person` (competitor), `FAQPage` (exactly the visible FAQs), `BreadcrumbList`.
- Thin/empty entities are **non-indexable** (`derivedNoindex`) and excluded from the sitemap.
- `sitemap.xml` lists only content-bearing, non-noindex venues/competitors.
- Internal links: competitor↔discipline/edition/article, venue↔edition, breadcrumbs.

## 6. Migration SQL & safety assessment
Migration `20261101200000_batch12_venue_competitor` — **fully additive**: `ALTER TYPE … ADD VALUE`
(×2), `ALTER TABLE "Venue" ADD COLUMN` (×9), 5 `CREATE TABLE`, 6 `CREATE INDEX`, 8 `ADD FOREIGN KEY`.
**Zero** `DROP`/`DROP COLUMN`/`DROP INDEX`/column-type changes (verified by grep). The
`Unsupported("tsvector")` declaration suppressed the usual searchVector drift — **no hand-stripping
needed** this time. `Article.searchVector` + GIN + FTS preserved. Applied to **test** via
`migrate deploy`; dev was **baselined** (migrations 01–11 `--applied`) then batch12 deployed — no
re-run, no data loss. Durable backup taken first (§7).

## 7. Durable backup verification
- `pg_dump` v17 custom-format of the dev DB, validated with `pg_restore -l` (65 TABLE DATA entries).
- Durable copy: `D:\MoynullHasan\personal\nfrguide-db-backups\nfrguide_dev_backup_20261101_154750.dump`
  (outside source control). Scratchpad original retained. No credentials exposed.

## 8. Fresh-from-zero migration replay — **OUTSTANDING**
The dev role lacks `CREATEDB`, so the disposable-DB replay could not run; the gate fell back to
verifying FTS on the fully-migrated test DB — **5/5 passed** (tsvector generated column, GIN index,
`websearch_to_tsquery`, all expected tables). To clear the gate (owner-approved; local; no Docker;
no reset), as a local Postgres admin:
```
CREATE ROLE nfrguide_replay LOGIN PASSWORD '***' CREATEDB;   -- choose your own password
```
then set `MIGRATION_REPLAY_ADMIN_URL="postgresql://nfrguide_replay:***@localhost:5432/postgres"` in
`apps/web/.env` (not committed) and run `npm run test:migration`.

## 9. Test & build results (actual)
- **Prisma validate:** valid. **TypeScript `tsc --noEmit`:** clean (exit 0).
- **Vitest:** **206/206 passed, twice** (serial) — includes new `batch12-unit` (4) + `batch12` DB (8),
  and the updated `permissions-unit` (14-module assertion).
- **`next build`:** success; `/venues/[slug]` + `/competitors/[slug]` prerendered (SSG),
  `/admin/venues` + `/admin/competitors` present.
- **Route smoke:** 37/37 (incl. new 404 routing + sitemap-driven entity checks).
- **Admin-auth smoke:** 16/16 (incl. `/admin/venues/` + `/admin/competitors/` → 200 authenticated).
- **Media regression:** 7/7. **Cache/publish regression:** 10/10 (dev server).
- **FTS/migration gate:** 5/5 (test-DB fallback; full replay OUTSTANDING per §8).

## 10. Browser / end-to-end QA (actual)
Against the production build (`next start`, fresh client): created temporary, clearly-labeled test
entities, then verified and **deleted** them (dev ships empty — no fabricated data retained):
- Venue page → **200**; `Place` + `FAQPage` JSON-LD; canonical; capacity in JSON-LD; indexable; FAQ rendered.
- Competitor page → **200**; `Person` + `FAQPage` JSON-LD; canonical; indexable; participation + result rendered.
- Thin (no-content) competitor → **non-indexable** and excluded from the sitemap source.
- Admin venues/competitors pages → 200 authenticated (admin smoke).
- Cleanup confirmed: 0 venues, 0 competitors, 0 Batch-12 FAQ/SEO/participation remaining.

## 11. Known limitations
- No seeded venue/competitor data (owner D6 — empty states, no fabrication).
- View analytics not yet tracking venues/competitors (`AnalyticsEntityType` not extended — out of
  scope); `ViewBeacon` omitted on these pages. All other analytics unchanged.
- Media assignment for these entities reuses `assignRodeoMedia`; a dedicated in-page media picker is
  future UX (competitor hero image is a URL field today).
- **A `next dev` server started before this batch holds a stale Prisma client and will 500 on the
  new pages until restarted** (Windows `prisma generate` engine-DLL EPERM is cosmetic; the on-disk
  client is current, as the production build + fresh processes confirm). **Restart `next dev`.**
- Fresh-from-zero replay OUTSTANDING (§8).

## 12. Files created / modified
**Created:** `apps/web/lib/cms/competitorService.ts`, `apps/web/lib/batch12Content.ts`,
`apps/web/app/(public)/venues/[slug]/page.tsx`, `apps/web/app/(public)/competitors/[slug]/page.tsx`,
`apps/web/app/admin/(dashboard)/venues/page.tsx`, `apps/web/app/admin/(dashboard)/competitors/page.tsx`,
`apps/web/app/admin/competitor-actions.ts`, `apps/web/views/admin/AdminVenuesPage.tsx`,
`apps/web/views/admin/AdminCompetitorsPage.tsx`,
`apps/web/prisma/migrations/20261101200000_batch12_venue_competitor/migration.sql`,
`apps/web/tests/batch12-unit.test.ts`, `apps/web/tests/batch12.test.ts`,
`PHASE1_BATCH12_PLAN.md`, `PHASE1_BATCH12_REPORT.md`.
**Modified:** `apps/web/prisma/schema.prisma`, `lib/cms/{rodeoService,landingEntities,landingAdminService,mediaService}.ts`,
`lib/seo.tsx`, `lib/auth/permissions.ts`, `config/routes.ts`, `app/sitemap.ts`,
`app/admin/(dashboard)/landing-seo/page.tsx`, `views/admin/AdminLandingSeoPage.tsx`,
`components/admin/AdminSidebar.tsx`, `scripts/{route-smoke,admin-auth-smoke}.mts`,
`tests/permissions-unit.test.ts`, and docs (DATABASE_ARCHITECTURE / RBAC_PERMISSION_MATRIX /
MIGRATION_STATUS / KNOWN_LIMITATIONS).

## 13. Git commit
Recorded on commit — see the commit that carries this report on `batch-01-nextjs-migration`.

## 14. Recommended Batch 13 priorities
1. **Clear the replay gate** (provision `nfrguide_replay`, run the full from-zero replay).
2. **Venue/competitor index pages** (`/venues/`, `/competitors/`) + homepage/section surfacing.
3. **Extend `AnalyticsEntityType`** with VENUE/COMPETITOR and re-enable `ViewBeacon` on their pages.
4. **In-page media picker** for venues/competitors (galleries) using the Media Library.
5. **Seed real, verified** flagship venue/competitor records (sourced, non-fabricated).
6. **Competitor → edition results** richer modeling (standings) if/when verified data is sourced.
