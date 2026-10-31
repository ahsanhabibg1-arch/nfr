# NFRGuide.com — Migration Status (Phase 1 / Batch 01)

**Updated:** 2026-10-28 · **Branch:** `batch-01-nextjs-migration`

## Applications

| App | Location | Stack | Status |
|---|---|---|---|
| Phase 0 reference | repo root | React 19 + Vite 8 + React Router 7 (SPA) | **Preserved, unchanged, buildable** |
| Phase 1 target | `apps/web/` | Next.js 16.4.3 App Router + React 19 + Tailwind v4 | **Running locally; build passes** |

The Vite app is intentionally retained until migration parity is signed off. Do
not delete it yet.

## Batch 01 Completion Criteria (§18)

| # | Criterion | Status |
|---|---|---|
| 1 | Original baseline recorded | ✅ lint/test/build captured (all pass) |
| 2 | Next.js app runs locally | ✅ `npm run dev` / `npm run start` |
| 3 | Public routes render correctly | ✅ home, 5 sections, article, discipline, category |
| 4 | Admin module routes render | ✅ 12 modules + editor (browser-verified) |
| 5 | Existing design preserved | ✅ Concept C tokens/fonts/layout reused; no redesign |
| 6 | Article editor usable as demo | ✅ 8 fields, workflow, blocks, validation render |
| 7 | Server-rendered public pages | ✅ Server Components + SSG/static |
| 8 | Per-route metadata | ✅ Metadata API (title/desc/canonical/OG/JSON-LD) |
| 9 | Redirects at HTTP level | ✅ 308 permanent for 5 legacy paths |
| 10 | Public content eligibility respected | ✅ published-only adapter; unknown/unpublished → 404 |
| 11 | Build and TypeScript checks pass | ✅ `next build` + `tsc --noEmit` exit 0 |
| 12 | Migration status + limitations documented | ✅ this file + KNOWN_LIMITATIONS.md + PHASE1_BATCH01_REPORT.md |

## Feature Parity

| Area | Phase 0 (Vite) | Batch 01 (Next) | Notes |
|---|---|---|---|
| Public pages | ✅ | ✅ | Server-rendered; design preserved |
| Legacy redirects | client `<Navigate>` | ✅ HTTP 308 | chain only for no-slash inbound (trailingSlash normalization) |
| SEO metadata | client DOM injection | ✅ server Metadata API | genuine improvement |
| Sitemap/robots | robots.txt only (sitemap 404) | ✅ generated `sitemap.xml` + `robots.txt` | new |
| Admin CMS UI (12) | ✅ | ✅ | ported, dynamic, noindex |
| Article editor | ✅ | ✅ | preserved + §14 fixes |
| Article persistence | sessionStorage (client) | sessionStorage (client, admin-only) | **not** server state; public reads static seed |
| Auth / RBAC | simulated | simulated (unchanged) | out of Batch 01 scope |
| Media upload | mock | mock (unchanged) | out of scope |
| SEO scanning | simulated | simulated (unchanged) | out of scope |

## Unmigrated / Out of Scope (by design, §17)

PostgreSQL/Prisma, production auth, server RBAC, CMS CRUD persistence, object
storage, scheduled-publishing jobs, SEO scan worker, production deployment.

## Local Commands

```bash
# Phase 0 reference app (repo root)
npm install --legacy-peer-deps
npm run dev            # Vite dev server :3000
npm run build          # vite build
npm test               # tsx tests/runner.ts

# Phase 1 Next.js app
cd apps/web
npm install
npm run dev            # next dev :3000
npm run build          # next build (also type-checks)
npm run start          # next start :3000 (needs a build first)
npm run typecheck      # tsc --noEmit
npm run test           # vitest unit suites
npm run test:routes    # HTTP route smoke (requires a running `npm run start`)
```

## Batch 02 Prerequisites

