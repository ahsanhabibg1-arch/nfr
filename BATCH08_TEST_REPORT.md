# Batch 08 — Test & Verification Report

**Date:** 2026-10-31 · **Branch:** `batch-01-nextjs-migration`

## Verification gates

| Gate | Command | Result |
|---|---|---|
| Prisma validate | `prisma validate` | ✅ valid |
| Prisma generate | `prisma generate` | ✅ client types current (monetization delegates present)¹ |
| TypeScript | `tsc --noEmit` | ✅ 0 errors |
| Unit + integration | `vitest run` | ✅ **161/161** (deterministic ×2) |
| Production build | `next build` | ✅ PASS (`/admin/monetization`, `/go/[id]`) |
| Public route smoke | `tsx scripts/route-smoke.mts` | ✅ **28/28** (prod :3300) |
| Authenticated admin smoke | `tsx scripts/admin-auth-smoke.mts` | ✅ **10/10** (incl `/admin/monetization/`) |
| Media upload/delivery | `tsx scripts/media-http-check.mts` | ✅ **7/7** |
| Publish/unpublish cache | `tsx scripts/cache-invalidation.mts` | ✅ **10/10** (dev :3000, new code) |
| SEO / search / analytics regression | within the 161 (seo-intel 11, search 22, analytics 16) | ✅ |
| Browser QA | via HTTP smoke harnesses (SSR output asserted) | Interactive browser skill available; green smokes used |

¹ Windows emits a harmless EPERM renaming the query-engine DLL while a server holds it; the
client code/types are regenerated and the engine binary is version-stable.

## New test suites

- `tests/monetization-unit.test.ts` — **7** pure tests: commercial URL validation (dangerous
  protocols, SSRF/private hosts, malformed) and paid-link `rel` policy.
- `tests/monetization.test.ts` — **11** DB tests: partner verify/activate guard; dangerous +
  private URL rejection; active/inactive/expired link resolution (open-redirect/expired safe);
  placement authorization (author own vs other; activation needs placement perm); rodeo
  event-vs-edition association separation; sponsored classification + rendering; reference-safe
  deletion; RBAC (author/editor/SEO-Manager restrictions); click gating (disabled by default,
  respects analytics collection) + aggregation + invalid link; AdSense disabled-by-default;
  commercial-compliance detection.

Test files now run **serially** (`fileParallelism: false`) because some DB suites toggle
shared singleton config rows (`AnalyticsConfig`, `MonetizationConfiguration`).

## §27 coverage map (highlights)

Partner creation/verification/activation (1–3) · affiliate URL validation + dangerous
rejection (4–5) · inactive/expired behavior (6–7) · open-redirect prevention (8) · placement
authorization (9) · event/edition associations (10) · disclosure rendering (11) · sponsored
labeling (12) · paid-link attributes (13, unit) · publication visibility (14, via compliance +
article render) · reference-safe deletion (15) · monetization RBAC (16) · author ownership
(17) · SEO Manager restrictions (18) · analytics disabled-by-default (19) · click validation
(20) · click aggregation (21) · AdSense disabled-by-default (22) · provider/not-configured
states (23, config) · media licensing (24, Batch 05 reuse unchanged) · cache invalidation (25)
· existing editorial/SEO/search/analytics/media regressions (26–30, within the 161 + smokes).

## Migration incident & fix

`migrate diff` generated a `DROP COLUMN "searchVector"` (the Batch 07 FTS generated column,
intentionally not modeled in Prisma). It was applied before detection and broke full-text
search. Fix: stripped the DROP from the migration, declared `searchVector Unsupported("tsvector")`
in the schema (downgrades future diff drift from a data-losing DROP to a no-op/erroring ALTER),
restored the column + GIN index on dev + test (idempotent), and re-verified the full suite
**161/161**. See `MIGRATION_STATUS.md` / `KNOWN_LIMITATIONS.md` for the required offline
hand-strip process.

## Files created / modified

**Created:** `lib/monetization/{url,rel,config,clicks,publicMonetization}.ts`,
`lib/cms/{monetizationService,monetizationSeed}.ts`, `app/go/[id]/route.ts`,
`app/admin/monetization-actions.ts`,
`components/monetization/{ArticleMonetization,AdPlacementSlot}.tsx`, migration
`20261031200000_batch08_monetization/`, `tests/monetization.test.ts`,
`tests/monetization-unit.test.ts`, 9 docs.

**Modified:** `prisma/schema.prisma` (6 enums, 10 models, 2 Article back-relations,
`searchVector` Unsupported), `prisma/seed.ts` (+ monetization disclosures),
`lib/auth/rbac.ts` (7 perms + mapping), `app/admin/(dashboard)/monetization/page.tsx`,
`views/admin/AdminMonetizationPage.tsx` (full rewrite), `app/(public)/articles/[slug]/page.tsx`
(monetization + ad slot), `scripts/admin-auth-smoke.mts`, `vitest.config.ts`, 6 docs.
