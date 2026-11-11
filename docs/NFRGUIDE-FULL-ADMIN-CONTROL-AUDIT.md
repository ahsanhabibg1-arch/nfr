# NFRGuide — Full Project & Admin-Controlled Website Capability Audit

**Audit type:** Read-only. No source code, database records, configuration, migrations or dependencies were modified. No commit was created.
**Audit date:** 2026-11-09
**Branch:** `office-sync-2026-11-08`
**HEAD:** `fd4fb1008e28cd99fa578a154d28f79318421d3c` (`fd4fb10`)
**Working tree:** clean (0 modified files at audit start and end)

### Evidence provenance convention

Every finding in this report is tagged with how it was established:

- **[SOURCE]** — established by reading the actual file at HEAD `fd4fb10`. Cited as `path:line`.
- **[RUNTIME]** — established by running the application locally and observing real HTTP responses / rendered HTML.
- **[HISTORICAL]** — a claim from a prior audit document or commit message. Re-verified in this audit; the verdict is stated explicitly. Never carried forward as fact on its own authority.
- **[UNVERIFIED]** — inspected insufficiently or not at all. Stated as unknown, never guessed.

Paths are relative to `apps/web/` unless prefixed with `docs/` or otherwise noted.

---

## 1. Executive Summary

**The administrator cannot currently control the entire public website.** The CMS has a genuinely strong, well-centralised foundation — but the gap between *"content and composition data is admin-editable"* and *"the admin controls what a visitor actually sees"* is larger than the project's own prior reporting indicated.

Three conclusions matter most.

**First: the Visual Website Builder is not visual.** The central canvas renders a text list of block names, not the page. The editor file never imports the block renderer, contains no iframe, and has no responsive viewport control; its own source comment reads `{/* ── Left: Canvas (block list) ── */}` (`views/admin/AdminPageLayoutEditor.tsx:660`) **[SOURCE]**. Block management (add / remove / reorder / duplicate / hide / drag-and-drop) is fully implemented and working. Visual page building is not implemented at all. These two capabilities were conflated in earlier reporting.

**Second: Builder reach is narrower than the Builder's own page list implies.** Of 15 page keys exposed in the admin, only **6** genuinely compose their page from slots (homepage plus five section landings). Seven `template:*` keys append slots as a tail section below fixed JSX, and the two `directory:*` keys render only a CTA block while their hero values are read out manually by each route **[SOURCE]**. Additionally, **10 editable properties are declared in the Builder but ignored by public rendering** — an administrator can edit them, save them, publish them, and nothing changes. That is the most trust-damaging class of defect found.

**Third: a previously-reported PASS was a false pass, and a live security hole exists.** The Task 4 `helpText` feature was reported complete; in fact `helpText` is rendered for only 3 of 9 property editor types, and the one property it was added for (`quick-access.kicker`) is of a type whose branch omits it — so the string sits in the registry and the database but never reaches the DOM **[SOURCE]**. Separately, the internal cache-revalidation endpoint falls back to a secret hardcoded in source (`app/api/internal/revalidate/route.ts:7`); `INTERNAL_REVALIDATE_SECRET` is absent from `.env` *and* from `.env.example`, the fallback is therefore active, and this repository is public on GitHub. The endpoint was confirmed exploitable with the published constant **[RUNTIME]**.

Also live and visitor-facing: **all seven legal/policy pages** (`/about/`, `/terms/`, `/privacy/`, `/editorial-policy/`, `/contact/`, `/corrections/`, `/affiliate-disclosure/`) currently serve `noindex, nofollow` **and** display an amber "Draft — pending owner and legal review" banner to real visitors **[RUNTIME]**, because their content comes from a 225-line hardcoded config whose entries are all flagged `pending-owner-review`.

**What is genuinely good and must not be rebuilt:** the SEO layer is properly centralised around a single metadata builder, a single robots policy model, a single canonical normaliser and a shared indexing policy that the sitemap re-derives from the same sources the pages render — articles and all eight landing-entity types have real, working, admin-editable SEO that reaches the HTML **[SOURCE]** **[RUNTIME]**. The PageLayout draft → preview → publish → revision → schedule chain is complete and correct; draft isolation is properly double-gated and anonymous visitors cannot reach draft content **[SOURCE]** **[RUNTIME]**. Competition data (schedule / results / standings) is admin-editable end-to-end, correcting an earlier characterisation of those pages as fixed. Block management, the 83-model data layer, and RBAC are solid.

**Verdict: the goal is achievable by upgrading the existing architecture. No module needs rebuilding.** The work is (a) two urgent hotfixes, (b) a property-integrity sweep, (c) replacing the canvas with a live render, and (d) extending slot composition outward from the six page keys that already work.

---

## 2. Git and Project Baseline

| Item | Value | Provenance |
|---|---|---|
| Branch | `office-sync-2026-11-08` | [RUNTIME] `git rev-parse --abbrev-ref HEAD` |
| HEAD commit | `fd4fb1008e28cd99fa578a154d28f79318421d3c` | [RUNTIME] `git log -1` |
| HEAD subject | `feat: CMS Block Management — Phases C-G + Tasks 1-4` | [RUNTIME] |
| HEAD author / date | `moynulhasan4044`, Sun Nov 8 17:33:52 2026 +0600 | [RUNTIME] |
| Working tree | Clean — `git status --porcelain` returned 0 lines | [RUNTIME] |
| Remote | `https://github.com/ahsanhabibg1-arch/nfr.git` (**public**) | [RUNTIME] `git remote -v` |

The commit `fd4fb10` referenced in the audit brief is confirmed as the actual current HEAD.

**Recent commit lineage** (relevant to this audit):

```
fd4fb10  feat: CMS Block Management — Phases C-G + Tasks 1-4
35eb467  feat: Phase B — Detail Template Renderer
c471b22  feat: Batch A — Shared Page Renderer (registry-driven block rendering)
ff09c37  Merge remote-tracking branch 'origin/fix/batch-s-seo-correctness'
7514f67  fix(site-builder): wire Page Builder settings to the public site + audit docs
27ebab3  fix(seo): Batch S — SEO correctness (S1–S7)
feb4711  feat: Batches 31-33 — Page Builder, Premium Blocks & Unified Site Experience
```

**Pre-existing audit documents** in `docs/` (treated as [HISTORICAL], re-verified where relevant, not trusted as fact):

- `docs/NFRGUIDE-SEO-ENGINE-COMPREHENSIVE-AUDIT.md`
- `docs/NFRGUIDE-SITE-BUILDER-COMPREHENSIVE-AUDIT.md`
- `docs/NFRGUIDE-WEBSITE-EXPERIENCE-ARCHITECTURE-BLUEPRINT.md`
- `docs/audits/`, `docs/batches/`

---

## 3. Current Architecture

### 3.1 Framework and runtime [SOURCE] `package.json`

| Dependency | Version |
|---|---|
| `next` | 16.4.3 (App Router, Turbopack in dev) |
| `react` | 19.2.0 |
| `typescript` | ^7.0.2 |
| `prisma` / `@prisma/client` | 6.19.3 |
| `tailwindcss` | ^4.3.3 |
| `vitest` | ^3.2.4 |
| `zod` | ^4.6.7 |

**Available verification scripts** [SOURCE] `package.json`:
`dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:routes` (`scripts/route-smoke.mts`), `test:cache` (`scripts/cache-invalidation.mts`), `test:migration` (`scripts/migration-replay.mts`), `test:e2e` (`playwright test`), plus the `db:*` Prisma family.

### 3.2 Application structure

- **Public site:** `app/(public)/` — 30 `page.tsx` files, one shared `layout.tsx`.
- **Admin:** `app/admin/(dashboard)/` — 25 `page.tsx` files; `app/admin/*-actions.ts` — 25 server-action modules.
- **Outside the public group:** `app/admin`, `app/api`, `app/go` only. `app/layout.tsx:29` renders bare `{children}` **[SOURCE]**, so **every public route inherits the shared chrome** — no page bypasses it.
- **Views:** `views/` (public) and `views/admin/` (admin) presentation components.
- **Blocks:** `components/blocks/` with a client registry at `components/blocks/registry.tsx`.
- **Services:** `lib/cms/` (41 files), `lib/seo/` (7 files), `lib/seo-intel/`, `lib/auth/`, `lib/media/`, `lib/monetization/`, `lib/search/`, `lib/analytics/`.

### 3.3 Data layer

**83 Prisma models** [SOURCE] `prisma/schema.prisma`. Those load-bearing for admin control of the website:

`PageLayout`, `PageLayoutRevision`, `SectionConfig`, `NavigationItem`, `SiteConfig`, `GlobalBlock`, `Announcement`, `InfoPage`, `EntitySeo`, `ArticleSeo`, `SeoConfig`, `SeoRule`, `SeoFinding`, `SeoAuditRun`, `EntityFaq`, `MediaAsset`, `Article`, `ArticleRevision`, `ArticleRedirect`, `RodeoHub`, `RodeoEvent`, `RodeoEventEdition`, `Competitor`, `Venue`, `Discipline`, `Category`, `Tag`, `Author`, `CompetitionSession`, `CompetitionResult`, `CompetitionStanding`, `SystemSetting`, `Role`, `Permission`, `RolePermission`.

### 3.4 Authentication, roles and permissions [SOURCE]

- `lib/auth/rbac.ts` — permission union (incl. `cms.access`, `system.config`, `seo.config`, `seo.audit.view`, `media.view`, `comment.view`, `reader.view`, `analytics.view`, `monetization.view`, `user.manage`) and role→permission maps. `super_admin` = `ADMIN_PERMS` + `system.config` (`:123`); distinct `author` (`:126`) and `seo_manager` (`:136`) role sets exist.
- `lib/auth/permissions.ts:20-39` — `CMS_MODULES`, the authoritative admin navigation: **18 modules**, each with a `view` permission. Default-deny (`visibleModuleIds`, `:43`).
- `lib/auth/currentUser.ts:57` — public-side CMS gate on `cms.access`.

**Admin route protection confirmed live:** anonymous requests to `/admin/website/`, `/admin/info-pages/` return `307 → /admin/login/`; `/admin/website/preview?pageKey=homepage` ultimately lands on `/admin/login/` **[RUNTIME]**.

**Nav-reachability note:** `app/admin/(dashboard)/landing-seo/page.tsx` exists but is **not** in `CMS_MODULES`. It is reachable only via a contextual button on the Rodeo Coverage page (`views/admin/AdminRodeoCoveragePage.tsx:76`, "Landing SEO & FAQ →") **[SOURCE]**. Functional, but poorly discoverable — the admin editor for all eight landing-entity SEO records has no primary nav entry.

### 3.5 Page Builder architecture [SOURCE]

- `lib/cms/sectionRegistry.ts` — 15 `KNOWN_PAGE_KEYS`, empty `DEAD_PAGE_KEYS`, `PAGE_KEY_LABELS`, and four section-definition arrays: `HOMEPAGE_SECTIONS` (15 blocks), `SECTION_LANDING_SECTIONS` (6), `DETAIL_TEMPLATE_SECTIONS` (5), `DIRECTORY_SECTIONS` (3).
- `lib/cms/pageLayoutService.ts` — `saveDraft`, `publishLayout`, `resetDraftToPublished`, `restoreDefaults`, `schedulePublish`, `cancelSchedule`, `getDueSchedules`, `executeScheduledPublish`, `listRevisions`, `getRevision`, `restoreRevision`; validation of section types, block limits, unique ids, page keys and prop sanitisation.
- `components/blocks/registry.tsx:132-160` — client block registry, 24 entries.
- Resolvers: `lib/cms/homepageData.ts`, `sectionLandingData.ts`, `detailTemplateData.ts`, `directoryData.ts`; shared helpers in `lib/cms/slotUtils.ts`.
- `lib/cms/previewGuard.ts:5-9` — `isStaffDraftPreview()`.

### 3.6 SEO architecture [SOURCE]

Genuinely centralised; a single emitter and a single policy:

