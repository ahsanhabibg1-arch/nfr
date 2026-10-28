# NFRGuide.com — Phase 1 / Batch 02 Report
## PostgreSQL, Prisma ORM, Relational Editorial Data & Persistent Public Content

**Date:** 2026-10-28 · **Branch:** `batch-01-nextjs-migration` · **App:** `apps/web`

> **STATUS: PARTIALLY COMPLETE (code-complete; live-DB verification pending).**
> All schema, migration, seed, repository, public integration, tests and docs are
> written and pass every check that does not need a running database (schema
> validate, client generate, TypeScript, non-DB unit tests). The steps that
> require a live database — `migrate deploy`, `db seed`, `next build` (which
> pre-renders DB content), the DB integration suite, and route smoke — are
> **blocked on a `DATABASE_URL` the agent is not permitted to guess** (§M).
> Per Batch 02 §17, these are reported as pending rather than verified.

---

## A. Baseline & Environment Results

| Check | Result |
|---|---|
| Node.js / npm | v22.16.0 / 10.9.2 ✅ |
| PostgreSQL server | **Running** (`postgres` PID listening on 127.0.0.1:5432) ✅ |
| `psql` CLI / Docker daemon | not present / not running (neither required) |
| Credentials | **not provided** — password guessing was correctly blocked by policy |
| Prisma | 6.19.3 CLI + client (pinned stable; `npm latest` had resolved a mismatched 8-rc / 7 pair, corrected) |
| Git working tree | clean before this batch; on `batch-01-nextjs-migration` |

The Phase 0 Vite app and the Batch 01 Next.js app are untouched aside from additive
`apps/web` database files.

## B. Database Architecture

PostgreSQL + Prisma; **34 tables, 33 FKs, 8 enums**. Full detail in
[DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md). Editorial core (Article + blocks
+ SEO + revisions + workflow history + categories/tags/authors + relations), evidence
& media (sources, media + joins), rodeo coverage (disciplines, hubs, recurring
events, editions with `(eventId, editionSlug)` uniqueness, venues, junctions),
publishing & SEO foundation (redirects, rules, findings, audit runs), and an identity
foundation (users, roles, permissions, audit log) with **no auth logic**.

## C. Prisma Schema & Migrations

- Schema: [apps/web/prisma/schema.prisma](apps/web/prisma/schema.prisma) — `prisma validate` ✅, `prisma generate` ✅.
- Initial migration: [apps/web/prisma/migrations/20261028000000_init/migration.sql](apps/web/prisma/migrations/20261028000000_init/migration.sql)
  — generated **offline** via `prisma migrate diff` (no DB needed), version-controlled,
  639 lines. `migration_lock.toml` set to `postgresql`. Applied with `prisma migrate
  deploy` (not `db push`). **Apply is pending a live DB.**

## D. Seed Data Results

Idempotent seed ([apps/web/prisma/seed.ts](apps/web/prisma/seed.ts)) mapping the Phase 0
demo data → relational rows; upsert-by-stable-key + child-row reset. Full mapping and
integrity notes in [DATA_MIGRATION_REPORT.md](DATA_MIGRATION_REPORT.md). Compiles &
type-checks. **Execution (`db seed`) pending a live DB.**

## E. Repository Layer

Server-only repository [apps/web/lib/content.ts](apps/web/lib/content.ts) +
client [apps/web/lib/db.ts](apps/web/lib/db.ts) (singleton, `server-only`) +
mappers [apps/web/lib/mappers.ts](apps/web/lib/mappers.ts) (DB rows → existing
`Article`/`Discipline` shapes, so UI components are reused unchanged). Functions
(all published-only where public): `getPublishedArticles`,
`getPublishedArticleBySlug`, `getPublishedArticlesBySection`,
`getPublishedArticlesByCategory`, `getPublishedArticlesByDiscipline`,
`getRelatedPublishedArticles`, `getPublishedArticleSlugs`, `getPublishedCategories`,
`getRodeoDisciplineBySlug`, `getAllDisciplines`, plus homepage feeds
(`getHeroArticle`/`getSecondaryHeroStories`/`getLatestArticles`) and
`getPublishedSearchIndex`. The `PUBLISHED` filter is applied **in the query**, so
draft/in_review/approved/scheduled/archived never reach a public response.

## F. Public Website Integration

All public **article** surfaces now read the repository (server-side):
- Homepage feeds (hero/secondary/latest) + discipline grid — `app/(public)/page.tsx` → `HomeView` (props).
- Five section landings — `[section]/page.tsx` → async `SectionLandingView` (article feed + disciplines from DB).
- Article detail — `articles/[slug]/page.tsx` + async `ArticleView` (related from DB).
- Category archive — `categories/[slug]/page.tsx` → client `CategoryArchiveView` (articles via server props).
- Discipline guide + its article list — `disciplines/[slug]/page.tsx` + async `DisciplineGuideView`.
- Global search — `(public)/layout.tsx` fetches the published index + disciplines and passes them to the client `SearchModal`.
- Sitemap — `app/sitemap.ts` (published DB content).

