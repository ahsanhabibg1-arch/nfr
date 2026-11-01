# Batch 10 — Test & Verification Report

**Date:** 2026-11-01 · **Branch:** `batch-01-nextjs-migration`

| Gate | Command | Result |
|---|---|---|
| Prisma validate / generate | `prisma validate` / `generate` | ✅ (RodeoHubEvent present)¹ |
| TypeScript | `tsc --noEmit` | ✅ 0 errors |
| Unit + integration | `vitest run` | ✅ **186/186** (deterministic ×2) |
| Migration replay / FTS | `tsx scripts/migration-replay.mts` | ✅ **5/5** (local test-DB; no Docker per owner) |
| Production build | `next build` | ✅ PASS (`/rodeo-events`, `/rodeo-events/[slug]`, `/rodeo-events/[slug]/[edition]`) |
| Public route smoke | `tsx scripts/route-smoke.mts` | ✅ **33/33** (incl rodeo section/event/hub/404) |
| Authenticated admin smoke | `tsx scripts/admin-auth-smoke.mts` | ✅ **13/13** |
| Media upload/delivery | `tsx scripts/media-http-check.mts` | ✅ **7/7** |
| Publish/unpublish cache | `tsx scripts/cache-invalidation.mts` | ✅ **10/10** (dev, new code) |
| SEO / Analytics / Monetization / Media regression | within the 186 | ✅ |

¹ Windows EPERM on the engine DLL while a server holds it is harmless; client types regenerate.

## New tests (6)

`tests/rodeo-public.test.ts` (DB): event read with editions/hubs/**published-only** articles +
indexable; hub lists associated events; edition↔event integrity (wrong parent → null) + verified
dates; hub-or-event resolver with event precedence + unknown → null; **cross-table slug
uniqueness** (hub vs event create conflict); rodeo entities included in public search with correct
analytics entity type.

## Build routing note

`/rodeo-events/` is served by a dedicated static page (lists DB hubs/events); the `[section]`
dynamic route excludes `rodeo-events`. Next resolves the static segment for `/rodeo-events/` and
the nested `[slug]` / `[slug]/[edition]` routes for deeper paths — no "parallel pages" conflict
(verified by a clean `next build`).

## Migration replay (carried-forward gate)

Per the owner's decision (no Docker; test with the existing local PostgreSQL), the gate verified
the FTS artifacts on the local `nfrguide_test` database — searchVector tsvector + generated, GIN
index, functional query, all expected tables (**5/5**) — plus the Vitest FTS regression. The full
from-zero replay on a fresh disposable DB is implemented and runs on local Postgres when a
one-time CREATEDB-capable `MIGRATION_REPLAY_ADMIN_URL` is supplied (`npm run test:migration`); it
remains the explicit carried-forward gate.

## Files created / modified

**Created:** `lib/rodeoContent.ts`, `views/RodeoViews.tsx`,
`app/(public)/rodeo-events/{page.tsx,[slug]/page.tsx,[slug]/[edition]/page.tsx}`,
`scripts/seed-rodeo-links.mts`, `tests/rodeo-public.test.ts`, 2 docs.

**Modified:** `prisma/schema.prisma` (RodeoHubEvent + back-relations), migration
`20261101000000_batch10_rodeo_hub_event/`, `prisma/seed.ts` (hub↔event links),
`config/routes.ts` (rodeo URL builders), `lib/seo.tsx` (`rodeoEditionJsonLd`),
`lib/search/{types.ts,publicSearch.ts}` + `components/search/SearchControls.tsx` +
`app/(public)/search/page.tsx` (rodeo in search), `lib/analytics/events.ts` (RODEO_* validation),
`lib/monetization/publicMonetization.ts` (`getEntityCommercialAssociations`), `app/sitemap.ts`,
`lib/cms/rodeoService.ts` (cross-table slug guard), `app/(public)/[section]/page.tsx` (exclude
rodeo-events), `scripts/route-smoke.mts`, docs.
