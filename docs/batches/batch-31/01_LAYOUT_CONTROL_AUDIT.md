# Batch 31 — Layout Control Audit

**Date**: 2026-11-07

## Empty Homepage Editor — Root Cause

**Symptom**: Admin → Website → Page Layouts → Homepage showed "No sections configured" with disabled controls.

**Root cause**: `AdminPageLayoutEditor` initialized `slots` from `layout?.draftSections ?? []`. When no `PageLayout` record existed in the database (before first save), `layout` was `undefined` and `slots` was an empty array.

**Fix**: Added `effectiveSlots()` function that falls back to building default slots from the section registry when no layout record exists. The editor now shows all 9 homepage sections with their default configuration immediately, with a "Showing defaults — save draft to persist" indicator.

## Layout Resolution Precedence

1. Existing saved draft sections (from `PageLayout.draftSections`)
2. Published sections (from `PageLayout.publishedSections`) — used by public pages
3. Registry defaults (built from `sectionRegistry.ts` family definitions) — used when no DB record exists

## Admin-to-Public Synchronization

- Admin always sees the current effective state (draft → published → defaults)
- Public pages always read `publishedSections` (or defaults if no record)
- Draft saves never affect public rendering
- Publishing atomically copies `draftSections → publishedSections`

## Migration Status

- `20261107140000_batch31_page_layout` — Applied to both `nfrguide_dev` and `nfrguide_test`
- `20261107120000_batch28_cms_gaps` — Already applied (resolved as applied)
- All 16 migrations verified applied via `prisma migrate status`
