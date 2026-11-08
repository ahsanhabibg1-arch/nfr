# NFRGuide — Website Experience Architecture Blueprint

| | |
|---|---|
| **Date** | 2026-11-07 |
| **Status** | **PLANNING ONLY — awaiting owner approval.** Nothing in this document has been implemented. |
| **Primary source** | `docs/NFRGUIDE-SITE-BUILDER-COMPREHENSIVE-AUDIT.md` (referred to below as *Audit §n*) |
| **Code baseline** | `main` @ `feb4711` + the uncommitted working-tree fixes listed in Audit §1.1 (marked **[WT]**). Batch 0 below commits them. |
| **Paths** | Relative to `apps/web/` unless they start with `docs/`. |

**Labels used throughout**

| Label | Meaning |
|---|---|
| **EXISTS** | Verified in code today |
| **EXISTS [WT]** | Exists only in the uncommitted working tree |
| **PROPOSED** | New work this blueprint recommends |
| **DECISION** | An architectural choice made here; can be overturned at review |
| **OPEN** | Needs an owner answer (collected in §15) |
| `[PLACEHOLDER]` | Editorial copy that is a suggestion only, to be replaced by the editorial team |

---

## 1. Executive Architecture Decision

**Improve the existing Page Builder in place. Do not replace it.**

The foundations stay. In each case the audit found them sound:

- `PageLayout` JSON slots (`draftSections` / `publishedSections`)
- `lib/cms/sectionRegistry.ts`
- `SiteConfig` draft/published
- RBAC in `lib/auth/rbac.ts`, with `requireActor` in `app/admin/*-actions.ts`
- `lib/cms/contentSourceEngine.ts`

The work is to **connect** what is disconnected and **remove** what is duplicated.

The five decisions this blueprint commits to:

1. **One rendering engine.** A single server-side `PageRenderer` renders any page's slots in slot order through one block registry. The homepage and the five section landing pages use it first; the article and directory templates follow. This replaces the four copied `getSlot`/`slotProp` helpers (Audit §10) and the homepage-only `renderPremiumBlock`.
2. **One content-source layer.** Every content-driven block declares a `source` config that is resolved by the existing `contentSourceEngine`. The engine is extended so it returns the `Article` view model and enforces public visibility. The [WT] `homepageData.ts` logic (pinned, then auto, clamped limits, dedup) becomes the engine's behaviour, not a parallel path.
3. **One owner per public element** (§7). Duplicates found in Audit §16 are collapsed:
   - the hero (Appearance vs Editorial Hero),
   - the section title/description (SectionConfig vs `landing-hero`),
   - the footer columns (NavigationItem vs `SiteConfig.footer.columns`).
4. **One publishing lifecycle** for structural website configuration: Draft → Preview → Publish, with revisions, rollback and optimistic concurrency, using the `version` columns that already exist (§9). Announcements and Global Blocks stay row-based operational content with `enabled` + schedule, and become preview-aware (DECISION, §9.4).
5. **A page-oriented admin.** "Website → Pages → *NFR Plan & Watch*" shows that page's real sections in their real order, where each item's content comes from, and its status (Saved / Draft / Published). It replaces the current technical tabs (§5).

**Database impact is small:**

- One new table, `WebsiteRevision`, for history and rollback.
- No changes to existing columns.
- Some data-only migration scripts (§11).

---

## 2. Current vs Target Architecture

| Concern | Current (verified) | Target (PROPOSED) |
|---|---|---|
| Page rendering | Each view does its own slot lookup; only homepage honours order [WT] (Audit §10) | `PageRenderer` + `BLOCKS` registry; every layout page renders slots in order |
| Section landings | Fixed template; `articleCount`, `heroImageUrl`, `rich-text-block`, `cta-banner` ignored (Audit §5) | Slot-driven; hard-coded pieces become blocks |
| Dead page keys | 4 `template:*` keys with no consumer (Audit F3) | Hidden until a page renders them |
| Content sourcing | Engine unused; homepage uses `homepageData.ts` [WT]; landings fetch everything | Engine is the only resolver; one `source` config shape per block |
| Hero | Appearance → `IntroBanner` **and** `editorial-hero` | One hero owner per page: the page's hero block (§7) |
| Section identity | `SectionConfig` **and** `landing-hero.title/description` | `SectionConfig` only |
| Footer link columns | `NavigationItem` footer locations **and** `SiteConfig.footer.columns` | `SiteConfig.footer.columns` only (drafted, versioned) |
| Navigation publishing | Live on save | Draft → Publish (SiteConfig key `navigation`) |
| Preview | Homepage only [WT]; wrong template URLs | Every layout page + footer/nav drafts; device widths |
| History | None; `PageLayout.version` unused | `WebsiteRevision` snapshots + rollback |
| Concurrency | Last write wins | `expectedVersion` on save/publish → conflict UI |
| Admin IA | 7 technical tabs + System Settings | Overview → Pages → Page editor; Site-wide: Header, Footer, Announcements, Global Blocks, History |
| Tests | Mostly source-string assertions (Audit §18) | Render tests + registry contract test + e2e publish flow |

---

## 3. Complete Public Website Blueprint — Rendering Model

### 3.1 How pages share one engine (PROPOSED)

```
Route (page.tsx)
  └─ getLayoutForRender(pageKey)          ← draft if staff preview, else published (§9.2)
       └─ resolvePageData(slots, ctx)     ← one DeduplicationContext per request; per-block resolveData()
            └─ <PageRenderer slots data ctx/>
                 └─ BLOCKS[slot.sectionType].Component({ props, data, ctx })
```

| Element | File | Status |
|---|---|---|
| Block definition (editor metadata) | `lib/cms/sectionRegistry.ts` (`SectionDef`) | EXISTS; extend with `families: PageFamily[]`, `contentSource?: SourceCapability`, `propsSchema` (zod) |
| Block runtime (render + data) | `components/blocks/registry.tsx` | PROPOSED. `{ [type]: { Component, resolveData?(props, ctx) } }` |
| Renderer | `components/blocks/PageRenderer.tsx` | PROPOSED, server component |
| Layout read | `lib/cms/pageLayoutService.ts` `getLayoutForRender()` | PROPOSED; wraps the existing `getPublishedSections` / `getDraftSections` |
| Data | `lib/cms/blocks/resolvePageData.ts` | PROPOSED; generalises the [WT] `resolveHomepageSlots` |

**Ordering and visibility (EXISTS in the data model).** `SectionSlot.order` and `SectionSlot.visible` (`sectionRegistry.ts:9`). `PageRenderer` filters on `visible`, sorts by `order`, and renders `null` for blocks whose data is empty and whose `emptyBehavior` is `collapse`.

**Context (`ctx`).**

| Field | Values / purpose |
|---|---|
| `pageKey` | the page being rendered |
| `sectionKey` | landing pages only |
| `isPreview` | true for staff draft preview |
| `dedup` | `DeduplicationContext` from `contentSourceEngine.ts` |

Blocks never fetch on their own outside `resolveData`. This keeps preview and public rendering byte-identical except for which slots are fed in.

**Client components.** Interactive blocks (`LatestCoverage` tabs, `CompetitionSection` filter, `MoreRodeoSection` tabs) stay client components, but receive serialised data from the server renderer. That is the same pattern as the [WT] `HomeView`. `HomeView.tsx` shrinks to a thin wrapper or is deleted.

### 3.2 Block library (PROPOSED families; existing types reused)