**Documented temporary boundary (§9):** non-article homepage/section decorative
modules (entertainment features, shopping events, plan & watch guide cards, rodeo
hub & event cards, learning resources, quick-access) remain Phase 0 static content;
they are not core Master-Reqs entities and are not yet in the content database.

## G. SEO & Sitemap Integration

Metadata API retained; article/section/discipline metadata and Article/NewsArticle +
BreadcrumbList JSON-LD derive from DB-backed content. `app/sitemap.ts` lists only
published articles + sections + category archives + disciplines (admin/draft/scheduled/
archived excluded by construction). ISR `revalidate` added (home/category 60s,
disciplines 300s, articles 60s). No SEO scanning (out of scope).

## H. Security Boundaries

- `DATABASE_URL` is server-only (`lib/db.ts` + `lib/content.ts` + `lib/mappers.ts`
  all `import 'server-only'`); never imported by a Client Component; never in browser
  bundles. `.env` git-ignored; `.env.example` has placeholders only.
- Publication status is enforced in the DB query, not trusted from the client.
- No public article create/update/delete endpoints exist. No admin DB mutations are
  activated. The existing admin editor remains a client-only prototype (sessionStorage).
- No RBAC is claimed; identity tables are inert foundation (Batch 03).

## I. Tests Executed

| Suite | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | ✅ exit 0 (full async integration + seed + mappers) |
| Non-DB unit (6 suites) | `npx vitest run` | ✅ 16/16 passed |
| DB integration (`tests/content.test.ts`, 11 tests) | `npx vitest run` | ⏸ **skipped** (no `DATABASE_URL`); self-runs when a seeded DB is configured |
| Prisma schema | `prisma validate` / `generate` | ✅ |
| `next build` | `npm run build` | ⏸ **pending DB** (SSG pre-renders DB content) |
| Route smoke | `npm run test:routes` | ⏸ **pending DB** (needs running server + DB) |

The DB integration suite covers §13 items 1,3–15 (schema relationships, published-only
reads, draft/scheduled/archived exclusion, slug uniqueness, category/discipline/event
relationships, related queries, unknown-slug null, seed consistency, DB error
behaviour) and auto-skips without a database.

## J. Files Created & Modified

**Created:** `apps/web/prisma/schema.prisma`, `apps/web/prisma/seed.ts`,
`apps/web/prisma/migrations/20261028000000_init/*`, `apps/web/lib/db.ts`,
`apps/web/lib/mappers.ts`, `apps/web/.env.example`, `apps/web/tests/stubs/server-only.ts`;
docs: this report, `DATABASE_ARCHITECTURE.md`, `DATABASE_SETUP.md`, `DATA_MIGRATION_REPORT.md`.
**Modified:** `apps/web/lib/content.ts` (static adapter → async DB repository),
`apps/web/package.json` (Prisma deps + `db:*` scripts + `prisma.seed`),
`apps/web/vitest.config.ts`, public pages/views + `PublicChrome`/`SearchModal`/
`HomeView`/`CategoryArchiveView` (async/props), `app/sitemap.ts`,
`apps/web/tests/content.test.ts` (→ DB integration). Docs updated: `ARCHITECTURE.md`,
`DATA_MODELS.md`, `MIGRATION_STATUS.md`, `KNOWN_LIMITATIONS.md`.

## K. Remaining Limitations

- Live-DB steps pending credentials (migrate/seed/build/integration/route-smoke).
- Admin CMS still writes only to `sessionStorage` (prototype); no DB writes activated.
- No auth/RBAC; identity tables are foundation only.
- Decorative non-article modules remain static (documented boundary).
- Media binaries are referenced URLs; no object storage (out of scope).

## L. Batch 03 Readiness

Schema, migrations, seed, repository and SEO/sitemap are in place. Batch 03 (auth +
server RBAC + activated CMS writes) can build on the identity tables and the typed
read repository; mutation interfaces should be added behind authentication and must
not be exposed publicly.

## M. Decisions Requiring Approval

1. **Provide `DATABASE_URL`** (and `TEST_DATABASE_URL`) for the local Postgres on
   :5432, or authorize creating a dedicated `nfrguide`/`nfrguide_dev` role+DB. This
   unblocks `npm run db:setup`, `next build`, the DB integration suite and route
   smoke. (The agent did not guess credentials by policy.)
2. **Prisma 6 vs 7:** stable 6.19.3 was chosen (Prisma 7 drops `url` from the schema
   datasource and requires `prisma.config.ts` + a driver adapter). Confirm 6 is
   acceptable, or request the 7 migration.
3. **Documented static boundary** for non-article decorative modules — confirm this
   is acceptable for now, or request them modeled in a later batch.
4. **Deployment/connection pooling** (e.g., PgBouncer/Accelerate) for production
   remains open (not needed locally).

**Batch 03 was not started. No unrelated changes were made.**
