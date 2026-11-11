# Stage 05 — Content Source Architecture

**Stage:** 05 of 10 · **Date:** 2026-11-09 · **HEAD:** `fd4fb10`
**Owner decisions implemented:** D-04 (retire the dead engine), D-11 (retire the newsletter block)

---

## 1. What changed, in one paragraph

There were two content-source implementations: a 402-line engine nobody imported, and a 31-line helper module that actually served every page. Stage 05 deleted the former, carried across its one good idea — a per-request deduplication context — and consolidated the latter into an explicit contract. The homepage now deduplicates across all of its article-bearing slots, which is what turned KD-01 green.

---

## 2. The retirement (D-04)

### 2.1 What was removed

`lib/cms/contentSourceEngine.ts` — **402 lines, deleted.**

Why it had to go rather than be integrated:

| Finding | Consequence |
|---|---|
| **Zero importers.** Its only repository reference was a source-text assertion in `tests/batch33-unit.test.ts` | Nothing it did affected any page |
| **Unreachable by construction.** `parseContentSource` returned `null` unless `props.sourceMode` was set, and `sourceMode` existed nowhere in the registry | It could not have run even if imported |
| **It omitted fixture exclusion.** It queried `workflowStatus: 'PUBLISHED'` directly, while the live path routes through `publicArticleWhere()` at 24 call sites | Wiring it in unchanged would have **regressed** a working protection |
| **Incompatible output type.** It emitted a flat `ResolvedItem` with ISO-string dates and truncated excerpts; block components consume the domain `Article` | Integration needed an adapter layer that was never written |

Recoverable from git at `fd4fb10` if ever needed, and a copy was taken outside the repository before deletion.

### 2.2 What was carried across

Exactly one algorithm: the **deduplication context**. The engine's `DeduplicationContext` was threaded through a `resolveMultipleSources` that never ran. That idea is now `SelectionContext` in `lib/cms/slotUtils.ts`, in the path that does run.

Deliberately **not** carried across, because no registry property exposes them and Task B forbids advertising unimplemented behaviour:

| Engine feature | Why not |
|---|---|
| `fallbackPolicy: 'hide-missing'` | `fill-auto` is the only behaviour the Builder offers today; adding the alternative would be a speculative control |
| `emptyBehavior: 'collapse' \| 'placeholder'` | Already handled per-block (components return `null`) and by the section-landing empty slot |
| `upcoming` edition filter | No registry property reaches it; detail routes fetch editions directly |
| Multi-entity resolvers (hub / event / edition / competitor / venue) | The live detail routes already fetch these; a second path would be the duplication this stage removes |

No parallel engine was created. The contract lives in the module that was already shared.

---

## 3. The contract

### 3.1 Where it lives

`lib/cms/slotUtils.ts` — the single authoritative content-source pathway, already imported by the homepage and section-landing resolvers before this stage.

| Export | Role |
|---|---|
| `pickedThenAuto(props, count, auto, ctx?)` | resolves one slot: manual picks first, then auto-fill, with optional cross-slot deduplication |
| `createSelectionContext(initial?)` | a request-scoped record of what the page has already placed |
| `numProp(props, key, fallback, min, max)` | bounded integer property |
| `limitList(items, props, key, max)` | applies a count property to an already-resolved list |
| `idListProp(props, key)` | reads an id list from either storage shape |

### 3.2 No new persistence

**No schema change, and no new stored property.** The contract is expressed entirely through properties the registry already had:

| Behaviour | Stored as |
|---|---|
| Manual selection | `featuredIds` — comma string or array of ids |
| Explicit ordering | the order of `featuredIds` |
| Bounded count | `articleCount` |
| Automatic selection | the absence of `featuredIds` |
| Mixed selection | `featuredIds` shorter than `articleCount` |
| Category / relationship filtering | the slot's `sectionType`, mapped by the resolver |

A layout stored before this stage resolves identically, because nothing new is required to read it.

### 3.3 The selection modes

| Mode | Configuration | Behaviour |
|---|---|---|
| **Automatic** | no `featuredIds` | the auto resolver fills to `articleCount`, honouring the slot's category filter |
| **Manual** | `featuredIds` length ≥ `articleCount` | exactly those articles, in the editor's order, bounded to the count |
| **Mixed** | `featuredIds` shorter than `articleCount` | manual picks first in order, then auto-fill for the shortfall |