- `lib/seo.tsx:53` — `buildMetadata()`, the **sole** Metadata emitter (title, description, canonical, robots, OG, Twitter).
- `lib/seo/robots.ts:17-72` — `RobotsPolicy` with independent index/follow; `combineRobots()` retains most-restrictive.
- `lib/seo/policy.ts:60-101` — `effectiveRobots` / `isIndexable` / `isInSitemap` as pure functions.
- `lib/cms/entitySeoService.ts:90` — `mergeSeoMeta()`, override→derived fallback; noindex additive-only (`:98-101`).
- `lib/seo/canonical.ts` — single same-site normaliser, shared by render, save-validation and sitemap.
- `lib/seo/sitemapEntries.ts:226` → `app/sitemap.ts:11`.
- `lib/seo-intel/{analyzers,rules,orchestrator,auditLock,types}.ts` — SEO Intelligence audit engine.

**There is no second SEO engine.** This layer should be extended, never replaced.

---

## 4. Public Route Inventory

30 public `page.tsx` routes plus `layout.tsx`, `app/sitemap.ts`, `app/robots.ts`, `app/go/[id]/route.ts`.

Legend for **Builder**: `full` = slots drive the visible layout · `tail` = slots appended below fixed JSX · `hero+cta` = only those slots consumed · `no` = not Builder-backed.

| Route | Renderer | Data source | Builder | Draft-aware | Provenance |
|---|---|---|---|---|---|
| `/` | `HomeView` → `PageRenderer` | `resolveHomepageSlots` + `getHeroArticle` | **full** (`homepage`), `views/HomeView.tsx:41` | yes (`page.tsx:26`) | [SOURCE] |
| `/[section]/` ×4 | `SectionLandingView` → `SectionLandingSlots` | `resolveSectionLandingSlots` | **full** (`section:*`) | yes (`:37`) | [SOURCE] |
| `/rodeo-events/` | `SectionLandingView` + `RodeoDirectory` | slots + `listPublicHubs` / `listPublicEvents` | **full** for section part; `RodeoDirectory` fixed JSX | yes (`:28`) | [SOURCE] |
| `/articles/[slug]/` | `ArticleView` | `getPublishedArticleBySlug` | **tail** (`template:article`) | yes (`:60`) | [SOURCE] |
| `/rodeo-events/[slug]/` | inline JSX | `rodeoContent` | **tail** (`:62`) | yes (`:45`) | [SOURCE] |
| `/rodeo-events/[slug]/[edition]/` | inline JSX | `rodeoContent` | **tail** (`:67`) | yes (`:39`) | [SOURCE] |
| `/disciplines/[slug]/` | `DisciplineGuideView` | `getRodeoDisciplineBySlug` | **tail** (`:77`) | yes (`:49`) | [SOURCE] |
| `/categories/[slug]/` | `CategoryArchiveView` | articles by category | **tail** (`:68`) | yes (`:44`) | [SOURCE] |
| `/competitors/[slug]/` | inline JSX | prisma `competitor` | **tail** (`:131`) | yes (`:45`) | [SOURCE] |
| `/venues/[slug]/` | inline JSX | prisma `venue` | **tail** (`:117`) | yes (`:44`) | [SOURCE] |
| `/competitors/` | inline JSX | prisma + `resolveDirectorySlots` | **hero+cta** | yes (`:24`) | [SOURCE] |
| `/venues/` | inline JSX | prisma + `resolveDirectorySlots` | **hero+cta** | yes (`:24`) | [SOURCE] |
| `…/[edition]/schedule/` | inline JSX | `getPublicSchedule` | no | **no** | [SOURCE] |
| `…/[edition]/results/` | inline JSX | `getPublicResults` | no | **no** | [SOURCE] |
| `…/[edition]/standings/` | inline JSX | `getPublicStandings` | no | **no** | [SOURCE] |
| `/search/` | inline JSX | client index from layout | no | **no** | [SOURCE] |
| `/info/[slug]/` | `LegalPageView` | `getPublishedInfoPage` ‖ `config/legalPages` | no | no | [SOURCE] |
| `/about/` `/terms/` `/privacy/` `/editorial-policy/` `/contact/` `/corrections/` `/affiliate-disclosure/` | `LegalPageView` (7-line stubs) | DB-first, **hardcoded config fallback** | no | no | [SOURCE] |
| `/login/` `/register/` `/forgot-password/` `/reset-password/` | `components/account/forms` | auth | no | no | [SOURCE] |
| `/account/` `/account/comments/` | inline JSX | `getCurrentUser` | no | no | [SOURCE] |
| `app/(public)/layout.tsx` | `PublicChrome` | `getPublicNavigation`, `getPublished<FooterConfig>`, `getActiveAnnouncements(2)`, `getActiveBlocksForPlacement('footer-top')` | n/a | no | [SOURCE] |
| `app/sitemap.ts` | — | `buildSitemapEntries` | n/a | n/a | [SOURCE] |
| `app/robots.ts` | — | `SITE_URL` + literal rules (`:8`) | no | n/a | [SOURCE] |
| `app/go/[id]/route.ts` | — | **[UNVERIFIED]** — not read | n/a | n/a | [UNVERIFIED] |

**Draft-awareness gap:** `schedule`, `results`, `standings` and `search` never call `isStaffDraftPreview()` — confirmed absent from their imports **[SOURCE]**.

---

## 5. Admin / CMS Module Inventory

| Module | Admin route | Server actions | Models | Public consumer | State |
|---|---|---|---|---|---|
| Articles | `(dashboard)/articles` | `article-actions.ts` | Article, ArticleSeo, ArticleRevision, ArticleBlock | `articles/[slug]/page.tsx` | **Functional** |
| Rodeo Coverage | `(dashboard)/rodeo-coverage` | `rodeo-actions.ts` → `rodeoService.ts` | RodeoHub, RodeoEvent, RodeoEventEdition, Venue, Discipline | `rodeo-events/**` | **Functional** (Discipline partial) |
| Competition | `(dashboard)/competition` | `competition-actions.ts:17-34` → `competitionService.ts:79-278` | CompetitionSession / Result / Standing | `schedule/page.tsx:17`, `results/page.tsx:18`, `standings/page.tsx:20` via `getPublicSchedule/Results/Standings` (`competitionService.ts:317-325`) | **Functional end-to-end** |
| Competitors | `(dashboard)/competitors` | `competitor-actions.ts` → `competitorService.ts:63-77` | Competitor | `lib/batch12Content.ts:94` → `competitors/[slug]/page.tsx:4` | **Functional** |
| Venues | `(dashboard)/venues` | `rodeo-actions.ts` → `rodeoService.ts:180-192` | Venue | `lib/batch12Content.ts:34` → `venues/[slug]/page.tsx:4` | **Functional** |
| Media Library | `(dashboard)/media` | `media-actions.ts` → `mediaService.ts` | MediaAsset + join tables | Indirect — URLs served by `app/api/media/[...key]/route.ts` | **Functional** |
| Page Builder | `(dashboard)/website` (tab `layout`) | `page-layout-actions.ts` → `pageLayoutService.ts` | PageLayout, PageLayoutRevision | 4 resolvers | **Partial** — see §6 |
| Navigation | `website` (tab `nav`) | `navigation-actions.ts` → `navigationService.ts:38-46` | NavigationItem | `layout.tsx:15` → `SiteHeader` / `SiteFooter` | **Functional** (footer locations overridden — §7.3) |
| Footer | `website` (tab `footer`) | `site-config-actions.ts` → `siteConfigService.ts` | `SiteConfig['footer']` | `layout.tsx:16` → `SiteFooter.tsx:62` | **Functional** (silently wins over nav) |
| Announcements | `website` (tab `announcements`) | `announcement-actions.ts` → `announcementService.ts:121` | Announcement | `layout.tsx:17` | **Functional** |
| Global Blocks | `website` (tab `global-blocks`) | `global-block-actions.ts` → `globalBlockService.ts:165` | GlobalBlock | `layout.tsx:18`, `page.tsx:32-33`, `ArticleView.tsx:19` | **Partial** — 3 of 7 placements dead |
| Appearance | `website` (tab `appearance`) | `site-config-actions.ts` | `SiteConfig['appearance']` | `app/(public)/page.tsx:34` → `IntroBanner` | **Partial** — misnamed, homepage-only |
| Info & Legal Pages | `(dashboard)/info-pages` | `info-page-actions.ts` → `infoPageService.ts` | InfoPage | `info/[slug]/page.tsx:3`, `LegalPageView.tsx:11` | **Partial** — lifecycle defect, §10 |
| SEO Intelligence | `(dashboard)/seo` | `seo-actions.ts` → `seoService.ts` | SeoRule, SeoAuditRun, SeoFinding, SeoConfig | Audit surface (not page output) | **Functional** |
| Landing SEO | `(dashboard)/landing-seo` | `landing-seo-actions.ts` → `landingAdminService.ts:37-80` | EntitySeo, EntityFaq | `EntityIntro` via `seo?.intro` (e.g. `categories/[slug]/page.tsx:64`), `faqService` | **Functional** (not in nav) |
| System Settings | `(dashboard)/settings` | `settings-actions.ts`, `section-config-actions.ts:13` | SystemSetting, SectionConfig | `getSectionMeta` (`lib/content.ts:268`) | **Partial** — Site Identity dead; 2 SectionConfig fields dead |
| Organization & Taxonomy | `(dashboard)/editorial-organization` | `taxonomy-actions.ts:10-32` → `taxonomyService.ts` | Category, Tag, Author | Author → bylines; Category via `getCategoryBySlug` | **Partial** — `Category.description` never rendered |
| Sources & References | `(dashboard)/sources` | `source-actions.ts` → `sourceService.ts` | Source, ArticleSource | `ArticleView.tsx:84-86` `SourceList` | **Functional** |
| Team & Permissions | `(dashboard)/team` | `team-actions.ts`, `invite-actions.ts` | User, Role, StaffInvitation | n/a by design | **Functional** |
| Comment Moderation | `(dashboard)/comments` | `comment-actions.ts` → `commentService.ts` | ArticleComment | `articles/[slug]/page.tsx:12` | **Functional** |
| Reader Accounts | `(dashboard)/readers` | `reader-actions.ts` → `readerAdminService.ts` | User | `app/(public)/account/**` | **Functional** |
| Monetization & Ads | `(dashboard)/monetization` | `monetization-actions.ts` → `monetizationService.ts` | AdPlacement, Disclosure, Affiliate* | `AdPlacementSlot` (articles only), `DisclosureBanner` (`ArticleView.tsx:72`) | **Partial** — 4 of 5 ad scopes dead |
| Analytics & Search | `(dashboard)/analytics` | `analytics-actions.ts` | Analytics* | Collection via `app/api/analytics/event/route.ts` | **Functional** (not page output) |
| Account | `(dashboard)/account` | `account-actions.ts` | User | n/a | **Functional** |

All rows [SOURCE].

---

## 6. Visual Builder Deep Audit

This is the decisive section for the product goal.

### 6.A Builder interface [SOURCE] `views/admin/AdminPageLayoutEditor.tsx`

| Capability | Status | Evidence |
|---|---|---|
| Canvas shows the **rendered page** | **FAIL** | Central panel is `<div className="divide-y divide-stone-100">` of text rows (`:716-765`); each row renders only the block label (`:744`) and description (`:748`) plus an index, a Visible/Hidden pill (`:750`) and up/down/eye buttons. Source comment: `{/* ── Left: Canvas (block list) ── */}` (`:660`) |
| Block renderer used in admin | **FAIL** | `blockRegistry` is **never imported** by the editor; no iframe and no `PageRenderer` usage anywhere in the file |
| Block tree / section navigator | **PASS** | The list is a flat ordered navigator |
| Click-to-select | **PARTIAL** | Works (`:732`) and maps correctly to slot id → `selectedDef` (`:141-142`) — but on a **list row**, not a visual section |
| Properties panel shows real saved values | **PASS** | Read from `slot.props[prop.key]` (`:429`) |
| Editing a property updates the canvas | **FAIL** | No visual canvas exists to update |
| Responsive previews (desktop / tablet / mobile) | **FAIL** | No viewport switcher; grid is fixed `lg:grid-cols-[1fr_300px]` (`:658`). Note the layout is **two panels**, despite a "three-panel builder" comment at `:657` |
| Add / remove / reorder / duplicate / hide | **PASS** | §6.C |
| Preview before publishing | **PARTIAL** | Exists, but as a separate browser tab — §6.D |

