# Batch 31 — Page Composition System — Completion Report

**Date**: 2026-11-07
**Status**: COMPLETE (awaiting owner review)

## Summary

Transformed the public website from hardcoded section presentation into a database-backed, admin-managed page composition system. Admins can now reorder, show/hide, and customize section text for homepage sections through the CMS — without code changes.

## What Changed

### New Files

| File | Purpose |
|------|---------|
| `lib/cms/sectionRegistry.ts` | Typed catalogue of available section types per page family (homepage, section-landing) |
| `lib/cms/pageLayoutService.ts` | CRUD + publish/draft service for PageLayout, gated by `system.config` permission |
| `app/admin/page-layout-actions.ts` | Server actions: saveDraft, publishLayout, resetDraft |
| `views/admin/AdminPageLayoutEditor.tsx` | Client component — drag-to-reorder, visibility toggles, kicker/title editing |
| `views/admin/AdminWebsitePage.tsx` | Tabbed wrapper: Navigation + Page Layouts tabs |
| `prisma/migrations/20261107140000_batch31_page_layout/migration.sql` | Additive migration — creates `PageLayout` table |
| `tests/batch31-unit.test.ts` | 11 unit tests covering registry, schema, service, integration |

### Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `PageLayout` model (id, pageKey, draftSections, publishedSections, timestamps) |
| `app/(public)/page.tsx` | Fetches published layout; passes `layoutSections` to HomeView |
| `views/HomeView.tsx` | Renders sections in layout-defined order with visibility filtering |
| `app/admin/(dashboard)/website/page.tsx` | Fetches layouts + registries; renders tabbed AdminWebsitePage |
| `views/admin/AdminWebsiteNavPage.tsx` | Removed duplicate AdminPageHeader (now in parent wrapper) |
| `tests/batchA.test.ts` | Removed AdminWebsitePage.tsx from dead-mock list (now a real component) |

## Architecture

### PageLayout Model

```
PageLayout {
  id                String    @id @default(uuid())
  pageKey           String    @unique       // e.g. "homepage", "section:competition"
  draftSections     Json      @default("[]")
  publishedSections Json      @default("[]")
  publishedAt       DateTime?
  publishedById     String?
  updatedById       String?
  createdAt         DateTime
  updatedAt         DateTime
}
```

### Section Registry

Two page families:
- **homepage** — 9 section types: editorial-hero, latest-coverage, quick-access, competition, plan-and-watch, entertainment, events-shopping, more-rodeo, learning
- **section-landing** — 4 section types: landing-hero, landing-featured, landing-grid, landing-stat-pills

Each section type has a label and `defaultProps` (kicker, title, articleCount, etc.).

### Draft/Publish Workflow

1. Admin edits section order/visibility/text → saved as `draftSections`
2. Admin clicks "Publish" → `draftSections` copied to `publishedSections`
3. Public site reads `publishedSections`; falls back to registry defaults when no layout exists

### Graceful Degradation

- If no PageLayout row exists → defaults from section registry (same as hardcoded behavior)
- If PageLayout table doesn't exist (migration not applied) → defaults (try/catch)
- If published sections array is empty → defaults

## Security

- All mutations require `system.config` permission (super_admin/administrator only)
- Server actions use `requireActor` gate
- All changes are audit-logged
- Section type validation prevents injection of unknown section types
- Input validated via Zod (max 30 sections per layout, bounded string lengths)

## Test Evidence

| Check | Result |
|-------|--------|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid |
| Vitest | 53 files, 464 tests passed |
| `next build` | success |
| Batch 31 unit tests | 11 tests passed |

## Non-Negotiable Safety Compliance

- [x] No commits or pushes made
- [x] No new Git branches created
- [x] No destructive database operations
- [x] No production DNS/hosting/credential changes
- [x] No third-party CMS or visual page-builder dependencies introduced
- [x] No website rebuild — extends existing architecture

## Pending

- **Migration execution**: `20261107140000_batch31_page_layout` needs to run on dev/staging/production databases
- **Section landing integration**: The section-landing page family registry is defined but not yet wired into `SectionLandingView.tsx` (P1 priority per audit)
- **Owner review and approval** before committing
