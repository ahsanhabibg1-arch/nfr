# 09 — Analytics & Monetization Audit

**Audited:** 2026-11-07

## Analytics & Search Intelligence

| Feature | Status | Evidence |
|---|---|---|
| Collection configuration | ✅ | `AnalyticsConfig` row, toggled from Admin UI |
| Content-view tracking | ✅ | `ViewBeacon` on all public entity pages |
| Search tracking | ✅ | `SearchTelemetry` on search page |
| Search-result click tracking | ✅ | `TrackedResultLink` wraps search results |
| Zero-result searches | ✅ | Recorded with `zeroResult: true` |
| Dashboard with date filters | ✅ | 5 tabs: overview, search, content performance, opportunities, providers |
| Content performance | ✅ | Real data from `AnalyticsDailyAggregate` |
| Provider status | ✅ | GSC/GA4 shown as `not_connected` (honest) |
| Privacy-safe behavior | ✅ | No identifiers stored, query redaction, cookieless |
| Collection currently enabled? | ❌ DISABLED | `collectionEnabled: false` (privacy-safe default) |
| Admin permissions | ✅ | `analytics.view`, `analytics.config` properly enforced |

**Production collection remains OFF pending owner privacy/consent decision.** This is by design.

## Monetization & Ads

| Feature | Status | Evidence |
|---|---|---|
| Partner management | ✅ | `AffiliatePartner` with verification status |
| Link management | ✅ | `AffiliateLink` with URL validation, status, activation |
| Placement management | ✅ | `AffiliatePlacement` linked to articles/entities |
| Disclosure management | ✅ | `MonetizationDisclosure` with prominent-display flag |
| Ad placement management | ✅ | `AdPlacement` with slot/scope/device/priority |
| Public rendering | ✅ | `ArticleMonetization` + `AdPlacementSlot` in article page |
| Affiliate redirects | ✅ | `/go/[id]/` route with click tracking |
| AdSense readiness | ✅ | `MonetizationConfiguration` with adsenseEnabled toggle (OFF by default) |
| Sponsored content | ✅ | `SponsoredContentRelationship` with disclosure labels |
| No fabricated affiliates | ✅ | All partner/link data is editorially created, never seeded with fake partners |
| External serving OFF by default | ✅ | `adsenseEnabled: false`, all placements `enabled: false` by default |

## Gaps

- **P3**: No active monetization partners configured (expected — owner must set these up)
- **P3**: AdSense publisher ID requires owner configuration
- Analytics collection requires owner privacy/consent decision before activation