**Conclusion: the screenshot observation was structurally correct, not a rendering glitch.** The Builder is a competent *block manager*; it is not a visual website builder.

### 6.B Properties panel [SOURCE] `renderPropField` (`:426-609`)

Nine editor types implemented: `number` (`:432`), `boolean` (`:444`), `select` (`:454`), `textarea`/`richtext` (`:468`), `featured` (`:479` — full search / recent / reorder picker), `image` (`:563` — MediaPicker + preview), `color` (`:590`), and a `text`/`url` fallback (`:600`).

Two defects:

1. **`richtext` falls through to a plain `textarea`** (`:468`) — no rich editing despite the declared type.
2. **`helpText` is rendered for only 3 of 9 types** — `number` (`:439`), `featured` (`:499`), `image` (`:585`). It is **absent** from the `text` fallback (`:600-608`), `textarea` (`:468`), `select` (`:454`), `boolean`, and `color`.

**Task 4 was a false pass.** `quick-access.kicker` declares `helpText` (`lib/cms/sectionRegistry.ts:108`) but is of type `text`, whose branch omits it — the string exists in the registry and the database and **never reaches the DOM**. The earlier report's claim rested on a `grep "helpText"` against the editor file, which matches the three unrelated branches. The screenshot was right; the prior report was wrong.

### 6.C Block operations [SOURCE] — all implemented

`addBlock` (`:202`, enforces `maxInstances`), `duplicateBlock` (`:220`, gated on `def.duplicatable`), `removeBlock` (`:240`, blocks `required`), `toggleVisible` (`:251`, blocks `required`), `moveBlock` (`:259`), full HTML5 drag-and-drop (`:274-303`). All reorder paths renormalise `order`. Save / publish / schedule / reset / restore / history wired at `:315-414`. **This subsystem is sound and should be preserved.**

### 6.D Preview mechanism [SOURCE]

`<a href="/admin/website/preview?pageKey=…" target="_blank">` (`:836-839`) → `app/admin/(dashboard)/website/preview/route.ts` enables `draftMode()` (`:38`) and returns a hand-built HTML document embedding `<iframe src="${targetUrl}?_preview=draft…" sandbox="allow-same-origin allow-scripts">` (`:64`) at fixed `height: calc(100vh - 36px)` (`:53`).

So the infrastructure to render a real page inside an iframe **already exists and works**. It is simply not mounted inside the Builder, and has no viewport switching. This is the single most important reuse opportunity in the project.

### 6.E Declared-but-ignored properties — the critical finding [SOURCE]

Properties an administrator can edit, save and publish with **no effect on public output**:

| Block | Declared prop | Consumed? | Evidence |
|---|---|---|---|
| `detail-hero` | `heroImageUrl`, `showImage` | **NO** | Declared `sectionRegistry.ts:442-443`. Type absent from `blockRegistry` (`registry.tsx:132-160`); zero references repo-wide outside the registry |
| `detail-body` | (none) | **NO** | `sectionRegistry.ts:455` — dead marker, no renderer |
| `detail-faq` | `title` | **NO** | `sectionRegistry.ts:479` — dead marker, no renderer |
| `detail-related` | `title` | **NO** | Declared `:466`; resolver passes only `relatedArticles` (`detailTemplateData.ts:36`, `:62`); `DetailRelatedBlock` omits title (`DetailBlocks.tsx:19`) while `RelatedArticles` hardcodes `'Related Championship Coverage'` (`RelatedArticles.tsx:15`) |
| `landing-hero` | `heroImageUrl` | **NO** | Declared `:343`; `LandingHeroBlock` never reads it (`LandingBlocks.tsx:25-46`) and `SectionLandingHeroProps` has **no image field at all** (`SectionLandingHero.tsx:4-12`) — structurally unconsumable |
| `landing-grid` | `articleCount` | **NO** | Declared `:371`; resolver passes **all** `secondaryStories` unsliced (`sectionLandingData.ts:72`); `LandingGridBlock` renders the full array with hardcoded `columns={3}` (`LandingBlocks.tsx:138`) |
| `directory-hero` | `heroImageUrl` | **NO** | Declared `:510`; resolved into data (`directoryData.ts:37-38`) but **never read** by either consumer (`competitors/page.tsx:32-41`, `venues/page.tsx:32-41`) — resolved-then-dropped |
| `directory-grid` | `columns` | **NO** | Declared `:525`; type absent from `blockRegistry`; no `columns` reference in any resolver or directory page |

**Properties confirmed working** (preserve these): `editorial-hero` — all six props (`homepageData.ts:84`, `:86`; `registry.tsx:43-46`); `latest-coverage`, `plan-and-watch`, `entertainment`, `events-shopping`, `learning` — copy props via `copyFromProps` (`sectionCopy.ts:19-22`) and `articleCount` (`homepageData.ts:98`); `quick-access`, `competition`, `more-rodeo` copy props (`registry.tsx:66-98`, `:115-125`); `rich-text-block`, `image-text-block`, `stats-banner`, `cta-banner`, `faq-block`, `newsletter-signup` — fully consumed (`PremiumBlocks.tsx:5-116`); `landing-featured` — `featuredIds`, `ctaText` (`sectionLandingData.ts:35,39`; `LandingBlocks.tsx:54`); `detail-related.articleCount` (`detailTemplateData.ts:34`, `:59`).

**Inverse — visible output not controlled by any declared prop:** `LandingGridBlock` heading `"More {sectionName} Stories & Dispatches"` and `columns={3}` (`LandingBlocks.tsx:129`, `:138`); `CompetitionDisciplinesBlock` strings `"Championship Disciplines"` / `"NFR Discipline Guides"` (`:152-157`); `LandingFeaturedBlock` label `"Department Feature"` (`:73`); `LandingEmptyState` copy (`:107-111`); directory hero fallbacks (`competitors/page.tsx:32-33`); `RelatedArticles` heading.

**Non-functional block:** `NewsletterSignup` is a shell — `readOnly` input and a button with no handler (`PremiumBlocks.tsx:110-111`). It renders publicly and collects nothing.

### 6.F Builder coverage — 6 of 15 page keys genuinely compose [SOURCE]

| Mode | Count | Keys | Evidence |
|---|---|---|---|
| **Full slot composition** | **6** | `homepage`, 5× `section:*` | `HomeView.tsx:41`; `SectionLandingSlots.tsx:13,15` (hero + content, wrapped in a fixed container div at `:14`) |
| **Tail-append only** | **7** | all `template:*` | `ArticleAppendageSlots.tsx:7` renders slots after fixed JSX; resolver emits **only** `detail-related` and `detail-cta` (`detailTemplateData.ts:33-41`, `:56-67`) — the other three declared detail blocks are inert |
| **Tail-append + manual hero** | **2** | `directory:competitors`, `directory:venues` | `DirectorySlots.tsx:6` filters to `directory-cta` **only**; hero title/description read manually per route (`competitors/page.tsx:32-33`); `directory-grid` never rendered as a block |

**9 of 15 page keys are listed in the Builder but do not compose their page from it.** Listing a page in the Builder is not control of that page.

---

## 7. Public Content Ownership Audit

### 7.1 Admin modules whose output nothing renders [SOURCE]

| # | Dead surface | Evidence |
|---|---|---|
| 1 | **Site Identity** (`siteName`, `tagline`) | `settingsService.ts:102 updateSiteIdentity`, schema `:5-18`. Grep for `site_identity|SITE_IDENTITY_KEY|getSystemSettings|SiteIdentity` outside `app/admin`, `views/admin`, `settingsService` returns **zero hits**. Admin edits the site name; nothing public reads it |
| 2 | **`SectionConfig.heroImage`, `SectionConfig.visible`** | Accepted by `sectionConfigService.ts:18-20`, surfaced in `app/admin/(dashboard)/settings/page.tsx:31-32`. `getSectionMeta` (`lib/content.ts:271-278`) merges only `displayName`, `tagline`, `description`. Write-only |
| 3 | **Global block placements `rodeo-hub-top`, `event-detail`, `edition-detail`** | In `ALLOWED_PLACEMENTS` (`globalBlockService.ts:17-19`), offered in `AdminGlobalBlocksEditor.tsx:10`, accepted by `validatePlacements:68-73`. `getActiveBlocksForPlacement` is only ever called with `footer-top`, `homepage-top`, `homepage-bottom`, `article-end` — 3 of 7 dead |
| 4 | **AdPlacement `pageScope` = `home`/`category`/`rodeo_event`/`global`** | Enum `monetizationService.ts:347`. `AdPlacementSlot` mounted exactly once, `pageScope="article"` (`articles/[slug]/page.tsx:62`) — 4 of 5 scopes dead |
| 5 | **`Category.description`** | Written via `taxonomy-actions.ts:14` → `taxonomyService.ts:35`; returned by `getCategoryBySlug` (`lib/content.ts:248-251`) but `categories/[slug]/page.tsx` uses only `catRow.id` (`:27`, `:46`); visible description comes from hardcoded `PRIMARY_SECTIONS` |
| 6 | **`ArticleSeo.structuredDataType`** | `schema.prisma:136`, default `"Article"`. Only other repo-wide occurrence is the type decl `types/index.ts:81`. `articleJsonLd` derives `@type` from `isNewsArticleType(article.articleType)` (`lib/seo.tsx:108`), ignoring the column |
| 7 | **Media `altText`** | `schema.prisma:222,325`. `buildMetadata` emits `images: [{ url: ogImage }]` (`lib/seo.tsx:82`) and `twitter.images: [ogImage]` (`:90`) — no `alt` key anywhere in `lib/seo.tsx` or `lib/seo/` |

### 7.2 Public content with no admin owner [SOURCE]

| # | Content | Evidence |
|---|---|---|
| 1 | **Discipline deep-guide JSON** | Rendered at `DisciplineGuideView.tsx:52` (`competitionFormat`) and `:77` (`scoringBreakdown`). Explicitly excluded: "slug/name/deep guide JSON are intentionally NOT editable here" (`rodeoService.ts:203-204`) |
| 2 | **`Discipline.image`** | Rendered at `disciplines/[slug]/page.tsx:41`; absent from `DisciplineInput` (`rodeoService.ts:205-210`) |
| 3 | **Discipline create / delete** | Only `updateDiscipline` exists (`rodeoService.ts:212`). No create or delete path anywhere — the 7 disciplines are fixed |
| 4 | **Category-page visible copy** | `getSectionMetaByCategorySlug` (`lib/content.ts:285-290`) reads `PRIMARY_SECTIONS` only and, unlike `getSectionMeta`, applies **no** `SectionConfig` override |
| 5 | **Footer hardcoded fallbacks** | `SECTIONS_FALLBACK`, `ACADEMY_FALLBACK`, `DIRECTORY_LINKS` (`SiteFooter.tsx:21,24`); `DIRECTORY_LINKS` is **always** appended (`:65`) regardless of admin nav |
| 6 | **Footer legal affiliation disclaimer** | Full PRCA / WPRA / NFR / Las Vegas Events disclaimer paragraph hardcoded at `SiteFooter.tsx:119`. Legal text with no admin owner |
| 7 | **Logo / wordmark** | `NFR<span>Guide</span>` literal JSX, `SiteHeader.tsx:83-85`. No upload, no text field |

### 7.3 Duplicate sources of truth [SOURCE]

1. **Footer columns — two owners, silent precedence.** `NavigationItem` locations `footer-sections` / `footer-academy` (`navTypes.ts:11`) reach `SiteFooter` as `sections`/`academy`; `SiteConfig.footer.columns` reaches it as `config`. `SiteFooter.tsx:67-74` — the CMS footer columns **replace** the two menu-driven columns when configured. An admin editing footer links in Header & Nav sees **no public change** once Website→Footer columns exist. No warning in either module. This is the most likely source of "I changed it and nothing happened" confusion.
2. **Section identity vs section search metadata.** `SectionConfig` (Settings) owns name/tagline/description; `EntitySeo(SECTION)` (Landing SEO) owns SEO title/description/canonical. The split is deliberate and documented (`lib/seo/sectionMeta.ts:4-11`) but spans two admin modules with overlapping-looking fields.
3. **Announcements vs Global Blocks.** Two models and two editors both producing site-wide promotional surfaces, both loaded in `layout.tsx:17-18`. No code conflict; ownership is ambiguous to an operator.

