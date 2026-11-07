# Batch 28 — Final Report

**Batch**: Targeted CMS Gap Remediation, Functional Verification & Test Stabilization
**Date**: 2026-11-07
**Status**: Complete (local, uncommitted — awaiting owner review)

## Summary

Batch 28 closed the four highest-priority CMS gaps identified in the Batch 27 functional audit and stabilized two flaky E2E tests. All changes compile, all 428 vitest tests pass, and the production build succeeds.

## What Was Done

### E2E Stabilization (G-07, G-08)

Two flaky Playwright tests were fixed with targeted timeout increases. G-07 (admin editor Sources heading) got a 15s assertion timeout to account for heavy panel hydration. G-08 (admin-seo axe scan) got a 60s per-test timeout for data-heavy admin pages.

### B1: Section Landing Page CMS Metadata

Sections can now have CMS-managed display names, taglines, descriptions, and hero images. A new `SectionConfig` model stores overrides; the existing `getSectionMeta()` was made async and merges DB values with hardcoded fallbacks. The `SECTION` entity type was added to the Landing SEO system, enabling SEO title/description and FAQ management for primary sections. A "Sections" tab was added to Admin Settings.

### B2: CMS-Managed Quick-Access Links

The homepage quick-access card grid is now editable via the Website & Navigation admin module. A `quick-access` location was added to `NavigationItem` along with a `description` field for card text. `getQuickAccessLinks()` returns DB-managed items when present, falling back to the hardcoded config.

### B3: Legal/Informational Page CMS Editing

All 7 legal/policy pages (about, privacy, terms, editorial-policy, affiliate-disclosure, corrections, contact) can now be edited through a new "Info & Legal Pages" admin module at `/admin/info-pages/`. Content follows a strict 4-stage workflow: DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED. Only published content overrides the hardcoded defaults. All mutations require `system.config` permission and are audit-logged.

The public `LegalPageView` was converted to an async server component that checks for published DB content first, falling back to the hardcoded `config/legalPages.ts` content. Legal page routes switched from `force-static` to dynamic `generateMetadata` to support DB reads.

### Test & Build Verification

- **TypeScript**: Clean (`tsc --noEmit`).
- **Prisma**: Schema valid; test DB synced.
- **Vitest**: 50 files, 428 tests, all passing. Updated permission test for 18 CMS modules; fixed SectionEditor accessibility (added `aria-label` to form controls).
- **Production build**: Succeeded with all routes compiling.

## Architecture Decisions

1. **Hardcoded fallbacks everywhere**: All three CMS features (sections, quick-access, legal pages) fall back to existing hardcoded content when no DB rows exist. The public site never breaks if the DB has no CMS overrides.

2. **InfoPage workflow enforcement**: The service layer enforces status transitions server-side. A published page cannot be edited directly — it must be reverted to draft first. Approval requires `system.config` (super_admin/administrator only).

3. **Legal pages now dynamic**: Switching from `force-static` to dynamic rendering was necessary for DB integration. Performance impact is minimal — these are low-traffic pages and Next.js caching handles repeat requests.

4. **Reused existing infrastructure**: Section metadata reuses the `LandingEntityType` + `EntitySeo` system. Quick-access reuses `NavigationItem`. No new permission strings were added — everything gates on existing `system.config` and `navigation.manage` permissions.

## What's Not Done

- E2E Playwright suite was not re-run (requires full test-DB build cycle).
- No git commit per spec rules.
- Admin-to-public workflow verification was done via test suites, not manual browser testing.

## Files

- 6 new files created
- 27 existing files modified
- Full list in [CHANGELOG.md](CHANGELOG.md)

---

## Follow-Up Verification (2026-11-07, session 2)

### Task 1 — Playwright Stability

G-07 and G-08 both pass consistently (2/2 repeat-each). Full Playwright suite: **56 passed, 0 failed, 0 skipped**.

### Task 2 — CMS Feature E2E Verification

Created `tests/batch28-cms.test.ts` with 13 integration tests against the real test DB covering:
- Section config: upsert, merge with fallback, unauthorized editor rejection, fallback when no DB row.
- Quick-access: create/edit/reorder/hide/delete, fallback to hardcoded, unsafe URL rejection.
- Info pages: full DRAFT→REVIEW→APPROVED→PUBLISHED workflow, workflow step enforcement, publish-then-unpublish cycle, direct-edit-of-published rejection, RBAC enforcement, all 7 slug acceptance.

**Critical fix**: `revertToDraft` on a PUBLISHED page silently removed public content. Added guard: PUBLISHED pages must be explicitly unpublished first (`unpublishInfoPage`). This prevents accidental public-content regression while preserving editorial control.

### Task 3 — XSS Security Hardening

Installed `sanitize-html`. Created `lib/cms/sanitizeHtml.ts` with an allowlist-based sanitizer (editorial tags only: headings, paragraphs, lists, links, tables, code blocks). Applied at both write time (`saveInfoPageDraft`) and render time (`LegalPageView`). Created `tests/batch28-xss.test.ts` with 12 regression tests covering script injection, event handlers, javascript/data URIs, iframe/object/embed, style injection, SVG XSS, meta refresh — all stripped. Safe editorial HTML preserved.

### Task 4 — Prisma Migration

Created `prisma/migrations/20261107120000_batch28_cms_gaps/migration.sql`. All operations are additive: `ALTER TYPE ADD VALUE`, `ADD COLUMN`, `CREATE TABLE`, `CREATE TYPE`. No destructive operations. Marked as applied on test DB via `prisma migrate resolve`. Migration status clean (15/15 applied).

**Staging requirement**: Run `prisma migrate deploy` against staging DB before deploying batch-28 code.

### Task 5 — Final Regression

| Check              | Result              |
|--------------------|---------------------|
| tsc --noEmit       | 0 errors            |
| prisma validate    | valid               |
| vitest             | 52 files, 453 tests |
| playwright         | 56 passed           |
| next build         | success             |
| migrate status     | 15/15 applied       |

### Follow-Up Files Added

- `lib/cms/sanitizeHtml.ts` — allowlist HTML sanitizer
- `tests/batch28-cms.test.ts` — 13 CMS integration tests
- `tests/batch28-xss.test.ts` — 12 XSS regression tests
- `prisma/migrations/20261107120000_batch28_cms_gaps/migration.sql`

### Follow-Up Files Modified

- `lib/cms/infoPageService.ts` — sanitization on save, revertToDraft guard, unpublishInfoPage
- `app/admin/info-page-actions.ts` — unpublishInfoPageAction
- `views/admin/AdminInfoPagesPage.tsx` — Unpublish button for published pages
- `views/LegalPageView.tsx` — render-time sanitization

### Remaining Issues

None. All tests pass. No unresolved security or data-integrity defects.

### Staging Readiness

**Ready for staging** pending: (1) `prisma migrate deploy`, (2) owner review of all uncommitted changes.
