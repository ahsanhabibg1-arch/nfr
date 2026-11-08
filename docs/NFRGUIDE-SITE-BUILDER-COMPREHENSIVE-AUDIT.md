# NFRGuide — Site Builder & Website Experience Comprehensive Audit

| | |
|---|---|
| **Date** | 2026-11-07 |
| **Scope** | Public website (`apps/web/app/(public)`), Admin → Website & Navigation (Site Builder), PageLayout / SiteConfig / Navigation / Announcement / GlobalBlock / SectionConfig, Content Source Engine, preview & publish |
| **Type** | Read-only audit. No code, schema, or data was changed to produce this report. |
| **Code baseline** | `main` @ `feb4711` **plus uncommitted working-tree fixes made on 2026-11-07** (see §1.1). Findings that depend on those fixes are marked **[WT]**. |
| **Status legend** | ✅ Fully functional · 🟡 Partially functional · 🖼️ UI only (saved, never rendered) · ⚙️ Backend only (no admin UI or no consumer) · ❌ Not implemented · ❔ Not verified |

> **Verified vs recommended.** Sections 1–19 describe what the code does today, with file and function references. Sections 20–21 are recommendations. Recommendations are always labelled as such.

---

## 1. Executive Summary

**The question:** can the owner use the admin panel to understand and control the whole public website?

**The answer:** partly. The data model and storage (PageLayout, SiteConfig, draft/publish) are reasonable. Most of the problem is in two places:

1. **Rendering is only partly wired.** Many settings can be edited and saved but never reach the public site.
2. **The admin is organised by technical subsystem, not by page.** It does not answer "which page am I editing, and where will this appear?"

**The architecture can support the target experience with incremental changes. It does not need a new page builder.** The PageLayout JSON slot model, the section registry, and the draft/publish columns are the right foundation. What's missing:

- **A single renderer contract.** Every page should render its slots in slot order through one shared block renderer. Today each view hand-picks the slots it wants.
- **The Content Source Engine connected to blocks.** `lib/cms/contentSourceEngine.ts` is complete but has **zero runtime callers**.
- **A page-oriented admin.** The editor should show only the pages and blocks that actually render, with a working preview for every page.

### Key verified findings

| # | Finding | Severity |
|---|---|---|
| F1 | Before the [WT] fix, **none of the 9 core homepage sections read their props**. `HomeView` built a fixed `sectionMap` from page-level data, so titles, images, counts and pinned articles saved in the builder never reached the site. This is the root cause of "I set an image and title and nothing changes". | Critical (fixed in WT) |
| F2 | **Section landing pages ignore slot order and most props.** `SectionLandingView` renders a fixed template. `landing-grid.articleCount`, `landing-hero.heroImageUrl`, and the `rich-text-block` / `cta-banner` blocks offered for these pages are never rendered. | High |
| F3 | **4 of the 13 editable page keys are never read by any public page:** `template:rodeo-hub`, `template:rodeo-edition`, `template:discipline`, `template:category`. Editing them has no effect. | High |
| F4 | **The Content Source Engine is unused.** It is referenced only in source-reading tests. The data fetching blocks actually use is inline in each view, or in the new `homepageData.ts` [WT]. | High |
| F5 | **Draft preview works only for the homepage [WT].** Before the fix it worked for no page: the preview iframe loaded the published page. Section, directory and template pages still show published content in preview, and template previews point to wrong URLs. | High |
| F6 | **Three publish models coexist.** Page layouts and site config (Footer/Appearance) use draft → publish. Navigation, Announcements and Global Blocks go live on save. The UI does not explain the difference. | Medium |
| F7 | **The same thing is configured in two places:** the section name/tagline/description (System Settings `SectionConfig` vs the `landing-hero` slot) and the homepage hero (Appearance "Intro Banner" vs the Page Builder "Editorial Hero"). | Medium |
| F8 | **Before the [WT] fix, the Footer editor (description, copyright, social links, columns) was UI only.** `SiteFooter` never read `SiteConfig('footer')`. | High (fixed in WT) |
| F9 | **Before the [WT] fix, "New Announcement" and "New Global Block" could not open.** `AdminModal` was rendered without its required `isOpen` prop, which was also a TypeScript error. | High (fixed in WT) |
| F10 | **No concurrency protection on layouts.** `PageLayout.version` exists but is never read or incremented, so `saveDraft` is last-write-wins. | Medium |
| F11 | **The page-builder tests assert source text, not behaviour.** Example: `expect(src).toContain('sectionMap')`. This is why F1, F2, F3 and F8 shipped with green tests. | Medium |

### 1.1 Working-tree changes this audit takes into account [WT]

These were made earlier on 2026-11-07 to fix the homepage. They are **not committed**.

| File | Change |
|---|---|
| `lib/cms/homepageData.ts` (new) | `resolveHomepageSlots()`: per-slot data resolution driven by slot props (`articleCount`, `featuredIds`, `secondaryCount`) |
| `views/HomeView.tsx` | Renders `slots.map(...)` and passes each slot's props to its component (`renderCore`). The fixed `sectionMap` is removed. |
| `components/sections/*.tsx`, `sectionCopy.ts`, `components/SectionHeading.tsx` | Kicker, title, description and CTA are props, falling back to the old text |
| `app/(public)/page.tsx` | Uses `draftMode()`. Staff with `system.config` see `getDraftSections('homepage')`. |
| `app/admin/(dashboard)/website/preview/route.ts` | Enables or disables Next.js draft mode |
| `app/(public)/layout.tsx`, `components/PublicChrome.tsx`, `components/SiteFooter.tsx` | Footer config rendered. Announcements and `footer-top` blocks shown site-wide. |
| `views/ArticleView.tsx` | `article-end` global blocks rendered |
| `lib/cms/sectionRegistry.ts` | Hero: lead-article picker, kicker, CTA, image alt. Pinned articles added to the article sections. |
| `lib/cms/pageLayoutService.ts` | URL validation now applies only to `*Url` props. It previously rejected `heroImageAlt` and `imagePosition`. |
| `views/admin/AdminAnnouncementsEditor.tsx`, `AdminGlobalBlocksEditor.tsx`, `AdminAppearanceEditor.tsx` | `isOpen` passed to the modal; type fixes |

`tsc --noEmit` is clean and the full Vitest suite passes (55 files, 558 tests) with these changes.

---

## 2. Current Public Website Architecture

