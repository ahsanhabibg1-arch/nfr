# Stage 02 — Controlled Hybrid Website Builder Architecture

**Stage:** 02 of 10 (max 12) · **Date:** 2026-11-09 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10`
**Status:** proposed architecture for owner evaluation. **Not approved. Not implemented.** No application code was modified.

Companion documents: `STAGE_02_BLOCK_AND_PAGE_COVERAGE.md` (inventory), `STAGE_02_DECISION_REGISTER.md` (approvals), `STAGE_02_IMPLEMENTATION_ROADMAP.md` (Stages 03–10).

---

## 1. Governing principle

**Improve the existing Builder in place. Replace nothing that works.**

The platform already has: a central renderer, a 27-type registry, per-page JSON layout storage with draft/published columns, a working draft-preview iframe for all 15 page keys, revisions, scheduled publishing, complete audit logging, a genuinely centralised SEO layer, and default-deny RBAC. The remaining work is to **connect what is disconnected**, **enforce what is advertised**, and **make the canvas visual**.

### 1.1 Three stale blueprint claims — corrected

The historical Website Experience Architecture Blueprint describes a worse starting point than exists at HEAD. It declares itself *"PLANNING ONLY — awaiting owner approval"* on a baseline four commits behind HEAD, so its "current state" assessments are stale by construction. Three specifically:

| Blueprint claim | Status at HEAD | Evidence |
|---|---|---|
| "four copied `getSlot`/`slotProp` helpers" must be replaced | **[STALE]** — already gone | `getSlot` / `slotProp` return **zero** matches repo-wide |
| "homepage-only `renderPremiumBlock`" must be replaced | **[STALE]** — already gone | zero matches repo-wide |
| No central renderer exists | **[STALE]** — one exists and is used by all four families | `components/blocks/PageRenderer.tsx:12`; consumed by `HomeView`, `SectionLandingSlots`, `ArticleAppendageSlots`, `DirectorySlots` |

A fourth refinement, found in Stage 02: the audit's "two incompatible block prop contracts" overstates the problem. **The interface is already uniform** — `BlockProps { slot, data }` (`components/blocks/blockProps.ts:3-6`), and every block receives both. Only *consumption* diverges. Unification needs no interface change.

**Consequence for planning:** the Builder is one architectural step from its goal, not four. Stage 04 and Stage 06 are cheaper than the Blueprint implies.

---

## 2. Controlled Hybrid Management — the boundary

The defining question this architecture answers is **who owns each piece of what a visitor sees**. One owner per element, enforced by test.

### 2.1 Three ownership domains

| Domain | Owns | Authoritative store | Never owns |
|---|---|---|---|
| **Structured CMS** | Factual editorial records: articles, disciplines, hubs, events, editions, competitors, venues, sessions, results, standings, categories, tags, authors, sources, entity relationships, editorial status | the entity's own Prisma model | page composition, section order, presentation copy |
| **Visual Builder** | Page *presentation*: which approved sections appear, their order and visibility, duplication where valid, presentation copy, images, CTAs, layout variants, and **which records a section selects** (by reference, never by copy) | `PageLayout.draftSections` / `publishedSections` | the records themselves |
| **SEO Intelligence** | Metadata resolution and indexing policy: title, description, canonical, robots, OG/Twitter, JSON-LD, sitemap eligibility | `EntitySeo`, `ArticleSeo`, `SeoConfig` + `lib/seo/*` | block content; page composition |

### 2.2 The non-duplication rule

**The Builder stores references, never copies.** A content-bearing slot persists only entity **ids** plus selection parameters. It never persists a title, excerpt, image URL or date belonging to an entity.

This is already how the working blocks behave — `featuredIds` holds ids and the resolver fetches live records — and it must become an enforced invariant rather than a convention, because it is what guarantees that correcting a typo in an article corrects it everywhere the article appears.

**Permitted in slot props:** entity ids; counts, filters, sort keys, limits; presentation copy that belongs to the *page* and not to any entity (a section kicker, heading, description, CTA label and URL); media references chosen for the *page*; layout variant flags.

**Forbidden in slot props:** any field mirrored from an entity. Enforced by a Stage 04 contract test that fails if a slot prop key matches an entity field name on a content-bearing block.

### 2.3 Where the boundary is currently violated

| Violation | Location | Resolution |
|---|---|---|
| Homepage hero owned twice — `editorial-hero` slot **and** `AppearanceConfig` intro banner (21 `introBanner*` fields) | `lib/cms/sectionRegistry.ts` vs `lib/cms/siteConfigService.ts` | slot wins; **migrate the 21 stored fields first** — decision D-06 |
| Footer columns owned twice — `SiteConfig('footer').columns` silently *replaces* `NavigationItem` columns | `components/SiteFooter.tsx` | one owner; migrate the other's rows — decision D-05 |
| Section identity owned twice — `SectionConfig` vs `landing-hero` props | `lib/content.ts` vs registry | `SectionConfig` owns identity; `landing-hero` owns presentation only |
| Category copy comes from a code constant, not the entity | `Category.description` written but never rendered | consume the entity field |

---

## 3. Target rendering architecture

### 3.1 Current pipeline, and the five changes proposed

```
CURRENT                                          PROPOSED
Admin editor (block list)                        Admin editor (live canvas)   ← change 1
  ↓ saveDraftAction → rev() flushes whole site     ↓ saveDraftAction, scoped  ← change 2
PageLayout.draftSections (JSON)                  unchanged
  ↓ isStaffDraftPreview()                          unchanged
FOUR resolvers, each filtering + sorting         four resolvers, data only    ← change 3
  ↓                                                ↓
PageRenderer ('use client', no filter/sort)      PageRenderer: filters,
                                                 sorts, logs unknown types    ← change 4
  ↓ blockRegistry (23 of 27 types)                 ↓ registry covers all types ← change 5
Block components: some ignore slot.props         all consume their declared props
  ↓                                                ↓
Public HTML                                      Public HTML
```

### 3.2 Change 1 — the canvas becomes the real page

**Reuse, do not rebuild.** `app/admin/(dashboard)/website/preview/route.ts` already enables `draftMode()` behind a permission check and returns a document embedding an iframe of the real draft page, with per-template sample entity URLs for all 15 keys. The Blueprint's own rule applies: *"There is no preview-specific renderer."*

Proposed mechanism:

1. Each block component emits `data-slot-id="<slot.id>"` on its outermost element. One attribute; no layout impact.
2. The Builder embeds the existing preview route as the centre panel, parameterised by `pageKey`.
3. The iframe posts `{ type: 'slot:select', slotId }` to the parent on click; the parent selects the matching slot in the properties panel.
4. The parent posts `{ type: 'slot:highlight', slotId }` back; the iframe applies an outline to the matching element.
5. On a successful draft save, the parent triggers a scoped iframe reload.

**Security constraints.** The iframe is same-origin and currently `sandbox="allow-same-origin allow-scripts"`. `postMessage` must validate `event.origin` against the site origin and ignore everything else. The highlight script must set no HTML from message data — only a CSS class on an element matched by `data-slot-id`. This matters because block props are admin-authored and prop sanitisation is currently weak (§7.3).

**Explicitly rejected alternative:** a second "editor-mode" renderer that approximates the page. It would drift from production output, double the rendering surface, and reintroduce exactly the duplication this architecture removes.

### 3.3 Change 3+4 — visibility and ordering move into the renderer

Today each of the four resolvers independently filters `visible` and sorts `order`, and `PageRenderer` applies neither — so the same rule is implemented four times and guaranteed nowhere.

Proposed: `PageRenderer` becomes the single place that filters hidden slots and sorts by `order`. Resolvers return data only. Three consequences: the rule is tested once instead of four times; a resolver bug can no longer silently reorder one family; and the renderer gains the natural home for the unknown-type log.

`PageRenderer` must also **log** an unrecognised `sectionType` rather than returning `null` silently, and wrap each block in an error boundary so one failing block renders nothing instead of taking down the page.

**Server-component question.** The Blueprint calls for a *server-side* renderer; `PageRenderer` is `'use client'` because four blocks use `useRouter`. Converting requires lifting those to plain `<Link>`. The three other block files are already server-compatible. **Recommendation: defer this to Stage 07** — it is an optimisation, not a correctness fix, and doing it alongside the canvas work in Stage 06 would entangle two risky changes.

### 3.4 Change 5 — the registry becomes authoritative

**Invariant R3:** every `editableProps` key of every block offered for a page family is consumed by that block's renderer. Enforced by a parameterised contract test (Stage 03), not by convention.

Two structural fixes support it:

- **Resolver allowlists become registry-driven.** Today `resolveAppendageSlots` emits only `detail-related` and `detail-cta`, and `resolveDirectorySlots` only the directory pair — so a visible, saved, schema-valid block silently vanishes. The registry, not the resolver, must decide what a family can render.
- **One definition per block type.** `rich-text-block` and `cta-banner` are each defined twice with divergent `maxInstances`, and first-wins dedup means the homepage limits silently apply on landing pages. Replace with a single definition carrying a `families: string[]` field.

---

## 4. Admin UI specification

Reuses the established NFRGuide identity — the existing admin surface already uses `#0F1115` / `#1E293B` with `#D4A757` as the accent, and `AdminPageHeader`, `AdminModal` and `MediaPicker` are reused as-is. **No new brand theme.**

### 4.1 Desktop layout (≥1280px)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TOOLBAR                                                                      │
│ ‹ Website   Homepage ▾   ● Draft changes    [▭ ▯ ▪]   History  Preview ↗     │
│                                              Save Draft   [Publish]          │
├──────────────┬──────────────────────────────────────────┬────────────────────┤
│ STRUCTURE    │ LIVE CANVAS                              │ PROPERTIES         │
│ 280px        │ fluid                                    │ 320px              │
│              │                                          │                    │
│ Page ▾       │  ┌────────────────────────────────────┐  │ Editorial Hero     │
│ ─────────    │  │                                    │  │ ───────────────    │
│ ⠿ Hero    M  │  │   real draft page in iframe        │  │ Content│Layout│SEO │
│ ⠿ Quick…  ●  │  │   (existing preview route)         │  │                    │
│ ⠿ Latest  ●  │  │                                    │  │ Featured articles  │
│ ⠿ Plan…   ○  │  │   selected section outlined        │  │ [picker]           │
│ ⠿ Compet. ●  │  │   in accent #D4A757                │  │                    │
│              │  │                                    │  │ Kicker             │
│ + Add block  │  └────────────────────────────────────┘  │ [____________]     │
│              │                                          │ ⓘ help text        │
│              │                                          │                    │
│              │                                          │ Content source     │
│              │                                          │ Auto · Picked ·    │
│              │                                          │ Mixed              │
└──────────────┴──────────────────────────────────────────┴────────────────────┘
```

**Left — Structure.** Page selector using friendly labels from `PAGE_KEY_LABELS` — **never** raw keys like `template:rodeo-hub`. Ordered section list with drag handle, visibility toggle, and an `M` marker for mandatory (`required`) blocks whose remove and hide controls are disabled with a tooltip explaining why. Per-row actions: duplicate (only when `duplicatable`), remove (unless `required`). "Add block" opens the family's available types grouped by category, with any type at its `maxInstances` shown disabled and labelled. Clicking empty space clears the selection.

**Centre — Live Canvas.** The real draft page via the existing preview route. Click-to-select by `data-slot-id`; the selected section receives an accent outline and a small floating label. Device widths are applied to the iframe container, not by re-rendering: desktop 1280, tablet 768, mobile 390. A scoped reload follows a successful save, preserving scroll position where possible. When a page family has no slot-driven layout, the canvas renders the page read-only with an explicit banner — "This page's layout is managed by its template; sections below the article are editable" — rather than implying control that does not exist.

**Right — Properties.** Three tabs: **Content** (copy, media, CTA), **Layout** (variant and appearance props), **SEO** (the two existing `tab:'seo'` props — this panel **reads from and writes to the existing SEO services; it never introduces its own metadata store**). Field help text renders for **every** editor type. Limits appear beside the input. Validation errors appear inline on save failure. A "Content source" section appears only on content-bearing blocks (§5.4). When nothing is selected the panel shows page-level status and last-published information.

**Toolbar.** Page name and status using one vocabulary — **Saved · Draft changes · Published · Scheduled** — with no synonyms elsewhere in the admin. Device toggle, History, Preview (opens the existing route in a new tab), Save Draft, Publish. An unsaved-changes indicator, and a `beforeunload` guard when dirty.

### 4.2 Below 1280px

Three panels do not fit. Proposed: a **tabbed single-panel layout** — `Structure | Canvas | Properties` — with the canvas defaulting to the device width nearest the viewport. Selecting a section in Structure switches to Properties automatically, preserving the selection. Below 768px the canvas is read-only preview; editing remains available through Structure and Properties. Publishing is permitted at every width; it is not a layout-dependent action.

### 4.3 Error, empty and loading states

| State | Behaviour |
|---|---|
| Canvas fails to load | inline error with retry; Structure and Properties stay usable |
| Save fails validation | inline field errors; the draft is **not** discarded |
| Save fails on a version conflict | explicit conflict notice with *Reload* and *Overwrite* (§6.3) — never a silent overwrite |
| Page has no layout row | show family defaults with a "not yet customised" note |
| Block renders empty | canvas shows a labelled placeholder so the admin can still select it |
| No section selected | Properties shows page-level status |

---

## 5. Content source contract

### 5.1 Current state — re-verified in Stage 02

`lib/cms/contentSourceEngine.ts` (402 lines) has **zero importers**. Its only repository reference is a source-text assertion in `tests/batch33-unit.test.ts:12`. It is unreachable by construction: `parseContentSource` returns `null` unless `props.sourceMode` is set, and **`sourceMode` appears nowhere in `sectionRegistry.ts`** — re-confirmed, count zero. It also omits the fixture-exclusion filter that the live path applies at 24 call sites, so **wiring it in unchanged would regress a working protection**.

Meanwhile the live path works but is narrow: `lib/cms/slotUtils.ts` (31 lines) provides `numProp`, `idListProp` and `pickedThenAuto`, and is already imported by both the homepage and section-landing resolvers.

### 5.2 Recommendation — consolidate onto `slotUtils`, retire the engine

**Promote `lib/cms/slotUtils.ts` to the single content-source entry point and retire `contentSourceEngine.ts`.** Rationale: `slotUtils` is live, already shared, already composes over the fixture-safe getters, and is covered by behavioural rather than source-text tests. The engine's genuinely valuable idea — a per-request deduplication context — is ported into the live path rather than discarded.

Retiring is preferred over integrating because integration would mean adding `source*` props to the registry *and* adding fixture protection *and* writing the adapter layer between its flat `ResolvedItem` and the domain `Article` type the block components consume — more work than extending the 31-line module that already does the job correctly. **Decision D-04; owner approval required. Nothing is deleted in Stage 02.**

### 5.3 The proposed contract

Stored on a content-bearing slot under `props.source`:

```ts
interface ContentSource {
  mode: 'auto' | 'picked' | 'mixed';     // mixed = picked first, then auto-fill
  entityType: 'article' | 'hub' | 'event' | 'edition' | 'competitor' | 'venue' | 'discipline';
  pickedIds?: string[];                   // order is the display order
  limit?: number;                         // clamped to the block's declared max
  filters?: {
    categoryKey?: string; sectionKey?: string; disciplineId?: string;
    eventId?: string; editionId?: string; hubId?: string;
    featuredOnly?: boolean; articleType?: string;
  };
  sort?: 'newest' | 'oldest' | 'manual' | 'upcoming';
  fallback?: 'fill-auto' | 'hide-missing';
  emptyBehavior?: 'collapse' | 'placeholder';
}
```

Backward compatibility: when `props.source` is absent, the resolver falls back to today's reading of `featuredIds` + `articleCount`, so **every existing stored layout keeps working with no migration**.

Resolution rules — `auto` queries by filters, sort and limit · `picked` returns exactly the picked ids in order · `mixed` returns picked first then auto-fills to the limit (today's `pickedThenAuto`) · every query passes through `publicArticleWhere()` so published-only and fixture exclusion always apply · results pass through a **request-scoped dedup set** · an empty result honours `emptyBehavior`.

### 5.4 Deduplication — fixing a live defect

Today `shownInHero` is passed to **one** slot and never extended past the hero. **[RUNTIME]** The live homepage renders one article **3×** and five others **2×**.

Proposed: a single `DeduplicationContext` created per request, passed to every slot resolution, extended after each slot resolves. A Stage 03 invariant test asserts no entity id appears twice across a resolved page.

### 5.5 Admin presentation

The Content Source panel leads with a **plain-language summary** — "Showing the 6 newest Plan & Watch articles" or "Showing 2 chosen articles, then newest to fill 6" — followed by mode, picker, filters, sort and limit. The admin never sees `sourceMode` or a raw filter key.

**Candidate-search parity.** The Builder's featured picker filters `workflowStatus:'PUBLISHED'` but does **not** apply the full `publicArticleWhere()` fixture filter, so in production an admin could pin an article the public query then suppresses, silently falling back to auto-fill. The picker must use the same visibility predicate as the public query.

### 5.6 Hardcoded filter maps must become props

`SECTION_CATEGORY` and `PRIMARY_SECTIONS[...].categoryKey` in `lib/cms/homepageData.ts` are the **only** reason category, section and discipline filtering are not admin-controllable. Promoting them to a `select` prop reuses the existing editor type and needs no new infrastructure.

---

## 6. Publishing, revisions and global controls

### 6.1 Four publishing models coexist — the predictability problem

| Entity | Draft | Preview | Publish | Revisions | Schedule | Audit |
|---|---|---|---|---|---|---|
| `PageLayout` (15 keys) | yes | **yes** | yes | **yes** | **yes** | yes (8 actions) |
| `SiteConfig` (`footer`, `appearance`) | yes | **no** | yes | no | no | yes |
| `InfoPage` | status enum, **no draft/published pair** | **no** | yes | no | no | yes |
| `SectionConfig` | **none — live on save** | n/a | immediate | no | no | yes |
| `NavigationItem` | **none — live on save** | n/a | immediate | no | no | yes |
| `Announcement`, `GlobalBlock` | **none — `enabled` + date window** | n/a | immediate | no | no | yes |
| `EntitySeo`, `ArticleSeo` | **none — direct write** | n/a | immediate | no | no | yes |

An owner editing navigation changes the live site instantly; editing a homepage block does not. Nothing in the UI explains the difference. **This, not any single missing feature, is the main predictability problem.**

### 6.2 Proposed model — three tiers, labelled

| Tier | Members | Behaviour | UI treatment |
|---|---|---|---|
| **Composed** | `PageLayout` | draft → preview → publish → revision → schedule | full toolbar; status chip |
| **Configured** | `SiteConfig`, `SectionConfig`, `NavigationItem` | draft → publish, no revisions initially | Save Draft + Publish; "Draft changes" chip |
| **Live** | `Announcement`, `GlobalBlock`, `EntitySeo`, `ArticleSeo` | immediate, with `enabled` and date windows as the safety control | explicit **"Changes go live immediately"** notice beside the save button |

Promoting Navigation and `SectionConfig` into **Configured** is the single largest reduction in accidental-live-change risk, and both already have the storage shape. Keeping announcements and SEO records **Live** is deliberate: they are already gated by `enabled`/date windows and by indexing policy, and adding a draft layer there buys little.

### 6.3 Optimistic concurrency

`PageLayout.version` exists and is incremented in exactly one place — inside `executeScheduledPublish`, guarded by `updateMany`. `saveDraft` and `publishLayout` take no expected version, so **two admins silently overwrite each other**.

Proposed: both accept `expectedVersion`; the write becomes a guarded `updateMany` on `{ pageKey, version }`; a zero-row result returns a typed `conflict` the editor surfaces as *"This page changed since you opened it"* with **Reload** and **Overwrite**, never a silent overwrite. The toolbar carries the loaded version.

Also fix the **revision-number race**: `nextRevisionNo()` is a read-then-increment `await`ed while building the `$transaction` array, so the read happens outside the transaction. Concurrent publishes can collide on `@@unique([pageKey, revisionNo])` — it fails safe but with an opaque error. Compute inside an interactive transaction or use a sequence.

### 6.4 Cache invalidation — the Stage 01 follow-up

**Requirement: saving a draft must not invalidate the entire public website cache.**

Current behaviour: `rev()` in `app/admin/page-layout-actions.ts` calls `revalidatePath('/', 'layout')` and is invoked by **`saveDraftAction`** as well as the publish paths. Saving a draft for `template:venue` therefore flushes the whole public site, homepage included.

Proposed model — two distinct refresh concerns:

| Concern | Trigger | Scope | Mechanism |
|---|---|---|---|
| **Admin draft refresh** | draft save | admin route + the preview iframe only | `revalidatePath('/admin/website/')`; the canvas reloads client-side. **No public invalidation.** |
| **Public publication refresh** | publish, scheduled publish, restore | only the routes the published `pageKey` affects | a `pageKey → paths` map; `'layout'` scope reserved for keys that genuinely affect the shared layout |

A `pageKey → paths` map is required because template keys fan out to many URLs. For `template:*` and `directory:*` keys, tag-based invalidation is the better long-term shape; path-based is acceptable initially since `revalidatePath` on a dynamic segment's parent covers its children.

**Behavioural verification required** (Stage 08, using `scripts/cache-invalidation.mts` as the harness — **[NOT EXECUTED]** in Stage 01 or 02):

1. A draft save does **not** invalidate `/`.
2. A publish of `homepage` **does** invalidate `/`.
3. A publish of `template:venue` invalidates venue detail routes and **not** `/`.
4. The admin canvas still shows the saved draft immediately after a save.
5. A published change is visible on the public route on the next request.

**No cache behaviour was changed in Stage 02.**

### 6.5 Revision retention

`PageLayoutRevision` has no retention policy; `nextRevisionNo` increments monotonically and each publish stores a full snapshot. `listRevisions` defaults to 50 but prunes nothing. Note `onDelete: Cascade` — deleting a layout row destroys its history. Retention count is **decision D-07**.

### 6.6 Scheduled publishing — deployment dependency

`startScheduler` is an in-process `setInterval` with `timer.unref()`, launched from `instrumentation.ts`. It never fires on serverless or scale-to-zero, and on multi-instance every replica runs it. Optimistic locking contains the double-publish race, so this is **reliability, not correctness**. Its revalidation also targets `http://localhost:${PORT}`, so only the publishing replica's cache is flushed. Correct target: external cron hitting an authenticated route. **Decision D-12** — depends on the hosting platform, which is not yet settled.

---

## 7. SEO and legal-content boundaries

### 7.1 Preserve the existing engine

One emitter and one policy, verified working in live HTML. **The Builder must never introduce a second metadata system.**

- `lib/seo.tsx` — `buildMetadata()`, the **sole** Metadata emitter; `JsonLd` with escaped serialisation
- `lib/seo/robots.ts` — `RobotsPolicy`, independent index/follow, most-restrictive combination
- `lib/seo/policy.ts` — `effectiveRobots` / `isIndexable` / `isInSitemap`, pure functions
- `lib/cms/entitySeoService.ts` — `mergeSeoMeta()`, override→derived, **noindex additive-only** so an editor cannot force-index a page policy excludes
- `lib/seo/canonical.ts` — single normaliser shared by render, save-validation and sitemap
- `lib/seo/sitemapEntries.ts` → `app/sitemap.ts`
- `lib/seo-intel/*` — the audit engine

### 7.2 Interaction model

**Precedence, highest first:** page-family policy (a `noindex` family stays `noindex`) → entity-level override (`EntitySeo` / `ArticleSeo`) → derived default (from entity data) → global default. Overrides may restrict indexing, never widen it.

**Block SEO props are page-level, not entity-level.** The only two (`heroImageAlt`, `imageAlt`) describe images chosen for the page; they must feed the image's `alt` and, where the image is the social image, the OG image alt. They must **never** write to `EntitySeo`.

**Sitemap eligibility is derived, never stored on a slot.** `isInSitemap` already re-derives from the same `EntitySeo`/`ArticleSeo` sources the pages render. A Builder change can affect sitemap membership only by changing publication state.

### 7.3 Integration gaps — engineering fixes

| Gap | Current | Target | Stage |
|---|---|---|---|
| Homepage metadata hardcoded; **no `HOMEPAGE` entity type** | literal title/description | add the enum value; route through `mergeSeoMeta` | 09 |
| Homepage emits **zero** JSON-LD; no sitewide `Organization`/`WebSite` | **[RUNTIME]** 0 blocks on `/` vs 2 on `/competition/` | add the entity — **decision D-14** | 09 |
| Directory metadata hardcoded (×2) | literal | route through EntitySeo | 09 |
| Coverage pages hardcoded (×3) | literal | route through EntitySeo | 09 |
| `/info/<slug>/` absent from the sitemap while indexable | sitemap iterates the static legal config | iterate published `InfoPage` rows | 09 |
| `InfoPage` lacks canonical / ogImage / robots columns | none | add columns + editor fields | 09 |
| Media `altText` never reaches OG/Twitter | no `alt` key emitted | thread it into `buildMetadata` | 09 |
| `ArticleSeo.structuredDataType` stored, never read | `@type` derived from `articleType` | consume or drop — **decision D-10** | 09 |
| Competitor/venue JSON-LD `url` is **relative** | passes a route path | prefix `SITE_URL` | 09 |
| Venue derived meta omits `image` | no hero fallback | add fallback | 09 |
| **Preview sends no `X-Robots-Tag: noindex`** | relies on `Disallow: /admin/` | set the header on preview responses | 09 |
| Snippet preview exists only in the article editor; no social-card preview | — | extend to the Builder SEO tab | 09 |
| Indexability chip reflects the editor flag, not **effective** robots | misleading | surface `effectiveRobots` | 09 |

### 7.4 Legal and policy pages — content decisions, not engineering

**[RUNTIME]** All seven legal pages currently serve `noindex, nofollow` **and** display a visitor-facing amber *"Draft — pending owner and legal review"* banner. Content comes from a 225-line code config; the hardcoded fallback is **documented as intentional** in the schema.

Three rules this architecture adopts:

1. **No legal content is ever fabricated.** Not by an agent, not as a placeholder that could be published.
2. **A draft legal page is never automatically indexable.** Clearing `noindex` requires an explicit owner/legal approval action, never a code change or a migration default.
3. **The visitor-facing banner and the indexing flag are separated.** One review flag currently drives both. A page under review should be `noindex` **for staff reasons** without telling every visitor it is unfinished — the banner becomes staff-only.

**Engineering (safe to implement):** separate the banner from the robots flag; add draft-alongside-published to `InfoPage`; add preview; add the missing SEO columns; include published info pages in the sitemap.

**Owner/legal (not engineering):** approving the prose, and the act of making each page indexable. **Decisions D-09 and D-13.**

### 7.5 The InfoPage lifecycle defect

`saveInfoPageDraft` refuses to edit a published page — *"Create a new draft revision"* — but **no such mechanism exists**. The only route is `unpublishInfoPage`, which removes the page from public output; for the seven legacy slugs the hardcoded config silently takes over, and for a new slug the URL **404s**. So **editing a live legal page degrades or removes it.**

Target: add draft/published columns (or a revision table) so a draft can be edited while the published version stays live, then add preview. Requires a migration — **approval required**.

---

## 8. Behavioural QA architecture

### 8.1 Why this section governs the programme

The suite re-ran green in Stage 01 at **78 files / 1549 tests / 0 failures**, and `tsc --noEmit` clean. That is not evidence the Builder works. Approximately **93% of the suite's substring assertions target source text**, all 13 Builder/CMS batch files use that method and hold **611 of 1549 tests**, and **no test proves an admin edit reaches public HTML**.

Stage 01 demonstrated the alternative on a small surface: mock the boundary, invoke the real handler, assert the side effect was *not* performed, then **mutation-test the suite** — reinstating the vulnerable code made 13 of 21 tests fail. That pattern is the model for everything below.

**A test suite that cannot fail proves nothing.** Every invariant added in Stages 03–10 must be mutation-tested at least once.

### 8.2 The ten required causation paths

| # | Path | Test shape | Stage |
|---|---|---|---|
| 1 | Admin edits a block property | registry contract test, parameterised over all 27 types × every declared prop | 03/04 |
| 2 | The value is validated | reject out-of-range numbers, non-option selects, undeclared keys, oversize strings | 04 |
| 3 | The draft is saved | DB-isolated `saveDraft` → read back `draftSections` | 03 |
| 4 | Draft preview reflects it | resolve with `draft:true` → `renderToStaticMarkup` → assert sentinel | 03 |
| 5 | Publication succeeds | `publishLayout` → `publishedSections` matches, revision created | 03 |
| 6 | Public rendering reflects it | resolve with `draft:false` → render → assert sentinel | 03 |
| 7 | Unpublished values stay private | published render must **not** contain a draft-only sentinel | 03 |
| 8 | SEO + structured data stay consistent | `EntitySeo` override → route `generateMetadata` → assert; sitemap/robots agreement | 09 |
| 9 | Invalid inputs rejected | property-validation matrix | 04 |
| 10 | Existing layouts remain compatible | a fixture layout written before a prop existed renders with defaults | 03 |

### 8.3 Test categories and their rules

| Category | Purpose | Rule |
|---|---|---|
| **Registry contract** | every declared prop is consumed, or carries a recorded exemption | parameterised over the registry, so a new block is covered automatically |
| **`renderToStaticMarkup`** | block output | already works under `environment: 'node'` — **no config change needed** |
| **Property sentinel** | prop → HTML causation | a unique sentinel per prop; assert presence in output |
| **DB-isolated draft→publish** | the full lifecycle | against `nfrguide_test`; the existing `decideTestDatabase()` guard is preserved |
| **Deduplication** | no entity twice per page | would have caught the live homepage defect |
| **SEO metadata** | override → emitted metadata | per page family |
| **Preview authorization** | anonymous never sees draft | all 15 keys |
| **Responsive / browser** | canvas device modes, click-to-select | Playwright; **currently zero responsive coverage** |
| **Cache invalidation** | draft-save vs publish scope | `scripts/cache-invalidation.mts` wired into CI |
| **Mutation testing** | the suite can fail | break the invariant, confirm red, restore |

### 8.4 Prohibited as proof

A test that reads a source file and asserts a substring **does not** prove a feature works. The Task 4 failure is the reference case: a test named *"editor renders helpText for text props"* asserted `toContain('helpText')` against the **whole file**, matched three unrelated branches, and passed while the `text` branch rendered nothing.

Two rules: **(1)** no test whose name contains "renders", "shows" or "displays" may use `readFileSync` + `toContain`; **(2)** a behavioural assertion must target the narrowest available unit, not the file. Negative-existence assertions (*"this literal must never reappear"*) remain legitimate and must be labelled as structural.

---

## 9. Data model impact

**No schema change is required for Stages 03–07.** `SectionSlot` carries an open `props` record, so new props are additive and existing rows fall back to defaults — this is the property that makes the whole plan incremental.

Changes that **do** need approval, all deferred to the stage that needs them:

| # | Change | Driver | Stage | Risk |
|---|---|---|---|---|
| S-1 | `InfoPage`: draft/published columns (or a revision table) | §7.5 | 09 | migration on live content |
| S-2 | `LandingEntityType`: add `HOMEPAGE` | §7.3 | 09 | enum migration; low render risk |
| S-3 | `InfoPage`: `canonical`, `ogImage`, `robots` | §7.3 | 09 | additive |
| S-4 | `PageLayoutRevision`: retention | §6.5 / D-07 | 08 | deletes history |
| S-5 | `SectionConfig`: draft/published | §6.2 | 08 | conflicts with the Blueprint's "no column changes" — resolve first |
| S-6 | Drop or consume `ArticleSeo.structuredDataType` | §7.3 / D-10 | 09 | dropping loses stored values |

---

## 10. What this architecture explicitly does not do

- Does not rebuild the registry, the layout storage shape, the SEO engine, the publishing service, RBAC or the preview mechanism.
- Does not introduce a free-form page builder. Block families stay fixed per page; no arbitrary pages. The Blueprint names scope creep into a free-form builder as a risk, and this architecture keeps that guard.
- Does not create a second preview renderer, a second SEO metadata store, or a competing content engine.
- Does not assume the Blueprint's unapproved design items are requirements.
- Does not fabricate legal content or make draft legal pages indexable.
- Does not change cache behaviour, schema, or any application code in Stage 02.