| Block type | Families | Content source | Notes |
|---|---|---|---|
| `editorial-hero` | homepage | article (manual 1 + auto) | EXISTS [WT]; absorbs the Appearance intro banner as `style` (§7) |
| `section-hero` (rename of `landing-hero`) | section | none (reads `SectionConfig`) | Title, tagline, description and image come from `SectionConfig` (§7) |
| `latest-coverage` | homepage | article (mixed) | EXISTS |
| `article-feed` (generalises `plan-and-watch`, `entertainment`, `events-shopping`, `learning`, `landing-featured`, `landing-grid`) | homepage, section | article (mixed, section/type filters) | One component, `layout` = `grid-3` / `grid-4` / `featured+list` / `list` |
| `quick-access` | homepage | navigation `quick-access` | EXISTS |
| `discipline-grid` (from `competition` + landing "Discipline Guides") | homepage, section:competition | discipline (auto, all) | Both of today's hard-coded discipline grids become one block |
| `rodeo-directory` (from `more-rodeo` + `RodeoDirectory`) | homepage, section:rodeo-events | rodeo-hub / rodeo-event | Absorbs the `rodeo-events/page.tsx` append |
| `edition-list` | section:rodeo-events, section:plan-watch | rodeo-edition (upcoming) | PROPOSED; engine already supports `upcoming` |
| `global-block` | all | GlobalBlock by id | PROPOSED slot reference (§3.4) |
| `rich-text-block`, `image-text-block`, `stats-banner`, `cta-banner`, `faq-block` | all page families | static | EXISTS on homepage only; moved to the shared registry |
| `newsletter-signup` | — | — | **Hidden** until a subscription backend exists (Audit §4: UI only) |
| `section-stats` (from `landing-stat-pills`) | section | computed counts | Values computed, labels editable |

The migration maps today's types to the new ones with a script, so existing layouts keep working (§11).

### 3.3 Content Source Engine integration (summary; detail in §6)

A block with `contentSource` capability stores **`props.source`**:

```json
{ "entityType": "article",
  "mode": "mixed",
  "manualIds": ["uuid-a"],
  "limit": 4,
  "filters": { "sectionKey": "plan-watch" },
  "sort": "newest",
  "emptyBehavior": "collapse" }
```

`resolveData` calls `resolveContentSource(normalizeSource(props), ctx.dedup)`. `normalizeSource` also reads the legacy shapes (`featuredIds`, `articleCount`, and the flat `source*` keys via the existing `parseContentSource`), so no layout breaks during migration.

### 3.4 Global Blocks (DECISION)

| Kind of position | Mechanism | Positions |
|---|---|---|
| **Chrome-level** (outside any page body) | Existing `GlobalBlock.placements` (`globalBlockService.ts:14`) | `below-header` (PROPOSED), `footer-top`, `article-end`; `rodeo-hub-top`, `event-detail`, `edition-detail` once those templates use the renderer |
| **Inside a page body** | A `global-block` slot referencing `GlobalBlock.id` | Wherever the slot sits in the page's order |

- The `homepage-top` / `homepage-bottom` placements are converted into `global-block` slots by a data script and then removed from `ALLOWED_PLACEMENTS`. This makes **one** mechanism own each position.
- The Global Block itself (content, schedule, enabled) has one owner: its `GlobalBlock` row. A slot only says *where*.

### 3.5 Preview and public share components (DECISION)

There is no preview-specific renderer. Preview is the real route rendered with `getLayoutForRender` returning draft slots (and draft site config, §9.2) under Next.js `draftMode()`, gated by permission. That mechanism EXISTS [WT] for the homepage in `app/(public)/page.tsx`.

---

## 4. All Six Page Structures

**Conventions**

- **M** = mandatory (the block cannot be deleted or hidden, matching `SectionDef.required`). **O** = optional.
- Counts are defaults; the editor may change them within the limits shown.
- "Section filter" means articles whose `category.name` equals `PRIMARY_SECTIONS[key].categoryKey` (EXISTS: `getPublishedArticlesBySection`, `lib/content.ts`).
- Every article query applies `publicArticleWhere()` (`lib/fixturePolicy.ts`): published, fixtures excluded.
- Copy marked `[PLACEHOLDER]` is a suggestion. Some current defaults are reproduced from the code (e.g. `PlanAndWatchSection.tsx`) and are marked *(current)*.

**SEO baseline for all six pages** (EXISTS unless noted):

| Element | Source |
|---|---|
| `<title>` + meta description | `buildMetadata` (`lib/seo.ts`), from `SectionConfig` / `PRIMARY_SECTIONS` |
| Canonical path | `meta.path` |
| Breadcrumb JSON-LD | `breadcrumbJsonLd` on landings |
| Heading structure | one `<h1>` per page (the hero); each block heading is `<h2>` (PROPOSED: enforce via `PageRenderer`; today `EditorialHero` uses `<h1>` for the lead headline and `SectionHeading` uses `<h2>` ✅) |
| `ItemList` JSON-LD | PROPOSED for feed blocks on landing pages |
| Indexing | No `noindex` on public pages; preview responses are already `X-Robots-Tag: noindex` (EXISTS in `preview/route.ts`) |
| Images | Every rendered image has alt text from article `imageAltText` or block `*Alt` |

### 4.1 Homepage (`/`, `pageKey: homepage`)

**Purpose:** a front page for the whole publication. Lead story, what's new, quick routes, then one feed per editorial section, then evergreen learning.

| # | Block | M/O | Heading (kicker / title) | Editorial purpose | Content & source | Layout | Count | CTA | Empty state |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `editorial-hero` | M | kicker `Lead Editorial Feature` *(current)* | Lead story with cinematic image | Article: manual 1 → else `isLeadHero` → else newest. Secondaries: `isFeatured`, then newest (EXISTS [WT]) | cinematic | 1 + 0–4 secondaries (default 2) | `Read Full Article` *(current)* | Whole page shows "No published coverage yet" (EXISTS) |
| 2 | `latest-coverage` | M | `Latest` / `Latest NFR Coverage` *(current)* | What was published most recently, across all sections | Article, mixed, all sections, newest, dedup vs hero | featured + list | 6 (1–12) | `[PLACEHOLDER] Browse all coverage` → OPEN Q4 (no "all articles" route exists) | Collapse |
| 3 | `quick-access` | O | `Quick Links` / `NFR Quick Access` *(current)* | Fast routes to tickets, schedule and watch guides | NavigationItem `quick-access` | 5-col cards | all visible | per link | Collapse |
| 4 | `article-feed` (Competition) | M | `[PLACEHOLDER] Competition` / `[PLACEHOLDER] Inside the NFR Arena` | Fills today's gap: there is no Competition article feed (Audit §3) | Article, mixed, section `competition` | grid-3 | 3 (1–8) | `[PLACEHOLDER] More competition coverage` → `/competition/` | Show "No Competition articles yet" + link (EXISTS pattern `HomeArticleFeed`) |
| 5 | `discipline-grid` | O | `Competition` / `The Seven NFR Disciplines` *(current)* | Evergreen guides to the 7 events | Disciplines, all, registry order | featured + grid | 7 | per card | Collapse |
| 6 | `article-feed` (Entertainment) | M | `Entertainment` / `NFR Entertainment & Fan Experiences` *(current)* | Concerts, fan events | Article, mixed, section `entertainment` | grid-3 (dark) | 3 | `[PLACEHOLDER] More entertainment` → `/entertainment/` | Empty message + link |
| 7 | `article-feed` (Events & Shopping) | M | `Events & Shopping` / `NFR Events & Cowboy Christmas` *(current)* | Cowboy Christmas, exhibitions | Article, mixed, section `events-shopping` | grid-3 | 3 | → `/events-shopping/` | Empty message + link |
| 8 | `article-feed` (Plan & Watch) | M | `Plan & Watch` / `NFR Plan & Watch` *(current)* | TV/streaming, tickets, travel | Article, mixed, section `plan-watch` | grid-4 | 4 | → `/plan-watch/` | Empty message + link |
| 9 | `article-feed` (More Rodeo) | M | `[PLACEHOLDER] More Rodeo` / `[PLACEHOLDER] Rodeo Beyond the NFR` | Fills the gap: no More Rodeo article feed today | Article, mixed, section `rodeo-events` | grid-3 | 3 | → `/rodeo-events/` | Empty message + link |
| 10 | `rodeo-directory` | O | `More Rodeo` / `More Rodeo: Hubs & Recurring Events` *(current)* | Directory of hubs and events | Hubs (`sortOrder`) + events (`isFlagship`, name) via `listPublicHubs`/`listPublicEvents` | tabs | 6 per tab (PROPOSED limit) | `All rodeo events` → `/rodeo-events/` *(current)* | Per-tab message (EXISTS) |
| 11 | `article-feed` (Evergreen) | M | `Rodeo 101` / `Rules, Formats & Rodeo History` *(current)* | Evergreen explainers | Article, `articleType` ∈ `EVERGREEN_ARTICLE_TYPES` (`lib/content.ts:212`) | grid-4 | 4 | OPEN Q4 | Collapse (EXISTS) |
| — | `global-block`, `rich-text-block`, `image-text-block`, `cta-banner`, `stats-banner`, `faq-block` | O | editor-defined | Campaigns, notices | static / GlobalBlock | — | — | — | — |