### 7.4 Section identity is code-defined [SOURCE]

`config/routes.ts:75-116` defines the primary section set. `name` / `tagline` / `description` are `SectionConfig`-overridable (`lib/content.ts:273-278`), but `id`, `path` and `categoryKey` are code-only. **An administrator cannot add, remove or re-slug a primary section.**

---

## 8. Page-Family Control Matrix

**Composition** = can the admin control which sections appear, their order and visibility? · **Presentation** = do the editable properties actually change output? · **Content** = is the underlying content admin-editable? · **SEO** = is SEO admin-editable *and* rendered?

| Page family | Composition | Presentation | Content | SEO | Preview | Overall |
|---|---|---|---|---|---|---|
| Homepage | **PASS** | PARTIAL (all 15 blocks compose; `NewsletterSignup` inert) | PASS | **HARDCODED** | PASS | **PARTIAL** |
| Section landings ×5 | **PASS** | PARTIAL (`landing-hero.heroImageUrl`, `landing-grid.articleCount` ignored) | PASS | PASS | PASS | **PARTIAL** |
| Articles | Tail only | PARTIAL (`detail-related.title` ignored) | PASS | PASS | PASS | **PARTIAL** |
| Rodeo hub / event | Tail only | PARTIAL | PASS | PASS | PASS | **PARTIAL** |
| Rodeo edition | Tail only | PARTIAL | PASS | PASS | PASS | **PARTIAL** |
| Disciplines | Tail only | PARTIAL | **PARTIAL** (deep-guide JSON + image unowned; no create/delete) | PASS | PASS | **PARTIAL** |
| Categories | Tail only | PARTIAL | PARTIAL (`description` dead; copy from code) | PASS | PASS | **PARTIAL** |
| Competitors (detail) | Tail only | PARTIAL | PASS | PASS (JSON-LD `url` relative) | PASS | **PARTIAL** |
| Venues (detail) | Tail only | PARTIAL | PASS | PARTIAL (no derived image) | PASS | **PARTIAL** |
| Directories ×2 | **FAIL** (CTA only; hero manual) | **FAIL** (`heroImageUrl`, `columns` ignored) | PASS | **HARDCODED** | PASS | **FAIL** |
| Schedule / Results / Standings | **FAIL** (no Builder) | **FAIL** | **PASS** (admin-editable end-to-end) | **HARDCODED** | **FAIL** (not draft-aware) | **PARTIAL** |
| Info / legal pages | **FAIL** | **FAIL** | PARTIAL (lifecycle defect §10) | PARTIAL (no canonical/ogImage/robots) | **FAIL** (no preview) | **FAIL** |
| Search | N/A | N/A | **FAIL** (headings hardcoded) | N/A (intentional `index:false`) | **FAIL** | **N/A / FAIL** |
| Auth ×4 / Account ×2 | N/A | N/A | N/A | N/A (`index:false`) | N/A | **N/A** |

---

## 9. SEO Integration Audit

### 9.A Ownership [SOURCE]

`LandingEntityType` (`prisma/schema.prisma:1540-1549`) has 8 values, **all 8** editable via Landing SEO (`lib/cms/landingEntities.ts:17`), all 5 `EntitySeo` fields exposed (`views/admin/AdminLandingSeoPage.tsx:109-115`). Articles own SEO via `ArticleSeo` + `views/admin/ArticleSeoPanel.tsx`.

**Families with NO admin-editable SEO:**

| Family | Status | Evidence |
|---|---|---|
| **Homepage** | **HARDCODED** | `app/(public)/page.tsx:14-23` — literal title/description, no `getEntitySeo` call. **No `HOMEPAGE` enum member exists** |
| **Directories** | **HARDCODED** | `competitors/page.tsx:18`, `venues/page.tsx:18` — literal strings; only `robots` dynamic via `directoryListingRobots(filtered)` |
| **Schedule / Results / Standings** | **HARDCODED** | `…/schedule/page.tsx:18-23` — literal title/desc; `noindex: rows.length === 0` |
| **Search** | **N/A** | `search/page.tsx:19-23` static, `index:false, follow:true` — intentional |

### 9.B Per-field rendering matrix [SOURCE] + [RUNTIME]

| Family | Title | Desc | Canonical | Robots | OG | Twitter | Social img | JSON-LD | Img ALT |
|---|---|---|---|---|---|---|---|---|---|
| Homepage | HARDCODED | HARDCODED | derived | derived | PASS | PASS | hero only | **FAIL** | FAIL |
| Section landings | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| Articles | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| Disciplines | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| Categories | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| Rodeo hub / event | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| Rodeo edition | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | FAIL |
| Competitor | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PARTIAL¹ | FAIL |
| Venue | PASS | PASS | PASS | PASS | PASS | PASS | PARTIAL² | PARTIAL¹ | FAIL |
| Directories | HARDCODED | HARDCODED | derived | PASS | PASS | PASS | default | PASS | FAIL |
| Coverage pages | HARDCODED | HARDCODED | derived | PASS | PASS | PASS | default | PASS | FAIL |
| Info pages | PASS | PASS | **FAIL**³ | PARTIAL⁴ | PASS | PASS | **FAIL**³ | PASS | FAIL |
| Search | N/A | N/A | N/A | PASS | N/A | N/A | N/A | FAIL | N/A |

Override consumption verified at `entitySeoService.ts:93-96,102` and `articleMeta.ts:59-68`.

¹ `competitorJsonLd` / `venueJsonLd` receive **relative** URLs — `competitors/[slug]/page.tsx:58` passes `ROUTES.COMPETITOR(c.slug)`, consumed raw at `lib/seo.tsx:217` (`url: input.url`); venue likewise (`venues/[slug]/page.tsx:57` → `lib/seo.tsx:192`). Contrast `rodeo-events/[slug]/[edition]/page.tsx:47-48`, which correctly prefixes `SITE_URL`. Schema.org `url` must be absolute.
² Venue derived meta omits `image` (`venues/[slug]/page.tsx:32-37`) — no hero fallback.
³ `InfoPage` (`schema.prisma:1568-1583`) has **no** canonical / ogImage / robots columns; `LegalPageView.tsx:13-18` emits none.
⁴ Info robots is derived-only (`LegalPageView.tsx:17`); no editorial control.

**Runtime confirmation [RUNTIME]** — live `<head>` inspection:

- `/` → title, description, `robots: index, follow`, canonical, full OG + Twitter set. **0 `application/ld+json` blocks.**
- `/competition/`, `/competitors/`, `/venues/` → full metadata set + **2** JSON-LD blocks each.
- `/articles/inside-the-chutes-nfr-roughstock-intensity/` → title, `robots: index, follow`, absolute canonical, `og:type=article`, and a rich graph: `Article`, `Person`, `Organization`, `BreadcrumbList`, 3× `ListItem`.
- `/about/`, `/terms/` → **`robots: noindex, nofollow`** plus visitor-visible "Draft — pending owner" text.
- `og:image` is the same `hero_bull_riding_*` asset on `/`, `/competition/`, `/competitors/`, `/venues/` — the global default, with no per-page admin override on the hardcoded families.

### 9.C Structured data [SOURCE]

Generated in `lib/seo.tsx`, emitted via `JsonLd` (`:283`), XSS-escaped by `serializeJsonLd` (`:273`). Types: `Article`/`NewsArticle` (`:105`), discipline `Article` (`:129`), `Event` (`:150`, null when dates unverified), `Place` (`:187`), `Person` (`:213`), `BreadcrumbList` (`:225`), `FAQPage` (`:246`, null when empty).

**Homepage and `/search/` emit no JSON-LD**, and there is **no sitewide `Organization` / `WebSite` entity** anywhere — confirmed [RUNTIME].

### 9.D Sitemap, robots and indexing consistency

`app/robots.ts:8` — `allow: '/'`, `disallow: '/admin/'`, sitemap + host from `SITE_URL`. Rules are literal; **not admin-editable** [SOURCE]. Confirmed live [RUNTIME]:

```
User-Agent: *
Allow: /
Disallow: /admin/
Host: http://localhost:3000
Sitemap: http://localhost:3000/sitemap.xml
```

Policy sharing is genuine: `sitemapExclusionReason` (`policy.ts:89-97`) rejects unpublished, content-noindex, stored-robots-noindex, editor-noindex, canonical-away and type-excluded entries. The sitemap re-derives robots from the same `EntitySeo`/`ArticleSeo` sources the pages render (`sitemapEntries.ts:110-113,156-157`), with eligibility predicates commented as mirroring the page rule (`:172`, `:183`) **[SOURCE]**.

**Live sitemap composition — 39 URLs [RUNTIME]:** 11 `/articles`, 9 `/rodeo-events`, 7 `/disciplines`, 5 `/categories`, 4 section landings, 1 `/competitors`, 1 `/venues`, 1 `/`.

Two coverage gaps confirmed [RUNTIME]:

1. **Zero `/info/…` or legacy legal URLs.** Root cause [SOURCE]: `sitemapEntries.ts:213` iterates the static `LEGAL_PAGES` config; the published-InfoPage query (`:106`) serves only as an eligibility/lastModified lookup keyed by those slugs (`:212,216`). An admin-created InfoPage whose slug is not in `LEGAL_PAGES` renders at `/info/<slug>/` and **is indexable** (`LegalPageView.tsx:17` → `noindex: !db && …` is false when `db` exists) yet never appears in the sitemap. The whole `/info/[slug]/` family has no sitemap representation.
2. **Zero competitor/venue *detail* URLs** — only the two directory listings appear. No competitor or venue detail records were present in the local dataset, so this cannot be distinguished at runtime from an empty-data condition; **[UNVERIFIED]** whether `sitemapEntries.ts` includes those families by design.

### 9.E Redirects [SOURCE]

**No admin redirect UI.** `ArticleRedirect` (`schema.prisma:574-581`) is written automatically on slug change / unpublish inside `articleService.ts:433-444` and consumed at `lib/content.ts:147` → `articles/[slug]/page.tsx:43`. Article-scoped only; no arbitrary path redirects and no management surface. `seo-intel/orchestrator.ts:73` reads them for auditing.

### 9.F Admin SEO usability [SOURCE]

- **Search-snippet preview: articles only** — `components/admin/editor/SearchAppearancePreview.tsx`, used by `views/admin/AdminArticleEditorShell.tsx`. Landing SEO has plain inputs with no preview.
- **Social-card preview: absent repo-wide.**
- **Validation / findings: present and real** — `lib/seo-intel/{analyzers,rules,orchestrator,auditLock,types}.ts`, surfaced by `app/admin/(dashboard)/seo/page.tsx` via `getSeoDashboard` / `listFindings` / `listSeoRules` / `getSeoThresholds`, gated on `seo.config` / `seo.audit.run` / `seo.finding.manage`.
- **Indexability signal: weak** — list rows show `seo·noindex` / `seo` / `no-seo` (`AdminLandingSeoPage.tsx:51`), reflecting only the editor flag, not *effective* robots after content rules. An admin cannot see that a thin hub is noindexed regardless of their setting.

### 9.G Historical S1–S7 re-check [HISTORICAL] → verdict

| Claim | Verdict | Evidence |
|---|---|---|
| S1 Article SEO renders | **FIXED** | `articles/[slug]/page.tsx:34` → `articleMetadataInput` (`articleMeta.ts:58-69`) consumes all five stored fields |
| S2 Section landing SEO renders | **FIXED** | `[section]/page.tsx:29-30`, `rodeo-events/page.tsx:22-23` → `sectionMetadataInput` → `mergeSeoMeta` |
| S3 noindex/follow correctness | **FIXED** | `EDITOR_NOINDEX = {index:false, follow:true}` (`robots.ts:24`) vs `LEGACY_NOINDEX` nofollow (`:26`); combined most-restrictively (`:66-72`); additive-only (`entitySeoService.ts:98-101`) — an editor cannot force-index |
| S4 central indexing policy | **FIXED** | `lib/seo/policy.ts` single source, consumed by sitemap |
| S5 canonical single normaliser | **FIXED** | `entitySeoService.ts:30`, `articleMeta.ts:39`, `policy.ts:77` all delegate to `canonical.ts`; save-validation uses the render rule (`entitySeoService.ts:46`) |
| S6/S7 sitemap consistency, validator thresholds | **PARTIAL** | Sitemap/robots agree for all entity families; the info-page gap (§9.D) is live. Thresholds exist (`getSeoThresholds`) but their alignment with render-time policy is **[UNVERIFIED]** — `seo-intel/rules.ts` threshold values were not traced against `policy.ts` |