| Layer | File | Data-driven? |
|---|---|---|
| Root public layout | `app/(public)/layout.tsx`, `PublicLayout` | Search index, disciplines, navigation (`getPublicNavigation`); [WT] footer config, announcements, `footer-top` blocks. `revalidate = 300`. |
| Chrome | `components/PublicChrome.tsx` | Client component. Renders `SiteHeader`, `<main>`, `SiteFooter` and `SearchModal`. |
| Header | `components/SiteHeader.tsx` | Links come from `NavigationItem(location='header')`. Falls back to `NAV_FALLBACK` (5 sections). Flat list: no dropdowns or nesting. Active state uses `pathname.startsWith(url)`. |
| Footer | `components/SiteFooter.tsx` | Menu columns come from `NavigationItem` (`footer-sections`, `footer-academy`). [WT] Tagline, description, copyright, status, social links and custom columns come from `SiteConfig('footer').published`. The brand lockup, independence disclaimer, "Publication Policies" column (`config/legalPages.ts`) and directory links stay hard-coded. |
| Homepage | `app/(public)/page.tsx` → `views/HomeView.tsx` | `PageLayout('homepage')` [WT: per-slot props]. `revalidate = 60`. |
| Section landings | `app/(public)/[section]/page.tsx` → `views/SectionLandingView.tsx`. `/rodeo-events/` has its own `app/(public)/rodeo-events/page.tsx`, which adds `RodeoDirectory`. | Partly; see §5 |
| Article | `app/(public)/articles/[slug]` → `views/ArticleView.tsx` | `PageLayout('template:article')`: related count, CTA [WT: `article-end` blocks] |
| Directories | `app/(public)/competitors/page.tsx`, `venues/page.tsx` | `PageLayout('directory:*')`: hero title/description, CTA |
| Rodeo hub / event / edition | `app/(public)/rodeo-events/[slug]/…`, `views/RodeoViews.tsx` | Entity data only; **no layout** |
| Discipline / category | `app/(public)/disciplines/…`, `categories/…`, `views/DisciplineGuideView.tsx`, `CategoryArchiveView.tsx` | Entity data only; **no layout** |
| SEO | `lib/seo.ts`: `buildMetadata`, `breadcrumbJsonLd`, `JsonLd` | Metadata titles and descriptions for sections come from `getSectionMeta` (`PRIMARY_SECTIONS` + `SectionConfig` override) |

---

## 3. Five-Section Information Architecture

The canonical definition is `PRIMARY_SECTIONS` in `config/routes.ts`. Each section has `id`, `name`, `categoryKey`, `path`, `tagline` and `description`.

| Section | Route | Route handler | Layout key | Article source |
|---|---|---|---|---|
| NFR Competition | `/competition/` | `[section]/page.tsx` (`generateStaticParams`, `dynamicParams = false`) | `section:competition` | `getPublishedArticlesBySection(categoryKey)`, i.e. articles whose `category.name` equals the section's `categoryKey` |
| NFR Entertainment | `/entertainment/` | same | `section:entertainment` | same |
| NFR Events & Shopping | `/events-shopping/` | same | `section:events-shopping` | same |
| NFR Plan & Watch | `/plan-watch/` | same | `section:plan-watch` | same |
| More Rodeo | `/rodeo-events/` | dedicated `rodeo-events/page.tsx` (excluded from `[section]` params) | `section:rodeo-events` | same, plus `listPublicHubs()` and `listPublicEvents()` |

- **Header labels:** `NavigationItem` rows. `restoreCanonicalNav` (`lib/cms/navigationService.ts`) seeds them from `lib/cms/navCanonical.ts`.
- **Section display name/tagline/description:** `SectionConfig`, edited in System Settings (`views/admin/AdminSettingsPage.tsx` → `app/admin/section-config-actions.ts`), merged in `getSectionMeta` (`lib/content.ts:268`). **Note:** `SectionConfig.heroImage` and `SectionConfig.visible` are stored but never read: ⚙️/🖼️.
- **Homepage section feeds:** Plan & Watch, Entertainment and Events & Shopping have homepage blocks. Competition appears as a discipline grid (`competition` block), not an article feed. More Rodeo appears as a hubs/events block (`more-rodeo`), not an article feed. **There is no homepage article feed for the Competition or More Rodeo sections.**

---

## 4. Homepage Structure

`app/(public)/page.tsx` → `resolveHomepageSlots()` (`lib/cms/homepageData.ts:91`) [WT] → `HomeView` (`views/HomeView.tsx`).

The fixed order outside the builder is: announcements (site-wide via the layout [WT]), `homepage-top` global blocks, the Appearance intro banner (`IntroBanner`, rendered only when a style and headline are both set), then the **builder slots in `order`**, then `homepage-bottom` global blocks.

| Block type | Component | Props honoured (after WT) | Data source |
|---|---|---|---|
| `editorial-hero` (required, max 1) | `components/sections/EditorialHero.tsx` | `featuredIds` (first = lead), `heroImageUrl`, `heroImageAlt`, `kicker`, `ctaText`, `secondaryCount` 0–4 | Pinned lead, else `getHeroArticle()` (`isLeadHero`, else newest). Secondaries: `getSecondaryHeroStories` (`isFeatured`), topped up from latest. |
| `latest-coverage` (max 3) | `LatestCoverage.tsx` | kicker, title, description, `articleCount` ≤12, `featuredIds` (pinned first), `ctaText`/`ctaUrl` | Pinned, then `getLatestArticles`, excluding articles shown in the hero |
| `quick-access` | `QuickAccess.tsx` | kicker, title, description | `NavigationItem(location='quick-access')` via `getQuickAccessLinks` |
| `competition` | `CompetitionSection.tsx` | kicker, title, description | `getAllDisciplines()`; the Roughstock/Timed filter is hard-coded |
| `plan-and-watch` / `entertainment` / `events-shopping` | `*Section.tsx` + `HomeArticleFeed` | kicker, title, description, `articleCount` ≤8, `featuredIds`, `ctaText`/`ctaUrl` | Pinned, then `getPublishedArticlesBySection(categoryKey, {limit, excludeIds})` |
| `more-rodeo` | `MoreRodeoSection.tsx` | kicker, title, description | `listPublicHubs`, `listPublicEvents` (unlimited, no selection) |
| `learning` | `LearningSection.tsx` | kicker, title, description, `articleCount`, `featuredIds`, CTA | `getEvergreenArticles` (`articleType` in `EVERGREEN_ARTICLE_TYPES`). Hidden when empty. |
| `rich-text-block`, `image-text-block`, `stats-banner`, `cta-banner`, `faq-block`, `newsletter-signup` | inline `renderPremiumBlock` in `HomeView.tsx:104` | All props | Static content in props |

