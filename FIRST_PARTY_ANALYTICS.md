# First-Party Editorial Analytics (Batch 07)

A minimal, privacy-conscious analytics system for an independent editorial publication.
**Disabled by default** (owner-approved, §8/§24) — the pipeline is implemented but records
nothing until an administrator enables it.

## Events

| Event | Fired by | Stored |
|---|---|---|
| `content_view` | `ViewBeacon` on article/discipline/section pages | entityType, entityId, path, createdAt |
| `search` | `SearchTelemetry` on `/search/` | normalized+redacted query, length, resultCount, zeroResult, contentType |
| `search_click` | `TrackedResultLink` on each result | normalized query, entityType, entityId, position |

Beacons are client-side, deferred, and `keepalive`, so server-rendered/prefetch/bot renders
are not counted, and the fetch survives navigation. They POST to `/api/analytics/event/`
(trailing slash — required under `trailingSlash: true`).

## What is NOT collected

- No cookies set by analytics; no `localStorage` identity.
- No raw IP stored. No device fingerprint. No cross-site identifier.
- No persistent per-user id. Page views are **observed events, not verified unique humans**
  (labeled as such in the dashboard).

## Integrity protections (§7)

- **Collection gate** — nothing recorded unless `collectionEnabled` (+ the per-category
  switch) is true.
- **Entity validation** — `content_view`/`search_click` must reference a real, publicly
  accessible entity (published article / existing discipline / known section). Rejects
  client-supplied false page identity and invalid ids.
- **Rapid-duplicate suppression** — a 30s dedup window keyed by a transient, non-persisted
  client hash + entity/query.
- **Rate limiting** — a per-key token bucket at the endpoint (burst 30, 1/s sustained).
- **Bounded volume** — invalid/over-limit payloads are dropped; aggregates are upserts.

## Storage model

Raw event rows are minimal and retention-pruned (default 180 days). The durable, indexed
rollup is `AnalyticsDailyAggregate` (`day, metric, entityType, entityId → count`), written
in the same transaction as each raw event. Dashboards read aggregates for totals and
top-content; raw events for term-level detail.

## Not in this batch

Affiliate-link click tracking is **not** implemented (owner-gated, §24). GA4 browser
collection is **not** added (no script, no measurement id).