Owner sign-off on §K decisions (PHASE1_BATCH01_REPORT.md): package manager,
frozen NFR URLs, Next 16/React 19, `apps/web` layout, deployment/auth/DB choices.
Then Batch 02 replaces `lib/content.ts` reads with Prisma/PostgreSQL behind the
same function signatures.

---

# Phase 1 / Batch 02 — Database Status (addendum)

**Updated:** 2026-10-28 · PostgreSQL + Prisma 6.19.3 in `apps/web`.

## Batch 02 completion criteria (§17)

| # | Criterion | Status |
|---|---|---|
| 1 | PostgreSQL configured & reachable | ✅ PostgreSQL 17.10; `nfrguide_dev`/`nfrguide_test` + least-privilege roles created |
| 2 | Prisma schema valid | ✅ `prisma validate` |
| 3 | Initial migrations apply | ✅ `migrate deploy` applied to dev + test |
| 4 | Seed idempotent | ✅ two runs → identical counts (11/11/7/…) |
| 5 | Repositories work | ✅ typecheck + runtime (27/27 vitest) |
| 6 | All public article surfaces read DB | ✅ home, sections, article, category, discipline, search, sitemap |
| 7 | Eligibility enforced server-side | ✅ `PUBLISHED` filter in-query (draft/scheduled/archived excluded, tested) |
| 8 | Sitemap reflects published DB content | ✅ `app/sitemap.ts` async DB-backed |
| 9 | Existing public UI functional | ✅ `next build` 28 routes; route smoke 20/20 |
| 10 | Admin prototype intact & separate | ✅ unchanged client `sessionStorage` prototype |
| 11 | DB integration tests pass | ✅ 11/11 against `nfrguide_test` |
| 12 | TypeScript + production build pass | ✅ both |
| 13 | Documentation complete | ✅ |

## Commands
```bash
cd apps/web
cp .env.example .env            # set DATABASE_URL (see DATABASE_SETUP.md)
npm run db:setup                # migrate deploy + generate + seed
npm run build && npm run start  # verify SSG + serve
npm run test                    # vitest (DB integration runs when DB present)
npm run test:routes             # HTTP route smoke (server running)
```

## Batch 03 prerequisites
Owner-provided `DATABASE_URL`; then auth + server RBAC + activated CMS writes build
on the identity tables and the typed read repository.

---

# Phase 1 / Batch 03 — Auth / RBAC / CMS Persistence (addendum)

**Updated:** 2026-10-29.

| # | Batch 03 §18 criterion | Status |
|---|---|---|
| 1 | Real login/logout | ✅ (browser round-trip + session tests) |
| 2 | Sessions validated server-side | ✅ |
| 3 | Admin routes protected | ✅ (gate + route smoke) |
| 4 | Five-role RBAC enforced | ✅ (service + rbac tests) |
| 5 | Unauthorized mutations rejected | ✅ |
| 6 | Article CRUD persists to PostgreSQL | ✅ |
| 7 | Revision history persists | ✅ |
| 8 | Workflow transitions enforced | ✅ |
| 9 | Public publishing reflects DB | ✅ |
| 10 | Unpublishing does not leak stale content | ✅ (revalidate + tests) |
| 11 | Audit logs written | ✅ |
| 12 | Security tests pass | ✅ (50/50) |
| 13 | Existing public functionality preserved | ✅ (route smoke 24/24, build) |
| 14 | Production build passes | ✅ |
| 15 | Documentation complete | ✅ |

First login: `cd apps/web; npm run bootstrap:admin` (see AUTHENTICATION_ARCHITECTURE.md).

## Batch 04 — Navigation table

| Migration | Applied (dev) | Applied (test) |
|---|:--:|:--:|
| `20261028000000_init` | ✅ | ✅ |
| `20261029000000_batch03_auth_rbac` | ✅ | ✅ |
| `20261029100000_batch04_navigation` (adds `NavigationItem`) | ✅ | ✅ |

