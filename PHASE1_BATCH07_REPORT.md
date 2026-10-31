# Phase 1 / Batch 07 — Analytics, Internal Search & Search Performance Intelligence

**Branch:** `batch-01-nextjs-migration` · **Date:** 2026-10-31 · Builds on Batch 06 (`b6cc12a`).

This batch adds a real, privacy-conscious public search engine, first-party editorial
analytics, internal-search intelligence, content-gap intelligence, a data-backed
Analytics & Search dashboard, and an honest external-provider (GSC/GA4) foundation.
No analytics value is fabricated.

---

## A. Baseline Verification

Audited before any change (§0). Findings:

- **Public search** was a client-side modal (`components/SearchModal.tsx`) filtering an
  articles-only in-memory index with `.includes()` plus a hardcoded guides mock. No
  `/search` route, no relevance ranking, no analytics.
- **Admin Analytics** (`views/admin/AdminAnalyticsPage.tsx`) was a pure mock with
  fabricated KPIs ("3,947 searches", "48.2% CTR", "4m 38s dwell") over `SEARCH_QUERY_LOGS`.
- **Schema** had no analytics/search models. Public routes exist for articles, disciplines
  and primary sections — **not** rodeo hubs/events/editions (CMS-only, no public page).

## B. Database Migrations

Additive migration `20261031100000_batch07_analytics_search`, generated offline and
applied via `migrate deploy` to **dev + test** (least-privilege roles can't create the
shadow DB `migrate dev` needs). Adds:

- Enums `AnalyticsEntityType`, `AnalyticsProvider`, `ProviderConnectionStatus`.
- Tables `SearchQueryEvent`, `SearchResultClickEvent`, `ContentViewEvent`,
  `AnalyticsDailyAggregate`, `AnalyticsProviderConnection`, `AnalyticsSyncRun`,
  `AnalyticsConfig`.
- A **DB-managed generated `tsvector` column** `Article."searchVector"` (weighted
  A=title, B=deck+excerpt, C=subcategory+articleType) + a **GIN index**. Not modeled in
  Prisma; queried with parameterized `$queryRaw`.

No existing table altered destructively; no data reset; seeded articles/disciplines intact.

## C. Public Search Engine

`lib/search/publicSearch.ts` (server-only). Articles use PostgreSQL FTS
(`websearch_to_tsquery` + `ts_rank_cd` over the weighted vector + GIN). Disciplines (7)
and sections (5) are ranked with a bounded, deterministic in-memory scorer. Only
published, publicly-routable entities are returned. Public page at
`/search/` (SSR, `noindex, follow`, filters, pagination, empty + no-result states).

## D. Search Relevance

Documented ranking (see `INTERNAL_SEARCH_ENGINE.md`): `ts_rank_cd('{0.1,0.2,0.4,1.0}', …)`
(weights D/C/B/A), tie-broken by `publishedAt desc, id desc` for deterministic pagination.
"Newest" sorts purely by date. Parameterized throughout (SQL-injection safe); highlighting
is data-driven and XSS-safe.

## E. Search Intelligence

`lib/cms/analyticsService.ts` reports most-searched terms, zero-result queries, weak
engagement (searched/not-clicked), CTR, and demand by content type — from real recorded
events only.

## F. First-Party Analytics

Cookieless, no-IP, no-PII, no-fingerprint, no-persistent-id content-view + search events
via a keepalive client beacon → `POST /api/analytics/event/` (same-origin, rate-limited,
entity-validated). **Collection is disabled by default** (owner-approved, §8/§24); the
pipeline is fully implemented but records nothing until enabled in the admin config.

## G. Analytics Dashboard

`views/admin/AdminAnalyticsPage.tsx` rewritten to be prop-driven over real data: Overview
(with previous-period comparison, honest "insufficient data"), Internal Search, Content
Performance, Opportunities, Providers & Config. Honest "collection disabled" and
"not connected" states; no fabricated percentages.

## H. Content-Gap Intelligence

`getContentGaps()` cross-references real zero-result search terms against published
articles, flagging missing vs. existing coverage with evidence period and suggested action.

## I. SEO Integration

`getSearchInformedSeo()` joins articles with real search-click demand to their OPEN SEO
findings — advisory only. The 37 Batch 06 rules are unchanged.

## J. Google Search Console Foundation

`lib/analytics/providers/index.ts` describes GSC honestly as **Not Connected** (no creds,
no network call, no SDK). Future setup documented in `EXTERNAL_ANALYTICS_INTEGRATION.md`.

## K. GA4 Foundation

Same foundation: GA4 Data API reporting is distinguished from GA4 browser collection and
from first-party analytics. **Not Connected**; no tracking script injected; no measurement
id hardcoded.

## L. Privacy and Consent

Data-minimized by design. Query redaction (emails/numbers masked), configurable retention
(default 180d; raw events pruned, aggregates preserved), UTC storage + documented UTC
display. See `ANALYTICS_PRIVACY_POLICY_TECHNICAL.md`. Disabled-by-default pending owner
privacy/consent sign-off.

## M. RBAC and Security

Six new permissions (owner-approved) enforced server-side + audited. Author performance is
own-scoped; search intelligence requires `search.analytics.view`. Public ingest is
same-origin + token-bucket rate-limited; no identifiers persisted. Parameterized SQL.

## N. Automated Tests

`tests/search-unit.test.ts` (10, no DB), `tests/search.test.ts` (11, DB),
`tests/analytics.test.ts` (16, DB). Full suite **143/143**, deterministic ×2.

## O. Production Build and Smoke Tests

`next build` PASS. Against a clean production server: route smoke **28/28**, admin smoke
**9/9** (incl `/admin/analytics/`), media e2e **7/7**. `test:cache` is a dev-mode test
(see `BATCH07_TEST_REPORT.md`).

## P. Files Created/Modified

See `BATCH07_TEST_REPORT.md` for the full list.

## Q. Known Limitations

- Rodeo hubs/events/editions have no public detail route, so they are intentionally not
  returned as clickable search results (they power content-gap cross-referencing only).
- FTS vector covers title/deck/excerpt/subcategory/articleType, not full block body.
- Rate limiting is in-memory (single-instance). See `KNOWN_LIMITATIONS.md`.

## R. Owner Decisions Required

1. **Enable first-party collection** once a privacy/consent approach is settled (one toggle
   in Admin → Analytics → Providers & Config). Until then the dashboard shows real-but-empty
   data honestly.
2. Connecting GSC/GA4 (credentials + approved setup) remains a future, owner-gated step.

## S. Batch 08 Readiness

Batch 07 is complete and committed. Batch 08 was **not** started.