Notes (verified):

- `newsletter-signup` is **UI only on the public side**. The input is `readOnly` and the button has no handler; there is no subscription backend.
- `LatestCoverage` still has hard-coded category filter tabs (`CATEGORIES`), which filter only the articles already fetched.
- The homepage-wide empty state ("No published coverage yet") triggers when `getHeroArticle()` returns nothing.

---

## 5. Section Landing Page Analysis

**Source:** `views/SectionLandingView.tsx`, `SectionLandingView()`. Every landing page is **the same hard-coded template**. The layout is used only for show/hide flags and a few strings.

| Registry block (`SECTION_LANDING_SECTIONS`) | Rendered? | Props honoured | Status |
|---|---|---|---|
| `landing-hero` | Yes, if `visible` | `kicker`, `title`, `description` | 🟡 `heroImageUrl` is ignored; `SectionLandingHero` has no image prop |
| `landing-featured` | Yes, if `visible` | `ctaText` | 🟡 Always the newest section article; the kicker "Department Feature" is hard-coded |
| `landing-grid` | Yes, if `visible` | `ctaText` | 🟡 **`articleCount` ignored.** All remaining section articles render (`getPublishedArticlesBySection` with no limit). The heading "More … Stories & Dispatches" is hard-coded. |
| `landing-stat-pills` | Show/hide only | none (`editableProps: []`) | 🟡 Values hard-coded in the view |
| `rich-text-block` | **No** | — | 🖼️ Offered in the builder, never rendered |
| `cta-banner` | **No** | — | 🖼️ Offered in the builder, never rendered |

More findings:

- **Slot order is ignored.** The view looks slots up with `getSlot(type)` and renders in fixed JSX order, so drag-and-drop reordering has no effect on landing pages.
- **The competition-only "NFR Discipline Guides" grid** (`sectionKey === 'competition'`) is hard-coded and has no slot.
- **More Rodeo** appends `RodeoDirectory` after the template (`rodeo-events/page.tsx`), outside the builder.
- **Not preview-aware.** The view always calls `getPublishedSections`.
- **Independent layouts:** each section has its own `PageLayout` row (`section:<key>`), so the *storage* is independent. The *rendering* is one template, so the five pages can differ only in hero copy, CTA labels and section visibility.

---

## 6. Existing Admin Builder Architecture

**Entry point:** `app/admin/(dashboard)/website/page.tsx`. This server component loads nav items, layouts, announcements, global blocks and site configs, and serializes the four registries. It passes everything to `views/admin/AdminWebsitePage.tsx`, a client component with tabs (`TABS`, line 48).

| Tab | Component | Server actions | Service | Permission |
|---|---|---|---|---|
| Overview | `AdminWebsitePage` (`OverviewCard`) | — | — | — |
| Page Builder | `AdminPageLayoutEditor.tsx` | `app/admin/page-layout-actions.ts`: `saveDraftAction`, `publishLayoutAction`, `resetDraftAction`, `restoreDefaultsAction`, `listFeaturedCandidatesAction`, `resolveArticleDetailsAction` | `lib/cms/pageLayoutService.ts` | `system.config` |
| Header & Nav | `AdminWebsiteNavPage.tsx` | `navigation-actions.ts` (create/update/delete, `setNavVisibleAction`, `restoreCanonicalNavAction`) | `navigationService.ts` | `navigation.manage` |
| Footer | `AdminFooterEditor.tsx` | `site-config-actions.ts` (`saveSiteConfigDraftAction`, `publishSiteConfigAction`, `resetSiteConfigDraftAction`) | `siteConfigService.ts` | `system.config` |
| Announcements | `AdminAnnouncementsEditor.tsx` | `announcement-actions.ts` | `announcementService.ts` | `system.config` |
| Global Blocks | `AdminGlobalBlocksEditor.tsx` | `global-block-actions.ts` | `globalBlockService.ts` | `system.config` |
| Appearance | `AdminAppearanceEditor.tsx` | `site-config-actions.ts` (`'appearance'`) | `siteConfigService.ts` | `system.config` |
| *(elsewhere)* System Settings → sections | `AdminSettingsPage.tsx` | `section-config-actions.ts` | `sectionConfigService.ts` | `system.config` |

**Registry:** `lib/cms/sectionRegistry.ts` defines `SectionDef` (type, label, category, `required`, `maxInstances`, `duplicatable`, `defaultProps`, `editableProps: PropDef[]`) for 4 families (`homepage`, `section-landing`, `detail-template`, `directory`), plus `KNOWN_PAGE_KEYS` (13 keys) and `getPageFamily(pageKey)`.

**Page Builder editor** (`AdminPageLayoutEditor.tsx`): page selector, canvas, add-section menu, drag and drop (`handleDragStart`/`handleDrop`), move up/down, duplicate (`duplicateBlock`, where `duplicatable`), visibility toggle, delete (required blocks protected), a properties panel with prop tabs (content / style / layout / seo, `editableProps.filter(p => p.tab === tab)`), and these field editors: `number`, `boolean`, `select`, `textarea`, `featured` (article search and pick with order), `image` (media library picker, which also writes `<key>Alt`), `color`, `url`/`text`. It also has dirty tracking ("Unsaved changes"), Save draft, Publish (with confirm), Reset draft, Restore defaults, and a "Preview Draft" link.

---

## 7. Admin Feature Inventory

