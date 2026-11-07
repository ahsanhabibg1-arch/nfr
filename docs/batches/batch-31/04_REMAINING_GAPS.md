# Batch 31 Final — Remaining Gaps

## P0 — Complete

| Area | Status | Notes |
|------|--------|-------|
| Database migration | ✅ COMPLETE | Applied to nfrguide_dev and nfrguide_test |
| Empty editor fix | ✅ COMPLETE | Defaults from registry; no Restore Defaults click required |
| Homepage layout editing | ✅ COMPLETE | All props editable including image, featured, CTA |
| Five section landings | ✅ COMPLETE | All read layout, fallback to defaults |
| Draft/publish isolation | ✅ COMPLETE | Draft saves never affect public |
| Admin UX | ✅ COMPLETE | Settings panel, typed fields, media picker, featured picker, preview button |
| Security | ✅ COMPLETE | RBAC, validation, audit logging |
| DB-backed E2E tests | ✅ COMPLETE | All 7 tests pass, 0 skipped |

## P1 — Complete

| Area | Status | Notes |
|------|--------|-------|
| Media Library picker | ✅ COMPLETE | MediaPickerModal integrated; image prop type on hero sections |
| Featured content selection | ✅ COMPLETE | Search/select articles + rodeo hubs; reorder; remove |
| Article detail template | ✅ COMPLETE | Reads template:article; related count, CTA, FAQ visibility |
| Directory templates | ✅ COMPLETE | Competitors + venues read layout; hero/CTA overrides |
| Secure draft preview | ✅ COMPLETE | Auth-gated route; noindex; iframe sandbox; preview bar |

## P1 — Partial

| Area | Status | Notes |
|------|--------|-------|
| Rodeo hub/event/edition templates | PARTIAL | Registry defined; public views not yet integrated (rodeo-events/[slug] pages). These pages have complex pre-existing layouts with edition/schedule/standings sub-routes. |
| Discipline/category templates | PARTIAL | Registry defined; discipline and category archive pages not yet integrated. Content is primarily data-driven with minimal layout variability. |
| Featured content rendering | PARTIAL | Picker and storage work; public rendering of manually selected featured articles not yet connected (sections still use automatic latest-by-section queries). |
| Draft preview content | PARTIAL | Preview route works; public pages don't yet read `_preview` param to render draft sections instead of published. Current preview shows published state in an iframe with the preview bar. |

## P2 — Deferred

| Area | Status | Notes |
|------|--------|-------|
| Layout variants (grid/card styles) | NOT STARTED | Requires component-level variant support |
| Background presets | NOT STARTED | Design system change |
| Spacing presets | NOT STARTED | Design system change |
| Drag-and-drop reordering | NOT STARTED | Move up/down buttons provided |

## Blocked — Resolved

| Item | Previous Status | Current Status |
|------|----------------|----------------|
| Migration execution | Was blocked (sandbox) | ✅ Applied manually |
| Full E2E write tests | Was blocked (no table) | ✅ All 7 pass, 0 skipped |

## Cloud/Production

| Item | Status |
|------|--------|
| Aiven database migration | NOT APPLIED — local only per owner instruction |
| Production deployment | NOT DEPLOYED — no commit/push per owner instruction |
