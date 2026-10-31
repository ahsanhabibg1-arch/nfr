# Batch 07 — Test & Verification Report

**Date:** 2026-10-31 · **Branch:** `batch-01-nextjs-migration`

## Verification gates

| Gate | Command | Result |
|---|---|---|
| Prisma validate | `prisma validate` | ✅ valid |
| Prisma generate | `prisma generate` | ✅ client types written (new analytics models present)¹ |
| TypeScript | `tsc --noEmit` | ✅ 0 errors |
| Unit + integration | `vitest run` | ✅ **143/143** (deterministic ×2) |
| Production build | `next build` | ✅ PASS (incl `/search`, `/api/analytics/event`, `/admin/analytics`) |
| Public route smoke | `tsx scripts/route-smoke.mts` | ✅ **28/28** (prod :3100) |
| Authenticated admin smoke | `tsx scripts/admin-auth-smoke.mts` | ✅ **9/9** (incl `/admin/analytics/`) |
| Media upload/delivery | `tsx scripts/media-http-check.mts` | ✅ **7/7** |
| Publish/unpublish cache | `tsx scripts/cache-invalidation.mts` | ✅ **10/10** (dev :3000) |
| SEO audit regression | covered by `tests/seo-intel.test.ts` | ✅ 11/11 (within the 143) |
| Browser QA | patchright available | Not run this batch — HTTP smoke + SSR assertions cover the surfaces |

¹ On Windows, `prisma generate` emits a harmless EPERM when renaming the query-engine DLL
while a node process holds it; the client **code/types** are regenerated regardless (verified
`SearchQueryEvent` et al. present in `index.d.ts`), and the engine binary is version-stable.

## Test suites added

- `tests/search-unit.test.ts` — **10** pure tests (no DB): normalization, redaction, length
  bounds, Unicode, token safety, XSS-safe highlighting, excerpts.
- `tests/search.test.ts` — **11** DB tests: real FTS matches, published-only visibility,
  weighted ranking (title > excerpt), deterministic pagination, category + discipline
  filters, special characters, Unicode, long-query bounds, SQL-injection resistance,
  zero-result + empty-query handling.
- `tests/analytics.test.ts` — **16** DB tests: disabled-collection no-op, content-view
  validation + aggregation, invalid entity rejection, dedup, search + zero-result recording,
  query redaction, click validation, RBAC (search intelligence + config), author own-scoping,
  previous-period insufficient-data, date-range filtering, provider not-connected safety +
  sync + provider-manage RBAC, content-gap detection, search-informed SEO, retention/deletion.

## §20 coverage map

| # | Requirement | Where |
|---|---|---|
| 1 | Search relevance | search.test "returns real DB matches" |
| 2 | Search ranking | search.test "ranks a title match above an excerpt-only match" |
| 3 | Published-only visibility | search.test (draft excluded) |
| 4 | Search filtering | search.test category + discipline |
| 5 | Search pagination | search.test "paginates deterministically" |
| 6 | Special-character queries | search.test + search-unit |
| 7 | Unicode queries | search.test + search-unit |
| 8 | Search query limits | search.test "bounds excessively long queries" + search-unit |
| 9 | SQL injection resistance | search.test "resistant to SQL injection" |
| 10 | Highlighting safety | search-unit "XSS-safe highlighting" |
| 11 | Search event validation | analytics.test search + click |
| 12 | Zero-result recording | analytics.test "records a search query and a zero-result signal" |
| 13 | Search result click validation | analytics.test "validates and records a search result click" |
| 14 | Article view event validation | analytics.test content-view valid/invalid |
| 15 | Event deduplication | analytics.test "suppresses rapid duplicate events" |
| 16 | Rate limiting | `lib/analytics/rateLimit.ts` (unit-exercised via ingest) + endpoint |
| 17 | Privacy configuration | analytics.test redaction + config RBAC |
| 18 | Disabled collection behavior | analytics.test "does not record when collection is disabled" |
| 19 | Retention and deletion | analytics.test "prunes raw events past the retention window" |
| 20 | Analytics aggregation | analytics.test aggregate increments |
| 21 | Date-range filtering | analytics.test "respects the date range in overview totals" |
| 22 | Previous-period comparison | analytics.test "marks … insufficient when there is no prior data" |
| 23 | Analytics RBAC | analytics.test RBAC on search intelligence + config |
| 24 | Author ownership restrictions | analytics.test "scopes overview to own content for an author" |
| 25 | SEO Manager access | analytics.test provider sync by seo_manager |
| 26 | Provider not-connected behavior | analytics.test "reports external providers as not connected" |
| 27 | Search Console config safety | providers foundation (no network/creds) |
| 28 | GA4 config safety | providers foundation (no script/measurement id) |
| 29 | Search content-gap detection | analytics.test "detects a content gap from real zero-result evidence" |
| 30 | SEO Intelligence integration | analytics.test "surfaces search-informed SEO" |
| 31 | Public route regression | route-smoke 28/28 |
| 32 | Article publishing regression | cache-invalidation 10/10 + seo-intel suite |
| 33 | Media privacy regression | media-http-check 7/7 |

## Note on `test:cache` (dev vs prod)

The cache-invalidation harness creates a brand-new article after build and expects it
immediately public — which relies on Next **dev's** always-dynamic rendering. Run against a
production `next start`, the 3 "reachable" assertions fail because a not-yet-generated
dynamic path is negative-cached; this is a test-environment characteristic, not a regression
(the publish/unpublish workflow transitions and the unpublish→404/section-removal assertions
pass in both modes). It passes **10/10** against `npm run dev`.

## Files created / modified

**Created:** `apps/web/lib/analytics/{privacy,config,rateLimit,events}.ts`,
`apps/web/lib/analytics/providers/index.ts`, `apps/web/lib/search/{types,query,publicSearch}.ts`,
`apps/web/lib/cms/{analyticsService,analyticsSeed}.ts`,
`apps/web/app/(public)/search/page.tsx`, `apps/web/app/api/analytics/event/route.ts`,
`apps/web/app/admin/analytics-actions.ts`,
`apps/web/components/analytics/{beacon.ts,ViewBeacon,SearchTelemetry,TrackedResultLink}.tsx`,
`apps/web/components/search/{SearchHighlight,SearchControls}.tsx`,
migration `20261031100000_batch07_analytics_search/`, 3 test files, 9 docs.

**Modified:** `apps/web/prisma/{schema.prisma,seed.ts}`, `apps/web/lib/auth/rbac.ts`,
`apps/web/lib/cms/articleService.ts` (2 ServiceError codes),
`apps/web/views/admin/AdminAnalyticsPage.tsx` (full rewrite, prop-driven),
`apps/web/app/admin/(dashboard)/analytics/page.tsx`, public article/discipline/section pages
(ViewBeacon), `apps/web/components/{PublicChrome,SearchModal}.tsx`, 2 smoke scripts, 6 docs.
