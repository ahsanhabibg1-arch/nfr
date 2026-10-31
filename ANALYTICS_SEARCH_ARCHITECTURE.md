# Analytics & Search Architecture (Batch 07)

End-to-end design of NFRGuide's internal search and first-party analytics. All data is
real; nothing is fabricated. Collection is **disabled by default** (owner-gated).

## Layers

```
Public site
 ├─ /search/ (SSR, noindex)      → lib/search/publicSearch.ts  → PostgreSQL FTS (tsvector+GIN)
 ├─ ViewBeacon / SearchTelemetry / TrackedResultLink (client, keepalive)
 │        → POST /api/analytics/event/  (same-origin, rate-limited, entity-validated)
 │               → lib/analytics/events.ts  → raw event + AnalyticsDailyAggregate
Admin
 └─ /admin/analytics/ (RBAC) → lib/cms/analyticsService.ts → aggregates + raw events
                                                             + providers + config + SEO link
```

## Modules

| Path | Responsibility |
|---|---|
| `lib/analytics/privacy.ts` | Query normalization, redaction, highlight tokens (pure) |
| `lib/analytics/config.ts` | `AnalyticsConfig` settings + collection switches |
| `lib/analytics/rateLimit.ts` | In-memory token bucket + dedup (single-instance) |
| `lib/analytics/events.ts` | Public ingest: validate → gate → dedup → persist + aggregate |
| `lib/analytics/providers/index.ts` | GSC/GA4 foundation (honest status, no network) |
| `lib/search/query.ts` | Normalization + XSS-safe highlight segments + excerpt (pure) |
| `lib/search/publicSearch.ts` | FTS engine + bounded discipline/section scoring |
| `lib/cms/analyticsService.ts` | RBAC-gated dashboard reads, gaps, SEO link, config, export, retention |

## Data sources (kept strictly distinct, §10/§14)

1. **First-party observed events** — content views + search (this batch, cookieless).
2. **Internal search analytics** — derived from search events.
3. **Google Search Console** — external, Not Connected.
4. **Google Analytics 4** — external, Not Connected.

The dashboard never blends these without labels and never shows fabricated deltas.

## Durability & performance

- Raw events are minimal and short-lived (retention-pruned).
- `AnalyticsDailyAggregate` is the durable, indexed rollup written at ingest time; dashboard
  totals/top-content read aggregates (fast), term-level detail reads raw events (bounded by
  range + indexes).
- No analytics query runs during a public page request; the beacon is deferred + keepalive.

## Time zone

All timestamps are stored UTC. The dashboard reports in a single documented zone (UTC),
configurable via `AnalyticsConfig.displayTimeZone` (§19).