**SEO:**
- Title `NFRGuide — Independent Rodeo Editorial & Championship Coverage` *(current, `app/(public)/page.tsx`)*.
- `Organization`/`WebSite` JSON-LD: OPEN Q7, not verified as present today.

### 4.2 NFR Competition (`/competition/`, `pageKey: section:competition`)

**Purpose:** the reference hub for the championship as a sport: disciplines, how scoring works, standings coverage.

| # | Block | M/O | Heading | Purpose | Source | Layout | Count | CTA | Empty state |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `section-hero` | M | `SectionConfig` name / tagline / description | Section identity | `getSectionMeta('competition')` | hero + breadcrumb | — | — | Always renders |
| 2 | `article-feed` (featured) | M | `[PLACEHOLDER] Featured` | The lead competition story | Article, mixed, section `competition`, manual 1 | featured | 1 | `Read Full Story` *(current)* | Collapse; block 5 shows the section empty state |
| 3 | `discipline-grid` | M | `Championship Disciplines` / `NFR Discipline Guides` *(current)* | Entry to each discipline guide | Disciplines | grid-4 | 7 | `Explore Guide` *(current)* | Collapse |
| 4 | `article-feed` (Rules & format) | O | `[PLACEHOLDER] How It Works` / `[PLACEHOLDER] Rules, Scoring & Format` | Evergreen explainers within Competition | Article, section `competition` + `articleType` ∈ Rules & Format, History, Records & Past Winners | grid-3 | 3 | — | Collapse |
| 5 | `article-feed` (all stories) | M | `[PLACEHOLDER] More Competition Stories` | Remaining section coverage | Article, auto, section `competition`, newest, dedup | grid-3 | 9 (3–24) | `View Category Archive` *(current)* → `ROUTES.CATEGORY(key)` | "No NFR Competition articles yet" (EXISTS `ContentEmptyState`) |
| 6 | `section-stats` | O | — | Credibility | Computed count + "Independent" | pills | — | — | Collapse |
| — | `global-block`, `cta-banner`, `rich-text-block`, `faq-block` | O | — | — | — | — | — | — | — |

**SEO:**
- `CollectionPage` + `ItemList` JSON-LD for block 5 (PROPOSED).
- Discipline links use `ROUTES.DISCIPLINE`.

### 4.3 NFR Entertainment (`/entertainment/`)

**Purpose:** fan experiences around the NFR: concerts, watch parties, awards.

| # | Block | M/O | Heading | Source | Layout | Count | CTA | Empty state |
|---|---|---|---|---|---|---|---|---|
| 1 | `section-hero` | M | SectionConfig | `getSectionMeta('entertainment')` | hero | — | — | always |
| 2 | `article-feed` featured | M | `[PLACEHOLDER] Featured` | mixed, section `entertainment`, manual 1 | featured | 1 | `Read Full Story` | collapse |
| 3 | `article-feed` | O | `[PLACEHOLDER] Concerts & Nightlife` | mixed, section `entertainment`, **manual picks** (no verified sub-taxonomy; `subcategory` is a free string; see OPEN Q2) | grid-3 | 3 | — | collapse |
| 4 | `article-feed` all | M | `[PLACEHOLDER] More Entertainment Coverage` | auto, section, dedup | grid-3 | 9 | category archive | section empty state |
| 5 | `section-stats` | O | — | computed | pills | — | — | collapse |

**SEO:** as in §4.2.

### 4.4 NFR Events & Shopping (`/events-shopping/`)

**Purpose:** Cowboy Christmas, Junior NFR, Miss Rodeo America, exhibitions.

| # | Block | M/O | Heading | Source | Layout | Count | CTA | Empty state |
|---|---|---|---|---|---|---|---|---|
| 1 | `section-hero` | M | SectionConfig | `getSectionMeta('events-shopping')` | hero | — | — | always |
| 2 | `article-feed` featured | M | `[PLACEHOLDER] Featured` | mixed, manual 1 | featured | 1 | `Read Full Story` | collapse |
| 3 | `cta-banner` / `global-block` | O | `[PLACEHOLDER] Shopping season guide` | static / GlobalBlock | banner | — | editor | — |
| 4 | `article-feed` all | M | `[PLACEHOLDER] More Events & Shopping Coverage` | auto, section, dedup | grid-3 | 9 | category archive | section empty state |
| 5 | `section-stats` | O | — | computed | pills | — | — | collapse |

**Affiliate links** in this section are governed by the existing monetization module and the `/affiliate-disclosure/` page (route EXISTS). Blocks do not add commercial links of their own (DECISION: preserves the independent editorial identity).

### 4.5 NFR Plan & Watch (`/plan-watch/`)

**Purpose:** practical planning: how to watch, tickets, hotels, travel, venue.

| # | Block | M/O | Heading | Source | Layout | Count | CTA | Empty state |
|---|---|---|---|---|---|---|---|---|
| 1 | `section-hero` | M | SectionConfig | `getSectionMeta('plan-watch')` | hero | — | — | always |
| 2 | `article-feed` featured | M | `[PLACEHOLDER] Start Here` | mixed, manual 1 (e.g. the how-to-watch guide) | featured | 1 | `Read Full Story` | collapse |
| 3 | `edition-list` | O | `[PLACEHOLDER] Upcoming Championship Dates` | rodeo-edition, `upcoming: true` (EXISTS filter), sort `startAt asc` (PROPOSED sort) | list | 3 | `[PLACEHOLDER] Full schedule` → `ROUTES.EDITION_SCHEDULE` | collapse |
| 4 | `article-feed` all | M | `[PLACEHOLDER] All Planning Guides` | auto, section, dedup | grid-4 | 8 | category archive | section empty state |
| 5 | `rich-text-block` | O | `[PLACEHOLDER] Confirm with official sources` | static | text | — | — | — |

**Copy note:** keep the current disclaimer, *"Confirm time-sensitive details with official sources."* (from `PlanAndWatchSection.tsx`), as the section-hero description default.

### 4.6 More Rodeo (`/rodeo-events/`)

**Purpose:** rodeo beyond the NFR: hubs, recurring events, annual editions, plus editorial coverage.