| Control | Backend effect | Public effect | Status |
|---|---|---|---|
| Page selector, all 13 keys | Loads the `PageLayout` row or registry defaults | — | 🟡 4 keys have no public consumer (F3) |
| Homepage: add / remove / reorder / visibility | `draftSections` JSON | Slot order and visibility honoured | ✅ |
| Homepage: core section props | saved | [WT] honoured (§4) | ✅ [WT] (was 🖼️) |
| Homepage: premium blocks | saved | honoured | ✅ (newsletter form 🖼️) |
| Homepage: hero image + alt | saved | [WT] honoured | ✅ [WT] (was 🖼️, and saving an image from the media library failed validation) |
| Section landing: reorder | saved | ignored | 🖼️ |
| Section landing: hero / featured / grid / pills props | saved | partly (§5) | 🟡 |
| Section landing: rich text / CTA banner | saved | not rendered | 🖼️ |
| Article template: related (count), CTA | saved | honoured | ✅ |
| Article template: `detail-related.title` | saved | ignored; `RelatedArticles` uses its default title | 🖼️ |
| Article template: `detail-hero` (`heroImageUrl`, `showImage`) | saved | ignored | 🖼️ |
| Article template: `detail-faq` visibility | saved | `faqVisible` is computed but never used (`views/ArticleView.tsx`) | 🖼️ |
| Rodeo hub / edition / discipline / category templates | saved | no consumer | 🖼️ |
| Directory: hero title/description, CTA | saved | honoured | ✅ |
| Directory: `heroImageUrl`, `directory-grid.columns` | saved | ignored | 🖼️ |
| Save draft / Publish / Reset / Restore defaults | `pageLayoutService` | publish copies draft → published, then `revalidatePath('/', 'layout')` | ✅ |
| Preview Draft | `preview/route.ts` iframe with draft mode on [WT] | homepage only | 🟡 [WT] (was ❌) |
| Scheduled layout publish | `PageLayout.scheduledSections/scheduledAt` columns | no code reads or writes them | ⚙️ (schema only) |
| Header & Nav CRUD, visibility, canonical restore | `NavigationItem` | live immediately | ✅ (no draft, no nesting) |
| Footer tagline / description / copyright / status / social / columns + draft/publish | `SiteConfig('footer')` | [WT] rendered | ✅ [WT] (was 🖼️) |
| Announcements CRUD, schedule, priority | `Announcement` | [WT] site-wide, top 2 | ✅ [WT] (create modal was broken) |
| Global Blocks CRUD, placements, schedule | `GlobalBlock` | `homepage-top/bottom` ✅; [WT] `footer-top`, `article-end` ✅; `rodeo-hub-top`, `event-detail`, `edition-detail` not rendered | 🟡 |
| Appearance intro banner + draft/publish | `SiteConfig('appearance')` | homepage only (`IntroBanner`) | ✅ |
| System Settings → section name/tagline/description | `SectionConfig` | headers and metadata | ✅ |
| System Settings → section hero image, visible | `SectionConfig` | never read | 🖼️ |
| Desktop/mobile preview toggle | — | — | ❌ |
| Draft/publish for navigation, announcements, global blocks | — | — | ❌ (live on save) |
| Layout version history / rollback | `PageLayout.version` | never used | ❌ |

---

## 8. Content Fetcher Architecture

### 8.1 Content Source Engine: `lib/cms/contentSourceEngine.ts` (⚙️ backend only)

- **Entities:** `article`, `rodeo-hub`, `rodeo-event`, `rodeo-edition`, `competitor`, `venue` (`RESOLVERS`).
- **Modes:** `auto`, `manual` (with `fallbackPolicy: 'fill-auto' | 'hide-missing'`), `mixed` (manual first, then auto fills the rest).
- **Filters (`SourceFilter`):** `categoryId`, `disciplineId`, `rodeoEventId`, `editionId`, `featured` (articles); `upcoming` and `rodeoEventId` (editions); `disciplineId` (competitors). `venueId`, `relatedEntityId` and `relatedEntityType` are declared, and `venueId` is parsed, but no resolver uses them.
- **Sorting:** fixed per entity. Articles `publishedAt desc`, hubs/venues/events/competitors alphabetical, editions `startAt desc`. Sort order is not configurable.
- **Dedup:** `DeduplicationContext` shared across `resolveMultipleSources` (sequential, one query per block).
- **Config parsing:** `parseContentSource(props)` reads `sourceMode`, `sourceEntityType`, `sourceManualIds`, `sourceLimit`, `source*Id`, `sourceFeatured`, `sourceUpcoming`, `sourceFallback`, `sourceEmptyBehavior`, `sourceLayoutVariant`.
- **Visibility:** articles use `workflowStatus: 'PUBLISHED'` but **not** `publicArticleWhere()` (`lib/fixturePolicy.ts`), so fixture-slug exclusion is bypassed. Hubs, events and venues have no public/fixture filter.
- **Returned shape:** `ResolvedItem` (`id`, `title`, `slug`, `imageUrl`, `excerpt` sliced to 120 characters, `publishedAt`, `extra`). This is **not** the `Article` type the public components consume (`types/index.ts`), so the engine cannot feed the existing section components without a mapper.
- **Callers:** none at runtime (`git grep resolveContentSource` → only the definition file and `tests/batch33-unit.test.ts` source assertions). **No registry block declares any `source*` prop**, so admins can't configure it either.

### 8.2 What actually fetches data today

| Consumer | Mechanism | Manual pick | Auto | Mixed | Limit | Dedup | Published + fixture filter |
|---|---|---|---|---|---|---|---|
| Homepage [WT] | `homepageData.ts`: `pickedThenAuto`, `numProp`, `idListProp`, with `lib/content.ts` getters | ✅ `featuredIds` | ✅ | ✅ (pinned, then auto) | ✅ clamped | Hero articles excluded from latest; pinned excluded from their own fill | ✅ `publicArticleWhere` |
| Section landing | `getPublishedArticlesBySection` (all rows) | ❌ | ✅ newest | ❌ | ❌ | ❌ | ✅ |
| Article related | `getRelatedPublishedArticles(id, n)` | ❌ | ✅ | ❌ | ✅ | — | ✅ |
| Directories | directory services | ❌ | ✅ | ❌ | paginated | — | — |

**Configuration lifecycle (homepage, verified):**

1. **Editor:** `updateProp` writes the value; `featuredIds` is stored as a comma-separated string.
2. **Save:** `saveDraftAction` → `saveDraft`, which runs zod `UpdateDraftSchema`, `validatePageKey`, `validateSectionTypes` (type allowed, string ≤2000, no `<script`, `*Url` must be `/…` or `http(s)://…` [WT]), `validateBlockLimits`, `validateUniqueIds`. Stored in `draftSections`.
3. **Publish:** `publishLayout` copies draft → `publishedSections` and sets `publishedAt`/`publishedById`, then `revalidatePath('/', 'layout')`.
4. **Render:** `getPublishedSections('homepage')` returns registry defaults if the row is missing or empty, or on any error. `resolveHomepageSlots` then fetches per-slot data and `HomeView` renders it.

