# Stage 02 — Block & Page Coverage Inventory

**Stage:** 02 of 10 (max 12) · **Date:** 2026-11-09 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10`
**Status:** specification/inventory only — no application code was modified.

### Evidence convention

**[RE-VERIFIED]** — the prior audit made this claim; it was independently re-derived from source in Stage 02 and the result is stated. **[SOURCE]** — read at the cited `path:line`. **[RUNTIME]** — observed over HTTP. **[STALE]** — a historical claim that is no longer true at HEAD. **[UNVERIFIED]** — not established.

---

## 1. Registry counts — re-derived, not inherited

Stage 02 re-computed every count by parsing `lib/cms/sectionRegistry.ts` and `components/blocks/registry.tsx` rather than trusting the audit. **[RE-VERIFIED]** — all figures reproduced exactly:

| Measure | Value | Detail |
|---|---|---|
| Declared block definitions | **29** | `type: '…'` entries across four family arrays |
| Unique declared types | **27** | 29 − 2 duplicates |
| Duplicate definitions | **2** | `rich-text-block`, `cta-banner` |
| Renderer entries (`blockRegistry`) | **23** | unique keys |
| Declared types with **no** renderer | **6** | `landing-stat-pills`, `detail-hero`, `detail-body`, `detail-faq`, `directory-hero`, `directory-grid` |
| Rendered types **not** declared | **2** | `landing-empty`, `landing-competition-disciplines` |
| `KNOWN_PAGE_KEYS` | **15** | |
| Arithmetic consistency | ✓ | 27 − 6 + 2 = 23, matching the renderer count |

One correction to the audit's own record: it listed 6 declared-without-renderer types but enumerated only 5 in prose, omitting `landing-stat-pills`. The re-derivation confirms **6**, and `landing-stat-pills` is included below.

**Shared block contract** **[SOURCE]** `components/blocks/blockProps.ts:3-11`:

```ts
export interface BlockProps { slot: SectionSlot; data: Record<string, unknown>; }
export function slotStr(slot: SectionSlot, key: string, fallback = ''): string
```

This materially refines the audit's "two incompatible prop contracts" finding. The **interface is already uniform** — every block receives both `slot` and `data`. The divergence is purely in *consumption*: homepage/landing blocks read `slot.props`, while detail/directory blocks ignore `slot` entirely. Unification therefore needs no interface change, only resolver and component edits. This makes Stage 04 materially cheaper than the audit implied.

---

## 2. Complete block inventory

**Cons.** = property actually consumed by public rendering. **Reads** = `slot` (reads `slot.props`), `data` (resolver data only), or both.

### 2.1 Homepage family — 15 blocks

| Block | Purpose | Declared props (type · default) | Reads | Cons. | Defects | Proposed correction | Required behavioural test |
|---|---|---|---|---|---|---|---|
| `editorial-hero` | Lead story + secondaries | `featuredIds`(featured·[]) `heroImageUrl`(image·'') `heroImageAlt`(text·'') `kicker`(text) `ctaText`(text) `secondaryCount`(num≤4·3) | slot | **6/6** | none | preserve as the reference implementation | sentinel per prop → public HTML |
| `latest-coverage` | Newest articles feed | `kicker` `title` `description`(textarea) `articleCount`(num≤12) `featuredIds` `ctaText` `ctaUrl`(url) | slot | **7/7** | none | preserve | sentinel + count assertion |
| `quick-access` | Shortcut link grid | `kicker`(+`helpText`) `title` `description` | slot | copy only | `helpText` **never renders** (type `text`); items sourced from nav service, not Builder | fix helpText in shared field chrome; label items as nav-owned | DOM assertion that helpText text is present |
| `competition` | Discipline grid | `kicker` `title` `description` | slot | 3/3 | none | preserve | sentinel |
| `plan-and-watch` | Section feed | `kicker` `title` `description` `articleCount`(num≤**8**) `featuredIds` `ctaText` `ctaUrl` | slot | 7/7 | `featuredIds` **absent from `defaultProps`**; declared max 8 but runtime clamp is 0–12 | add to defaults; align clamp to declared max | boundary test at the declared max |
| `entertainment` | Section feed | as above | slot | 7/7 | same two | same | same |
| `events-shopping` | Section feed | as above | slot | 7/7 | same two | same | same |
| `learning` | Evergreen feed | as above | slot | 7/7 | same two | same | same |
| `more-rodeo` | Hubs + events | `kicker` `title` `description` | slot | 3/3 | none | preserve | sentinel |
| `rich-text-block` | Free prose | `title` `body`(textarea) `alignment`(select L/C/R) | slot | 3/3 | **DUPLICATE DEFINITION**; `alignment` cast unvalidated | single definition with a `families` array; validate against `options` | reject a non-option value |
| `image-text-block` | Image + prose | `title` `body` `imageUrl`(image) `imageAlt`(text) `imagePosition`(select) `ctaText` `ctaUrl` | slot | 7/7 | raw `<img src>` / `<a href>` | keep; URL props are scheme-validated | sentinel + alt assertion |
| `stats-banner` | Up to 4 stats | `title` + `stat1-4Label/Value` (9×text) | slot | 9/9 | React key on `s.label` collides on duplicate labels | key by index | duplicate-label render test |
| `cta-banner` | Call to action | `kicker` `title` `description` `ctaText` `ctaUrl` `bgColor`(select) | slot | 6/6 | **DUPLICATE DEFINITION** | single definition with `families` | limit-enforcement test |
| `faq-block` | Up to 5 Q&A | `title` + `q1-5`/`a1-5` (11 props) | slot | 11/11 | key on `f.q` | key by index | sentinel |
| `newsletter-signup` | Email capture | `title` `description` `ctaText` `placeholderText` | slot | 4/4 | **NON-FUNCTIONAL** — `readOnly` input, button with no handler. Documented as *hidden until a backend exists* yet renders publicly | remove from registry (the documented decision) — **owner decision D-11** | assert absent from available types and from public HTML |

### 2.2 Section-landing family — 6 blocks

| Block | Purpose | Declared props | Reads | Cons. | Defects | Proposed correction | Required test |
|---|---|---|---|---|---|---|---|
| `landing-hero` | Section hero | `heroImageUrl`(image) `kicker` `title` `description` | slot+data | 3/4 | **`heroImageUrl` structurally unconsumable** — `SectionLandingHeroProps` has **no image field** **[SOURCE]** `components/editorial/SectionLandingHero.tsx:4-12`; stat pills hardcoded | add an image field to the component, or delete the prop | sentinel; must fail before the component change |
| `landing-featured` | Department feature | `featuredIds`(featured) `ctaText` | slot+data | 2/2 | `"Department Feature"` label hardcoded | promote label to a prop | sentinel |
| `landing-grid` | Secondary feed | `articleCount`(num≤20) `ctaText` | slot+data | **1/2** | **`articleCount` ignored** — resolver passes `secondaryStories` unsliced **[SOURCE]** `lib/cms/sectionLandingData.ts:44`; heading and `columns={3}` hardcoded | slice by `articleCount`; promote heading and columns to props | count assertion at two different values |
| `landing-stat-pills` | Hero stat pills | **none declared**; `defaultProps.pills[]` present | — | **0** | **BROKEN CONTRACT** — has **no renderer entry**; the stored `pills[]` array is read by nothing; pills are hardcoded in `LandingHeroBlock` | declare a `pills` PropDef and consume it, or delete the block | sentinel on a pill label |
| `rich-text-block` | shared | see 2.1 | slot | 3/3 | duplicate; **homepage limit silently wins here** | single definition | limit test asserting the landing limit |
| `cta-banner` | shared | see 2.1 | slot | 6/6 | duplicate; same | single definition | same |

### 2.3 Detail-template family — 5 blocks

| Block | Purpose | Declared props | Reads | Cons. | Defects | Proposed correction | Required test |
|---|---|---|---|---|---|---|---|
| `detail-hero` | Entity hero | `heroImageUrl`(image) `showImage`(**text**·`true`) | — | **0** | **DEAD** — no renderer. `showImage` declared `text` but defaults to boolean | **owner decision D-02** | n/a until decided |
| `detail-body` | Body marker | **none**; `defaultProps {}` | — | **0** | **DEAD** — zero contract, no renderer | **owner decision D-02** | n/a |
| `detail-related` | Related articles | `title`(text) `articleCount`(num≤6) | **data only** | **1/2** | `title` **ignored** — resolver never passes it; `RelatedArticles` hardcodes `'Related Championship Coverage'`. `articleCount` is `Number(…)\|\|3` **unclamped** → unbounded Prisma `take`; `0` silently becomes `3` | pass `title` through; clamp via `numProp` | sentinel on title; boundary test at 1000 |
| `detail-faq` | FAQ marker | `title`(text) | — | **0** | **DEAD** — no renderer | **owner decision D-02** | n/a |
| `detail-cta` | Tail CTA | `ctaText` `ctaUrl`(url) | data only | 2/2 | none | preserve | sentinel |

### 2.4 Directory family — 3 blocks

| Block | Purpose | Declared props | Reads | Cons. | Defects | Proposed correction | Required test |
|---|---|---|---|---|---|---|---|
| `directory-hero` | Listing hero | `heroImageUrl`(image) `title` `description` | — (route reads data) | 2/3 | **No renderer entry.** `title`/`description` are resolved then read **manually by each route**; `heroImageUrl` is resolved and **dropped** | register a real renderer; consume the image | sentinel on all three |
| `directory-grid` | Listing grid | `columns`(num≤4) | — | **0** | **DEAD** — `required: true` yet unrenderable; cannot be removed by an admin and renders nothing | register a renderer, or drop `required` and delete | column-count assertion |
| `directory-cta` | Listing CTA | `ctaText` `ctaUrl`(url) | data only | 2/2 | none | preserve | sentinel |

### 2.5 Rendered but undeclared — 2 synthetic slots

| Block | Injection point | Issue | Proposed correction |
|---|---|---|---|
| `landing-empty` | `lib/cms/sectionLandingData.ts` — injected with `order:-1, props:{}` | Renders publicly; **not in the registry**, so an admin cannot reorder, hide or edit it | declare it as a registry block with `required`, or document as system-owned chrome |
| `landing-competition-disciplines` | same | Renders two hardcoded headings on `/competition/`; not admin-controllable | declare and give it copy props |

---

## 3. The audit's eight block-level findings — re-checked

| Finding | Audit claim | Stage 02 verdict |
|---|---|---|
| Ten inert editable properties | 10 | **RE-VERIFIED — 10 confirmed**, enumerated in §4 below. Three sit on types that *do* have renderers and were individually re-checked |
| Six declared types without rendering | 6 | **RE-VERIFIED — exactly 6.** The audit's prose enumerated only 5; `landing-stat-pills` was the omission |
| Duplicate block definitions | 2 | **RE-VERIFIED** — `rich-text-block` and `cta-banner`, each defined twice with divergent `maxInstances`; `getAvailableBlockTypes` dedupes first-wins, so homepage limits apply on landing pages |
| Silent unknown-block handling | present | **RE-VERIFIED** — `components/blocks/PageRenderer.tsx:17` returns `null` with no log, violating the intended "skipped **and** logged" invariant |
| Missing field help text | 3 of 9 branches | **RE-VERIFIED** — `helpText` renders only in the `number`, `featured` and `image` branches; absent from `text`, `textarea`, `select`, `boolean`, `color`. `quick-access.kicker` is type `text`, so the project's only help string never reaches the DOM |
| Incomplete property validation | string-only | **RE-VERIFIED** — checks gated on `typeof val === 'string'`; XSS test is `/<script/i` alone; URL checks only for keys matching `/url$/i`; `select` options unvalidated; non-string props unchecked; no prop whitelist; `required` unenforced server-side |
| Inconsistent visibility and ordering | in 4 resolvers | **RE-VERIFIED** — `PageRenderer` applies **neither**; each of the four resolvers filters and sorts independently |
| Unbounded content queries | 1 | **RE-VERIFIED** — `detail-related.articleCount` is `Number(…)\|\|3` with no clamp, feeding a Prisma `take` |

**No audit block-level finding was found stale.** One was found incomplete (the enumeration of six), and one was found *less severe* than described (the prop contract — §1).

---

## 4. The ten inert properties — consolidated

| # | Block | Property | Why inert | Fix class |
|---|---|---|---|---|
| 1 | `detail-hero` | `heroImageUrl` | no renderer | decision D-02 |
| 2 | `detail-hero` | `showImage` | no renderer; also a type mismatch | decision D-02 |
| 3 | `detail-body` | — (no props) | no renderer, no contract | decision D-02 |
| 4 | `detail-faq` | `title` | no renderer | decision D-02 |
| 5 | `detail-related` | `title` | renderer exists; resolver never passes it | wiring |
| 6 | `landing-hero` | `heroImageUrl` | **component has no image field** | component change |
| 7 | `landing-grid` | `articleCount` | resolver passes the list unsliced | wiring |
| 8 | `directory-hero` | `heroImageUrl` | resolved then dropped | wiring |
| 9 | `directory-grid` | `columns` | no renderer | wiring or delete |
| 10 | `landing-stat-pills` | `pills[]` (undeclared default) | no renderer; nothing reads the array | declare + consume, or delete |

**Six are wiring or deletion. One needs a component change. Three hinge on owner decision D-02** (detail-template direction).

---

## 5. Page-family coverage

**Builder mode:** `full` = slots drive the visible layout · `tail` = slots appended below fixed JSX · `hero+cta` = only those slot types · `none`.
**Complexity:** S = wiring only · M = resolver + component work · L = needs an owner decision or a migration.

| Page family | Public route (verified) | Template | Builder now | Editable sections | CMS dependency | SEO owner | Draft preview | Proposed target | Cx |
|---|---|---|---|---|---|---|---|---|---|
| Homepage | `/` | own | **full** (15 blocks) | all | Articles, Disciplines, Nav | **hardcoded** | **yes** | add `HOMEPAGE` entity SEO; fix dedup; remove newsletter block | **S** |
| NFR Competition | `/competition/` | shared landing | **full** (6) | all | Articles, Disciplines | EntitySeo(SECTION) | yes | consume `heroImageUrl`, `articleCount`; declare the 2 synthetic slots | **M** |
| NFR Entertainment | `/entertainment/` | shared landing | **full** | all | Articles | EntitySeo | yes | as above | **M** |
| NFR Events & Shopping | `/events-shopping/` | shared landing | **full** | all | Articles | EntitySeo | yes | as above | **M** |
| NFR Plan & Watch | `/plan-watch/` | shared landing | **full** | all | Articles | EntitySeo | yes | as above | **M** |
| More Rodeo | `/rodeo-events/` | shared landing + fixed `RodeoDirectory` | **full** (section part) | section only | Articles, Hubs, Events | EntitySeo | yes | promote the two `RodeoDirectory` headings to props | **M** |
| Article detail | `/articles/[slug]/` | shared appendage | **tail** | `detail-related`, `detail-cta` | Articles, Sources, Comments | ArticleSeo — **strongest** | yes | decision D-02; pass `detail-related.title` | **L** |
| Rodeo hub detail | `/rodeo-events/[slug]/` | shared appendage | **tail** | same 2 | RodeoHub | EntitySeo | yes | decision D-02 | **L** |
| Rodeo event detail | `/rodeo-events/[slug]/` (same route, event branch) | shared appendage | **tail** | same 2 | RodeoEvent | EntitySeo | yes | decision D-02 | **L** |
| Annual edition | `/rodeo-events/[slug]/[edition]/` | shared appendage | **tail** | same 2 | RodeoEventEdition | EntitySeo | yes | decision D-02 | **L** |
| Discipline | `/disciplines/[slug]/` | shared appendage | **tail** | same 2 | Discipline — **deep-guide JSON and image have no admin owner; no create/delete** | EntitySeo | yes | decision D-02; extend the discipline editor | **L** |
| Category / archive | `/categories/[slug]/` | shared appendage | **tail** | same 2 | Category — `description` written but never rendered | EntitySeo | yes | decision D-02; consume `description` | **L** |
| Competitor directory | `/competitors/` | own | **hero+cta** | CTA only; hero read manually | Competitor | **hardcoded** | yes | register `directory-hero` + `directory-grid` renderers; entity SEO | **M** |
| Competitor profile | `/competitors/[slug]/` | shared appendage | **tail** | same 2 | Competitor | EntitySeo — JSON-LD `url` is **relative** | yes | decision D-02; absolute `url` | **L** |
| Venue directory | `/venues/` | own | **hero+cta** | CTA only | Venue | **hardcoded** | yes | as competitor directory | **M** |
| Venue profile | `/venues/[slug]/` | shared appendage | **tail** | same 2 | Venue | EntitySeo — no derived image; relative `url` | yes | decision D-02; image fallback | **L** |
| Schedule | `/rodeo-events/[slug]/[edition]/schedule/` | own fixed | **none** | — | CompetitionSession — **admin-editable end-to-end** | **hardcoded** | **no** | keep data-driven; add entity SEO + optional tail blocks | **M** |
| Results | `…/[edition]/results/` | own fixed | **none** | — | CompetitionResult — admin-editable | **hardcoded** | **no** | as schedule | **M** |
| Standings | `…/[edition]/standings/` | own fixed | **none** | — | CompetitionStanding — admin-editable | **hardcoded** | **no** | as schedule | **M** |
| Information / legal | `/info/[slug]/` + 7 legacy (`/about/`, `/terms/`, `/privacy/`, `/editorial-policy/`, `/contact/`, `/corrections/`, `/affiliate-disclosure/`) | own fixed | **none** | — | InfoPage — **no draft/published pair** | InfoPage fields; **no canonical/ogImage/robots columns** | **no** | decisions D-09 and D-13; add draft model + preview | **L** |
| Search | `/search/` | own fixed | **none** | — | client index | N/A — `index:false` by design | no | leave; promote group headings to config | **S** |
| Auth ×4 | `/login/` `/register/` `/forgot-password/` `/reset-password/` | own fixed | **none** | — | auth | N/A | no | out of scope | — |
| Account ×2 | `/account/` `/account/comments/` | own fixed | **none** | — | User | N/A | no | out of scope | — |

**Verified coverage:** of 15 Builder page keys, **6 compose fully** (homepage + 5 section landings), **7 tail-append** (all `template:*`), **2 consume a CTA only** (both `directory:*`). **No proposed route is invented** — every route above was enumerated from `app/(public)/`.

**Not a Builder page key, but public:** schedule, results, standings, search, info/legal, auth, account. These have no `PageLayout` row and are listed for completeness.

---

## 6. Draft/published behaviour per block family

**[SOURCE]** All four resolvers branch on `isStaffDraftPreview()`, and the audit's end-to-end trace found **no** case where a resolver accepts a `draft` flag without threading it. **[RUNTIME]** An anonymous client cannot obtain draft content.

| Family | Draft source | Published source | Preview verified |
|---|---|---|---|
| Homepage | `getDraftSections('homepage')` | `getPublishedSections('homepage')` | yes |
| Section landing | `resolveSectionLandingSlots(key,{draft})` | same, `draft:false` | yes |
| Detail template | `fetchVisibleSlots(key,{draft})` | same | yes |
| Directory | `resolveDirectorySlots(key,{draft})` | same | yes |

**Gap:** schedule, results, standings and search never call `isStaffDraftPreview()`, so they have no preview path. Low priority — they are data-driven with no Builder layout.

---

## 7. Property-editor coverage

**[SOURCE]** Nine editor types exist in `renderPropField`: `number`, `boolean`, `select`, `textarea`, `richtext`, `featured`, `image`, `color`, and a `text`/`url` fallback.

| Type | Renders `helpText` | Validated server-side | Note |
|---|---|---|---|
| `number` | **yes** | clamped at resolve time on homepage/landing only | `detail-related` unclamped |
| `featured` | **yes** | array length only | real search/recent/reorder picker |
| `image` | **yes** | `/url$/i` scheme check | MediaPicker + preview |
| `text` / `url` | **no** | 2000 chars; URL scheme if key ends `url` | **the branch `quick-access.kicker` uses** |
| `textarea` | **no** | 2000 chars | |
| `select` | **no** | **options never validated** | accepts any string |
| `boolean` | **no** | **unchecked** | |
| `color` | **no** | **unchecked** | |
| `richtext` | **no** | 2000 chars | **falls through to a plain textarea** — declared capability not delivered; used by no block |

---

## 8. Required behavioural tests — consolidated

Grouped by the Stage 03 suite that should own them. None may be satisfied by a source-text substring assertion.

1. **Registry contract (parameterised over all 27 types × every declared prop)** — render with a sentinel, assert it in output, or assert a recorded exemption. Catches all ten inert props and any future regression.
2. **Property-editor DOM test** — `helpText` is present for every editor type that declares it.
3. **Limit enforcement** — declared `max` rejected server-side; `detail-related` bounded at 1000.
4. **Select validation** — a non-option value is rejected.
5. **Duplicate-definition guard** — fail if any `type` is declared twice.
6. **Unknown-slot handling** — an unregistered `sectionType` renders nothing **and logs**.
7. **Visibility/order** — hidden slots absent from output; order reflected in DOM order, asserted through the renderer rather than per resolver.
8. **Dedup invariant** — no article id appears twice across a resolved page's slots.
9. **Draft isolation** — anonymous requests never receive draft content, for all 15 keys.
10. **Layout compatibility** — a stored layout written before a prop existed still renders with defaults.

---

## 9. Limitations

1. **No stored-layout inspection.** Reading `PageLayout.draftSections`/`publishedSections` from the development database was **not** performed — Stage 02 is read-only on code and the stage directive permits DB inspection only against an independently verified non-production database. **Required for a later stage:** before any inert prop is wired or any block type removed, query both JSON columns for the affected keys, because wiring a previously-ignored prop will change live pages for any owner who already saved a value. Defined as a Stage 04 prerequisite.
2. **No browser verification.** No admin credentials were available, so the Builder UI was assessed from source. The non-visual canvas finding is unambiguous in source and matches an owner-supplied screenshot, but was not observed in a browser.
3. **`maxInstances` values per duplicate** were not individually transcribed; only the divergence and the first-wins resolution were verified.