| # | Block | M/O | Heading | Source | Layout | Count | CTA | Empty state |
|---|---|---|---|---|---|---|---|---|
| 1 | `section-hero` | M | SectionConfig | `getSectionMeta('rodeo-events')` | hero | — | — | always |
| 2 | `article-feed` featured | O | `[PLACEHOLDER] Featured` | mixed, section `rodeo-events`, manual 1 | featured | 1 | `Read Full Story` | collapse |
| 3 | `rodeo-directory` | M | `[PLACEHOLDER] Hubs & Recurring Events` | hubs + events (`listPublicHubs`, `listPublicEvents`) | tabs/grid | all | per card | "No recurring events have been added yet." *(current)* |
| 4 | `edition-list` | O | `[PLACEHOLDER] Upcoming Editions` | rodeo-edition, upcoming | list | 6 | → edition page | collapse |
| 5 | `article-feed` all | M | `[PLACEHOLDER] More Rodeo Coverage` | auto, section, dedup | grid-3 | 9 | category archive | section empty state |

**Route handling:** `app/(public)/rodeo-events/page.tsx` stops appending `RodeoDirectory` outside the layout. The directory becomes block 3, so the owner controls its position.

---

## 5. Admin Panel UX Specification

**Navigation (PROPOSED):** *Website & Navigation* stays the sidebar entry (`app/admin/(dashboard)/website/`). Its content becomes:

```
Website
├─ Overview
├─ Pages ─────────── Homepage · Competition · Entertainment · Events & Shopping · Plan & Watch · More Rodeo
│                    (later: Article template · Directories)
├─ Site-wide ─────── Header & Navigation · Footer · Announcements · Global Blocks
└─ History
```

Removed as separate screens:

- **Appearance:** the intro banner moves into the homepage hero block (§7).
- **The Page Builder page-key dropdown:** replaced by the Pages list.
- **System Settings → Sections:** section identity moves into each section page's "Page settings" panel. Storage is still `SectionConfig`.

