# Stage 07 — Template Architecture

**Programme:** Controlled Hybrid Website Builder, CMS & SEO Remediation
**Stage:** 07 of 10 · **Date:** 2026-11-11 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` (unchanged)

This document records the design decisions Stage 07 made and the evidence behind each. It is the companion to `STAGE_07_PAGE_AND_BLOCK_COVERAGE.md`, which records the resulting per-page state.

---

## 1. The one authoritative slot contract (Task A)

### 1.1 What was wrong

The rule "render visible slots in `order`" was implemented **five times by hand**, in four files, and applied **nowhere** in the renderer:

| Site | Code |
|---|---|
| `lib/cms/homepageData.ts:66` | `slots.filter((s) => s.visible).sort((a, b) => a.order - b.order)` |
| `lib/cms/sectionLandingData.ts:30` | identical |
| `lib/cms/detailTemplateData.ts:47` | identical |
| `lib/cms/detailTemplateData.ts:98` | identical |
| `lib/cms/directoryData.ts:26` | identical |

So the rule was *guaranteed* in no single place, and a change to one copy could silently reorder one page family. The approved Stage 02 architecture §3.3 (change 3+4) calls for exactly one authority in `PageRenderer`.

### 1.2 The double-application proof Stage 06 could not produce

Stage 06 deferred this because it could not cheaply prove a second application in the renderer would be harmless. **It would not have been**, and the note Stage 06 left in `PageRenderer` named the wrong reason.

The Stage 06 comment claimed `resolveSections` "sorts and filters before the resolvers compose `data`". That is **false** — verified by reading `lib/cms/pageLayoutService.ts:216`, which only chooses stored sections versus family defaults and backfills missing ids. It never filtered or sorted.

The real hazard was sharper and specific:

> `resolveSectionLandingSlots` **injects** two system slots — `landing-competition-disciplines` and `landing-empty` — by `splice()`ing them at a **positional index**, while stamping them `order: -1`.

The resolver's array order and the slots' `order` fields therefore **contradicted each other**. Had `PageRenderer` sorted by `order`, both injected blocks would have jumped to the **top** of the page: the discipline guides and the "nothing published yet" empty state would have rendered **above the section hero** on `/competition/`.

This is asserted as a standing regression test so the placeholder cannot return:

```
tests/stage07-slot-selection.test.ts
  "REGRESSION: a placeholder order of -1 would have hoisted an injected block to the top"