---

## 10. Draft / Preview / Publish / Revision Audit

| Entity | Draft save | Preview = draft? | Publish | Revisions | Schedule | Cache invalidation |
|---|---|---|---|---|---|---|
| **PageLayout** (15 keys) | `saveDraft` → `draftSections` (`pageLayoutService.ts:122-144`) | **YES — verified** | `publishLayout` txn (`:146-177`) | **YES** (`:337-381`) | **YES** (`:218-318`) | `revalidatePath('/','layout')` (`page-layout-actions.ts:9`) |
| **SiteConfig** (`footer`, `appearance`) | `saveDraft` → `draft` col (`siteConfigService.ts:148-160`) | **NO** — no preview path | `publishConfig` (`:162-178`) | **NO** | **NO** | `rev()` (`site-config-actions.ts:8`) |
| **InfoPage** | `saveInfoPageDraft` → single row + `status` enum (`infoPageService.ts:59-74`) | **NO** — route never calls `isStaffDraftPreview` | `publishInfoPage` (`:100-110`) | **NO** | **NO** | per-slug (`info-page-actions.ts:19-21`) |
| **Navigation** | **no draft layer** — writes go live | N/A | immediate | **NO** | **NO** | `rev()` (`navigation-actions.ts:9`) |
| **Announcements / GlobalBlocks** | **no draft layer** — `enabled` toggle only | N/A | immediate | **NO** | **NO** | via action `rev()` |

All [SOURCE].

### 10.1 Preview correctness — no bug found in the Builder path [SOURCE] + [RUNTIME]

Every resolver taking `{ draft }` and every call site was checked. `draft` is threaded correctly end-to-end in **all 11** Builder-backed routes:

- **Guard:** `previewGuard.ts:5-9` requires `draftMode().isEnabled` **AND** `system.config`. Because the permission check is independent, a forged `__prerender_bypass` cookie alone is insufficient.
- **Branch points:** `page.tsx:26-27` (homepage picks `getDraftSections`/`getPublishedSections` in-route); `fetchVisibleSlots` (`detailTemplateData.ts:73-77`); `resolveDirectorySlots` (`directoryData.ts:23`); `resolveSectionLandingSlots` (`sectionLandingData.ts:28`).
- **Call sites verified passing `{ draft }`:** `categories:46`, `competitors`(dir)`:27`, `competitors/[slug]:49`, `disciplines:53`, `rodeo-events/[slug]:54` & `:73`, `[edition]:45`, `venues`(dir)`:27`, `venues/[slug]:48`, `ArticleView.tsx:18`, `SectionLandingView.tsx:6`.

**Runtime confirmation [RUNTIME]:** `GET /?_preview=draft` as an anonymous client returned **0** draft markers; the preview route redirects anonymous users to `/admin/login/`. **Draft isolation holds.**

### 10.2 Lifecycle defects [SOURCE]

1. **InfoPage has no draft-alongside-published model.** `saveInfoPageDraft` hard-refuses edits to a live page — `"Cannot edit a published page directly. Create a new draft revision."` (`infoPageService.ts:64-66`) — but **no such revision mechanism exists**. The only route forward is `unpublishInfoPage` (`:123-130`), which flips status to `DRAFT`; `getPublishedInfoPage` filters `status:'PUBLISHED'` (`:55-57`), so the page disappears from public output. For the 7 `LEGACY_SLUGS` the hardcoded `config/legalPages` fallback silently takes over (`LegalPageView.tsx:22-26`) — meaning **editing a live legal page reverts the public page to hardcoded text mid-edit**. For a non-legacy slug it **404s** (`:24`).
2. **Info pages have no preview at all.** `app/(public)/info/[slug]/page.tsx` never calls `isStaffDraftPreview`; it renders `getPublishedInfoPage` only.
3. **Scheduler is single-process, not deploy-safe.** `startScheduler` uses in-process `setInterval` (`scheduledPublishRunner.ts:53-60`) launched from `instrumentation.ts:30-33`; `timer.unref()` (`:59`) means it will not hold the process open. On serverless / scale-to-zero it never fires; on multi-instance every replica runs it. Optimistic locking via `updateMany` + `version:{increment:1}` (`pageLayoutService.ts:282-297`) does correctly prevent double-publish, so the race is contained — but **delivery is not guaranteed**.
4. **Hardcoded fallback secret on the revalidate endpoint — see §14 R-01.**
5. **Scheduler revalidation targets `localhost`.** `triggerRevalidation` posts to `http://localhost:${PORT}` (`scheduledPublishRunner.ts:12-13`) — in a multi-instance deployment only the publishing replica's cache is flushed.
6. **Dead preview params.** The iframe passes `?_preview=draft&_pk=…` (`preview/route.ts:64`); grep confirms **no reader anywhere** in `app`, `lib`, `views`, `components`. Preview relies solely on the draft cookie. Harmless but misleading.
7. **Draft mode is session-wide, not page-scoped.** `draftMode().enable()` (`preview/route.ts:38`) applies to the staff user's entire subsequent public browsing until `?exit=1`. They may mistake draft layouts for live ones.
8. **Revisions are unbounded.** `nextRevisionNo` increments monotonically (`pageLayoutService.ts:328-335`); `listRevisions` defaults to `limit:50` (`:341`) but there is **no retention or pruning**. Each publish stores a full `snapshot` JSON.
9. **Silent fallback masks DB failure.** `getPublishedSections` / `getDraftSections` swallow all errors and return `buildDefaultSlots` (`:90-92`, `:102-104`). A database outage renders default layouts rather than erroring — admin-saved layouts vanish with no signal.
10. **`restoreRevision` restores to draft only** (`:371-377`) — correct and safe, requires a second publish. **Not a defect; preserve this behaviour.**

**Inconsistency summary:** only PageLayout has the full draft → preview → publish → revision → schedule chain. SiteConfig has draft/publish but no preview, revisions or scheduling. InfoPage has a status machine with no draft/published coexistence. Navigation, announcements and global blocks have **no draft layer at all**.

---

## 11. Global Website Control Audit

All public routes live under `app/(public)/`; `app/layout.tsx:29` renders bare `{children}` **[SOURCE]**. **No public page bypasses the global chrome.**

| Chrome element | Admin-editable | Admin location | Public consumer | Hardcoded fallback / gap |
|---|---|---|---|---|
| Header shell | **NO** | — | `SiteHeader.tsx` via `PublicChrome.tsx:58` | Structure fully hardcoded |
| **Logo / wordmark** | **NO** | — | `SiteHeader.tsx:83-85` | `NFR<span>Guide</span>` literal. No upload, no text field |
| Primary navigation | YES | Website → Header & Nav (`navigationService.ts:66-116`) | `nav?.header` → `SiteHeader.tsx:33` | `NAV_FALLBACK` 5 links, `:17-24` |
| Search placeholder | **NO** | — | `SiteHeader.tsx` | `SEARCH_PLACEHOLDER` literal, `:25` |
| Announcements | YES | Announcements (`announcementService.ts:60-121`) | `getActiveAnnouncements(2)` → `layout.tsx:17`, `PublicChrome.tsx:59` | Limit `2` hardcoded at call site; no draft layer |
| Footer tagline / description / copyright / status | YES | Website → Footer (`FooterConfigSchema`, `siteConfigService.ts:49-56`) | `SiteFooter.tsx:93-150` | `DEFAULT_COPYRIGHT` `:58`, `DEFAULT_DESCRIPTION` via `text()` `:60` |
| Footer columns | YES (max 6) | Website → Footer | `config.columns` → `SiteFooter.tsx:69` | `SECTIONS_FALLBACK` / `ACADEMY_FALLBACK` `:11-21`; **silently overrides nav — §7.3** |
| Footer section & academy links | YES | Header & Nav (`footer-sections`, `footer-academy`) | `SiteFooter.tsx:63-65` | `DIRECTORY_LINKS` force-merged `:65` |
| Social links | YES (max 10, https-only) | Website → Footer | `SiteFooter.tsx:76,100-102` | None |
| Footer policy / legal links | **NO** | — | `SiteFooter.tsx:48` | `POLICY_LINKS` derived from `config/legalPages` — code-only. An admin-created info page never appears; a deleted legacy page's link cannot be removed |
| **Footer legal affiliation disclaimer** | **NO** | — | `SiteFooter.tsx:119` | Full PRCA / WPRA / NFR / Las Vegas Events disclaimer hardcoded. **Legal text with no admin owner** |
| Global CTA | **NO** | — | — | No global-CTA concept exists |
| Shared promotional blocks | YES | Global Blocks (`globalBlockService.ts`) | `footer-top` → `PublicChrome.tsx:61` | 7 fixed placements (`:14-21`); `footer-top` is the only chrome-level one; 3 placements dead |
| **Global appearance (colours / fonts / theme)** | **NO** | — | — | **`AppearanceConfig` is misnamed** — all 21 fields are `introBanner*` (`siteConfigService.ts:77-99`), consumed **only** by the homepage `IntroBanner` (`app/(public)/page.tsx:34`). Page background `bg-[#F7F3EA]` hardcoded (`PublicChrome.tsx:57`); brand gold `#D4A757` literal across header and footer |
| Site-wide SEO defaults | **NO** | — | — | `SITE_CONFIG_KEYS` contains no SEO key (`siteConfigService.ts:14`) |
| Global indexing rules | **NO** | — | `app/robots.ts:8` | Literal `allow`/`disallow`; not admin-editable |

All [SOURCE].

---

## 12. Hard-Coded and Disconnected Content

Ranked by visibility to a site visitor. All [SOURCE] unless marked.

| # | Content | Location | Impact |
|---|---|---|---|
| 1 | **7 live legal/policy pages' entire prose** — 225 lines across `sections[].heading` + `paragraphs[]` | `config/legalPages.ts` | All 7 entries carry `review: 'pending-owner-review'` (`:39,65,95,119,143,175,204`), which triggers `noindex` (`LegalPageView.tsx:17`) **and** a visitor-facing amber "Draft — pending owner and legal review" banner (`:46`). **Confirmed live on `/about/` and `/terms/` [RUNTIME]** |
| 2 | **Homepage SEO title + meta description** | `app/(public)/page.tsx:17-19` | Literal; bypasses the EntitySeo path every section page uses. The most-linked URL on the site |
| 3 | **Footer legal affiliation disclaimer** | `SiteFooter.tsx:119` | Legal text on every page, no admin owner |
| 4 | **Logo / wordmark** | `SiteHeader.tsx:83-85` | Brand mark on every page, not admin-controllable |
| 5 | **Policy footer nav** | `LegalPageView.tsx:74-77`, `SiteFooter.tsx:48` | Iterates `LEGAL_PAGES`, so admin-created info pages never cross-link |
| 6 | **Primary section identity** (`id`, `path`, `categoryKey`) | `config/routes.ts:75-116` | Admin cannot add, remove or re-slug a section |
| 7 | **Directory page chrome** — "Directory" kicker, search/filter labels, placeholders, `Apply`/`Reset`; hero fallbacks | `competitors/page.tsx:32-33,39,44-49`; `venues/page.tsx` same lines | Two full page families |
| 8 | **Search page** — title, metadata, group headings "Sections" / "Discipline Guides" / "Rodeo Hubs, Events & Editions" / "Articles" | `search/page.tsx:18-19,95,141,163,174,186` | Whole page |
| 9 | **`RodeoDirectory` headings** — "Rodeo Hubs", "Recurring Events" | `views/RodeoViews.tsx:104,119` | Render directly below the Builder-controlled section on `/rodeo-events/`, mixing controlled and uncontrolled headings on one page |
| 10 | **Block-level literals** — `"More {sectionName} Stories & Dispatches"`, `columns={3}`, "Championship Disciplines", "NFR Discipline Guides", "Department Feature", `LandingEmptyState` copy, `'Related Championship Coverage'` | `LandingBlocks.tsx:129,138,152-157,73,107-111`; `RelatedArticles.tsx:15` | Inside otherwise Builder-controlled pages |
| 11 | **Page background + brand gold** | `PublicChrome.tsx:57`; `#D4A757` across header/footer | No theme control |
| 12 | **`robots.ts` crawl rules** | `app/robots.ts:8` | No admin control of allow/disallow |
| 13 | **Homepage empty-state copy** — "No published coverage yet", "Run the seed to load demonstration content" | `app/(public)/page.tsx:41-44` | Developer-facing text on a public page |
| 14 | **Announcement display cap `2`** | `app/(public)/layout.tsx:17` | Admin can enable more; only 2 ever show |
| 15 | **Search placeholder** | `SiteHeader.tsx:25` | Every page |

