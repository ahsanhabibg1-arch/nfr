# Batch 26 — Executive Summary

**Analytics & Search Intelligence: Activation, Integration & End-to-End Repair**
**Date:** 2026-11-05 · **Status:** verified locally, **production collection remains DISABLED** by design; **not committed / not deployed** (owner review).

## 1. Why analytics currently show zero
`lib/analytics/config.ts` sets `collectionEnabled: false` by default (persisted in the
`AnalyticsConfig` row). Every recorder no-ops while collection is inactive, so no events
are stored and all metrics read zero. **This is the privacy-safe owner-gate, not a bug.**

## 2. Which collection components already existed (all of them)
Ingest endpoint, recorders (view/search/click) with entity-is-public verification + dedup +
aggregate bumping, privacy redaction, client beacons (`ViewBeacon`, `SearchTelemetry`,
`TrackedResultLink`) wired on every public content page, the full service layer (overview,
search, content performance, content gaps, search-informed SEO, providers, config, export,
retention), all 5 admin tabs, and 18 unit tests. See `01_ANALYTICS_ARCHITECTURE_AUDIT.md`.

## 3. What was repaired / added
The system was **complete but unproven end-to-end in a browser**. Batch 26 adds:
- A **Phase I end-to-end browser test** (`e2e/analytics-collection.spec.ts`) that, within the
  isolated test DB, enables collection, drives the real public journey (article view →
  search → result click → zero-result search), and asserts each event lands in the DB via
  the real same-origin endpoint, that the **admin dashboard reflects them**, and that
  **disabling collection stops new events**.
- A precise test hook (`data-testid="stat-content-views"`) on the Content Views KPI.
- No new analytics system, no schema change, no change to the privacy-safe default.

## 4. Dashboard features now proven functional (with collection enabled)
Content Views, Internal Searches, Zero-Result Searches, Search CTR (clicks ÷ searches), the
Overview breakdown with previous-period comparison, Top Content by observed views, and the
collection-status banner flipping to **ACTIVE**. Screenshot: `analytics-dashboard.png`
(Content Views 2, Searches 2, Zero-Result 1, CTR 50.0%).

## 5. What remains disabled and why
**Production first-party collection stays OFF** pending the owner's privacy/consent decision
(§Phase G). External providers (Google Search Console, GA4) remain `not_connected` — they
need owner credentials/OAuth (§Phase F). Nothing was silently activated.

## 6. Privacy/consent decisions the owner must make
See `02_CONFIG_PRIVACY_AND_REMAINING.md` — the consent model (banner vs. legitimate-interest,
cookieless), whether to keep query redaction on, retention window, and sign-off to flip
`collectionEnabled` on in production.

## 7. Test results (all executed)
| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ 0 errors |
| Prisma validate | ✅ valid (no schema change) |
| Vitest (`npm run test`) | ✅ **428 / 428** (incl. 18 analytics unit tests) |
| `next build` (dev + test DB) | ✅ clean |
| Playwright + axe | ✅ **56 / 56** (incl. 3 new analytics e2e) |

> Note: a transient local flake can appear if the durable `register:`/`login:` rate-limit
> rows accumulate across many repeated full-suite runs within the hour (clear them in the
> test DB). CI runs once from a clean DB and is unaffected.

## 8. Screenshot
`docs/batches/batch-26/analytics-dashboard.png` — the dashboard with live first-party data.

## 9. Remaining limitations
First-party collection is off in production until owner sign-off; external providers need
owner setup; unique-visitor counting is intentionally not implemented (observed events only,
no identifiers). Details in `02_CONFIG_PRIVACY_AND_REMAINING.md`.