**Error handling:** `getPublishedSections` and `getDraftSections` catch all errors and silently return defaults. A DB failure therefore looks like "my changes disappeared" rather than an error, and nothing is logged.

**Caching:** ISR (`revalidate` is 60 for home and 300 for the layout and `/rodeo-events/`; `[section]` pages are static with layout-level revalidation). Every layout save **and** publish calls `revalidatePath('/', 'layout')`, so saving a *draft* also purges the whole public cache unnecessarily.

---

## 9. Database and Configuration Models

| Model | File / line | Purpose | Notes |
|---|---|---|---|
| `PageLayout` | `prisma/schema.prisma:1596` | `pageKey` (unique), `draftSections` and `publishedSections` Json (`SectionSlot[]`), `scheduledSections`/`scheduledAt` (unused), `publishedAt`, `publishedById`, `updatedById`, `version` (unused) | One row per page key. No history table. |
| `SiteConfig` | `:1666` | `key` ∈ `footer`, `appearance`. `draft`/`published` Json, `version` incremented on publish (`siteConfigService.ts:174`) but never checked. | zod `FooterConfigSchema`, `AppearanceConfigSchema` |
| `SectionConfig` | `:1553` | Section display overrides | `heroImage` and `visible` are unused |
| `NavigationItem` | `:789` | `location` ∈ `header`, `footer-sections`, `footer-academy`, `quick-access`; `sortOrder`, `visible`, `isSystem` | Flat, no `parentId`; no draft |
| `Announcement` | `:1613` | `type` (BREAKING/INFO), `text`, `linkUrl`, `articleId`, `priority`, `enabled`, `startsAt`/`endsAt` | Live on save |
| `GlobalBlock` | `:1637` | `type` (MESSAGE/CTA/FEATURED_STORY), `content`, media, CTA, `articleId`, `placements String[]`, schedule | `ALLOWED_PLACEMENTS` (`globalBlockService.ts:14`) |

**Slot JSON (`SectionSlot`, `sectionRegistry.ts:9`), sanitized example:**

```json
{ "id": "3f1c…", "sectionType": "latest-coverage", "visible": true, "order": 1,
  "props": { "kicker": "Latest", "title": "Latest NFR Coverage", "articleCount": 6,
             "featuredIds": "uuid-a,uuid-b", "ctaText": "", "ctaUrl": "" } }
```

**Limitations:**

- Props are untyped (`Record<string, unknown>`), and there is no per-block zod schema: only the generic string checks in `validateSectionTypes`.
- `featuredIds` is a CSV string, with no referential integrity. A deleted or unpublished article is silently dropped at render.
- `ensureSlotIds` generates a random ID at read time for slots that lack one, so IDs can change between reads until the layout is saved.

---

## 10. Rendering Pipeline

```
Admin editor ─saveDraftAction─▶ PageLayout.draftSections ─publishLayoutAction─▶ PageLayout.publishedSections
                                                                                   │
Public route ──getPublishedSections(pageKey)──────────────────────────────────────┘
   │
   ├─ homepage [WT]:   resolveHomepageSlots(slots)  → HomeView.renderCore / renderPremiumBlock   (slot order ✅, props ✅)
   ├─ section landing: getSlot(type) per fixed position → SectionLandingView JSX                  (slot order ❌, props 🟡)
   ├─ article:         getSlot('detail-related' | 'detail-cta' | 'detail-faq')                    (partial)
   ├─ directories:     slotProp('directory-hero' | 'directory-cta')                                (partial)
   └─ hub/edition/discipline/category: (no PageLayout read)                                        (❌)
```

**There is no shared block renderer.** Each view implements its own slot lookup (`getSlot`/`slotProp` are copied into 4 files: `SectionLandingView.tsx`, `ArticleView.tsx`, `competitors/page.tsx`, `venues/page.tsx`). The premium blocks are implemented only inside `HomeView.tsx`, which is why the `rich-text-block` and `cta-banner` blocks offered for landing pages cannot render there.

**Hard-coded vs configurable:** see §14.

---

## 11. Preview and Publish Lifecycle

| Area | Draft storage | Preview | Publish | Public read |
|---|---|---|---|---|
| Page layouts | `draftSections` | `/admin/website/preview?pageKey=…` → HTML wrapper with an iframe. [WT] calls `draftMode().enable()`. **Only `app/(public)/page.tsx` checks draft mode** (and re-checks `system.config` via `getCurrentUser`). | `publishLayout` → `revalidatePath('/', 'layout')` | `publishedSections` |
| Footer / Appearance | `SiteConfig.draft` | none: the public layout reads `published` only | `publishConfig` | `published` |
| Nav / Announcements / Global Blocks | none | none | immediate on save or toggle | live rows |

Verified problems:

- **Wrong preview targets.** `pageKeyToUrl` (`preview/route.ts:73`) maps every `template:*` key except `template:article` to `/`, and maps `template:article` to `/articles/` (no slug, so not a real article).
- **No device preview.** The preview is a full-width iframe with no mobile or tablet width.
- **No pre-publish validation** beyond what ran at save time. Publish copies the draft as-is.
- **Publish confirms but doesn't show a diff.** No "what changed" summary, and no rollback (the only option is "Reset draft to published").
- **Draft mode is session-wide [WT].** After previewing, a staff member browsing the public site keeps seeing the *draft* homepage until they use "Exit draft preview" or the cookie expires. The page shows a gold "DRAFT PREVIEW" bar, which mitigates this.

---

## 12. Navigation and Footer Integration

- **Header:** `getPublicNavigation()` (`navigationService.ts:38`) → `SiteHeader` `navItems`. Rows exist per location; when a location has none, `CANONICAL[loc]` is used. Flat links only, with no dropdowns, mega-menus or nested items. Edits are live after `revalidatePath('/', 'layout')`. ✅
- **Footer menus:** `footer-sections` and `footer-academy` rows → `SiteFooter`. `DIRECTORY_LINKS` (competitors, venues) are always appended to the academy column. The "Publication Policies" column is hard-coded from `config/legalPages.ts`.
- **Footer config [WT]:** if custom `columns` are configured they **replace** the two nav-driven columns, and Publication Policies always remains. The two configuration paths overlap (NavigationItem footer locations vs `SiteConfig.footer.columns`), and the admin UI does not explain which one wins.
- **Quick Access:** `NavigationItem(location='quick-access')` is edited in the Header & Nav tab but rendered by the homepage `quick-access` block. The admin has no hint of this.