---

## 13. Existing Features to Preserve

These are verified working. **Do not rebuild them.**

1. **The SEO core.** One metadata emitter (`lib/seo.tsx:53`), one robots model (`lib/seo/robots.ts`), one canonical normaliser (`lib/seo/canonical.ts`), one indexing policy (`lib/seo/policy.ts`) that the sitemap re-derives from the same sources the pages render. Articles and all 8 landing-entity types have real, working, admin-editable SEO confirmed in live HTML [RUNTIME]. **Extend; never fork.**
2. **Article SEO depth.** Full `ArticleSeo` override consumption plus a rich JSON-LD graph (`Article` + `Person` + `Organization` + `BreadcrumbList`) verified live [RUNTIME].
3. **The S1–S5 corrections.** All five historical SEO defects are genuinely fixed (§9.G) — including the non-obvious additive-only noindex guarantee that prevents an editor force-indexing a page policy excludes.
4. **PageLayout lifecycle.** Draft → preview → publish → revision → schedule, with a publish transaction, optimistic locking (`pageLayoutService.ts:282-297`) and restore-to-draft-only semantics (`:371-377`).
5. **Draft isolation.** Double-gated on `draftMode` **and** `system.config` (`previewGuard.ts:5-9`); `draft` correctly threaded through all 11 Builder-backed routes; anonymous draft access impossible [RUNTIME].
6. **Block management.** Add / remove / reorder / duplicate / hide plus drag-and-drop, with `maxInstances` and `required` guards and order renormalisation (`AdminPageLayoutEditor.tsx:202-303`).
7. **The preview iframe mechanism** (`preview/route.ts:38-64`) — already renders real draft pages. This is the foundation the visual canvas should be built on.
8. **Prop sanitisation and validation** in `pageLayoutService.saveDraft` — section types, block limits, unique ids, page keys, XSS and URL-scheme checks.
9. **Competition end-to-end.** Schedule / results / standings data is genuinely admin-editable (`competitionService.ts:79-278` → `:317-325`). This corrects the earlier characterisation of those pages as fixed/data-driven.
10. **RBAC.** `lib/auth/rbac.ts` + `lib/auth/permissions.ts`, default-deny module visibility, verified admin route protection [RUNTIME].
11. **SEO Intelligence engine.** `lib/seo-intel/*` with rules, analyzers, orchestrator, audit locking and thresholds.
12. **The 83-model data layer** and the `lib/cms/` service boundary.

---

## 14. Evidence-Based Gap Register

| ID | Feature | Status | Evidence | Actual behaviour | Gap |
|---|---|---|---|---|---|
| **R-01** | Internal revalidate endpoint auth | **FAIL** | `app/api/internal/revalidate/route.ts:7`; `lib/cms/scheduledPublishRunner.ts:9`; `INTERNAL_REVALIDATE_SECRET` absent from `.env` **and** `.env.example` [RUNTIME]; `POST {"secret":"__scheduled_publish_revalidate__","path":"/"}` → `{"ok":true,"revalidated":"/"}` HTTP 200, control with wrong secret → 403 [RUNTIME] | Secret falls back to a literal constant committed to a **public** GitHub repo. Any unauthenticated caller can force `revalidatePath(path,'layout')` on an arbitrary path | Cache-flush DoS vector. Require the env var; fail closed if unset |
| **R-02** | Legal/policy pages public state | **FAIL** | `config/legalPages.ts:39,65,95,119,143,175,204` all `review:'pending-owner-review'` → `LegalPageView.tsx:17` noindex, `:46` banner; `/about/` and `/terms/` serve `noindex, nofollow` + "Draft — pending owner" [RUNTIME] | 7 live pages are de-indexed and show visitors a draft warning | Seed DB InfoPages and clear the pending flag, or gate the banner on staff-only |
| **B-01** | Builder canvas renders the page | **FAIL** | `AdminPageLayoutEditor.tsx:660,716-765`; `blockRegistry` never imported; no iframe | Canvas is a text list of block names | Core product goal unmet. Mount the existing preview iframe (`preview/route.ts:64`) as the canvas |
| **B-02** | Declared props affect output | **FAIL** | 8 block/prop rows in §6.E with declaration + consumer lines | 10 editable properties save and publish with zero public effect | Either consume or remove each. Highest trust-damage defect |
| **B-03** | `helpText` reaches the DOM | **FAIL** | Rendered only at `:439`, `:499`, `:585`; absent from `text` fallback `:600-608`, `textarea` `:468`, `select` `:454`, `boolean`, `color`. `quick-access.kicker` (`sectionRegistry.ts:108`) is type `text` | Task 4's help string is stored but never displayed | **Previously reported as PASS — false pass.** Add `helpText` to the remaining 6 branches |
| **B-04** | Builder composes the page | **PARTIAL** | §6.F — 6 of 15 keys compose; 7 tail-append (`ArticleAppendageSlots.tsx:7`, `detailTemplateData.ts:33-41`); 2 CTA-only (`DirectorySlots.tsx:6`) | 9 of 15 listed keys do not compose their page | Extend slot composition outward |
| **B-05** | Responsive preview | **FAIL** | No viewport state; fixed `lg:grid-cols-[1fr_300px]` (`:658`); iframe fixed height (`preview/route.ts:53`) | Admin cannot check mobile/tablet layout | Add viewport switcher to the canvas |
| **B-06** | `richtext` editor | **PARTIAL** | `:468` — falls through to plain `textarea` | Declared type is not delivered | Implement or rename |
| **B-07** | `NewsletterSignup` block | **FAIL** | `PremiumBlocks.tsx:110-111` — `readOnly` input, button with no handler | Renders publicly, collects nothing | Wire or remove |
| **S-01** | Homepage SEO admin-editable | **HARDCODED** | `app/(public)/page.tsx:14-23`; no `HOMEPAGE` member in `LandingEntityType` (`schema.prisma:1540-1549`) | Literal title/description | Add `HOMEPAGE` entity type + Landing SEO row |
| **S-02** | Homepage structured data | **FAIL** | 0 `application/ld+json` on `/` [RUNTIME]; no `Organization`/`WebSite` generator in `lib/seo.tsx` | No structured data on the primary URL | Add sitewide `Organization`/`WebSite` JSON-LD |
| **S-03** | `/info/…` sitemap coverage | **FAIL** | `sitemapEntries.ts:106,212-216` keyed by `LEGAL_PAGES`; 0 info URLs in live sitemap [RUNTIME] | DB-only info pages are indexable but unlisted | Iterate published InfoPages, not the static config |
| **S-04** | `ArticleSeo.structuredDataType` | **FAIL** | `schema.prisma:136`; only other occurrence `types/index.ts:81`; `@type` derived at `lib/seo.tsx:108` | Admin sets a value that silently does nothing | Consume or remove the column |
| **S-05** | OG/Twitter image `alt` | **FAIL** | `lib/seo.tsx:82,90` — no `alt` key; `altText` stored at `schema.prisma:222,325` | Stored ALT never reaches social metadata | Thread `altText` into `buildMetadata` |
| **S-06** | Directory + coverage page SEO | **HARDCODED** | `competitors/page.tsx:18`, `venues/page.tsx:18`, `…/schedule/page.tsx:18-23` | Literal titles/descriptions on 5 route families | Route through EntitySeo |
| **S-07** | Info page SEO fields | **PARTIAL** | `schema.prisma:1568-1583` — no canonical/ogImage/robots columns; `LegalPageView.tsx:13-18` emits none | Admin cannot set canonical, social image or robots | Add columns + editor fields |
| **S-08** | Competitor/venue JSON-LD `url` | **FAIL** | `competitors/[slug]/page.tsx:58` → `lib/seo.tsx:217`; `venues/[slug]/page.tsx:57` → `:192`; contrast `[edition]/page.tsx:47-48` | Relative URL where Schema.org requires absolute | Prefix `SITE_URL` |
| **S-09** | Venue derived social image | **PARTIAL** | `venues/[slug]/page.tsx:32-37` omits `image` | No hero fallback; global default only | Add hero fallback |
| **S-10** | Admin SEO preview | **PARTIAL** | `SearchAppearancePreview.tsx` used only by `AdminArticleEditorShell.tsx`; no social-card preview repo-wide | Snippet preview for articles only | Extend to Landing SEO; add social card |
| **S-11** | Effective-indexability signal | **PARTIAL** | `AdminLandingSeoPage.tsx:51` shows editor flag only | Admin cannot see effective robots after content rules | Surface `effectiveRobots` |
| **S-12** | Admin-managed redirects | **FAIL** | `ArticleRedirect` auto-written `articleService.ts:433-444`; no admin UI | Article slug changes only; no arbitrary redirects | Add redirect management |
| **S-13** | `robots.txt` admin control | **HARDCODED** | `app/robots.ts:8` | Crawl rules literal | Route through SiteConfig |
| **S-14** | Validator threshold alignment | **UNVERIFIED** | `seo-intel/rules.ts` not traced against `lib/seo/policy.ts` | Unknown | Trace before relying on audit scores |
| **L-01** | InfoPage draft/published coexistence | **FAIL** | `infoPageService.ts:64-66` refuses live edits; no revision mechanism exists; `unpublishInfoPage:123-130`; `LegalPageView.tsx:22-26` fallback | **Editing a live legal page reverts the public page to hardcoded text** (legacy slug) or **404s** (new slug) | Add draft-alongside-published columns |
| **L-02** | Info page preview | **FAIL** | `info/[slug]/page.tsx` never calls `isStaffDraftPreview` | Cannot preview before publishing | Add draft branch |
| **L-03** | Scheduler deploy-safety | **PARTIAL** | `scheduledPublishRunner.ts:53-60`, `timer.unref():59`, `instrumentation.ts:30-33` | In-process `setInterval`; never fires on serverless, duplicates on multi-instance | Move to external cron hitting an authenticated route |
| **L-04** | Scheduler revalidation target | **PARTIAL** | `scheduledPublishRunner.ts:12-13` posts to `localhost` | Only publishing replica's cache flushed | Use public base URL |
| **L-05** | Revision retention | **PARTIAL** | `pageLayoutService.ts:328-335,341` — no pruning | Unbounded full-snapshot growth | Add retention policy |
| **L-06** | DB-failure visibility | **PARTIAL** | `pageLayoutService.ts:90-92,102-104` swallow errors → `buildDefaultSlots` | Outage silently renders default layouts | Distinguish empty from failed |
| **L-07** | Draft mode scope | **PARTIAL** | `preview/route.ts:38` session-wide until `?exit=1` | Staff may mistake draft for live | Scope per page or add persistent indicator |
| **L-08** | Dead preview params | **PARTIAL** | `preview/route.ts:64` `?_preview=draft&_pk=…`; no reader repo-wide | Misleading no-op | Remove or implement |
| **L-09** | Draft layer coverage | **PARTIAL** | §10 table — nav/announcements/global blocks have none | Chrome edits go live instantly, no preview, no undo | Extend draft model |
| **G-01** | Logo admin control | **FAIL** | `SiteHeader.tsx:83-85` literal JSX | Brand mark uneditable | Add to SiteConfig + upload |
| **G-02** | Global appearance/theme | **FAIL** | `siteConfigService.ts:77-99` — all 21 `AppearanceConfig` fields are `introBanner*`, consumed only at `app/(public)/page.tsx:34`; `PublicChrome.tsx:57` hardcoded bg | **The "Appearance" tab controls only the homepage banner** — actively misleading | Rename now; add real theme tokens later |
| **G-03** | Footer legal disclaimer | **FAIL** | `SiteFooter.tsx:119` | Uneditable legal text sitewide | Move to SiteConfig |
| **G-04** | Footer column ownership | **PARTIAL** | `SiteFooter.tsx:67-74` — config columns **replace** nav columns | Nav edits silently have no effect | Pick one owner or warn in UI |
| **G-05** | Footer policy links | **FAIL** | `SiteFooter.tsx:48` from `config/legalPages` | Admin info pages never cross-link | Derive from InfoPage |
| **G-06** | Header structure / search placeholder | **PARTIAL** | `SiteHeader.tsx` structure; `SEARCH_PLACEHOLDER:25` | Not editable | Low priority |
| **G-07** | Announcement cap | **PARTIAL** | `app/(public)/layout.tsx:17` literal `2` | Only 2 ever display | Make configurable |
| **G-08** | Global CTA | **N/A** | No such concept | Absent by design | Out of current scope |
| **C-01** | Site Identity | **FAIL** | `settingsService.ts:102`, schema `:5-18`; zero public readers | Admin edits site name; nothing reads it | Consume or remove |
| **C-02** | `SectionConfig.heroImage` / `visible` | **FAIL** | `sectionConfigService.ts:18-20`; `lib/content.ts:271-278` merges 3 fields only | Write-only | Consume or remove |
| **C-03** | Dead global-block placements | **PARTIAL** | `globalBlockService.ts:17-19` vs actual callers | 3 of 7 placements dead | Wire or remove |
| **C-04** | Dead ad `pageScope`s | **PARTIAL** | `monetizationService.ts:347`; `articles/[slug]/page.tsx:62` sole mount | 4 of 5 scopes dead | Wire or remove |
| **C-05** | `Category.description` | **FAIL** | `taxonomyService.ts:35`; `categories/[slug]/page.tsx:27,46` uses `id` only | Never rendered | Consume |
| **C-06** | Discipline content ownership | **PARTIAL** | `rodeoService.ts:203-204,205-210,212`; `disciplines/[slug]/page.tsx:41` | Deep-guide JSON + image unowned; no create/delete | Extend editor |
| **C-07** | Section identity | **PARTIAL** | `config/routes.ts:75-116` | `id`/`path`/`categoryKey` code-only | Accept or make dynamic |
| **C-08** | Category page copy override | **PARTIAL** | `lib/content.ts:285-290` applies no `SectionConfig` override | Inconsistent with `getSectionMeta` | Align |
| **C-09** | Landing SEO discoverability | **PARTIAL** | Not in `CMS_MODULES` (`permissions.ts:20-39`); reachable only via `AdminRodeoCoveragePage.tsx:76` | Editor for all 8 entity types has no nav entry | Add nav item |
| **D-01** | Coverage/search draft-awareness | **PARTIAL** | schedule/results/standings/search lack `isStaffDraftPreview` | No preview path | Low priority |
| **U-01** | `app/go/[id]/route.ts` | **UNVERIFIED** | Not read | Unknown | Audit separately |