Edge behaviour, each covered by a test:

- A reference to a **missing** record drops out; the rest keep their order.
- A reference to an **unpublished** record drops out — `getPublishedArticlesByIds` returns only published rows.
- A **repeated** manual id is de-duplicated deterministically: first occurrence wins.
- **Sparse content** returns fewer items than requested rather than padding.
- A **zero count** returns nothing and issues no query at all.

### 3.4 The selection context

```ts
interface SelectionContext {
  readonly shown: ReadonlySet<string>;
  claim(ids: Iterable<string | null | undefined>): void;
  excluded(): string[];
  has(id: string): boolean;
}
```

**Ordering rule: slots claim in resolution order, and the first claim wins.** A later slot never displaces an earlier one, which is what makes a page deterministic for the same data and configuration.

Three guards, in layers:

1. **Manual picks** skip any id already placed.
2. **Auto-fill** receives the full exclusion list, de-duplicated, so the query never returns a repeat.
3. **The result loop** rejects a duplicate even if the auto resolver ignored its exclude list — defence in depth against a resolver bug, with its own test.

`claim()` ignores `null`, `undefined` and empty strings, so junk never enters the set, and it is idempotent.

**Without a context, `pickedThenAuto` behaves exactly as before.** Callers that have not been migrated are unaffected — a property a test asserts explicitly.

---

## 4. Resolver map

| Page family | Resolver | Content source | Context |
|---|---|---|---|
| Homepage | `lib/cms/homepageData.ts` | `pickedThenAuto` per article slot | **one shared context across all slots** |
| Section landing | `lib/cms/sectionLandingData.ts` | `pickedThenAuto` for the featured slot; `limitList` for the grid | per-slot (single article-bearing slot) |
| Detail template | `lib/cms/detailTemplateData.ts` | `getRelatedPublishedArticles` with a clamped count | n/a — one related block per page |
| Directory | `lib/cms/directoryData.ts` | none — listings come from `batch12Content` directly | n/a |

### 4.1 Homepage resolution order

```
1. shared datasets fetched once, and only if a slot needs them
     disciplines · quick-access links · hubs · recurring events

2. HERO resolves and claims FIRST, wherever the admin placed it
     manual lead (featuredIds[0]) or getHeroArticle()
     + secondary stories, topped up from latest if short
     + its own lead/secondary overlap removed
     → ctx.claim(lead, ...secondary)

3. every visible slot, in `order`:
     latest-coverage  → pickedThenAuto(..., getLatestArticles, ctx)
     plan-and-watch   → pickedThenAuto(..., bySection(categoryKey), ctx)
     entertainment    → pickedThenAuto(..., bySection(categoryKey), ctx)
     events-shopping  → pickedThenAuto(..., bySection(categoryKey), ctx)
     learning         → pickedThenAuto(..., getEvergreenArticles, ctx)
     competition / quick-access / more-rodeo → non-article data
```

**Why the hero claims first regardless of position.** The lead story is the page's headline act. If it also qualifies for a category feed, the hero keeps it and the feed moves on. Resolving it ahead of the loop makes that priority deterministic rather than dependent on where the block sits.

**Category relevance is preserved.** The filters are unchanged — only the exclusion list now carries what the page has already placed.

---

## 5. Content ownership (Task D)

The Builder stores **references**. A content-bearing slot persists entity ids plus selection parameters, never a copy of an entity's fields.

| Builder may store | Builder must never store |
|---|---|
| entity ids (`featuredIds`) | article title, deck, body, author |
| counts, filters, sort keys | an entity's image URL as its content |
| page-level presentation copy (kicker, heading, CTA label) | event dates, competitor records, venue details |
| layout and visibility preferences | anything mirrored from a CMS record |

Proven behaviourally against the isolated database:

- Editing an article's title changes what the page resolves, **with the stored layout JSON byte-identical before and after**.
- The stored slot contains the id and **not** the article's title.
- Unpublishing a record removes it from resolved output without the layout changing.

This is the property that makes the Controlled Hybrid model worth having: a correction made once in the CMS is a correction everywhere the record appears.

---

## 6. Query bounding and performance (Task G)

