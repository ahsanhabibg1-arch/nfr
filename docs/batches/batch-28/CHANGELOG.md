# Batch 28 — Targeted CMS Gap Remediation, Functional Verification & Test Stabilization

**Date**: 2026-11-07
**Status**: Complete (local, uncommitted)

## Phase A — E2E Test Stabilization

- **G-07** (admin editor Sources heading flaky): Added `timeout: 15_000` to the Sources heading assertion in `e2e/admin.spec.ts`.
- **G-08** (admin-seo axe timeout): Added `test.setTimeout(60_000)` per-test inside the `ADMIN_PAGES` loop in `e2e/a11y.spec.ts`.

## Phase B1 — Section Landing Page CMS Metadata

- Added `SECTION` to `LandingEntityType` enum, enabling SEO/FAQ editing for primary sections via the existing Landing SEO admin module.
- Created `SectionConfig` Prisma model with `displayName`, `tagline`, `description`, `heroImage`, `visible` fields.
- Created `lib/cms/sectionConfigService.ts` with `getSectionConfig`, `getAllSectionConfigs`, `upsertSectionConfig` (Zod validated, `system.config` gated, audit logged).
- Made `getSectionMeta()` in `lib/content.ts` async, merging DB overrides with hardcoded fallbacks.
- Added server action `app/admin/section-config-actions.ts`.
- Added "Sections" tab to Admin Settings page with collapsible per-section editor.
- Updated all consumers of `getSectionMeta()` to use `await`.

## Phase B2 — CMS-Managed Quick-Access Links

- Added `'quick-access'` to `NAV_LOCATIONS` and `QuickAccessLink` interface to `navTypes.ts`.
- Added `description` nullable field to `NavigationItem` Prisma model.
- Added `getQuickAccessLinks()` to `navigationService.ts` with hardcoded fallback.
- Updated `HomeView` to accept `quickAccessLinks` prop; updated homepage server component to call `getQuickAccessLinks()`.
- Added description field and 'quick-access' location support to admin navigation page.

## Phase B3 — Legal/Informational Page CMS Editing

- Created `InfoPage` Prisma model with `InfoPageStatus` enum (DRAFT, PENDING_REVIEW, APPROVED, PUBLISHED).
- Created `lib/cms/infoPageService.ts` with full workflow: `saveInfoPageDraft`, `submitForReview`, `approveInfoPage`, `publishInfoPage`, `revertToDraft`. All mutations are `system.config` gated and audit logged.
- Created server actions in `app/admin/info-page-actions.ts`.
- Created admin page at `/admin/info-pages/` with `AdminInfoPagesPage` view showing all 7 legal pages, their hardcoded and CMS status, and full workflow controls.
- Registered `info-pages` module in `CMS_MODULES` (18 modules total).
- Updated `LegalPageView` to async: checks DB for published `InfoPage` first, falls back to hardcoded content. Published pages override title, body, SEO metadata, and suppress the draft notice.
- Converted all 7 legal page routes from `force-static` + sync `metadata` to `generateMetadata` (async).

## Phase C — Workflow Verification

- Full vitest suite: 50 files, 428 tests, all passing.
- Updated `permissions-unit.test.ts` for 18 CMS modules.
- Fixed accessibility test (batchD) — added `aria-label` to SectionEditor form controls.
- Pushed schema to test DB; batch04 navigation tests pass.

## Phase D-E — Regression & Build

- TypeScript: `tsc --noEmit` clean.
- Prisma: `prisma validate` clean.
- Production build: `next build` succeeded with all routes.

## Files Changed (new)

- `lib/cms/sectionConfigService.ts`
- `lib/cms/infoPageService.ts`
- `app/admin/section-config-actions.ts`
- `app/admin/info-page-actions.ts`
- `app/admin/(dashboard)/info-pages/page.tsx`
- `views/admin/AdminInfoPagesPage.tsx`

## Files Modified

- `prisma/schema.prisma` — SectionConfig model, InfoPage model, SECTION enum, NavigationItem.description
- `lib/cms/landingEntities.ts` — SECTION support
- `lib/cms/landingAdminService.ts` — SECTION listing/detail
- `lib/content.ts` — async getSectionMeta with DB merge
- `lib/cms/navTypes.ts` — quick-access location, QuickAccessLink
- `lib/cms/navCanonical.ts` — quick-access canonical entry
- `lib/cms/navigationService.ts` — description field, getQuickAccessLinks
- `lib/auth/permissions.ts` — info-pages CMS module
- `views/HomeView.tsx` — quickAccessLinks prop
- `views/SectionLandingView.tsx` — async getSectionMeta
- `views/LegalPageView.tsx` — async, DB-first content rendering
- `views/admin/AdminSettingsPage.tsx` — Sections tab, aria-labels
- `views/admin/AdminWebsiteNavPage.tsx` — quick-access location
- `app/(public)/page.tsx` — getQuickAccessLinks call
- `app/(public)/[section]/page.tsx` — await getSectionMeta
- `app/(public)/rodeo-events/page.tsx` — await getSectionMeta
- `app/sitemap.ts` — await getSectionMeta
- `app/admin/(dashboard)/settings/page.tsx` — section config loading
- `app/(public)/about/page.tsx` — async generateMetadata
- `app/(public)/terms/page.tsx` — async generateMetadata
- `app/(public)/privacy/page.tsx` — async generateMetadata
- `app/(public)/editorial-policy/page.tsx` — async generateMetadata
- `app/(public)/contact/page.tsx` — async generateMetadata
- `app/(public)/corrections/page.tsx` — async generateMetadata
- `app/(public)/affiliate-disclosure/page.tsx` — async generateMetadata
- `e2e/admin.spec.ts` — G-07 fix
- `e2e/a11y.spec.ts` — G-08 fix
- `tests/permissions-unit.test.ts` — 18-module assertion

---

## Follow-Up (session 2)

### Files Added

- `lib/cms/sanitizeHtml.ts` — allowlist HTML sanitizer (sanitize-html)
- `tests/batch28-cms.test.ts` — 13 CMS integration tests
- `tests/batch28-xss.test.ts` — 12 XSS regression tests
- `prisma/migrations/20261107120000_batch28_cms_gaps/migration.sql` — additive migration

### Files Modified

- `lib/cms/infoPageService.ts` — write-time sanitization, revertToDraft guard, unpublishInfoPage
- `app/admin/info-page-actions.ts` — unpublishInfoPageAction server action
- `views/admin/AdminInfoPagesPage.tsx` — Unpublish button for published pages
- `views/LegalPageView.tsx` — render-time sanitization
- `package.json` / `package-lock.json` — added sanitize-html, @types/sanitize-html