```

### 1.3 The design

`lib/cms/slotSelection.ts` (143 lines) is the single implementation:

| Export | Purpose |
|---|---|
| `isSlotVisible` | the visibility predicate |
| `compareSlotOrder` | the order comparator; a non-finite order sorts last rather than corrupting the sort |
| `selectRenderableSlots` | **the** authoritative selection: filter, then stable sort. Pure and non-mutating |
| `selectRenderableResolved` | the same over `{ slot, data }` pairs, the shape `PageRenderer` receives |
| `orderAfter` | the fractional order for a positionally-injected system slot |
| `findContractViolations` | a diagnostic so "the guard never fires" can be asserted rather than claimed |

`orderAfter(anchor, fallbackLast)` returns `anchor.order + 0.5`. Fractional on purpose: renumbering every slot to its array index would also work, but it would overwrite the operator's stored order values in the resolved copy and make the rendered `order` unrelated to the saved layout — harder to debug and easy to mistake for a persistence bug. A fraction keeps every stored order intact and states the injected block's position *relationally*.

With injected slots carrying real orders, `selectRenderableSlots` is **provably idempotent**:

```
selectRenderableSlots(selectRenderableSlots(x)) === selectRenderableSlots(x)
```

asserted over four hand-built layouts and 300 generated ones.

### 1.4 Behaviour preservation, deliberately

`isSlotVisible` is a **truthiness** test, not `visible !== false`. That is what all five replaced copies did, so consolidation changes no public output for any stored layout.

The tempting "improvement" — making a slot whose JSON lost the `visible` key render instead of vanishing — was **rejected**. `SectionSlotSchema` in `pageLayoutService.ts` declares `visible: z.boolean()` as required, so every layout ever saved through `saveDraft` carries a real boolean; the two semantics can only differ for hand-edited JSON, and in that unreachable case the change would alter live HTML on a page no operator touched. Stage 07 consolidates the rule; it does not quietly redefine it.

Equivalence is pinned by an oracle suite: a literal transcription of the pre-Stage-07 code is kept in the test file and compared against the consolidated function over nine hand-built cases and 300 generated layouts.

### 1.5 On "no double filtering or sorting" (directive §3 requirement 7)

There is exactly **one implementation** of the rule and no second, divergent one.

A resolver still calls it once, because it must not issue a content query for a hidden slot (requirement 8) and because the deduplication context has to claim articles in render order. `PageRenderer` calls it once as the render authority. **Those two calls cannot disagree**, because they are the same function over a provably idempotent operation. What has been eliminated is *divergence* — which is what the five hand-written copies actually risked — not the second invocation.

### 1.6 One documented exception

`views/SectionLandingSlots.tsx` partitions the resolved list into the hero and the remainder so it can wrap the remainder in a container, and therefore calls `PageRenderer` twice with two subsets. Selection applies within each subset. That is order-preserving because the partition is by section type and the hero sorts first either way — asserted in `tests/stage07-renderer-consolidation.test.ts` by comparing the concatenated partitioned output against whole-list output.

---

## 2. Server Component conversion — **DECISION: RETAIN THE CLIENT COMPONENT** (Task B)

The directive is explicit that conversion must not be forced to satisfy an architectural preference, and permits retaining the Client Component with a documented reason. This is that reason, with the evidence.

### 2.1 What the four blocks actually need

| Block wrapper | Client dependency | Underlying section component | Could it drop the dependency? |
|---|---|---|---|
| `EditorialHeroBlock` | `useRouter` | `EditorialHero` — `'use client'`, **no** `useState` | Yes, with a `<Link>` refactor |
| `LatestCoverageBlock` | `useRouter` | `LatestCoverage` — `'use client'` **+ `useState`** (category filter tabs) | **No** — genuinely interactive |
| `CompetitionBlock` | `useRouter` | `CompetitionSection` — `'use client'` **+ `useState`** (discipline filter) | **No** — genuinely interactive |
| `QuickAccessBlock` | `document.getElementById(...).scrollIntoView` | `QuickAccess` — `'use client'` | No — smooth-scroll is a client behaviour |

So `useRouter` is the **smaller half** of the problem. Two of the four blocks hold their own `useState` and must remain client islands whatever happens to the renderer.

### 2.2 The actual blockers

**The editor-mode context, not the router.** `PageRenderer` reads `useBuilderEditorMode()`. A Server Component cannot use context, so conversion needs one of:

- **(a)** thread an `editorMode` prop through 4 view components and the 11 public routes that reach them. Stage 06 rejected this with a recorded rationale: the failure mode is "an un-selectable block with no error" on any route a later stage adds, which is the class of defect this programme exists to remove.
- **(b)** call `isStaffDraftPreview()` inside `PageRenderer`. That imports `server-only` and `next/headers`, which **cannot run under the Vitest runtime** (`environment: 'node'`, no RSC context). **71 tests across 4 files render `PageRenderer` directly** — `stage06-renderer-slots` (27 call sites), `stage05-registry-retirement` (5), `stage07-renderer-consolidation` (2), `batch-a-renderer` (1). Every one would have to be rewritten or deleted. Those tests are the regression net for public-vs-editor output parity, retired-block inertness, selectable containers and, now, ordering and visibility.

**The benefit is near zero anyway.** `components/blocks/registry.tsx` carries `'use client'` and imports all 22 block components. Converting `PageRenderer` moves the client boundary from the renderer to the registry; **every block still ships to the client**. The only code that would leave the bundle is `PageRenderer` itself (121 lines) plus four thin view wrappers.

### 2.3 Verdict

| | Cost | Benefit |
|---|---|---|
| **(a)** prop threading | loses the Stage 06 inheritance guarantee across 11 routes + 4 wrappers | ~125 lines leave the client bundle; 22 blocks do not |
| **(b)** `isStaffDraftPreview()` inside the renderer | breaks 71 regression tests; adds a cookie + permission read per renderer instance (twice per section-landing page) | same |
| **retain** | none | keeps the regression net and the single server-side editor-mode decision |

**Retained.** The Stage 02 architecture itself calls this "an optimisation, not a correctness fix" (§3.3). Trading a 71-test regression net and a deliberate architectural guarantee for ~4 KB of client JavaScript is a bad trade. `tests/batch-a-renderer.test.ts` ("PageRenderer is a client component") now encodes the decision.

**A real conversion path exists for a later stage**, and it is the one worth taking: split `registry.tsx` into server-renderable and client-island halves so the 22 blocks stop shipping wholesale. That is a larger change than Stage 07 authorises and should be scoped on its own.

### 2.4 A defect found while investigating Task B — reported, not fixed

`components/sections/EditorialHero.tsx:117` renders each **secondary hero story** as:

```tsx
<article onClick={() => onSelectArticle(story)} className="group cursor-pointer …">
```

A `div`-with-`onClick`. It is **not keyboard-focusable**, is **not announced as a link**, and carries **no `href`** — so it is invisible to crawlers and cannot be opened in a new tab. The lead story's CTA is a `<button>` doing client-side navigation, with the same crawlability consequence.

This is a genuine accessibility and internal-linking defect on the most prominent element of the homepage. It is **not fixed in Stage 07**: it changes the public markup of the homepage hero, which needs its own visual verification across the three device widths, and the directive forbids folding unrelated conversions into this stage's work. Carried forward with a recommendation in `STAGE_07_HANDOVER.md`.

---

## 3. Unsupported block resolution (Task C)

### 3.1 The safety gate was honoured

Development and test databases hold **zero** `PageLayout` rows (Stage 04 inventory, unchanged). **Production has never been inspected, and Stage 07 did not inspect it** — no production credentials were used and no production query was run.

Therefore **no block type was physically deleted.** Deleting a definition removes the type from `getKnownSectionTypes`, and `saveDraft` validates against that — so an operator whose production layout holds a `detail-body` slot could no longer save a page they never touched. That is the precise hazard the Stage 06 handover flagged.

### 3.2 What was done instead

| Type | Before | After | Authority |
|---|---|---|---|
| `detail-hero` | definition, no renderer, `required: true` | `retired: true`, `retiredBy: 'D-02 (Stage 07)'`, `required` **dropped** | D-02, approved Option B |
| `detail-body` | definition, no renderer, no props, `required: true` | same treatment | D-02 |
| `detail-faq` | definition, no renderer, `title` prop only | same treatment, **superseded** by the shared `faq-block` | D-02 |
| `directory-grid` | definition, **no renderer**, `required: true` | **real renderer**; `required` kept and now truthful; `systemContent: true` | Task F design |

`retired` is the mechanism Stage 05 proved for `newsletter-signup` (D-11): the block is absent from every block library and from all default layouts, has no renderer, and contributes nothing to a page — while its definition keeps a stored layout valid and editable. A `retiredBy` field was added because two different owner decisions now retire blocks and the Admin notice should say which.

`required` was dropped from the three retirements because a required block with no renderer could be **neither removed nor hidden** in the Builder while contributing nothing — the worst of both states.

### 3.3 The required-block contradiction, resolved atomically

`directory-grid` was `required: true` **and** unrenderable. The directive requires the contradiction resolved "atomically with the new directory rendering design", and there were two ways:

1. drop `required` and delete the block, or
2. make `required` **true** by giving it a renderer.

**(2) was chosen.** The thing it represents — the search form, result count, entries and pagination — really is mandatory on a listing page and really is already on it. Deleting the block would have left the listing **unrepresented in the Builder**, which is the dishonesty this programme exists to remove. `systemContent: true` records the other half of the truth: the Builder owns *where* the listing sits and nothing else.

### 3.4 Legacy compatibility, proven

- every retired type is still in `getKnownSectionTypes`, so a stored layout containing it remains saveable;
- a public visitor sees nothing for it;
- the Builder canvas shows a removable notice naming the type;
- a legacy layout mixing retired markers with live blocks still renders the live ones;
- an **unrecognised** type (one removed in some future stage) is now *emitted* by the resolvers rather than dropped, so it reaches `PageRenderer`'s diagnostic and the operator who must remove it.

---

## 4. The seven detail template families (Task D)

### 4.1 What the approved architecture authorises

Owner decision **D-02 is approved as Option B**: *"shared structured editorial templates, with optional approved appendage sections"*, and the register states the three inert markers are *"confirmed for removal rather than promotion"*. **D-03** settles layout at **template level**: *"entity-level overrides remain limited to SEO and FAQ."*

So Stage 07 does **not** invent per-entity overrides and does **not** make the templates fully composable. It makes the appendage honest and useful, which is exactly what Option B asks for.

### 4.2 The four approved regions

| Region | Block | Why it is the right block |
|---|---|---|
| introduction | `rich-text-block` | heading + body + alignment, real renderer |
| image + text | `image-text-block` | side-by-side media block, real renderer |
| FAQ | `faq-block` | five question/answer pairs, real renderer — **replaces** the inert `detail-faq`, which had only a `title` and could never have shown a question |
| CTA | `cta-banner` | richer than `detail-cta`, real renderer |

Each already had a working renderer proven by the Stage 03 registry contract, so adding it to the family gives real control rather than another inert marker. `detail-related` and `detail-cta` continue unchanged.

### 4.3 Registry-driven resolvers — the change that makes composition real

The approved architecture §3.4 names the defect:

> "Resolver allowlists become registry-driven. Today `resolveAppendageSlots` emits only `detail-related` and `detail-cta` … so a visible, saved, schema-valid block silently vanishes. The registry, not the resolver, must decide what a family can render."

`resolveAppendageSlots` and `resolveDirectorySlots` no longer keep their own allowlist. The registry governs through the paths that should govern it — `getAvailableBlockTypes` decides what may be **added**, `saveDraft`'s `validateSectionTypes` decides what may be **saved** — and `PageRenderer` is the single authority on what **renders**.

All seven template routes already mount `ArticleAppendageSlots` after the record body (`views/ArticleView.tsx`, `app/(public)/categories/[slug]`, `.../competitors/[slug]`, `.../disciplines/[slug]`, `.../rodeo-events/[slug]`, `.../rodeo-events/[slug]/[edition]`, `.../venues/[slug]`), so composition works in the **actual public route** for every family — asserted per key against a real stored layout.

### 4.4 No live page changed

`RichTextBlock`, `ImageTextBlock` and `CtaBanner` render a `<section>` **even with empty props** — they do not guard on emptiness. Seeding them into the default layout would have added visible empty bands to every article, discipline, category, competitor, venue, hub and edition page the moment Stage 07 shipped.

All four regions therefore carry `excludeFromDefaultsIn: ['detail-template']`. The default detail layout is now exactly `[detail-related, detail-cta]` — the two blocks that actually rendered before — and renders empty HTML with default props, as it did before.

### 4.5 `excludeFromDefaultsIn` is a list, and that matters

The first implementation used a boolean and **spread the shared definitions per family**:

```ts
{ ...SHARED_RICH_TEXT_BLOCK, excludeFromDefaults: true, familyLimits: { …, 'detail-template': 2 } }
```

That produced **four distinct definition objects** for `rich-text-block` and silently reintroduced exactly the divergence Stage 04 Task B removed — `tests/stage04-property-fixes.test.ts` asserts object **identity**, and it caught it. The per-family list form keeps one shared object carrying every family's caps and exclusions. A second assertion was added from the detail side so the identity requirement is visible where the next family addition will be made.

---

## 5. The competition landing block (Task E)

`landing-competition-disciplines` had a renderer in `blockRegistry` but **no definition anywhere**. The section-landing resolver injected it on `/competition/`, and the block printed two headings — "Championship Disciplines" and "NFR Discipline Guides" — that **no administrator could reach, edit, hide or reorder.** It was the clearest remaining case of public copy with no owner in the Admin.

| Change | Effect |
|---|---|
| real definition in `SECTION_LANDING_SECTIONS` | addable, orderable, hideable, canvas-selectable, badge "Editable" |
| `kicker` / `title` / `description` editable props | the hardcoded strings became owned copy |
| `defaultProps` set to the **previous literals** | `/competition/` renders exactly what it rendered before |
| `excludeFromDefaultsIn: ['section-landing']` | the other four section landings gain nothing |
| resolver injection kept, **guarded** by `!storedDisciplineSlot` | the live page is unchanged until an operator takes control; it can never render twice |
| resolver fetches disciplines when the section needs them **or** a stored slot exists | a placed block is never rendered empty because the resolver did not look |
| removed from `SYSTEM_OWNED_SECTION_TYPES` | a block with editable copy an operator may place is not "added automatically by the site" |

The data still comes from the existing `getAllDisciplines()`. **No second competition data source and no duplicate section resolver were created.** The block returns `null` when there are no disciplines, so placing it on a non-Competition landing adds no empty band — and its registry `description` says so plainly.

---

## 6. The competitor and venue directories (Task F)

### 6.1 What was wrong

A directory page was built **entirely inside its route**: the header, the search form, the result count, the grid, the empty state and the pagination were literal JSX in `app/(public)/competitors/page.tsx` and `.../venues/page.tsx`. The Builder's three directory slots sat alongside that markup and only one (`directory-cta`) rendered. `views/DirectorySlots.tsx` filtered the resolved list down to `directory-cta`, so **two of three slots — including the required one — never reached the page.**

`directory-hero` was half-wired: `title` and `description` reached the page because each route read them by hand, while `heroImageUrl` was resolved and **dropped**. With no renderer there was no `data-slot-id`, so the block was **unclickable on the Stage 06 canvas**.

### 6.2 The design: the route keeps the data, the Builder gets the presentation

```
route (searchParams)                      resolver                     renderer
────────────────────                      ────────                     ────────
listPublicCompetitors()  ──items/total──▶ resolveDirectorySlots  ──▶ PageRenderer
listPublicVenues()         page/filters   attaches listing data       directory-hero
  authoritative, bounded,                 to the directory-grid       rich-text-block
  page-clamped, fixture-                  slot; applies the route     directory-grid
  excluded                                default heading when the    directory-cta
                                          operator left it empty      (in slot order)