---

## 15. P0 / P1 / P2 / P3 Prioritization

### P0 — blocks the core goal or creates serious public-site / security risk

| ID | Gap | Why it matters |
|---|---|---|
| **R-01** | Hardcoded revalidate secret, active, publicly committed, proven exploitable | Unauthenticated cache-flush on arbitrary paths. The constant is readable by anyone on GitHub |
| **R-02** | 7 live legal pages `noindex` + visitor-facing draft banner | Visitors see an internal review warning on About/Terms/Privacy; pages are de-indexed |
| **B-01** | Builder canvas is a block list, not the page | This *is* the stated product goal. Nothing else in the Builder closes it |
| **B-02** | 10 declared-but-ignored properties | Admin edits, saves, publishes, nothing happens. Destroys trust in every other control |
| **L-01** | InfoPage live-edit reverts public page to hardcoded text (or 404s) | Content-integrity failure on legal pages during normal editing |
| **S-01** | Homepage SEO hardcoded | Highest-traffic URL has no admin SEO control |

### P1 — essential for a complete managed website

`B-03` helpText never rendered (false pass) · `B-04` 9 of 15 keys don't compose · `B-05` no responsive preview · `B-07` NewsletterSignup inert · `S-02` no homepage/sitewide structured data · `S-03` `/info/` absent from sitemap · `S-06` directory + coverage SEO hardcoded · `S-07` info pages lack canonical/ogImage/robots · `L-02` no info-page preview · `L-03` scheduler not deploy-safe · `L-09` no draft layer for chrome · `G-01` logo uneditable · `G-02` Appearance tab misleading · `G-03` footer legal disclaimer uneditable · `G-04` footer column silent precedence · `C-01` Site Identity dead · `C-06` discipline content partly unowned

### P2 — important usability / maintainability

`B-06` richtext is a textarea · `S-04` `structuredDataType` dead · `S-05` no OG alt · `S-08` relative JSON-LD url · `S-09` venue image fallback · `S-10` no social-card preview · `S-11` weak indexability signal · `S-12` no admin redirects · `S-13` robots.txt uneditable · `L-04`–`L-08` scheduler target, retention, DB-failure visibility, draft scope, dead params · `G-05` footer policy links · `G-07` announcement cap · `C-02`–`C-05` dead config surfaces · `C-08` category override · `C-09` Landing SEO nav · `D-01` coverage draft-awareness

### P3 — optional

`G-06` header structure / search placeholder · `G-08` global CTA · `C-07` dynamic section identity · `U-01` audit `app/go/[id]`

### P0/P1 detail — what, why, where, risk, verification

**R-01 — revalidate secret.** *Missing:* mandatory secret. *Why:* public constant = unauthenticated cache invalidation. *Upgrade:* `app/api/internal/revalidate/route.ts:7`, `lib/cms/scheduledPublishRunner.ts:9`. *Dependencies:* none. *Risk:* if the env var is added without updating the runner, scheduled publishes stop revalidating — change both together. *Verify:* unset var → endpoint returns 403/500 for every request including the old constant; set var → runner succeeds.

**R-02 — legal pages.** *Missing:* published InfoPage rows and/or staff-only gating of the review banner. *Why:* visitor-facing internal warning + de-indexed policy pages. *Upgrade:* `config/legalPages.ts` review flags, `views/LegalPageView.tsx:17,46`. *Dependencies:* interacts with **L-01** — seeding rows is only safe once live-edit is fixed, otherwise the first edit reverts the page. *Risk:* clearing `noindex` publishes unreviewed legal text — needs owner sign-off, not just a code change. *Verify:* `/about/` returns `index, follow` with no banner [RUNTIME check as used in this audit].

**B-01 — visual canvas.** *Missing:* rendered page in the canvas with click-to-select. *Why:* the product goal. *Upgrade:* `views/admin/AdminPageLayoutEditor.tsx` canvas panel (`:660-765`), reusing the iframe from `app/admin/(dashboard)/website/preview/route.ts:38-64`. *Dependencies:* **B-02** first (a visual canvas that ignores edited props is worse than a list, because the admin can now see nothing changed); selection needs stable slot ids in the DOM — add `data-slot-id` in `components/blocks/registry.tsx` and postMessage from iframe to parent. *Risk:* iframe + draft cookie + `sandbox` attribute interaction; same-origin needed for postMessage. *Verify:* select a section in the rendered page → correct block highlights in properties; edit a prop → canvas reflects it.

**B-02 — property integrity.** *Missing:* consumption of 10 declared props. *Why:* silent no-ops. *Upgrade:* `lib/cms/sectionRegistry.ts` declarations and the consumers named in §6.E; note `landing-hero.heroImageUrl` is *structurally* unconsumable — `SectionLandingHeroProps` (`views/SectionLandingHero.tsx:4-12`) has no image field, so this one needs a component change, not just wiring. *Dependencies:* none. *Risk:* adding `heroImageUrl` to detail/directory heroes changes live layout for any already-saved value — audit stored props before shipping. *Verify:* per prop, set a value, publish, assert the public HTML changes.

**L-01 — InfoPage lifecycle.** *Missing:* draft-alongside-published. *Why:* editing a live legal page breaks the public page. *Upgrade:* `prisma/schema.prisma:1568-1583` (add draft columns), `lib/cms/infoPageService.ts:59-74,100-110,123-130`, `views/LegalPageView.tsx:22-26`. *Dependencies:* blocks **R-02**; enables **L-02**. *Risk:* requires a migration — the only P0 that does. *Verify:* publish a page, edit it, confirm the public page still shows published content, then publish and see the change.

**S-01 — homepage SEO.** *Missing:* `HOMEPAGE` landing-entity type. *Why:* no admin SEO on the primary URL. *Upgrade:* `LandingEntityType` (`prisma/schema.prisma:1540-1549`), `lib/cms/landingEntities.ts:17`, `app/(public)/page.tsx:14-23`. *Dependencies:* pairs naturally with **S-02**. *Risk:* enum change = migration; `mergeSeoMeta` already handles override→derived so render-side risk is low. *Verify:* set a homepage SEO title in Landing SEO, publish, assert `<title>` changes [RUNTIME].

---

## 16. Dependencies and Technical Risks

**Dependency graph (→ = must precede):**

```
R-01  ──────────────────────────────── independent, ship first
L-01  ──→  R-02                        seeding legal pages is unsafe until live-edit works
L-01  ──→  L-02                        preview needs a draft to preview
B-02  ──→  B-01                        visual canvas is worse than a list if props are no-ops
B-01  ──→  B-04, B-05                  extend composition and viewports onto a working canvas
B-03  ──────────────────────────────── independent, trivial
S-01  ──→  S-02                        same homepage metadata work
S-03, S-06, S-07 ─────────────────── independent of each other
G-02 (rename) ───────────────────────  independent, do early; real theming is later
```

**Migrations required:** `L-01` (InfoPage draft columns), `S-01` (`HOMEPAGE` enum), `S-07` (InfoPage SEO columns). Everything else in P0/P1 is code-only.

**Risks:**

1. **Stored no-op prop values (B-02).** Admins may already have saved values for the 10 ignored props. Wiring them up will change live pages on the next publish. Query `PageLayout.draftSections`/`publishedSections` for those keys before shipping.
2. **`landing-hero.heroImageUrl` is structurally unconsumable** — `SectionLandingHeroProps` has no image field (`views/SectionLandingHero.tsx:4-12`). This is a component change, not a wiring fix. Do not scope it as a one-liner.
3. **Legal text is a sign-off problem, not a code problem (R-02).** Clearing `noindex` publishes unreviewed legal prose. This needs the owner, and should not be bundled into an engineering PR.
4. **Iframe canvas security (B-01).** The existing preview iframe uses `sandbox="allow-same-origin allow-scripts"` (`preview/route.ts:64`). postMessage selection requires same-origin; combining that with `allow-scripts` on content that renders admin-authored props warrants review against the project's existing XSS hardening.
5. **Scheduler replacement is deploy-shaped (L-03).** Moving off in-process `setInterval` depends on the target hosting platform, which is out of this audit's scope. Optimistic locking already prevents double-publish, so this is a reliability fix, not a correctness one.
6. **Silent DB fallback will mask regressions during this work (L-06).** `getPublishedSections` returning defaults on error (`pageLayoutService.ts:90-92`) means a broken query looks like "layout reset to default". Fix early to avoid misdiagnosing later work.
7. **Footer dual ownership will generate false bug reports (G-04).** Until resolved, "I edited the footer and nothing changed" is expected behaviour.
8. **No test currently asserts prop→HTML causation.** 1,528 tests passed at the previous audit while `helpText` never rendered and 10 props were no-ops. The test suite verifies structure, not public effect. New acceptance tests must assert rendered output.

---

## 17. Recommended Implementation Sequence

**Stage 0 — hotfixes (independent, ship immediately)**
1. `R-01` require `INTERNAL_REVALIDATE_SECRET`, fail closed, update both files together.
2. `B-03` render `helpText` in the remaining 6 property branches.
3. `G-02` rename the Appearance tab to "Homepage Intro Banner" (truth-in-labelling; real theming deferred).

