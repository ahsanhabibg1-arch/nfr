# Batch 11 — Test & Verification Report

**Date:** 2026-11-01 · **Branch:** `batch-01-nextjs-migration`

| Gate | Command | Result |
|---|---|---|
| Prisma validate / generate | `prisma validate` / `generate` | ✅ (EntitySeo/EntityFaq present) |
| TypeScript | `tsc --noEmit` | ✅ 0 errors |
| Unit + integration | `vitest run` | ✅ **194/194** (deterministic ×2) |
| Production build | `next build` | ✅ PASS (`/admin/landing-seo`) |
| Public route smoke | `tsx scripts/route-smoke.mts` | ✅ **33/33** |
| Authenticated admin smoke | `tsx scripts/admin-auth-smoke.mts` | ✅ **14/14** (incl `/admin/landing-seo/`) |
| Media HTTP | `tsx scripts/media-http-check.mts` | ✅ **7/7** |
| Publish/unpublish cache | `tsx scripts/cache-invalidation.mts` | ✅ **10/10** (dev, live data) |
| Migration / FTS gate | `tsx scripts/migration-replay.mts` | ✅ **5/5** (local test-DB; full fresh replay still outstanding) |

## New tests (8)

- `tests/landing-unit.test.ts` (4, no DB): per-entity permission mapping; same-site canonical
  resolution (off-site → null); SEO merge/fallback; additive-only `noindex` + `isLandingIndexable`.
- `tests/landing.test.ts` (4, DB): EntitySeo upsert authorization + existence checks; off-site
  canonical rejection; FAQ auth + empty/duplicate rejection + ordering/reorder + cross-entity
  reorder rejection + enabled filtering + delete auth; orphan cleanup on entity delete.

## §27 coverage map (Batch 11 items)

Entity route resolution / canonical / metadata / noindex / sitemap — exercised by landing-unit +
route-smoke + the Batch 10 rodeo suite (unchanged). FAQ create/edit/delete/order/ownership/auth +
public rendering + duplicate/empty prevention — `landing.test.ts`. Structured-data validity —
`faqPageJsonLd` emits only from visible FAQs (unit-covered shape). Missing/unpublished content,
invalid/duplicate slugs — existing suites. Migration safety / searchVector preservation — the
migration gate + `governance.test.ts` FTS regression. Batch 10 regression — full suite + smokes.

## Dev database restoration

The prior session reset the development database (0 rows). It was restored with the idempotent
`npm run db:seed` + `scripts/seed-rodeo-links.mts` (test DB was never reset). `prisma db seed` was
also repaired (it had crashed on a `server-only` import in `analyticsSeed`). Dev admin **user
accounts** still need re-bootstrapping (`npm run bootstrap:admin`).

## Migration-replay (carried-forward gate)

Unchanged and explicitly outstanding: the full from-zero replay runs on local PostgreSQL via
`MIGRATION_REPLAY_ADMIN_URL` (no Docker). The local `nfrguide_test` FTS verification (5/5) + the
Vitest FTS regression are the standing checks.

## Files created / modified (Batch 11, corrected state)

**Created:** `lib/cms/{landingEntities,entitySeoService,faqService,landingAdminService}.ts`,
`components/FaqAccordion.tsx`, `components/editorial/EntityIntro.tsx`,
`app/admin/landing-seo-actions.ts`, `app/admin/(dashboard)/landing-seo/page.tsx`,
`views/admin/AdminLandingSeoPage.tsx`, migration `20261101100000_batch11_entity_seo_faq/`,
`tests/{landing-unit,landing}.test.ts`, 2 docs.

**Modified:** `prisma/schema.prisma` (enum + 2 models), `lib/seo.tsx` (canonical override,
`faqPageJsonLd`), `lib/cms/{rodeoService,taxonomyService,analyticsSeed}.ts`, `lib/content.ts`
(`getCategoryBySlug`), `views/RodeoViews.tsx` + rodeo/discipline/category public pages (intro +
FAQ + SEO merge), `app/admin/rodeo-actions.ts` (`updateDisciplineAction`),
`views/admin/AdminRodeoCoveragePage.tsx` (manager link), `scripts/admin-auth-smoke.mts`, docs.
