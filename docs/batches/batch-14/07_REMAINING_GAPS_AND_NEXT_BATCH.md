# Batch 14 — Remaining Gaps & Next Batch

## Delivered (implemented + tested)
Edition-scoped Schedule/Results/Standings data models + services + admin CMS + public pages + NFR-2026
landing integration + SEO/sitemap; verification + publication gates; cross-edition integrity; corrections;
230/230 tests; additive migration (local dev + test; FTS preserved).

## Remaining gaps / unfinished
- **Cloud migration pending:** `20261102120000_batch14_competition_coverage` is NOT applied to Aiven
  (deferred). Apply via the guarded path + `cloud-db.mts verify` when approved.
- **No verified NFR-2026 content** yet — editorial research dependency (schedules/results/standings/
  contestants/dates must come from official sources; never fabricated). Pages show empty states.
- **Admin UX depth:** the managers cover create/list/verify/publish/delete; inline edit + correction UI +
  advanced filtering (by discipline/date/status) are lean — a polish pass is worthwhile (P2).
- **Analytics:** schedule/results/standings views are not tracked (`AnalyticsEntityType` not extended).
- **Display formatting:** decimals are returned canonical (e.g. `26500`); currency/time display formatting
  is minimal (P3 polish).
- **No Broadcast/Streaming/Ticket models** (intentional — handled editorially via articles + affiliates).

## Owner decisions
- When to apply the Batch 14 migration to Aiven (needs the deferred credential posture respected).
- Whether to later add an official standings **calculation engine** (requires verified payout/tie-break
  rules) — the data model already supports adding one without replacement.
- Source of official NFR-2026 data + editorial workflow ownership.

## Recommended Batch 15 (per the pre-Batch-13 roadmap)
**Public Discoverability & Media Delivery (P2):** `/competitors/` + `/venues/` index pages; cross-linking/
breadcrumbs; CDN delivery for published media derivatives (private originals preserved); extend
`AnalyticsEntityType` for venue/competitor (and optionally coverage) views. Depends on Batch 13 (env/
delivery) + an owner domain decision. Alternatively prioritize **editorial content production + cloud
migration apply** if NFR-2026 verified data becomes available first.

> Not production-ready: credential rotation, hosting selection, least-privilege DB role, cloud migration
> apply, and real verified content all remain outstanding (see batch-13 checklists + the pre-Batch-13 audit).