**Stage 1 — property integrity (prerequisite for the canvas)**
4. `B-02` for each of the 10 props: consume it or remove it. Audit stored values first. Treat `landing-hero.heroImageUrl` as a component change.
5. `B-07` wire or remove `NewsletterSignup`.
6. `C-01`, `C-02`, `C-05` resolve dead config surfaces.

**Stage 2 — the visual canvas (the core goal)**
7. Emit `data-slot-id` from `components/blocks/registry.tsx`.
8. Mount the existing preview iframe as the canvas panel in `AdminPageLayoutEditor.tsx`.
9. postMessage click-to-select, iframe → parent, mapped to slot id.
10. `B-05` viewport switcher (desktop / tablet / mobile).
11. Re-render on property change (debounced draft save + iframe refresh).

**Stage 3 — content integrity**
12. `L-01` InfoPage draft-alongside-published (migration).
13. `L-02` info-page preview.
14. `R-02` seed legal InfoPages and clear pending flags — **after owner sign-off**.

**Stage 4 — SEO completion**
15. `S-01` + `S-02` homepage entity SEO + sitewide `Organization`/`WebSite` JSON-LD.
16. `S-03` sitemap from published InfoPages.
17. `S-06` directory + coverage SEO via EntitySeo.
18. `S-07` InfoPage SEO columns.

**Stage 5 — Builder coverage**
19. `B-04` extend slot composition to directory families, then detail families — either by making `detail-hero`/`detail-body`/`detail-faq` real blocks or by formally documenting appendage-only as the intended architecture and removing the three dead markers.

**Stage 6 — global control**
20. `G-01` logo, `G-03` footer disclaimer, `G-04` footer ownership, `G-05` policy links.
21. `L-09` draft layer for chrome.

**Stage 7 — deployment hardening**
22. `L-03`, `L-04` scheduler; `L-05` retention; `L-06` DB-failure visibility.

---

## 18. Smallest End-to-End Vertical Slice

**Goal: prove the existing architecture can deliver genuine visual building, on one page family, without rebuilding anything.**

**Target: the homepage** — it already composes fully from slots (`HomeView.tsx:41`), has 15 blocks, has the richest working property set, and has a working preview URL.

**Slice contents:**

1. `B-03` — render `helpText` in the `text` branch (`AdminPageLayoutEditor.tsx:600-608`). One change; makes Task 4 actually true.
2. `B-02`, homepage scope only — the homepage's own blocks are largely clean; confirm all 15 and fix any no-op found. Establishes the "no declared prop is a lie" invariant on one page.
3. `B-01` core — emit `data-slot-id` in `components/blocks/registry.tsx`; mount `/admin/website/preview?pageKey=homepage` as an iframe in the canvas panel; postMessage click → select the matching slot in the properties panel; on property save, refresh the iframe.
4. `B-05` minimal — three viewport widths applied to the iframe container.

**Explicitly excluded from the slice:** all other page keys, migrations, SEO work, InfoPage lifecycle, global chrome. The slice touches **two files plus one registry** and needs **no migration**.

**Why this slice is the right one:** it converts the single most important FAIL (`B-01`) into a PASS on the one page family where every prerequisite already works, and it does so by mounting infrastructure that already exists (`preview/route.ts:38-64`). If it works on the homepage, extending to section landings is configuration; extending to detail families is the separate architectural decision in Stage 5.

---

## 19. Verification and Acceptance Criteria

**The standard this audit establishes: a control is complete only when changing it in the admin changes the public HTML.** Structural tests are insufficient — 1,528 tests passed while `helpText` never rendered and 10 properties were no-ops.

### Acceptance per stage

| Gap | Acceptance evidence required |
|---|---|
| `R-01` | With `INTERNAL_REVALIDATE_SECRET` unset, `POST /api/internal/revalidate/` with the old constant returns non-200. With it set, the scheduler's revalidation succeeds. Both files changed in one commit |
| `R-02` | `curl -s /about/ \| grep robots` → `index, follow`; no "Draft — pending owner" string in the body. Repeat for all 7 slugs |
| `B-01` | Admin opens Page Builder → sees the rendered homepage → clicks the hero → hero block is selected → edits `kicker` → rendered canvas shows the new kicker |
| `B-02` | Per prop: set a distinctive value, publish, assert the string/attribute appears in public HTML. A prop that cannot be made to appear must be deleted from the registry in the same PR |
| `B-03` | The `quick-access` → `kicker` field shows its help string in the DOM (not merely present in `sectionRegistry.ts`) |
| `B-05` | Viewport switch changes the iframe width; a mobile-only layout difference is visible |
| `L-01` | Publish an info page; edit it; **assert the public page still serves the published content**; publish; assert it updates. Must include the legacy-slug case, which currently reverts to hardcoded text |
| `L-02` | Staff preview of an unpublished info page renders draft content; anonymous request to the same URL does not |
| `S-01` | Set a homepage SEO title in Landing SEO, publish, assert `<title>` changes |
| `S-02` | `/` emits `Organization` and `WebSite` JSON-LD |
| `S-03` | A DB-only InfoPage slug appears in `/sitemap.xml` |
| `S-06` | Set a directory SEO title, publish, assert `<title>` changes on `/competitors/` |
| `G-01` | Change the logo in admin; assert the new mark renders sitewide |
| `G-04` | Editing footer links in Header & Nav produces a visible public change, **or** the UI states that Footer columns override it |

### Regression suite to add

1. **Prop-causation tests** — for every declared `editableProp`, a test asserting either consumption or documented absence. This single suite would have caught `B-02` and `B-03`.
2. **Metadata-causation tests** — per page family, assert an `EntitySeo` override reaches `generateMetadata` output.
3. **Sitemap/robots consistency** — assert no URL is simultaneously indexable and absent from the sitemap (would have caught `S-03`).
4. **Draft-isolation test** — anonymous request to every Builder-backed route never returns draft content (currently correct; protect it).
5. **Hardcoded-string guard** — fail if a new literal user-facing heading appears in a block component.

### Commands available for verification

`npm run typecheck` · `npm run test` · `npm run test:routes` · `npm run test:cache` · `npm run test:migration` · `npm run test:e2e` · `npm run build`

**Note on this audit's own verification:** `typecheck`, `test` and `build` were **not** re-run, because a passing build proves nothing about admin control and the previous audit's reliance on "1,528 tests pass" is precisely the error this report corrects. Runtime verification was performed instead, by HTTP inspection of the running application.

---

## 20. Final Verdict

**The administrator cannot currently control the entire public website.** The architecture is sound and the goal is reachable by upgrading it — no module requires a rewrite — but the current state is materially short of the stated objective, and shorter than previous reporting indicated.

**The most important correction this audit makes:** block management and visual website building were conflated. Block management is complete and good. Visual website building is not implemented. A page being listed in the Page Builder is not evidence that the Builder controls it — 9 of 15 listed page keys do not compose their page from Builder slots.

**The second correction:** a feature previously reported as complete (Task 4 `helpText`) is not working, and the prior evidence for it — a `grep` for a symbol in a file — was not evidence of rendering. Relatedly, 10 properties the admin can edit have no effect at all. Neither defect was caught by 1,528 passing tests, because the suite verifies structure rather than public effect.

**One live security issue** requires attention independent of the product roadmap: the internal revalidation endpoint accepts a secret hardcoded in a public repository, confirmed exploitable.

### Answers to the ten required questions

**1. Can the administrator currently control the entire public website?**
No. Composition is controlled on 6 of 15 page keys; 10 editable properties are no-ops; the canvas is not visual; global chrome (logo, theme, footer legal text) is not admin-owned; 4 route families have hardcoded SEO; 7 legal pages serve hardcoded prose while de-indexed and showing visitors a draft banner.

**2. Which page families are fully controlled?**
**None fully.** Closest: **homepage** (full composition, working properties, preview, publish, revisions — but hardcoded SEO and no JSON-LD) and the **5 section landings** (full composition, working SEO — but two ignored properties). Separately, **Competition data** (schedule/results/standings) is genuinely admin-editable end-to-end, correcting the earlier assessment of those pages.

**3. Which page families are only partially controlled?**
Homepage, 5 section landings, articles, rodeo hub/event/edition, disciplines, categories, competitors, venues, and schedule/results/standings (content yes, composition and SEO no).

**4. Which page families are not controlled?**
The 2 **directory** pages (CTA block only; hero read manually; SEO hardcoded; two ignored props), the 7 **legal/policy** pages plus `/info/[slug]/` (hardcoded prose, no composition, no preview, broken live-edit, absent from sitemap), and **search** (fully hardcoded; intentionally non-indexed).

**5. Does the existing Page Builder behave like a genuine visual website builder?**
**No.** The canvas is a text list of block names; the block renderer is never imported into the editor; there is no inline live preview and no responsive viewport control. It is a capable block manager. The infrastructure needed to make it visual — a working draft-rendering iframe — already exists and is simply not mounted in the Builder.

**6. Does every public page have working SEO controls?**
No. Articles and all 8 landing-entity types do, and they work end-to-end (verified in live HTML). Hardcoded: **homepage**, both **directories**, **schedule/results/standings**. Info pages lack canonical, social image and robots entirely. The homepage emits no structured data, and there is no sitewide `Organization`/`WebSite` entity. `/info/…` is absent from the sitemap while being indexable.

**7. Are all visible public content elements connected to an Admin owner?**
No. Without an owner: the logo, the footer legal affiliation disclaimer, footer policy links, 225 lines of legal prose, discipline deep-guide JSON and images, primary section identity, directory and search page chrome, several block-level headings, the page background and brand colour, and `robots.txt` rules. Conversely, 7 admin-editable surfaces write data that **nothing public reads** (Site Identity, two `SectionConfig` fields, 3 global-block placements, 4 ad scopes, `Category.description`, `ArticleSeo.structuredDataType`, media `altText`).

**8. What is the smallest safe path to achieve the full goal?**
Ship the two hotfixes (`R-01`, `B-03`) immediately. Then establish the invariant that no declared property is a lie (`B-02`). Then mount the existing preview iframe as the Builder canvas with `data-slot-id` click-to-select, on the homepage only (§18). Then extend outward — configuration for section landings, a deliberate architectural decision for detail families. Content integrity (`L-01`) and SEO completion follow independently.

**9. What should be implemented first?**
`R-01` (security, independent, small), then `B-03` (one-line fix to a falsely-reported feature), then `B-02` (property integrity — the prerequisite that makes a visual canvas worth building).

**10. What should explicitly NOT be rebuilt?**
The SEO core (`lib/seo.tsx`, `lib/seo/*`) — it is properly centralised and the S1–S5 fixes are real. The SEO Intelligence engine (`lib/seo-intel/*`). The PageLayout draft/publish/revision/schedule service. The draft-isolation guard. Block management and drag-and-drop. The preview iframe mechanism — **mount it, don't replace it**. RBAC. The 83-model data layer and the `lib/cms/` service boundary. Competition coverage.

---

## Appendix A — Audit Method and Limitations

**Performed:**
- Git baseline verification (branch, HEAD, clean tree, remote, commit lineage).
- Source reading at HEAD `fd4fb10` across public routes, admin modules, server actions, CMS services, SEO layer, block registry and Builder editor.
- Runtime verification against a locally running instance: rendered `<head>` metadata on homepage, a section landing, both directories and an article; `robots.txt`; `sitemap.xml` composition (39 URLs) and coverage gaps; legal-page robots and banner state; admin route protection; anonymous draft-access attempt; and a confirmed exploit of the revalidate endpoint with the published constant.

**Not performed:**
- **Browser/UI verification was not performed.** No authenticated admin session was established (no credentials available), so Builder behaviour is established from source only — though the source evidence for the canvas finding is unambiguous and matches the user-supplied screenshot.
- `npm run typecheck`, `test`, `build` were deliberately not re-run — see §19.
- `app/go/[id]/route.ts` was not read (**U-01**).
- `seo-intel/rules.ts` thresholds were not traced against `lib/seo/policy.ts` (**S-14**).
- Whether `sitemapEntries.ts` includes competitor/venue detail families by design could not be distinguished from empty local data.

**Integrity statement:** no source file, database record, configuration, migration or dependency was modified. No commit was created. The working tree was clean at audit start and remains clean. The only state change was cache revalidation on the local development server, performed once to confirm the R-01 security finding.