| Concern | Position |
|---|---|
| Queries per article slot | **at most two** — one manual-id lookup, one auto-fill call. The auto call is skipped entirely when manual picks already satisfy the count |
| N+1 | none introduced. Slots resolve sequentially so the context can accumulate; each issues bounded queries rather than per-article fetches |
| Auto-fill size | asked for exactly the shortfall, never more |
| Count bounds | `numProp` clamps to the declared range. Homepage slots 0–12; `landing-grid` 0–20; `detail-related` 1–6 |
| Exclusion list growth | bounded by articles already on the page — in practice well under 100, since slot counts are capped at 12. The list is de-duplicated before it reaches a query |
| Shared datasets | disciplines, quick-access links, hubs and events fetched **once** per request, and only when a slot needs them |
| Cache boundaries | unchanged. No new revalidation path, no new cache key |

**Trade-off stated plainly.** Sequential slot resolution is required for cross-slot deduplication — a parallel resolve cannot know what a sibling has claimed. The cost is wall-clock latency proportional to the number of article slots rather than to the slowest one. With at most six such slots and two bounded queries each, that is the right trade for a correct page. If it ever matters, the fix is a single batched candidate fetch feeding all slots from memory, not reintroducing parallelism.

---

## 7. Page-family coverage (Task E)

| Family | Configurable content source today | Status |
|---|---|---|
| **Homepage** | `featuredIds` + `articleCount` on 5 article slots | ✅ full contract, shared deduplication |
| **Section landing** | `featuredIds` on `landing-featured`; `articleCount` on `landing-grid` | ✅ supported contract honoured |
| **Detail template** | `articleCount` on `detail-related` (clamped 1–6) | ✅ appendage contract honoured |
| **Directory** | **none** | ⚠️ documented gap, below |

### 7.1 Documented gaps — not invented features

**Directory listings have no configurable content source.** `/competitors/` and `/venues/` fetch their listings through `listPublicCompetitors` / `listPublicVenues`, called directly by each route, entirely outside the slot system. `directoryData.ts` resolves only the hero and CTA slot props and no content. Stage 05 did **not** add one: that is directory-template work belonging to Stage 07.

**Section-landing deduplication is per-slot, not cross-slot.** Each landing page has one article-bearing feed plus a featured slot, so a shared context has nothing to deduplicate against today. If Stage 07 gives landings multiple feeds, they should adopt the same `createSelectionContext` pattern — the contract already supports it.

**Detail templates have one related block per page**, so cross-slot deduplication does not arise. The related query excludes the current entity already.

---

## 8. The newsletter retirement (D-11)

Not strictly content-source work, but it is the other approved decision and it touches the registry.

| Requirement | Implementation |
|---|---|
| Remove from the Builder's available registry | `SectionDef.retired` flag; `getAvailableBlockTypes` filters retired blocks out of every family library |
| Admin cannot add it to a new layout | it is absent from the block library, so there is nothing to click |
| Remove misleading default placement | `buildDefaultSlots` skips retired blocks — it was previously in the homepage default layout |
| Preserve compatibility with stored layouts | the definition is **retained**, marked `retired`. Save validation uses a new `getKnownSectionTypes`, which includes retired types, so a page containing one stays editable |
| Handle a legacy slot safely | the `blockRegistry` entry was removed, so `PageRenderer` skips it: **no form, no input, no submit control, no markup at all** |
| Do not collect personal data | nothing is rendered, so nothing can be typed or submitted. A test asserts no newsletter or subscription API route exists |
| Do not create a backend | none created, no provider introduced |

**Why retired and not deleted.** Deleting the definition would make `saveDraft` reject any stored layout still containing the type, locking an admin out of editing a page they never touched. Stage 04 found zero stored layouts in the inspectable databases, **but production was not inspected** — so the safe assumption is that such a layout may exist.

The component itself (`PremiumBlocks.tsx`) is retained but unreachable, annotated with a warning not to re-register it until a backend and consent workflow exist. That keeps revival cheap without leaving an active data-collection surface.

---

## 9. What this architecture explicitly does not do

- Does not introduce a second content engine, or any parallel source-resolution implementation.
- Does not add a persistence schema, a migration, or any new stored property.
- Does not advertise a control it has not implemented — no `fallbackPolicy`, `emptyBehavior` or `upcoming` property was added.
- Does not give directory templates a content source, or detail pages full composability — both are Stage 07.
- Does not change CMS ownership: factual records remain authoritative, and no editorial record was modified.
- Does not alter the SEO engine, publishing lifecycle, RBAC, draft isolation or the environment isolation guard.
