# NFRGuide.com — Phase 1 / Batch 04 Report
## Editorial Management Modules: Dashboard, Articles, Rodeo Coverage, Taxonomy, Sources & Navigation

**Branch:** `batch-01-nextjs-migration`  ·  **Date:** 2026-10-29
**Stack:** Next.js 16.4.3 (App Router) · React 19 · TypeScript · PostgreSQL 17 · Prisma 6.19.3

Batch 04 transforms the CMS's remaining core editorial modules from static/demo
interfaces into secure, functional, database-backed administrative systems.
Every mutation is authenticated, permission-checked, validated, audited and
persisted. **Batch 05 was not started.**

---

## A. Scope & Baseline

Six functional areas, all delivered:
- **A. Overview dashboard** — real metrics from the DB (status counts, pending
  reviews, recently updated, by-section/discipline tallies, audit activity),
  with an honest "analytics not connected" notice (no fabricated traffic data).
- **B. Advanced Article Management** — server-side search / filter / sort /
  pagination.
- **C. Rodeo Coverage** — hubs, recurring events, annual editions, venues,
  disciplines (read-only), with the event↔edition distinction preserved.
- **D. Editorial Organization** — categories (protected primary sections), tags,
  author bylines (distinct from login users).
- **E. Sources & References** — CRUD with URL safety + verification dates.
- **F. Website & Navigation** — DB-backed header/footer with static fallback.

Baseline (Batch 01–03) left intact: Next.js migration, Postgres/Prisma, auth +
server-side RBAC + article CRUD/workflow/revisions/audit, publish cache
invalidation. All prior tests still pass.

## B. Architecture

All modules share one pattern — **Server Component route → Client view → Server
Action → `server-only` service** — with a shared guard at the enforcement
point. Full details in [EDITORIAL_CMS_ARCHITECTURE.md](EDITORIAL_CMS_ARCHITECTURE.md).
The guard (`lib/cms/guard.ts`) centralizes actor resolution, default-deny
permission checks, audit logging and typed `ActionResult` error normalization.

## C. Dashboard (real data)

`getDashboardData({ viewerId, canViewAll })` in `lib/cms/adminQueries.ts`:
RBAC-scoped (an actor without `article.edit.any` sees only their own work via
`createdById`), status counts via `groupBy`, published tallies by section and
discipline, pending reviews, recently updated, and a recent-activity feed from
`AuditLog`. The page renders KPI tiles and explicitly states traffic/search
analytics are **not connected** rather than inventing numbers.

## D. Advanced Article Management

`getAdminArticleList(params)` performs all search/filter/sort/pagination in the
database: free-text (`q`) across title/excerpt/author, filters by status /
category / discipline / author, sort by updated|created|published, `skip`/`take`
pagination returning `{ rows, total, page, pageSize, totalPages }`. The view
(`AdminArticlesPage`) drives it through URL query params (shareable, server-
rendered) with status tabs, search, filters, bulk publish/delete and pagination.

## E. Rodeo Coverage

`lib/cms/rodeoService.ts` + `rodeo-actions.ts` + `AdminRodeoCoveragePage.tsx`.
Recurring events (stable identity) are modelled separately from annual editions
(one occurrence, unique `editionSlug` per event); the UI enforces the
distinction. Hubs, venues and disciplines complete the set. Deletion is
restrict-on-delete for anything referenced by articles/editions. Details:
[RODEO_ENTITY_MANAGEMENT.md](RODEO_ENTITY_MANAGEMENT.md).

## F. Editorial Organization

`lib/cms/taxonomyService.ts` + `taxonomy-actions.ts` + `AdminEditorialOrgPage.tsx`.
Categories (five `cat-*` primary sections protected — label editable, slug
locked, deletion blocked), tags, and author bylines kept **distinct from CMS
login users**. Details: [CONTENT_TAXONOMY.md](CONTENT_TAXONOMY.md).

## G. Sources & References

`lib/cms/sourceService.ts` + `source-actions.ts` + `AdminSourcesPage.tsx`. URL
safety via `isSafeHref`; `VERIFIED` records the real time of the editorial
action as the verification date; sources cited by articles cannot be deleted.
Details: [SOURCES_REFERENCE_SYSTEM.md](SOURCES_REFERENCE_SYSTEM.md).

## H. Website & Navigation

New `NavigationItem` model + offline migration. `navigationService.ts` serves a
DB-backed header + two footer columns with a built-in **static fallback** (the
site never renders empty), canonical-link protection (`isSystem` rows can be
hidden but not deleted; url/location locked), and URL validation. The public
`SiteHeader`/`SiteFooter` consume it via the public layout, keeping their own
component-level fallback. Details:
[NAVIGATION_MANAGEMENT.md](NAVIGATION_MANAGEMENT.md).

## I. Database Changes

One new table, `NavigationItem` (see schema §F). No existing tables altered, no
data reset, the 11 seeded articles and 7 disciplines untouched.

## J. Migration

Generated **offline** (least-privilege roles have no shadow-DB rights):
`prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --script`
→ `prisma/migrations/20261029100000_batch04_navigation/migration.sql`, applied
to **both** dev and test with `prisma migrate deploy`. Client regenerated. See
[MIGRATION_STATUS.md](MIGRATION_STATUS.md).