| # | Screen | Responsibilities | Controls | Workflow |
|---|---|---|---|---|
| 1 | **Website Overview** | One-glance status of everything public | One card per page and per site-wide area: status chip (Published / Draft changes / Never published), last published by/at, "Edit" and "Preview" buttons; list of active announcements and global blocks with their date windows | Click a card → that editor |
| 2 | **Page Management** (Pages list) | Choose which page to edit | Six rows with live URL, status chip, draft-changed-sections count | Click → Page editor |
| 3 | **Homepage Editor** | Edit the homepage's sections | Canvas of sections in real order (drag, ↑↓, hide, duplicate if allowed, delete if optional); chrome positions shown greyed (announcement bar, below-header and footer-top global blocks) with "managed in Site-wide → …" links; right panel tabs **Content** (source, §6), **Text**, **Style/Layout**; status bar: `Saved draft · v12 · 2 changes not published` · Preview ▾ (Desktop/Tablet/Mobile) · Publish | Edit → autosave draft (debounced) or Save → Preview → Publish (with change summary) |
| 4 | **Section Page Editors** (×5) | Same editor, filtered to the `section` family | Plus a **Page settings** panel: display name, tagline, description, hero image, SEO title/description (writes `SectionConfig`, which is drafted; see §9) | Same as above |
| 5 | **Section Library** | Add a section to *this page* | Modal listing blocks allowed for the page family, grouped (Editorial feeds, Directories, Content, Campaign), each with a thumbnail, "max N per page", and "used N times" | Pick → inserted after the selected section with defaults |
| 6 | **Block Library** (reusable content) | Manage reusable Global Blocks | = the Global Blocks screen (#11); in the Section Library the "Global block" entry opens a picker of existing GlobalBlocks | Create once, place in many pages |
| 7 | **Content Source panel** | Decide what content a section shows | Plain-language summary first: *"Shows the 4 newest Plan & Watch articles. 1 pinned."* Then: Mode (Automatic / Hand-picked / Mixed), Pinned items (search + reorder), Filters (section, discipline, rodeo event, edition, featured only, article type), Sort, Count (with min/max shown), If empty (hide section / show message), live result list (first N titles) | Changing a field refreshes the result list through a server action that calls the same engine |
| 8 | **Header & Navigation** | Header links + Quick Access links | List with drag order, label, URL (internal page picker or external), visibility, desktop/mobile flags; draft status bar | Save draft → Preview → Publish (§9) |
| 9 | **Footer** | Identity text, social, link columns | Existing `AdminFooterEditor` fields; columns become the single owner (§7); "Publication Policies" shown as a locked column | Same lifecycle |
| 10 | **Announcements** | Site-wide bar | Existing editor; adds "Preview" (shows disabled or future items in draft preview) and a timeline of date windows | Enable = live; schedule windows |
| 11 | **Global Blocks** | Reusable blocks | Existing editor; adds "Used on" (pages/slots referencing it + chrome placements) | Same |
| 12 | **Appearance** | — | **Removed**: hero style options live in the homepage hero block's Style tab (§7). Future site-wide tokens (logo, colours) would return here if approved (OPEN Q6). | — |
| 13 | **Preview** | See the draft exactly as it will publish | Opens the real URL with draft mode; toolbar: page switcher, Desktop 1280 / Tablet 768 / Mobile 390, "Exit preview", "Publish this page" | §9.2 |
| 14 | **Publishing History** | Audit + rollback | Per area: revision list (version, who, when, note, changed sections), "View" (renders that revision in preview), "Restore to draft" | Restore → becomes the draft → Preview → Publish |

**UX rules (PROPOSED), addressing Audit §15:**

1. Never offer a control that does not affect the public site. This is enforced by the registry contract test (§14).
2. Every editor shows **where** its output appears.
3. A single status vocabulary everywhere: *Saved*, *Draft changes*, *Published*, *Scheduled*.
4. Limits are shown next to inputs (`3 (1–8)`).
5. No technical keys (`template:…`) in the UI.

---

## 6. Content Fetcher Integration Design

### 6.1 Feature map

| Feature | Existing function (verified) | Gap | PROPOSED change |
|---|---|---|---|
| Manual selection | `resolveArticles` manual branch; `manualIds`; order preserved (`contentSourceEngine.ts`) | Returns `ResolvedItem`, not `Article`; one query per entity type | Hydrate articles with `articleInclude` + `toArticle` (`lib/mappers.ts`), e.g. reuse `getPublishedArticlesByIds` [WT] |
| Automatic selection | `fetchAutoArticles` (`orderBy publishedAt desc`) | — | Keep; add sort options |
| Mixed | `mode: 'mixed'` | — | Keep; this matches [WT] `pickedThenAuto` semantics |
| Manual fallback | `fallbackPolicy: 'fill-auto' \| 'hide-missing'` | — | Keep; editor label "If a pinned item is unpublished: fill automatically / leave the gap" |
| Entity types | `article`, `rodeo-hub`, `rodeo-event`, `rodeo-edition`, `competitor`, `venue` (`RESOLVERS`) | `discipline` missing | Add a `discipline` resolver (wrap `getAllDisciplines`) |
| Filter: section | `categoryId` | Sections are keyed by **category name** (`PRIMARY_SECTIONS[*].categoryKey`), not id | Add `sectionKey` → `{ category: { name: categoryKey } }` (same as `getPublishedArticlesBySection`) |
| Filter: discipline / event / edition | `disciplineId` → `ArticleDiscipline`; `rodeoEventId` → `ArticleEvent`; `editionId` → `ArticleEdition` (relations verified in `schema.prisma`) | — | Keep |
| Filter: hub, competitor | relations **exist** (`ArticleHub`, `ArticleCompetitor`) | Not in engine | Add `hubId`, `competitorId` |
| Filter: featured | `featured` → `isFeatured` | — | Keep |
| Filter: article type | none | `articleType` exists on `Article` | Add `articleTypes: string[]` (evergreen feed) |
| Filter: upcoming editions | `upcoming` → `startAt >= now` | Sorted `startAt desc` | Sort `asc` when `upcoming` |
| Filter: venue / related entity | declared (`venueId`, `relatedEntityId`) | unused | Remove from the type until a resolver uses them |
| Sorting | fixed per entity | not configurable | `sort`: `newest` / `oldest` / `manual` / `alphabetical` / `upcoming` / `registry` (disciplines); allowed sorts are declared per entity |
| Item limits | `limit` (default 10) | no clamp | Clamp via block `propsSchema` (the [WT] `numProp` behaviour) |
| Deduplication | `DeduplicationContext`, `resolveMultipleSources` (sequential) | Not page-scoped by policy | One context per page render; per-block `dedup: true` (feeds) / `false` (directories) |
| Published visibility | articles: `workflowStatus: 'PUBLISHED'` only | **Bypasses `publicArticleWhere()`** fixture exclusion; hubs/events/venues have no `publicSlugWhere()` | Apply `publicArticleWhere()` and `publicSlugWhere()` (`lib/fixturePolicy.ts`) in every resolver; hubs ordered by `sortOrder` like `listPublicHubs` |
| Empty behaviour | `emptyBehavior: 'collapse' \| 'placeholder'` | not used by any renderer | `PageRenderer` honours it |
| Preview resolution | — | — | Same engine; preview changes only *which slots* are read, never the entity visibility (drafts of articles are **never** shown in website preview; DECISION) |
| Public resolution | — | — | Same engine |
| Errors | none caught | — | Per-block try/catch → log via existing logger, render nothing (block-level degradation) |
| Performance | one query per block; manual + auto = 2 queries | N+1 not present; sequential awaits | Resolve blocks with `Promise.all` where dedup order allows (hero first, then the rest in parallel with a dedup pass after fetch, as today's [WT] approach does for the hero) |

### 6.2 Admin candidate search

`listFeaturedCandidatesAction` (`app/admin/page-layout-actions.ts`) EXISTS for articles and hubs. PROPOSED: extend it to all engine entity types, with the same visibility filters as the public resolver, so the editor can only pin items that can render.

---

## 7. Single Source of Truth

| Public element | Canonical owner (DECISION) | Removed / redirected duplicate | Migration |
|---|---|---|---|
| Homepage hero | `editorial-hero` slot in `PageLayout('homepage')`, with a `style` prop (`cinematic` default + the 10 `INTRO_BANNER_STYLES` from `siteConfigService.ts`) and optional manual headline/description/CTA for campaign mode | `SiteConfig('appearance')` intro banner and `IntroBanner` rendering in `HomeView` | Script: if `appearance.published.introBannerHeadline` is set, create `editorial-hero` props `{ style, campaign: {...} }` in draft; owner reviews and publishes |
| Section page hero (name, tagline, description, image, SEO meta) | `SectionConfig` (`prisma/schema.prisma:1553`) via `getSectionMeta` | `landing-hero.title/kicker/description/heroImageUrl` props | Script: copy non-empty `landing-hero` values into an empty `SectionConfig`; the block keeps only layout props |
| Homepage section headings (kicker/title/description/CTA) | The block's props (EXISTS [WT]) | — | — (distinct element from the landing hero) |
| Header links | `NavigationItem(location='header')` → drafted as `SiteConfig('navigation').header` | Live-on-save row edits | Script copies rows into the config; `getPublicNavigation` reads published config, with rows as fallback during transition |
| Quick Access links | `SiteConfig('navigation').quickAccess` | `NavigationItem(location='quick-access')` | same |
| Footer link columns | `SiteConfig('footer').columns` | `NavigationItem` `footer-sections` / `footer-academy` and `DIRECTORY_LINKS` appending in `SiteFooter.tsx` | Script seeds columns from the current nav rows + directory links |
| Footer legal column | Code (`config/legalPages.ts`), locked | — | — (legal requirement) |
| Footer identity text | `SiteConfig('footer')` (EXISTS [WT]) | — | — |
| Appearance | None (screen retired) unless OPEN Q6 adds site-wide tokens | — | — |
| Content sourcing | Block `props.source` → `contentSourceEngine` | `featuredIds`/`articleCount` legacy props; page-level fetches in `SectionLandingView` and `HomeView` | `normalizeSource` reads legacy keys; a script rewrites them |
| Global block content | `GlobalBlock` row | — | — |
| Global block position | Chrome: `GlobalBlock.placements`; page body: `global-block` slot | `homepage-top` / `homepage-bottom` placements | Script converts placements → slots |
| `SectionConfig.visible` | **Removed from UI** (never read; Audit §7); section visibility is governed by header navigation + the route | — | — |

**Rule (PROPOSED):** a registry contract test fails if two `SectionDef` props, or a prop and a SiteConfig field, are declared as owning the same public element id (`owns: 'section.hero.title'`).

---

## 8. Rendering Architecture

### 8.1 Files

| File | Role | Status |
|---|---|---|
| `components/blocks/PageRenderer.tsx` | Filters, orders and renders slots; empty behaviour; error boundary per block | PROPOSED |
| `components/blocks/registry.tsx` | `BLOCKS` runtime map | PROPOSED |
| `components/blocks/*Block.tsx` | Thin adapters over the existing components in `components/sections/*` and `components/editorial/*` | PROPOSED (components reused, not rewritten) |
| `lib/cms/blocks/resolvePageData.ts` | Per-request data resolution with dedup | PROPOSED (from [WT] `homepageData.ts`) |
| `lib/cms/sectionRegistry.ts` | Editor metadata + `families` + `propsSchema` | EXISTS; extended |
| `views/HomeView.tsx`, `views/SectionLandingView.tsx` | Replaced by `PageRenderer` | Retired |
| `app/(public)/page.tsx`, `[section]/page.tsx`, `rodeo-events/page.tsx` | Call `getLayoutForRender` → `resolvePageData` → `PageRenderer` | Modified |

### 8.2 Invariants (PROPOSED)

- **R1.** A slot type that is not in `BLOCKS` is skipped and logged. It never crashes the page.
- **R2.** Server-resolved data is the only data a block renders. No block-level `fetch` or `prisma` calls.
- **R3.** Every `editableProps` key of every block offered for a family is consumed by that block's component. Enforced by the contract test.
- **R4.** Exactly one `<h1>` per page, from the hero block.

---

## 9. Preview and Publishing Architecture

### 9.1 Unified lifecycle (PROPOSED)

```
 edit ──▶ Draft (autosave/save, version n+1) ──▶ Preview (draftMode, same renderer) ──▶ Publish
                                                                                      │
                                     WebsiteRevision(scope,key,version,snapshot) ◀────┘
                                                                                      │
                                                           revalidate affected paths ◀┘
 History ──▶ "Restore to draft" (copies snapshot → draft) ──▶ Preview ──▶ Publish
```

| Area | Draft store | Published store | Status |
|---|---|---|---|
| Page layouts | `PageLayout.draftSections` | `PageLayout.publishedSections` | EXISTS |
| Section identity | `SiteConfig('section:<key>')`, a PROPOSED new key whose JSON is mirrored into `SectionConfig` on publish so `getSectionMeta` keeps working | `SectionConfig` | PROPOSED, no schema change; `SITE_CONFIG_KEYS` extended (`siteConfigService.ts:14`) |
| Navigation (header + quick access) | `SiteConfig('navigation').draft` | `.published` | PROPOSED, no schema change |
| Footer | `SiteConfig('footer')` | | EXISTS |
| Announcements, Global Blocks | Row with `enabled=false` or a future `startsAt` | Row with `enabled=true` in window | EXISTS; DECISION in §9.4 |

### 9.2 Preview (PROPOSED, extends [WT])

- **Entry:** `GET /admin/website/preview?pageKey=…`. It checks `requireUser` + permission, calls `draftMode().enable()`, and renders the wrapper with a device toolbar (iframe widths 1280/768/390).
- **`getLayoutForRender(pageKey)`:** if `draftMode().isEnabled` **and** `userHasPermission(getCurrentUser(), 'website.edit')`, it returns draft sections; otherwise published. The [WT] `isStaffDraftPreview` in `app/(public)/page.tsx` becomes this shared helper.
- **Site config in preview:** `getSiteConfigForRender(key)` does the same, so footer and navigation drafts are visible in preview.
- **Announcements and blocks:** the preview also shows disabled or future items, each with a "DRAFT" badge.
- **Targets:** `pageKeyToUrl` (`preview/route.ts:73`) is replaced by a registry entry `previewPath` per page key. Templates use a real sample slug chosen by the editor.
- **Bar and exit:** a persistent preview bar (EXISTS [WT] on the homepage) on every page, with **Exit preview** (`?exit=1`, EXISTS [WT]).

### 9.3 Revisions and rollback (PROPOSED)

- **New model `WebsiteRevision`** (§11). Written in the same transaction as publish.
- **Rollback** never writes `published` directly. It restores into draft, so a rollback always goes through preview and RBAC.
- **Retention:** last 50 revisions per (scope, key). Older ones are pruned by the publish transaction. OPEN Q5.

### 9.4 DECISION: announcements and global blocks keep row-level "enabled" semantics

These are operational, time-windowed items (`startsAt`/`endsAt` EXIST), much like scheduled articles. Forcing them into whole-document drafts would make "turn off this banner now" a multi-step action. They get preview visibility and history (a revision row written on each change), but **no** separate draft copy.

### 9.5 Cache revalidation (PROPOSED; replaces the blanket `rev()` in `page-layout-actions.ts:9`)

| Event | Revalidate |
|---|---|
| Draft save (any) | `/admin/website/` only |
| Publish `homepage` | `/` |
| Publish `section:<key>` | `PRIMARY_SECTIONS[key].path` |
| Publish footer / navigation | `revalidatePath('/', 'layout')` (chrome on every page) |
| Announcement / global block change | `revalidatePath('/', 'layout')` (EXISTS) |
| Section identity publish | the section path + `/` (header and metadata) |

---

## 10. Security and Concurrency

### 10.1 RBAC (verified current state)

- `system.config` is granted only to `super_admin` (`lib/auth/rbac.ts`, `ROLE_PERMISSIONS`).
- `navigation.manage` is granted to administrator and super_admin.
- So administrators can edit navigation but **cannot** open the Page Builder, Footer, Announcements or Global Blocks today.

**PROPOSED:** add two permissions in `lib/auth/rbac.ts`. This is code only, with no schema change.

| Permission | Allows | Default roles |
|---|---|---|
| `website.edit` | Save drafts, use preview | super_admin, administrator (OPEN Q1: editor?) |
| `website.publish` | Publish, rollback | super_admin, administrator |

`system.config` stays for non-website system settings. Every `app/admin/*-actions.ts` for website areas switches its `requireActor` permission accordingly, and services re-check (existing `need()` pattern).

### 10.2 Optimistic concurrency (PROPOSED; uses existing columns)

- `PageLayout.version` and `SiteConfig.version` EXIST (`schema.prisma:1606`, `:1673`). Today `PageLayout.version` is unused and `SiteConfig.version` is only incremented.
- **Save:** `saveDraft(actor, { pageKey, sections, expectedVersion })` → `updateMany({ where: { pageKey, version: expectedVersion }, data: { …, version: { increment: 1 } } })`. If 0 rows are updated, throw `ServiceError('conflict')`.
- **Publish** takes `expectedVersion` too, so you publish exactly the draft you previewed.
- **Editor on conflict:** a dialog: "Updated by *X* at *time*. Reload their version / Overwrite with mine (requires `website.publish`) / Copy my changes" (the last keeps the local JSON in `localStorage` for manual merge).
- **Presence (optional, OPEN Q3):** show "*X* is editing this page" via a lightweight `updatedById`/`updatedAt` poll. No new table.

### 10.3 Validation (PROPOSED)

- A per-block zod `propsSchema` in the registry replaces the generic string loop in `validateSectionTypes` (`pageLayoutService.ts:29`).
- Unknown props are rejected.
- URLs are validated by the existing rule (`/…` or `http(s)://…`, no `javascript:`).
- Manual IDs are checked to exist **and be publicly visible** at save time, as a warning rather than a hard failure, because items may be published later.

### 10.4 Reliability

- `getPublishedSections` / `getDraftSections` log fallbacks instead of failing silently (Audit §17).
- Per-block error isolation in `PageRenderer`.
- `ensureSlotIds` is applied at save time only, so slot IDs are stable.

---

## 11. Database Impact

| Change | Type | Batch |
|---|---|---|
| `model WebsiteRevision { id uuid PK; scope String; key String; version Int; snapshot Json; note String?; publishedById String?; publishedAt DateTime @default(now()); @@unique([scope, key, version]); @@index([scope, key, publishedAt]) }` | **New table** (additive migration) | D |
| `SiteConfig` new keys `navigation`, `section:<key>` | Data only (`key` is a free string id; extend `SITE_CONFIG_KEYS` + zod schemas) | D |
| Existing `PageLayout.version`, `SiteConfig.version` | Start using them; no column change | F |
| `PageLayout.scheduledSections` / `scheduledAt` | Unused; keep for an optional scheduled-publish batch (OPEN Q8) | — |
| `NavigationItem` | Kept read-only as a fallback during transition; drop later (separate approval) | D (+ later) |
| `GlobalBlock.placements` values `homepage-top/bottom` | Data script → `global-block` slots | A |
| Legacy slot props (`featuredIds`, `articleCount`, `landing-*` types) | Data script → `props.source`, new block types | A/B |

All data scripts are **idempotent**, run against the draft first, and print a diff. Published data changes only when an editor publishes, except the `NavigationItem` → `SiteConfig('navigation')` seed, which seeds both draft and published with identical content so the public site does not change.

---

## 12. Implementation Batches

**Dependency-driven order:** **0 → A → B → E → F → D → C → G**.

- Preview (E) depends only on A's `getLayoutForRender`, so it comes early.
- Concurrency (F) must exist before the unified publishing UI (D) and the page-oriented admin (C), which both surface conflicts and history.
- C comes last among the feature batches, because it is the UI over A, B, D and F.

### Batch 0 — Land the working-tree fixes

| | |
|---|---|
| Files | The [WT] files in Audit §1.1 |
| DB | none |
| Acceptance | `tsc` clean; full Vitest green (558 at audit time); manual homepage prop check |
| Rollback | Revert the commit |

### Batch A — Public rendering corrections (shared renderer)

| | |
|---|---|
| **Modify** | `app/(public)/page.tsx`, `app/(public)/[section]/page.tsx`, `app/(public)/rodeo-events/page.tsx`, `lib/cms/sectionRegistry.ts` (families, new types, hide dead keys from `KNOWN_PAGE_KEYS` UI list), `lib/cms/pageLayoutService.ts` (`getLayoutForRender`, logging), `components/sections/*` (props in, no fetching), `components/editorial/SectionLandingHero.tsx` (image), `views/ArticleView.tsx` (`detail-related.title`, use `faqVisible`), `components/editorial/RelatedArticles.tsx` |
| **New** | `components/blocks/PageRenderer.tsx`, `components/blocks/registry.tsx`, `components/blocks/*Block.tsx`, `lib/cms/blocks/resolvePageData.ts`, `scripts/migrate-layout-blocks.mts` (legacy types → new types; homepage-top/bottom placements → slots; appearance → hero style; landing-hero → SectionConfig) |
| **Retire** | `views/HomeView.tsx` (`renderPremiumBlock` moves to blocks), `views/SectionLandingView.tsx`, `lib/cms/homepageData.ts` (folded into `resolvePageData`) |
| **DB** | none (data script only) |
| **Depends on** | Batch 0 |
| **Acceptance** | (1) The five landings render slots in saved order; reordering in admin changes public order. (2) `rich-text-block` / `cta-banner` render on landings. (3) The landing grid honours count. (4) The landing hero image renders from `SectionConfig.heroImage`. (5) The More Rodeo directory is positioned by its slot. (6) The homepage is visually unchanged after migration (screenshot diff). (7) No `template:*` key without a renderer appears in admin. |
| **Tests** | Render tests: fixture layout → `resolvePageData` + `PageRenderer` → assert headings, order and counts in output; registry contract test (R3); migration script test on fixture JSON |
| **Rollback** | Code revert; the data script writes drafts only and keeps a JSON backup of every touched row (`docs/` or a table dump) |

### Batch B — Content Source Engine integration

| | |
|---|---|
| **Modify** | `lib/cms/contentSourceEngine.ts` (Article hydration, `sectionKey`/`hubId`/`competitorId`/`articleTypes` filters, sorts, visibility via `lib/fixturePolicy.ts`, `discipline` resolver, error isolation), `lib/content.ts` (share `articleInclude` query helpers), `lib/cms/sectionRegistry.ts` (`contentSource` capability + `propsSchema`), `app/admin/page-layout-actions.ts` (`listFeaturedCandidatesAction` for all entities, new `previewSourceAction`), `views/admin/AdminPageLayoutEditor.tsx` (Content panel) |
| **New** | `lib/cms/blocks/normalizeSource.ts`, `views/admin/website/ContentSourcePanel.tsx` |
| **DB** | none |
| **Depends on** | A |
| **Acceptance** | Each feed block supports Automatic, Hand-picked and Mixed; filters by section, discipline, event, edition, hub, competitor, featured and type; sort; count clamped; dedup across the page; fixtures never appear publicly; an unpublished pinned item follows `fallbackPolicy` |
| **Tests** | DB-integration tests on the isolated test DB (pattern of `tests/batchA.test.ts`): seed articles/relations → assert resolver output per mode/filter/sort; dedup test across two blocks; visibility test with a fixture slug |
| **Rollback** | Code revert; `normalizeSource` keeps legacy props readable, so layouts saved in B still render after revert only if their legacy keys remain. The editor writes both `source` and legacy keys during B, and drops the legacy keys in G. |

### Batch E — Preview and mobile experience

| | |
|---|---|
| **Modify** | `app/admin/(dashboard)/website/preview/route.ts` (registry-driven `previewPath`, device toolbar), `lib/cms/pageLayoutService.ts` / `lib/cms/siteConfigService.ts` (`getSiteConfigForRender`), `app/(public)/layout.tsx` (footer draft in preview), `components/PublicChrome.tsx` (preview bar on all pages), `lib/cms/announcementService.ts` / `globalBlockService.ts` (preview variants) |
| **New** | `lib/cms/preview.ts` (`isStaffPreview()` shared helper) |
| **DB** | none |
| **Depends on** | A |
| **Acceptance** | Preview shows the draft for each of the six pages, plus footer/nav drafts; the public (logged-out) view of the same URL shows published; device widths 1280/768/390 work; exit preview restores public view |
| **Tests** | Playwright: login → change a title in draft → preview shows it → logged-out context shows old → publish → logged-out shows new (extend `e2e/page-builder.spec.ts`) |
| **Rollback** | Code revert; no data |

### Batch F — Concurrency and reliability

| | |
|---|---|
| **Modify** | `lib/cms/pageLayoutService.ts` (`saveDraft`, `publishLayout` with `expectedVersion`), `lib/cms/siteConfigService.ts` (same), `app/admin/page-layout-actions.ts`, `app/admin/site-config-actions.ts` (conflict result), `views/admin/AdminPageLayoutEditor.tsx`, `AdminFooterEditor.tsx` (conflict dialog), `lib/auth/rbac.ts` (`website.edit`, `website.publish`), all website `*-actions.ts` permission checks |
| **DB** | none (existing `version` columns) |
| **Depends on** | A |
| **Acceptance** | Two sessions editing one page: the second save gets a conflict and no data is lost; publish with a stale version is rejected; administrators can edit/publish per the role matrix; `RBAC_PERMISSION_MATRIX.md` (referenced in `rbac.ts`) updated |
| **Tests** | Service tests with concurrent `Promise.all` saves (pattern of `tests/batch17-concurrency.test.ts`); RBAC unit tests per role |
| **Rollback** | Code revert; `version` values remain valid |

### Batch D — Unified publishing (revisions, navigation drafts, single footer owner)

| | |
|---|---|
| **Modify** | `prisma/schema.prisma` (+`WebsiteRevision`), `lib/cms/pageLayoutService.ts` / `siteConfigService.ts` (write revision in the publish transaction; restore-to-draft), `lib/cms/navigationService.ts` (`getPublicNavigation` reads `SiteConfig('navigation').published`, rows as fallback), `components/SiteFooter.tsx` (columns only from config; remove nav-column + `DIRECTORY_LINKS` merge), `app/admin/*-actions.ts` (scoped revalidation §9.5), `lib/cms/announcementService.ts`, `globalBlockService.ts` (revision row on change) |
| **New** | Migration `prisma/migrations/<ts>_website_revisions/`, `lib/cms/revisionService.ts`, `app/admin/revision-actions.ts`, `scripts/seed-navigation-config.mts`, `scripts/seed-footer-columns.mts` |
| **DB** | +1 table (additive) |
| **Depends on** | F |
| **Acceptance** | Every publish creates a revision; restore-to-draft → preview → publish reproduces the old public output; nav and footer edits are invisible publicly until published; public nav/footer unchanged immediately after the seed scripts |
| **Tests** | DB-integration: publish ×3 → restore v1 → publish → equals v1; seed scripts idempotent; public render of footer before and after seeding identical |
| **Rollback** | The migration is additive (the table can stay unused); navigation falls back to `NavigationItem` rows if the config is absent; keep rows until G sign-off |

### Batch C — Page-oriented Admin UX

| | |
|---|---|
| **Modify** | `app/admin/(dashboard)/website/page.tsx` (load per-page status), `views/admin/AdminWebsitePage.tsx` (new IA §5), `views/admin/AdminPageLayoutEditor.tsx` (split into page editor + panels; remove page-key dropdown; status bar; limits shown; greyed chrome positions), `views/admin/AdminWebsiteNavPage.tsx`, `AdminFooterEditor.tsx`, `AdminAnnouncementsEditor.tsx`, `AdminGlobalBlocksEditor.tsx` ("used on"), `views/admin/AdminSettingsPage.tsx` (remove the Sections panel → page settings), sidebar entry unchanged |
| **New** | `views/admin/website/WebsiteOverview.tsx`, `PagesList.tsx`, `PageEditor.tsx`, `SectionLibraryModal.tsx`, `PageSettingsPanel.tsx`, `PublishBar.tsx`, `HistoryPanel.tsx` |
| **Remove** | `AdminAppearanceEditor.tsx` (after A's migration and owner sign-off) |
| **DB** | none |
| **Depends on** | B, D, E, F |
| **Acceptance** | The owner can answer the brief's seven questions from one screen per page (manual walkthrough script in `docs/`); no control without public effect (contract test); keyboard and screen-reader access consistent with the existing admin accessibility work (commit `80f633b`) |
| **Tests** | Playwright flows per page: add section, configure source, preview desktop/mobile, publish, view history, restore; axe checks if already used in `e2e/` |
| **Rollback** | Feature flag `WEBSITE_ADMIN_V2` (env) toggles the old/new `AdminWebsitePage` during transition |

### Batch G — Full regression and release

| | |
|---|---|
| Work | Remove legacy prop keys and the transition fallbacks (`NavigationItem` read path, legacy `normalizeSource` branches) after sign-off; replace remaining source-string tests in `tests/batch31/32/33-unit.test.ts` with render or contract tests; full Vitest + Playwright; visual screenshot pass of six pages at 3 widths; production data-script dry run on a staging copy |
| DB | Optional follow-up migration to drop `NavigationItem` (separate approval) |
| Acceptance | All suites green; zero 🖼️ "UI only" rows left from the Audit §7 inventory; owner sign-off |
| Rollback | Each prior batch is independently revertible; G only removes fallbacks after a release cycle |

---

## 13. Acceptance Criteria (global)

1. **One renderer.** Homepage and the 5 section pages render through `PageRenderer`. No page has its own slot-lookup helper.
2. **No dead controls.** Every control in Website admin changes public output (contract test + Audit §7 inventory cleared).
3. **Content.** Every feed block supports manual / automatic / mixed with section filtering; public output never includes unpublished or fixture content.
4. **One owner.** Every public element in §7 has exactly one owner.
5. **Lifecycle.** Layouts, section identity, navigation and footer follow Draft → Preview → Publish → Revision; announcements and global blocks follow §9.4.
6. **Preview fidelity.** The preview of a page equals its post-publish public HTML, apart from the preview bar (asserted in e2e by comparing headings and section order).
7. **Devices.** Preview available at 1280 / 768 / 390.
8. **Safety.** Concurrent edits never silently overwrite; RBAC per §10.1; every publish is audited (`audit()`) and versioned.

---

## 14. Testing Strategy

| Layer | What | Where |
|---|---|---|
| Registry contract | Each block offered for a family has a runtime entry; every `editableProps` key is consumed (via a typed `usesProps` list on the block runtime); no two owners per element | `tests/website-contract.test.ts` (new) |
| Render | Fixture layouts → `resolvePageData` (mocked engine) → `PageRenderer` via `react-dom/server` → assert order, headings, counts, empty behaviour | `tests/website-render.test.tsx` (new) |
| Engine | Modes, filters, sorts, dedup and visibility against the isolated test DB | `tests/content-source.test.ts` (new; DB pattern from `tests/batchA.test.ts`) |
| Services | Concurrency, revisions, rollback, RBAC | DB-integration tests |
| E2E | Draft → preview (logged-in) vs public (logged-out) → publish → history → restore; device widths | `e2e/page-builder.spec.ts`, `e2e/page-layout.spec.ts` (extend) |
| Visual | Screenshots of six pages × 3 widths before and after each batch | Playwright `toHaveScreenshot` |
| Regression gate | `tsc --noEmit`, full Vitest, Playwright, CI skip gate (existing `REQUIRE_DB_TESTS` in CI) | `.github/workflows/ci.yml` |

**Policy:** new website tests must assert on behaviour (rendered output or DB state), not on source text.

---

## 15. Risks and Open Decisions

### Risks

| Risk | Mitigation |
|---|---|
| Visual regressions when views are replaced by blocks | Screenshot baselines before A; blocks wrap existing components unchanged |
| Data scripts altering live content | Draft-only writes, JSON backups, idempotency, staging dry run |
| Admin downtime during the UX swap | `WEBSITE_ADMIN_V2` flag (Batch C) |
| Cache staleness after scoped revalidation | E2E publish test asserts the logged-out view updates; fall back to layout-wide revalidation if a path is missed |
| Query load from more configurable blocks | Per-block limits clamped; one query per block; `Promise.all`; ISR unchanged (`revalidate` 60/300) |
| Scope creep into a free-form builder | Block families and mandatory blocks are fixed per page (§4); no arbitrary pages |
| Disk space on the dev machine (D: had ~0.1 GB free during the audit; Turbopack cache writes failed) | Clear `.next` and free space before Batch A |

### Open decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | Should **editors** get `website.edit` (draft + preview only, no publish)? | Yes for drafts, no for publish |
| Q2 | Sub-topics within a section (e.g. "Concerts" in Entertainment): use free-text `Article.subcategory`, `ArticleTag`, or manual picks only? | Manual picks now; tags-based filter later (relation `ArticleTag` exists, not yet analysed) |
| Q3 | Show "someone else is editing" presence? | Optional, after F |
| Q4 | Where do "Browse all coverage" / evergreen CTAs go? There is no `/latest/` or evergreen index route; `/categories/[slug]/` and `/search/` exist. | Link to `/search/` for now; a `/latest/` route is a separate IA decision |
| Q5 | Revision retention | 50 per page/area |
| Q6 | Keep an Appearance screen for site-wide tokens (logo, accent colour)? | Not now |
| Q7 | Add `Organization`/`WebSite` JSON-LD on the homepage? | Yes (low risk; verify current `lib/seo.ts` output first) |
| Q8 | Scheduled publishing for layouts (`PageLayout.scheduledAt` exists) — needs a scheduler | Defer until after G |
| Q9 | Approve dropping the Appearance intro banner as a separate feature (it becomes a hero *style*)? | Yes |
| Q10 | Approve `SiteConfig('navigation')` replacing live `NavigationItem` editing? | Yes |

---

### Appendix — Verified references used

`app/(public)/page.tsx` · `app/(public)/[section]/page.tsx` · `app/(public)/rodeo-events/page.tsx` · `app/(public)/layout.tsx` · `views/HomeView.tsx` · `views/SectionLandingView.tsx` · `views/ArticleView.tsx` · `lib/cms/homepageData.ts` [WT] · `lib/cms/sectionRegistry.ts` (`SectionSlot`, `SectionDef`, `KNOWN_PAGE_KEYS`, `getPageFamily`) · `lib/cms/pageLayoutService.ts` (`validateSectionTypes`, `getPublishedSections`, `getDraftSections`, `saveDraft`, `publishLayout`) · `app/admin/page-layout-actions.ts` (`rev`, `listFeaturedCandidatesAction`) · `app/admin/(dashboard)/website/preview/route.ts` (`pageKeyToUrl`) · `lib/cms/contentSourceEngine.ts` (`resolveContentSource`, `resolveMultipleSources`, `parseContentSource`, `DeduplicationContext`, `RESOLVERS`) · `lib/content.ts` (`getPublishedArticlesBySection`, `getEvergreenArticles`, `EVERGREEN_ARTICLE_TYPES`, `getSectionMeta`) · `lib/rodeoContent.ts` (`listPublicHubs`, `listPublicEvents`) · `lib/fixturePolicy.ts` (`publicArticleWhere`, `publicSlugWhere`) · `lib/cms/siteConfigService.ts` (`SITE_CONFIG_KEYS`, `FooterConfig`, `INTRO_BANNER_STYLES`, `publishConfig`) · `lib/cms/sectionConfigService.ts` · `lib/cms/navigationService.ts` (`getPublicNavigation`) · `lib/cms/globalBlockService.ts` (`ALLOWED_PLACEMENTS`) · `lib/cms/announcementService.ts` · `components/SiteFooter.tsx` · `lib/auth/rbac.ts` (`ROLE_PERMISSIONS`, `system.config`, `navigation.manage`) · `config/routes.ts` (`PRIMARY_SECTIONS`, `ROUTES`) · `prisma/schema.prisma` (`Article` relations `ArticleDiscipline`/`ArticleEvent`/`ArticleEdition`/`ArticleHub`/`ArticleCompetitor`; `PageLayout`, `SiteConfig`, `SectionConfig`, `NavigationItem`, `Announcement`, `GlobalBlock`).
