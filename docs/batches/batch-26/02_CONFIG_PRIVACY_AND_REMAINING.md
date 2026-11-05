# 02 — Configuration, Privacy Decisions & Remaining Work

## How to enable first-party collection (owner-gated)

Collection is controlled by the `AnalyticsConfig` row (key `settings`) and toggled from the
admin UI: **Admin → Analytics & Search → Providers & Config**. Flipping "first-party
collection" on sets `collectionEnabled: true` (requires the `analytics.config` permission,
Admin/Super-Admin). Sub-toggles (`searchLoggingEnabled`, `contentViewEnabled`) and
`redactQueries`, `retentionDays`, `displayTimeZone` are set there too.

- **Default stays OFF** in production. It was enabled ONLY inside the isolated test database
  for the automated e2e, which disables + wipes it again on teardown.
- When disabled, the dashboard shows an honest "collection DISABLED" banner explaining why
  the metrics are empty.

## Event collection flow
1. A public content page mounts `ViewBeacon` (once per mount, `useRef`-guarded) → keepalive
   `POST /api/analytics/event/` `{type:'content_view', entityType, entityId, path}`.
2. The search results page mounts `SearchTelemetry` → `{type:'search', query, resultCount,
   zeroResult, contentType}`; a result click fires `TrackedResultLink` → `{type:'search_click', …}`.
3. The endpoint checks same-origin + rate limit, then the recorder: collection-gate →
   zod-validate → **entity-is-public** verify → transient-key dedup → write raw event +
   bump the daily aggregate (one transaction). No identifiers are stored.
4. The service aggregates per the selected UTC date range for the dashboard.

## Metric definitions
- **Content Views** — observed first-party page-view events (NOT unique visitors; stated in the UI).
- **Internal Searches** — recorded public search submissions.
- **Zero-Result Searches** — searches whose `resultCount` was 0.
- **Search CTR** — `search_click events ÷ recorded searches × 100` over the same range (shown
  as "—" when there are no searches, never a misleading number).
- **Content Performance / Opportunities** — real content rows + zero-result evidence; no
  fabricated volume, ranking, or traffic estimates.

## Privacy / consent decisions the owner must settle (Phase G)
These are **decisions**, not code gaps — the code already defaults to the safe choice:
1. **Legal basis / consent model.** The collection is cookieless and stores no identifiers,
   no IP. Decide whether a consent banner is still required in the target jurisdictions, or
   whether legitimate-interest cookieless analytics is acceptable. Until decided, keep it off.
2. **Query redaction.** `redactQueries` defaults ON (emails etc. stripped before storage).
   Decide whether to keep it on in production (recommended).
3. **Retention.** `retentionDays` (default 180) — raw events are pruned past the window while
   aggregates are kept (`runRetention`). Confirm the retention/deletion policy.
4. **Sign-off** to set `collectionEnabled: true` in production.

## External provider integration (Phase F) — owner action required
`lib/analytics/providers/index.ts` defines Google Search Console + GA4 as **not_connected**
foundations (no SDK, no credentials, no network calls). To connect later (owner-gated):
- **GSC:** verify the domain property; create a service account; set `GSC_SITE_URL` +
  `GOOGLE_APPLICATION_CREDENTIALS`. See `EXTERNAL_ANALYTICS_INTEGRATION.md`.
- **GA4:** enable the GA4 Data API; service account; set `GA4_PROPERTY_ID` +
  `GOOGLE_APPLICATION_CREDENTIALS`.
First-party analytics work **independently** of these; no external service was connected and
no cloud config was changed in this batch.

## Data accuracy (Phase H) — verified
- No double-count: `ViewBeacon`/`SearchTelemetry` guard with refs; the endpoint dedups via a
  transient key; aggregates are upserted atomically with the raw event.
- Admin preview does **not** mount `ViewBeacon`, so editor preview activity isn't counted.
- Dates use UTC day boundaries; previous-period comparison reports "insufficient" with no
  prior data rather than a fabricated delta (unit-tested).
- Aggregates are indexed by `day_metric_entityType_entityId`; the dashboard reads aggregates,
  not full event scans.

## Remaining limitations
- Production collection off until owner sign-off (by design).
- External providers need owner credentials/OAuth.
- Unique-visitor counts are intentionally not implemented (no identifiers) — the UI says
  "observed views", not "unique visitors".