---

## 13. Public vs Admin Functionality

| Capability the admin implies | Delivered publicly? |
|---|---|
| "Reorder sections" on all pages | Homepage only |
| "Add Rich Text / CTA" to a section landing page | No |
| "Edit templates" for hubs, editions, disciplines, categories | No |
| "Article count" on section landing grid | No |
| "Hero image" on section landing / directory / detail pages | No |
| "Preview draft" | Homepage only [WT] |
| Global Block placements "Top of sport pages / event / edition" | No |
| Newsletter signup block | Renders, but does not subscribe |
| Footer config | Yes [WT] |

---

## 14. Hardcoded vs CMS-Controlled Features

| Area | CMS-controlled | Hard-coded |
|---|---|---|
| Header | link labels, URLs, order, visibility | logo/brand, search button, layout |
| Homepage | section order, visibility, copy, counts, pinned articles, hero image [WT]; premium block content; intro banner; announcements; global blocks | `LatestCoverage` category tabs, `CompetitionSection` filter tabs, card designs, section background colours |
| Section landing | hero kicker/title/description, featured/grid CTA text, visibility of hero/featured/grid/pills; section name/tagline (SectionConfig) | order, grid size, discipline-guides block, pill values, "Department Feature" label, grid heading, `RodeoDirectory` |
| Article | related count, bottom CTA, `article-end` blocks [WT] | header, TOC, sidebar advisory box, related title |
| Directories | hero title/description, CTA | grid, columns, filters |
| Hubs / editions / disciplines / categories | entity data only | entire page layout |
| Footer | [WT] tagline, description, copyright, status, social, custom columns; nav menus | brand lockup, independence notice, policy column, directory links, "Editorial CMS →" link |

---

## 15. UX and Usability Problems

From the owner's point of view, verified against the code:

1. **"Which page am I editing?"** The page selector lists 13 technical keys (`template:rodeo-edition`, `directory:venues`…). Four of them do nothing, and nothing indicates which ones are live.
2. **"Where will this appear?"** Global Block placements, Quick Access (in the nav tab), and the Appearance intro banner (homepage only) each affect pages the admin can't see from the editor. There is no "used on" indicator.
3. **The same concept lives in two places.** The homepage hero is set both in *Appearance → Intro Banner* and in *Page Builder → Editorial Hero*. The section name and description are set in both *System Settings* and the *landing-hero* block.
4. **Three save models with no explanation.** Some tabs need Publish; others are live on save. The Overview cards don't say which.
5. **Controls that silently do nothing** (§7, 🖼️ rows). This is the main source of "I edited it many times and nothing happens".
6. **Content sourcing is not discoverable.** Only a "Pinned articles" picker exists [WT]. There is no visible "automatic: newest from <section>" description, and no filter by section, discipline or event even though the engine supports it.
7. **Properties are hidden in prop tabs.** For example, image alt text is under "seo", and empty tabs still show.
8. **"Showing defaults — save draft to persist"** appears for pages that have never been saved. Admins don't know whether the public site uses the defaults (it does).
9. **The preview is not representative** for any page except the homepage, and has no mobile view.
10. **Numeric limits are not shown.** `max` is enforced on render (`numProp` clamps), but a typed value of 20 is silently shown as 12.

---

## 16. Architectural Limitations

- **No shared block renderer or block contract.** A block's implementation lives inside one view, so it can't be reused across pages (requirement C).
- **Rendering is decoupled from the registry.** The registry advertises blocks and props with no check that a renderer consumes them. This is the structural cause of F2, F3 and F8.
- **Two data-fetch paths that don't match:** the unused Content Source Engine (`ResolvedItem`) and the `lib/content.ts` getters (`Article`).
- **Untyped props JSON.** There is no per-block schema for validation or defaults, and old layouts lack new props (handled only by "blank = fallback" [WT]).
- **Page families are hard-coded in `getPageFamily`**, and the preview URL mapping is hand-maintained.
- **Duplicate responsibilities:** SectionConfig vs `landing-hero`; Appearance intro banner vs `editorial-hero`; NavigationItem footer locations vs `SiteConfig.footer.columns`.
- **Global blocks use a separate placement system** (`ALLOWED_PLACEMENTS`) from page layouts, and 3 placements have no renderer.

---

## 17. Security and Reliability Findings

| Area | Finding | Verified at |
|---|---|---|
| AuthZ | Layout, site config, announcement and global block actions require `system.config` (`requireActor`); nav requires `navigation.manage`. Services re-check (`need()`). ✅ | `app/admin/*-actions.ts`, services |
| Preview | Draft content is shown only when draft mode is on **and** the user has `system.config` [WT]. Preview route requires a user with `system.config`. ✅ | `app/(public)/page.tsx`, `preview/route.ts` |
| Input validation | Generic string checks only (`<script`, length, `*Url` scheme). Props are rendered as React text (auto-escaped), so the XSS risk is low. Footer social links are rendered only if `https://` [WT]. | `pageLayoutService.ts:29`, `SiteFooter.tsx` |
| URL inputs | Editor uses `<input type="url">` for `url` props; browsers mark `/relative/` paths invalid, which is confusing but not blocking. | `AdminPageLayoutEditor.tsx` (`prop.type === 'url'`) |
| Concurrency | `saveDraft` and `publishLayout` are last-write-wins; `PageLayout.version` unused. Two editors silently overwrite each other. | `pageLayoutService.ts:122,146` |
| Silent failure | `getPublishedSections`/`getDraftSections` swallow errors and fall back to defaults without logging. | `pageLayoutService.ts:83,95` |
| Fixture leakage | `contentSourceEngine` does not apply `publicArticleWhere` (relevant only once it is wired up). | `contentSourceEngine.ts:82` |
| Cache | Draft saves purge the whole public cache (`rev()`); harmless but wasteful. Time-windowed announcements and blocks appear or expire with up to 5 minutes of delay (layout `revalidate = 300`). | `page-layout-actions.ts:9`, `app/(public)/layout.tsx` |
| Audit trail | `audit()` is written for layout draft save, publish, reset and restore. ✅ | `pageLayoutService.ts` |

---

## 18. Existing Test Coverage

