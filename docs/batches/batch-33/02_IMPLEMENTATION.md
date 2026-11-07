# Batch 33 — Unified Site Experience, Advanced Content Sourcing & Premium Visual Builder Integration

## Delivery Summary

### Database (Phase K)
- **Migration**: `20261107160000_batch33_site_experience`
- Added `Announcement` model (BREAKING/INFO types, date windows, priority)
- Added `GlobalBlock` model (MESSAGE/CTA/FEATURED_STORY, placement allowlist, date windows)
- Added `SiteConfig` model (keyed document store for footer/appearance, draft/published JSON)
- Added `scheduledSections`, `scheduledAt`, `version` to `PageLayout` (concurrency control)

### Content Source Engine (Phase C)
- **File**: `lib/cms/contentSourceEngine.ts`
- `DeduplicationContext` class prevents duplicate items across sections
- 6 entity type resolvers: article, rodeo-hub, rodeo-event, rodeo-edition, competitor, venue
- 3 modes: auto (database query with filters), manual (specific IDs), mixed (manual + auto backfill)
- `resolveContentSource()`, `resolveMultipleSources()`, `parseContentSource()`

### Services (Phases E–H)
- **`lib/cms/announcementService.ts`**: Full CRUD + `getActiveAnnouncements()` for public display
- **`lib/cms/globalBlockService.ts`**: Full CRUD + `getActiveBlocksForPlacement()`, 7 placement slots
- **`lib/cms/siteConfigService.ts`**: Draft/publish for `footer` and `appearance` keys, 10 intro banner styles

### Server Actions
- `app/admin/announcement-actions.ts`: create, update, delete, toggle
- `app/admin/global-block-actions.ts`: create, update, delete, toggle
- `app/admin/site-config-actions.ts`: saveDraft, publish, resetDraftToPublished

### Admin UI (Phases B–H)
- **`views/admin/AdminWebsitePage.tsx`**: 7-tab unified workspace (Overview, Page Builder, Header & Nav, Footer, Announcements, Global Blocks, Appearance)
- **`views/admin/AdminAnnouncementsEditor.tsx`**: Table + modal CRUD, enable/disable, date windows
- **`views/admin/AdminGlobalBlocksEditor.tsx`**: Table + modal CRUD, placement selector, date windows
- **`views/admin/AdminFooterEditor.tsx`**: Tagline, copyright, social links, columns with draft/publish
- **`views/admin/AdminAppearanceEditor.tsx`**: 10-style selector, banner content, focal point sliders, overlay controls, layout options

### Premium Intro Banner (Phase D)
- **`components/public/IntroBanner.tsx`**: 10 styles rendered
  - editorial, stadium, bottom-caption, right-focus, glass, framed, split, spotlight, amber, minimal
- Focal point control (desktop + mobile), zoom, overlay darkness, text/vertical alignment, full-width toggle

### Public Integration (Phase N)
- **`components/public/AnnouncementBanner.tsx`**: Dismissible banners (BREAKING = red, INFO = gold)
- **`components/public/GlobalBlockRenderer.tsx`**: Renders MESSAGE, CTA, FEATURED_STORY blocks
- **Homepage** (`app/(public)/page.tsx` + `views/HomeView.tsx`):
  - Fetches active announcements, homepage-top/bottom global blocks, published appearance config
  - Renders announcement banners at top, global blocks at top/bottom, intro banner before sections

### Tests (Phase O)
- **`tests/batch33-unit.test.ts`**: 37 tests covering all services, actions, admin components, public components, migration, and integration
- All 37 pass; 105 existing tests unaffected (zero regressions)

## RBAC
- Announcements, Global Blocks, Site Config: `system.config` permission
- Navigation: `navigation.manage` permission (unchanged)

## Placements
| Placement | Description |
|---|---|
| homepage-top | Above homepage content sections |
| homepage-bottom | Below homepage content sections |
| article-end | After article body |
| rodeo-hub-top | Top of rodeo hub pages |
| event-detail | Event detail pages |
| edition-detail | Edition detail pages |
| footer-top | Above footer content |

## Intro Banner Styles
| Style | Description |
|---|---|
| editorial | Classic editorial hero with overlay text |
| stadium | Full-bleed arena atmosphere with bold headline |
| bottom-caption | Image fills frame, text at bottom edge |
| right-focus | Text left, image cropped right |
| glass | Frosted glass card overlaying image |
| framed | Inset image with decorative border |
| split | 50/50 text-image horizontal split |
| spotlight | Centered text with vignette |
| amber | NFRGuide gold accent treatment |
| minimal | Clean type-forward hero, subtle image |