Batch 04 added exactly one table, `NavigationItem`; no existing tables were
altered and no data was reset (the 11 seeded articles and 7 disciplines are
untouched). The migration was generated **offline** — least-privilege DB roles
cannot create the shadow database `prisma migrate dev` requires:

```bash
# generate (no shadow DB needed):
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel  prisma/schema.prisma \
  --script > prisma/migrations/20261029100000_batch04_navigation/migration.sql
# apply to dev and test:
npx prisma migrate deploy
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
npx prisma generate
```

**Canonical navigation seed.** `prisma db seed` now also runs
`seedCanonicalNavigation()` — idempotent, create-missing-only; it never
overwrites administrator-customized rows and never deletes navigation. Safe to
re-run.

**Batch 04 build verification (2026-10-29).** With the dev server stopped:
`prisma validate` ✅ · `prisma generate` ✅ · `typecheck` ✅ ·
`vitest run` **77/77** (deterministic ×3) ✅ · `next build` ✅ (28/28 static
pages) · `test:routes` **24/24** (prod) ✅ · admin-auth smoke **6/6** (prod) ✅ ·
`test:cache` **10/10** (dev) ✅. No data deleted, no migrations reset. See
[BATCH04_TEST_REPORT.md](BATCH04_TEST_REPORT.md).
## Batch 05 — media/DAM migration

| Migration | Development | Test |
|---|:---:|:---:|
| `20261029200000_batch05_media` | Applied | Applied |

The migration is additive: it extends `MediaAsset` and adds five rodeo-media
junctions. Existing asset IDs, `/assets/images/...` URLs and relationships are
preserved; no remote file was downloaded and no database was reset. Verification:
Prisma valid, 95/95 tests (18 media), production build, 24/24 routes, 6/6 admin,
and 7/7 media HTTP checks.

## Batch 06 — SEO Intelligence (2026-10-31)
Additive migration `20261031000000_batch06_seo`, generated offline and applied to
dev + test. Extends `SeoRule`/`SeoAuditRun`/`SeoFinding`, adds enum values
(`SeoSeverity`: HIGH/MEDIUM/LOW/INFO; `SeoFindingStatus`: REOPENED; new
`SeoFindingKind`) and a new `SeoConfig` table. No existing tables dropped, no data
reset; all content/SEO metadata preserved. Verification: Prisma validate + generate
OK; typecheck clean; vitest 106/106 (deterministic ×2); `next build` PASS; route
smoke 24/24, admin smoke 8/8 (incl /admin/seo), media e2e 7/7, cache 10/10.

## Batch 07 — Analytics & Search Intelligence (2026-10-31)
Additive migration `20261031100000_batch07_analytics_search`, generated offline and
applied to **dev + test**. Adds enums (`AnalyticsEntityType`, `AnalyticsProvider`,
`ProviderConnectionStatus`); tables `SearchQueryEvent`, `SearchResultClickEvent`,
`ContentViewEvent`, `AnalyticsDailyAggregate`, `AnalyticsProviderConnection`,
`AnalyticsSyncRun`, `AnalyticsConfig`; and a DB-managed generated `tsvector` column
`Article."searchVector"` (weighted A/B/C) + GIN index `Article_searchVector_idx` for
full-text search (not modeled in Prisma — queried via parameterized `$queryRaw`). No
existing table altered destructively; no data reset; seeded content preserved.
Verification: Prisma validate + generate OK; typecheck clean; vitest **143/143**
(deterministic ×2); `next build` PASS; route smoke 28/28, admin smoke 9/9 (incl
/admin/analytics), media e2e 7/7. `test:cache` is a dev-mode test (see
BATCH07_TEST_REPORT.md).

```bash
# generated offline (no shadow DB) then applied to dev + test:
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script > \
  prisma/migrations/20261031100000_batch07_analytics_search/migration.sql
#   (tsvector column + GIN index appended by hand — see the migration file)
npx prisma migrate deploy
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
```