| Suite | What it actually verifies |
|---|---|
| `tests/batch31-unit.test.ts` (33 tests, 23 source reads) | Registry shape and helpers (real calls); **many assertions are `read(file)` + `toContain(string)`** |
| `tests/batch32-unit.test.ts` (35 tests, 14 source reads) | Registry/editor helpers; source-string checks |
| `tests/batch33-unit.test.ts` (37 tests, 23 source reads) | Announcements, global blocks, site config, content engine, mostly by source-string presence |
| `e2e/page-builder.spec.ts`, `e2e/page-layout.spec.ts` | Playwright admin UI flows (❔ not executed in this audit) |
| DB integration (`batchA`, `batch28-cms`, …) | Services against the isolated test DB; none asserts that a saved layout prop appears in public HTML |

**Gap:** no test renders a public page from a layout and asserts on the output. A source-string test such as `toContain('sectionMap')` (`batch31-unit`, before the WT change) passed even though the feature was broken. During this session a manual end-to-end check was done instead: edit `publishedSections` in the dev DB, fetch `/`, observe the change, restore. It is not automated.

---

## 19. Feature Gap Matrix (vs owner requirements A–H)

| Req | Requirement | Current state | Gap |
|---|---|---|---|
| A | Complete homepage management | ✅ [WT] order, visibility, copy, counts, pins, hero image | Section-filter content sourcing; per-section style or layout variants; newsletter backend |
| B | Independent section landing management | 🟡 storage independent, rendering fixed | Slot-order rendering, honour props, render shared blocks, landing hero image |
| C | Reusable block library | ❌ blocks implemented per view | Shared `BlockRenderer` + per-block components |
| D | Manual / auto / mixed content fetching | 🟡 homepage pinned + auto [WT]; engine unused | Wire the engine (or the [WT] resolver) into a block "content source" panel with section, discipline and event filters |
| E | Nav and footer changes appear publicly | ✅ nav; ✅ [WT] footer | Explain which footer source wins; optional nav draft |
| F | Draft isolated from public | ✅ storage isolation; 🟡 preview homepage only | Draft-aware rendering on every page that has a layout |
| G | Desktop/mobile preview | ❌ | Width toggle in the preview wrapper |
| H | Respects permissions and editorial rules | ✅ RBAC; ✅ only published articles in pickers | Concurrency/version check; validation per block |

---

## 20. Recommended Architecture Improvements *(recommendations, not implemented)*

Overall: **incremental, keep the PageLayout model.** No new CMS and no new page builder.

1. **One block contract and a shared renderer.**
   - `components/blocks/registry.tsx` maps `sectionType` → `{ component, resolveData(props, ctx) }`.
   - A server-side `renderSlots(pageKey, slots, ctx)` used by **every** page that has a layout (home, 5 landings, article, directories, later hubs and editions).
   - Move the premium blocks out of `HomeView.tsx` into this registry so they work on every page that offers them.
2. **The registry is the truth for both editor and renderer.** Add a contract test: for every `SectionDef` offered on a page family, a renderer exists and consumes every `editableProps` key. This catches F2, F3 and F8 automatically.
3. **One content-source layer.**
   - Generalise the [WT] `homepageData.ts` (pinned → auto, clamped limits, cross-section dedup, `publicArticleWhere`) and fold in the engine's filters (section/category, discipline, event, edition, featured, upcoming).
   - Return `Article` (or map `ResolvedItem` → `Article`).
   - Expose a compact "Content" panel per block: *Source: Newest from [section ▾] · Pinned: [picker] · Show: [n]*.
4. **Make section landings slot-driven.**
   - Render `section:<key>` slots in order with the shared renderer.
   - Turn the hard-coded pieces (discipline guides, `RodeoDirectory`, stat pills) into registry blocks available only on the relevant section.
5. **Hide what doesn't render.** Remove the 4 dead `template:*` keys from `KNOWN_PAGE_KEYS` until a page consumes them, or wire them up with item 1.
6. **Unify duplicates.**
   - The hero is defined only by the Page Builder hero block; Appearance → Intro Banner becomes a hero *style* option.
   - Section name and description live in SectionConfig, and the landing-hero block reads them by default.
   - Footer: show "Nav menus are used unless custom columns are set" in the Footer tab.
7. **Preview everywhere.**
   - Every layout-driven page reads draft sections under `draftMode()` + `system.config`.
   - Fix `pageKeyToUrl` to point at a real sample entity per template.
   - Add a desktop / tablet / mobile width toggle to the preview wrapper.
8. **Reliability.**
   - Use `PageLayout.version` for optimistic concurrency (`expectedVersion` on save and publish).
   - Log in `getPublishedSections` when falling back.
   - Revalidate only on publish, not draft save.
   - Keep the last N published snapshots for rollback (a new table, which needs approval since it is a schema change).
9. **Tests.** Replace source-string assertions with render tests: build a layout fixture → call the page's data resolver + renderer → assert on output.

---

## 21. Implementation Roadmap *(recommendation; each phase needs owner approval)*

| Phase | Goal | Main work | Risk |
|---|---|---|---|
| 0 | Land the [WT] fixes | Review, branch, commit the current working-tree changes | Low |
| 1 | Nothing silently does nothing | Hide dead page keys and blocks; render landing `rich-text-block`/`cta-banner`; honour `landing-grid.articleCount`, `detail-related.title`, `detail-faq` visibility; contract test (item 2) | Low |
| 2 | Shared renderer | `components/blocks` registry + `renderSlots`; migrate homepage, then landings; slot order honoured everywhere | Medium (visual regressions; add render tests first) |
| 3 | Content panel | Unified source resolver with section, discipline and event filters; admin "Content" panel; pinned + auto + limit | Medium |
| 4 | Page-oriented admin | Left list "Pages" (Homepage, 5 sections, Articles, Directories), each showing its blocks + global blocks + "used on" badges; one status chip (Saved / Draft / Published); device preview | Medium (UI only) |
| 5 | Reliability | Optimistic concurrency, publish history and rollback (schema change), scoped revalidation | Medium |
| 6 | Optional | Nav dropdowns (`parentId`), nav/announcement drafts, hub/edition templates | Owner decision |

**Target admin flow (Phase 4 sketch):** *Website → Pages → "NFR Plan & Watch"* → canvas of that page's blocks in real order, with global blocks shown in their placement greyed out → click a block → **Content** (where items come from), **Text**, **Style** → status chip "Draft — not live" → *Preview (Desktop / Mobile)* → *Publish*. This answers the owner's seven questions (§11 of the brief) on one screen.