## K. RBAC / Permission Matrix

Five new permissions added to the default-deny matrix (`lib/auth/rbac.ts`):
`rodeo.manage`, `taxonomy.manage`, `author.manage`, `source.manage` (Editor+),
and `navigation.manage` (Administrator/Super Admin only). Mirrored to the DB via
`roleSync`. Rationale + full matrix in
[RBAC_PERMISSION_MATRIX.md](RBAC_PERMISSION_MATRIX.md). **Owner approval of this
matrix is requested** (see §P).

## L. Security

Default-deny enforcement re-checked in every service (not just the UI);
server-side actor resolution from the session cookie; zod validation on all
input; URL-scheme safety on source/navigation URLs; CSRF-safe Server Actions;
full audit trail. RBAC enforcement is proven by tests (forbidden roles rejected
at the service boundary), consistent with the "no unproven security claims"
rule.

## M. Referential Integrity

Restrict-on-delete across sources, rodeo entities, categories, author bylines
and canonical navigation — no silent cascade of published editorial content.
Enumerated in [EDITORIAL_CMS_ARCHITECTURE.md §5](EDITORIAL_CMS_ARCHITECTURE.md).

## N. Cache Invalidation (HTTP-level)

`scripts/cache-invalidation.mts` (`npm run test:cache`) drives a full
publish→unpublish cycle over HTTP against the running server and asserts the 8
observable points — **10/10 pass**. See
[BATCH04_TEST_REPORT.md](BATCH04_TEST_REPORT.md) for the points and the
dev-vs-production caching note.

## O. Testing & Regression (final sign-off — all green)

- `npx prisma validate` — schema valid.  ·  `npx prisma generate` — Client v6.19.3.
- `npm run typecheck` — clean.
- `vitest run` against the test DB — **77/77** (incl. **27** Batch 04 tests in
  `tests/batch04.test.ts`); deterministic on three consecutive runs.
- **`npm run build` — PASS** (production build: compiled 10.2s, 28/28 static
  pages, all routes). Ran after stopping the dev server (owner-approved).
- `npm run test:routes` — **24/24** against the production server (`npm run start`).
- `scripts/admin-auth-smoke.mts` — **6/6** admin routes render 200 authenticated
  on the production build.
- `npm run test:cache` — **10/10** (dev server; see BATCH04_TEST_REPORT §3 for
  the prod-vs-dev rationale).
- **Role-sync hardening:** `lib/auth/roleSync.ts` made idempotent + concurrency-
  safe, fixing a flaky parallel-test race (BATCH04_TEST_REPORT §1.1).

Full detail and exact commands: [BATCH04_TEST_REPORT.md](BATCH04_TEST_REPORT.md).

## P. Owner Decisions — Approved & Implemented

The owner approved the following at Batch 04 sign-off; all are implemented:

1. **Permission matrix** (§K): content modules (rodeo/taxonomy/author/source) at
   **Editor+**; navigation at **Administrator+**. Shipped as-is — no change
   needed. All mutations are server-side RBAC-checked and audited (decision 3).
2. **Automatic canonical navigation seeding** (decision 4): the Prisma seed now
   calls `seedCanonicalNavigation()` (`lib/cms/navCanonical.ts`) which creates
   any missing canonical links as protected `isSystem` rows. It is idempotent
   (create-missing-only), **never overwrites administrator-customized values**
   (decision 5), and **never deletes** existing navigation. The static fallback
   remains for uninitialized/unavailable-DB scenarios. The admin "restore
   canonical links" action shares the same non-destructive implementation.
   The five protected canonical section routes are preserved (decision 6).
   Covered by four new tests (first-time init, idempotent repeat, no-overwrite,
   no-deletion).

## Q. Files & How to Verify

**New:** `lib/cms/{rodeoService,taxonomyService,sourceService,navigationService,navTypes,navCanonical,guard}.ts`,
`app/admin/{rodeo-actions,taxonomy-actions,source-actions,navigation-actions}.ts`,
`views/admin/{AdminRodeoCoveragePage,AdminEditorialOrgPage,AdminSourcesPage,AdminWebsiteNavPage}.tsx`,
`prisma/migrations/20261029100000_batch04_navigation/`,
`tests/batch04.test.ts`, `scripts/{cache-invalidation,admin-auth-smoke}.mts`,
`scripts/server-only-hook.mjs`, and the seven Batch 04 docs.
**Modified:** `lib/auth/{rbac,roleSync}.ts`, `lib/cms/adminQueries.ts`,
`app/admin/(dashboard)/{page,articles/page,rodeo-coverage/page,editorial-organization/page,sources/page,website/page}.tsx`,
`views/admin/AdminArticlesPage.tsx`, `components/{SiteHeader,SiteFooter,PublicChrome}.tsx`,
`app/(public)/layout.tsx`, `prisma/schema.prisma`, `prisma/seed.ts`, `package.json`.

**Verify:** see [BATCH04_TEST_REPORT.md §6](BATCH04_TEST_REPORT.md).

---

**Batch 05 was not started**, per instructions.
