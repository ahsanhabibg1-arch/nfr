# 01 — Analytics Architecture Audit & Root Cause (Phase A)

Audited before any change. **The analytics system is fully implemented and tested — it is
switched off by a privacy-safe default, not broken or missing.** No second analytics system
was built.

## Root cause of the zero values

`lib/analytics/config.ts` → `DEFAULT_ANALYTICS_SETTINGS.collectionEnabled = false`.
The setting is persisted as one JSON row in **`AnalyticsConfig`** (key `settings`). Every
recorder calls `getAnalyticsSettings()` and **silently no-ops when collection is inactive**
(`searchLoggingActive` / `contentViewActive` both require `collectionEnabled === true`). So
no events are stored, every aggregate is empty, and the dashboard reads zero. This is the
owner-gated privacy posture (Batch 07 §8/§24), not a defect.

## Component inventory

### Fully implemented & functional
- **Ingest endpoint** `app/api/analytics/event/route.ts` — same-origin guard, token-bucket
  rate limit, JSON parse, routes to recorders. Posts to the trailing-slash path.
- **Recorders** `lib/analytics/events.ts` — `recordContentView`, `recordSearchQuery`,
  `recordSearchClick`: collection-gated, zod-validated, **entity-is-public verified**
  (rejects client-forged page identity), transient-key deduped, write a raw event **and**
  bump the daily aggregate in one transaction.
- **Privacy** `lib/analytics/privacy.ts` — query normalization + redaction (emails etc.);
  no identifiers stored (IP+UA hashed only in memory for dedup/rate-limit, never written).
- **Client trackers** — `ViewBeacon` (one fire-and-forget view per mount via `useRef`;
  mounted on articles, disciplines, sections, rodeo events/editions), `SearchTelemetry`
  (one search/zero-result event per distinct query), `TrackedResultLink` (click event
  before navigation); all via keepalive `beacon.ts`.
- **Service/aggregation** `lib/cms/analyticsService.ts` — overview (+ previous-period
  comparison), internal-search analytics, content performance, content gaps (zero-result
  evidence), search-informed SEO, provider statuses, config read/write, export, retention.
- **Admin UI** `views/admin/AdminAnalyticsPage.tsx` — all 5 tabs (Overview, Internal
  Search, Content Performance, Opportunities, Providers & Config), the enable/disable
  control, and the "collection disabled" explanation.
- **Tests** `tests/analytics.test.ts` — **18 tests** covering: disabled no-op, valid view
  + aggregate, invalid/non-public reject, dedup, search + zero-result, email redaction,
  click, RBAC (search/gaps/config), author scoping, previous-period insufficiency,
  date-range, providers not-connected, content-gap detection, search-informed SEO,
  retention pruning.

### Implemented but disabled
- First-party collection (the whole pipeline) — gated off by `collectionEnabled:false`.

### Partially connected / foundation only
- **External providers** `lib/analytics/providers/index.ts` — Google Search Console + GA4
  descriptors with required env + setup doc, reporting an honest `not_connected`/`live:false`.
  No SDK, no network calls, no credentials. Owner-gated future work (Phase F).

### Missing
- **A real end-to-end *browser* test** of the beacon → HTTP endpoint → DB → dashboard flow.
  The unit tests call the recorders directly, so they don't exercise the client beacon, the
  same-origin endpoint, or the dashboard rendering of live events. **This is the gap Batch 26
  fills** (Phase I).

### Broken
- Nothing identified.

### Intentionally restricted (privacy/security)
- Collection off by default; query redaction on by default; no identifiers stored; endpoint
  same-origin + rate-limited + payload-validated; analytics admin gated by
  `analytics.view` / `analytics.config` / `analytics.provider.manage` / `analytics.export`.

## Data model (schema, no change needed)
`SearchQueryEvent`, `ContentViewEvent`, `SearchResultClickEvent`, `AnalyticsDailyAggregate`
(unique `day_metric_entityType_entityId`), `AnalyticsConfig`. All timestamps UTC; the
dashboard reports in a single `displayTimeZone` (UTC).

## Conclusion
Analytics are empty **by design** (privacy-safe default). The fix for Batch 26 is to (a)
confirm the enable/disable control works, (b) prove the full journey end-to-end in a browser
within the **isolated test environment**, and (c) leave the production default **disabled**
pending the owner's privacy/consent decision — never silently activate production tracking.