---

## 22. Exact Source File References

All paths are relative to `apps/web/`.

| Concern | File | Symbols |
|---|---|---|
| Homepage route | `app/(public)/page.tsx` | `HomePage`, `isStaffDraftPreview` [WT], `revalidate` |
| Homepage data [WT] | `lib/cms/homepageData.ts` | `resolveHomepageSlots` (L91), `pickedThenAuto` (L60), `numProp` (L45), `idListProp` |
| Homepage view | `views/HomeView.tsx` | `HomeView`, `renderCore` (L55), `renderPremiumBlock` (L104) |
| Section components | `components/sections/*.tsx`, `components/sections/sectionCopy.ts`, `components/SectionHeading.tsx` | `EditorialHero`, `LatestCoverage`, `QuickAccess`, `CompetitionSection`, `PlanAndWatchSection`, `EntertainmentSection`, `EventsShoppingSection`, `MoreRodeoSection`, `LearningSection`, `HomeArticleFeed`, `copyOr`, `copyFromProps` |
| Section landing | `app/(public)/[section]/page.tsx`, `app/(public)/rodeo-events/page.tsx`, `views/SectionLandingView.tsx` | `SectionPage`, `generateStaticParams`, `SectionLandingView`, `getSlot`, `slotProp` |
| Article | `views/ArticleView.tsx` | `ArticleView`, `relatedSlot`, `ctaSlot`, `faqVisible` (unused) |
| Directories | `app/(public)/competitors/page.tsx`, `app/(public)/venues/page.tsx` | `slotProp('directory-hero' / 'directory-cta')` |
| Public chrome | `app/(public)/layout.tsx`, `components/PublicChrome.tsx`, `components/SiteHeader.tsx`, `components/SiteFooter.tsx` | `PublicLayout`, `PublicChrome`, `SiteHeader` (`NAV_FALLBACK`), `SiteFooter` (`customColumns`, `DIRECTORY_LINKS`, `POLICY_LINKS`) |
| Content getters | `lib/content.ts` | `getHeroArticle`, `getSecondaryHeroStories`, `getLatestArticles`, `getPublishedArticlesBySection`, `getPublishedArticlesByIds` [WT], `getEvergreenArticles`, `getSectionMeta` (L268) |
| Section metadata | `config/routes.ts` | `PRIMARY_SECTIONS`, `ROUTES` |
| Registry | `lib/cms/sectionRegistry.ts` | `SectionSlot`, `PropDef`, `SectionDef`, `HOMEPAGE_SECTIONS`, `SECTION_LANDING_SECTIONS`, `DETAIL_TEMPLATE_SECTIONS`, `DIRECTORY_SECTIONS`, `KNOWN_PAGE_KEYS`, `getPageFamily`, `buildDefaultSlots`, `ensureSlotIds` |
| Layout service | `lib/cms/pageLayoutService.ts` | `validateSectionTypes` (L29), `getPublishedSections` (L83), `getDraftSections` (L95), `saveDraft` (L122), `publishLayout` (L146), `resetDraftToPublished`, `restoreDefaults` |
| Layout actions | `app/admin/page-layout-actions.ts` | `rev` (L9), `saveDraftAction`, `publishLayoutAction`, `resetDraftAction`, `restoreDefaultsAction`, `listFeaturedCandidatesAction`, `resolveArticleDetailsAction`, `getDraftPreviewSections` (unused by the UI) |
| Preview | `app/admin/(dashboard)/website/preview/route.ts` | `GET`, `pageKeyToUrl` (L73), `draftMode().enable()` [WT] |
| Content engine | `lib/cms/contentSourceEngine.ts` | `resolveContentSource` (L350), `resolveMultipleSources`, `parseContentSource` (L373), `DeduplicationContext`, `RESOLVERS` |
| Site config | `lib/cms/siteConfigService.ts`, `app/admin/site-config-actions.ts` | `FooterConfig`, `AppearanceConfig`, `getPublished`, `getDraft`, `publishConfig` (L162) |
| Section config | `lib/cms/sectionConfigService.ts`, `app/admin/section-config-actions.ts`, `views/admin/AdminSettingsPage.tsx` | `upsertSectionConfig` |
| Navigation | `lib/cms/navigationService.ts`, `lib/cms/navTypes.ts`, `lib/cms/navCanonical.ts` | `getPublicNavigation` (L38), `getQuickAccessLinks`, `NAV_LOCATIONS`, `CANONICAL` |
| Announcements | `lib/cms/announcementService.ts`, `components/public/AnnouncementBanner.tsx` | `getActiveAnnouncements` (L121) |
| Global blocks | `lib/cms/globalBlockService.ts`, `components/public/GlobalBlockRenderer.tsx` | `ALLOWED_PLACEMENTS` (L14), `getActiveBlocksForPlacement` (L165) |
| Appearance | `components/public/IntroBanner.tsx`, `views/admin/AdminAppearanceEditor.tsx` | `IntroBanner` |
| Admin shell | `app/admin/(dashboard)/website/page.tsx`, `views/admin/AdminWebsitePage.tsx` | `TABS` (L48), `OverviewCard` |
| Admin editors | `views/admin/AdminPageLayoutEditor.tsx`, `AdminWebsiteNavPage.tsx`, `AdminFooterEditor.tsx`, `AdminAnnouncementsEditor.tsx`, `AdminGlobalBlocksEditor.tsx`, `AdminAppearanceEditor.tsx`, `components/admin/AdminModal.tsx` | `saveDraft`, `publish`, `duplicateBlock`, `handleDrop`, prop editors by `prop.type` |
| Schema | `prisma/schema.prisma` | `NavigationItem` (L789), `SectionConfig` (L1553), `PageLayout` (L1596), `Announcement` (L1613), `GlobalBlock` (L1637), `SiteConfig` (L1666) |
| Migrations | `prisma/migrations/20261107140000_batch31_page_layout`, `20261107160000_batch33_site_experience` | — |
| Tests | `tests/batch31-unit.test.ts`, `batch32-unit.test.ts`, `batch33-unit.test.ts`, `e2e/page-builder.spec.ts`, `e2e/page-layout.spec.ts` | — |

---

*Not verified in this audit:* the Playwright e2e suites (not run); the visual/responsive behaviour of public pages (no browser session); the production database contents (no production access, by design).