```

**The database query stays in the route.** It depends on `searchParams`, it is already bounded (`take: PAGE_SIZE`) and page-clamped, and it is the authoritative read for competitor and venue records. The resolver only attaches the result to the `directory-grid` slot — one query per request, and **no entity data is ever copied into layout JSON**. A test proves the point adversarially: props bearing entity-shaped keys produce no entries at all.

| Block | State after Stage 07 |
|---|---|
| `directory-hero` | real renderer; renders kicker, the single `<h1>`, description and — finally — the hero image; canvas-selectable |
| `directory-grid` | real renderer; the search form, count line, entries, empty state and pagination; `required` (truthful) + `systemContent`; `columns` consumed and clamped |
| `directory-cta` | unchanged, now orderable relative to the listing |
| `rich-text-block` | **added**, capped at 2, library-only — one genuine presentation choice |

The search form is a plain `GET` form and pagination is plain links, exactly as the routes had them, so search, filtering and paging need no JavaScript and stay crawlable. Form controls gained `id`/`for` label associations.

`columns` had been declared in the registry and **ignored for three stages**. It is now read through the shared `numProp`, so an out-of-range stored value is clamped to the declared 1–4 rather than producing an undefined Tailwind class.

### 6.3 Capability level stays `directory-limited`, deliberately

All four directory block types now render and all four are canvas-selectable — a real improvement on "the Builder controls the heading text and one CTA". But calling the page `composed` would be a lie: the listing's contents, search, filters and pagination are built from the database query and are not Builder-owned, and the listing itself is required. The directive is explicit — do not mark a page composed while its structured core sits outside Builder control.

The Admin copy changed in both directions: it still says the entries are generated and the search cannot be removed, and it now also says what *is* editable (the heading, where the listing sits, its column count, surrounding text).

### 6.4 A defect found and fixed: fixture exclusion was missing

`lib/fixturePolicy.ts` provides `publicSlugWhere()` for slug-addressed public entities, and it is applied at the public hub and event reads. **Neither `listPublicCompetitors` nor `listPublicVenues` applied it.** A `fixture-` competitor or venue row would have been listed to real visitors in production, and nothing else guards it — neither model carries a publication state, so the fixture prefix is the only available filter.

Both queries now apply `publicSlugWhere()`, matching the hub/event pattern. `excludeFixturesFromPublic()` is true only when `appEnv() === 'production'`, so test and CI databases keep showing fixtures and the browser harness is unaffected.

No speculative filter, sort mode or personalisation control was introduced; Stage 06's test asserting the inspector never mentions them still passes.

---

## 7. Capability and registry synchronisation (Task G)

`lib/cms/pageCapability.ts` mirrors the renderer list rather than importing `blockRegistry`, to stay server-safe and out of the Admin bundle. `tests/stage06-page-capability.test.ts` asserts the mirror equals `Object.keys(blockRegistry)` in both directions. Stage 07 updated:

| Change | Reason |
|---|---|
| `RENDERED_SECTION_TYPES` 22 → 24 | `directory-hero`, `directory-grid` gained renderers |
| `directory-hero` removed from `NON_RENDERER_CONSUMERS` | it renders; leaving it would have returned `server-composed` for a rendering block — the contradiction the Stage 06 handover warned about |
| `landing-competition-disciplines` removed from `SYSTEM_OWNED_SECTION_TYPES` | it has a definition and editable copy now |
| **`classifyBlockSupport` retirement check fixed** | it checked only `homepage` and `section-landing`. The three detail-family retirements would have been labelled `unsupported` ("No renderer exists for this block") instead of `retired` ("…you can remove it safely"). Both are true; only the second tells the operator the removal is expected |
| `DETAIL_FIXED` / `APPENDAGE_SUMMARY` rewritten | the old copy understated the page; the new copy names the four regions and still refuses to claim the template is composable |
| `DIRECTORY_FIXED` / `DIRECTORY_SUMMARY` rewritten | says what is generated **and** what is now editable |

A new assertion derives from the live registry rather than a list: **no block type in any family classifies as `unsupported`.** A block added later with no renderer fails there instead of shipping as a confident lie in the Admin.

### 7.1 Admin surfaces that had to follow

Three editor-side changes were required because the editor **re-computes** things the server computes, and the two must not diverge:

| Field now passed to the editor | Why |
|---|---|
| `excludeFromDefaultsIn` | the tree builds its own copy of the **default** layout while the canvas renders the server's. Without it the tree would list four appendage blocks the page does not have — and Stage 06 proved a tree/canvas mismatch silently breaks click-to-select, because the ids stop matching |
| `familyLimits` | the library showed and gated on `maxInstances` only, so a per-family cap was displayed wrong and enforced only on save. Now `resolveMaxInstances(def, familyKey)` |
| `systemContent`, `retiredBy` | the inspector can state where a block's content comes from, and which decision retired it |

A new inspector notice appears for `systemContent` blocks: *"Content comes from the database … You control where it sits on the page and its layout options — not what it lists."* The support badge answers "can I edit this block"; it does not answer "where does what I see come from", and for the directory listing those are different questions.

---

## 8. Canvas and security (Tasks H, I)

No second renderer was built. The canvas still mounts the real preview route, so the new blocks appear in it for free once they have renderers — and that is verified in Chromium rather than asserted (`e2e/stage07-templates.spec.ts`).

Nothing in the frame-security posture changed: `X-Frame-Options: SAMEORIGIN`, CSP `frame-ancestors 'self'` and `frame-src 'self'` are unmodified, and the iframe sandbox is untouched. Autosave was not introduced. The environment isolation guard was not weakened — `APP_ENV=test` with the isolated database satisfies it, as documented.

---

## 9. What Stage 07 deliberately did not do

- **No schema change, no migration.** 19 migrations, unchanged; `schema.prisma` unmodified.
- **No production database access.** No credentials used, no query run.
- **No physical deletion** of any block type.
- **No per-entity template override** — D-03 does not authorise one.
- **No second renderer, no parallel slot resolution, no second content engine.**
- **No speculative directory control** — no filter beyond the one each route already had, no sort mode, no personalisation.
- **No autosave, no undo/redo buttons.**
- **No newsletter re-registration.**
- **No commit, push, merge, reset or branch switch.**
- **No change to footer ownership, Appearance controls, revision retention or the scheduler** — Stage 08 items.
