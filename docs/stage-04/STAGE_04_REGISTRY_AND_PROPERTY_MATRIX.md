# Stage 04 — Registry & Property Matrix

**Stage:** 04 of 10 · **Date:** 2026-11-09 · **HEAD:** `fd4fb10`

All counts below were derived by parsing the live registry and renderer, not quoted from a prior report.

---

## 1. Registry counts — before and after

| Measure | Stage 03 | Stage 04 | Change |
|---|---|---|---|
| Definition entries across the four family arrays | 29 | **29** | unchanged — shared blocks still appear in two families |
| **Distinct definition objects** | **27** | **27** | unchanged |
| **Duplicate declarations** (two literals for one type) | **2** | **0** | ✅ `rich-text-block`, `cta-banner` consolidated |
| Renderer entries in `blockRegistry` | 23 | **23** | unchanged |
| Declared types with no renderer | 6 | **5** | `landing-stat-pills` reclassified as a deliberate toggle |
| Rendered types not declared | 2 | **2** | unchanged — internal injected slots, §4 |
| `KNOWN_PAGE_KEYS` | 15 | **15** | unchanged |

**On the "29 entries, 0 duplicates" distinction.** A shared block legitimately appears in two family arrays — but it must be the **same object**, not a second declaration. Before Stage 04 there were two divergent literals per shared type, and `getAvailableBlockTypes` deduped first-wins, so one declaration was silently discarded along with its stricter instance cap. The new test asserts object **identity**, which is the property that actually matters:

```
every block type resolves to exactly ONE definition object  ✅
the two shared blocks appear in two families via a single definition  ✅
```

---

## 2. Exemption register — before and after

| Reason | Stage 03 | Stage 04 | Notes |
|---|---|---|---|
| `INERT` — a renderer exists but the property reaches no output | **3** | **0** | ✅ all three fixed (§3) |
| `NO_RENDERER` — declared type absent from `blockRegistry` | 9 | **8** | one reclassified to `BY_DESIGN` |
| `VIA_RESOLVER` — consumed through resolver data | 5 | **6** | `detail-related.title` moved here once wired |
| `BY_DESIGN` — correctly has no renderer *(new reason)* | — | **1** | `landing-stat-pills` |
| **Total entries** | 17 | **15** | |

`BY_DESIGN` was added because `NO_RENDERER` conflated two different things: a defect (a block that should render and cannot) and a deliberate choice (a control that is not a block). Counting them together overstated the defect list.

**The register cannot grow silently.** An unregistered exemption fails the contract suite, and a stale `INERT` entry fails it too — the suite renders every `INERT` property on each run and fails if one starts working, which is what forced this stage to clear all three rather than leave them documented.

---

## 3. The three inert properties — fixed

| Property | Broken data flow | Correction | Proven by |
|---|---|---|---|
| **`landing-hero.heroImageUrl`** | **Structurally unconsumable.** `SectionLandingHeroProps` had no image field, so `LandingHeroBlock` had nothing to pass it to. A component change, not wiring. | `SectionLandingHero` gained optional `backgroundImageUrl` / `backgroundImageAlt`, rendered as a background layer behind the existing dark panel with a gradient to preserve headline contrast. `LandingHeroBlock` now passes `p('heroImageUrl')`. | 5 tests. Renders the URL when set; renders **no `<img>` at all** when unset or blank; decorative unless alt supplied |
| **`landing-grid.articleCount`** | Resolver passed `secondaryStories` through unsliced; the block rendered the whole array. | New `limitList()` helper in `slotUtils`, applied in `sectionLandingData`. Absent **or zero** keeps the previous "show all" behaviour. | 7 tests covering 2, 4, unset, zero, above-max clamping, above-available, plus the block rendering exactly what it is handed |
| **`detail-related.title`** | Resolver never copied `title` into `data`; the block read `data` only; `RelatedArticles` hardcoded its heading. | `detailTemplateData` now passes `title` (trimmed, omitted when blank) into `data` in both resolver branches; `DetailRelatedBlock` forwards it. `RelatedArticles` already accepted an optional `title` — only the pass-through was missing. | 3 tests. Custom heading replaces the default; absent or empty falls back to the documented default |

**`detail-related.title` moved to `VIA_RESOLVER`, not removed from the register.** It is now wired, but it is consumed through resolver `data` rather than `slot.props`, so a component-level slot sentinel cannot prove it. Keeping it registered with an accurate reason, and proving it where it actually flows, is more honest than deleting the entry to make a count look clean.

---

## 4. Undeclared and unsupported types (Task E)

| Type | Decision | Rationale |
|---|---|---|
| **`landing-stat-pills`** | **Registered control — keep, correctly has no renderer** | It is a visibility toggle: `resolveSectionLandingSlots` reads whether the slot is present and visible, derives `pillsVisible`, then `continue`s. The pills render inside the hero from live article counts. **Action taken:** removed the `defaultProps.pills[]` array (read by nothing, and it made the block look configurable); relabelled to "Stat Pills (show/hide)" with a description stating values are calculated automatically; exemption reclassified to `BY_DESIGN`. |
| **`landing-empty`** | **Internal-only renderer element — keep unregistered** | Injected by the resolver with `order:-1` and empty props, and it only renders when a section has zero articles. Admin configuration would be wrong in principle: an admin should not be able to hide the "no articles yet" state, and there is nothing in it to edit. Documented rather than promoted. |
| **`landing-competition-disciplines`** | **Internal-only for now — promotion deferred to Stage 07** | Also resolver-injected, on `/competition/` only. It renders two hardcoded headings ("Championship Disciplines", "NFR Discipline Guides") that an admin cannot edit — a genuine gap, but making it a configurable block is section-landing presentation work that belongs with Stage 07, not a registry correction. |
| **`detail-hero`, `detail-body`, `detail-faq`** | **Confirmed for removal — deferred to Stage 07** | The owner's approved Option B ("shared structured editorial templates, with optional approved appendage sections") settles their fate. The stored-layout audit shows **zero** stored occurrences, so removal is risk-free in the audited environments. Not removed here because the stage directive says to coordinate detail cleanup with Stage 07, and because `detail-hero`/`detail-body` are `required: true` and appear in `buildDefaultSlots('detail-template')` — removing them changes the detail-family default layout, which is Stage 07's surface. |
| **`directory-hero`, `directory-grid`** | **Preserved unchanged — Stage 07** | Required-section validation left intact as instructed. `directory-grid` carries `required: true` while having no renderer, so it cannot be removed by an admin and renders nothing; whoever removes it must drop the `required` flag in the same change or a directory layout will become unsavable. Recorded for Stage 07. |

---

## 5. Property validation — before and after (Task C)

| Check | Before | After |
|---|---|---|
| Gating | **only** `typeof val === 'string'` | per declared `PropDef.type` |
| Numeric `min` / `max` | **never enforced server-side** | enforced; non-numeric and fractional rejected |
| `select` options | **never validated** | value must be a declared option |
| `boolean` | **unchecked** | must be a real boolean |
| `color` | **unchecked** | must be a hex colour |
| `featured` id lists | **unchecked** | accepts a comma string or array; caps at 50 ids; rejects non-string ids |
| URL identification | key-name heuristic `/url$/i` | declared **type** (`url` \| `image`) — alt-text and position props can no longer be mistaken for URLs |
| Unsafe schemes | `javascript:` only | `javascript:`, `data:`, `vbscript:`, `file:`, `blob:` |
| Markup | `/<script/i` only | `script`, `iframe`, `object`, `embed`, `style`, `link`, `meta`, `base`, `svg`, **any `on*=` event attribute**, and `srcdoc=` |
| Length | 2000 chars, strings only | 2000 chars, enforced per type |
| Undeclared keys | persisted silently | **warned and preserved** — never rejected, never deleted |
| Instance caps | `def.maxInstances`, family-blind | `resolveMaxInstances(def, family)` — the declared per-family cap is the enforced one |

**Deliberately not enforced as rejection:** undeclared legacy keys. A strict whitelist would make a save fail on a page the admin never touched, so Stage 04 ships warn-only per decision D-10. A test asserts the value is still present in what gets written.

**The old `/<script/i` check specifically missed** `<img src=x onerror=...>`, `<svg onload=...>`, `<iframe>` and `data:` URLs. Each now has a test proving rejection, and each test is labelled with the fact that the old check let it through.

---

## 6. Conditional dependency metadata (Task F)

**20 `requires` declarations** added, covering every verified case where a property only takes effect in combination:

| Dependency | Count | Why it was invisible before |
|---|---|---|
| `ctaUrl` → `ctaText` | 9 | `actionHref` is set only when `ctaText` is non-empty (e.g. `PlanAndWatchSection.tsx:23-24`), so setting only the URL did nothing |
| `aN` → `qN` (FAQ) | 5 | `FaqBlock` filters out incomplete question/answer pairs |
| `statNValue` → `statNLabel` | 4 | `StatsBanner` filters out incomplete label/value pairs |
| `heroImageAlt` → `heroImageUrl` | 1 | the alt is used only when a hero image URL is present (`EditorialHero.tsx:27`) |
| `imageAlt` → `imageUrl` | 1 | the image element is only rendered when a URL is set |

**Editor behaviour:** an unmet dependency renders amber guidance naming the prerequisite **by its label, not its key** — "Takes effect once Button text is set." A test asserts the key does not leak into the message.

**Guidance only, by design.** The field stays enabled and its stored value is still rendered. A dependency is routinely unsatisfied mid-edit, and disabling the field would make the admin fill fields in one fixed order; discarding the value would lose work. Two tests assert the value is preserved and the field is not disabled.

A further test asserts **every declared dependency names a real sibling property**, so a typo in `requires` cannot ship silently.

---

## 7. Complete property matrix

**Status:** ✅ consumed and proven · ⚙️ consumed via resolver · 🚫 no renderer (Stage 07) · 🎛️ control, not a block.

### Homepage family — 15 blocks

| Block | Props | Status | Family cap |
|---|---|---|---|
| `editorial-hero` | featuredIds⚙️ heroImageUrl✅ heroImageAlt✅*(requires heroImageUrl)* kicker✅ ctaText✅ secondaryCount⚙️ | ✅ | 1 |
| `latest-coverage` | kicker✅ title✅ description✅ articleCount⚙️ featuredIds⚙️ ctaText✅ ctaUrl✅*(requires ctaText)* | ✅ | 1 |
| `quick-access` | kicker✅ *(+helpText, now renders)* title✅ description✅ | ✅ | 1 |
| `competition` | kicker✅ title✅ description✅ | ✅ | 1 |
| `plan-and-watch` | kicker✅ title✅ description✅ articleCount⚙️ featuredIds⚙️ ctaText✅ ctaUrl✅ | ✅ | 1 |
| `entertainment` | same | ✅ | 1 |
| `events-shopping` | same | ✅ | 1 |
| `learning` | same | ✅ | 1 |
| `more-rodeo` | kicker✅ title✅ description✅ | ✅ | 1 |
| `rich-text-block` | title✅ body✅ alignment✅ | ✅ | **5** homepage / **3** landing |
| `image-text-block` | title✅ body✅ imageUrl✅ imageAlt✅*(requires imageUrl)* imagePosition✅ ctaText✅ ctaUrl✅ | ✅ | 5 |
| `stats-banner` | title✅ + stat1-4 Label✅/Value✅*(each requires its label)* | ✅ | 3 |
| `cta-banner` | kicker✅ title✅ description✅ ctaText✅ ctaUrl✅ bgColor✅ | ✅ | **3** homepage / **2** landing |
| `faq-block` | title✅ + q1-5✅ / a1-5✅*(each requires its question)* | ✅ | 3 |
| `newsletter-signup` | title✅ description✅ ctaText✅ placeholderText✅ | ⚠️ renders, but **non-functional form** — D-11 | 1 |

### Section-landing family — 6 blocks

| Block | Props | Status | Cap |
|---|---|---|---|
| `landing-hero` | **heroImageUrl ✅ FIXED** kicker✅ title✅ description✅ | ✅ | 1 |
| `landing-featured` | featuredIds⚙️ ctaText✅ | ✅ | 1 |
| `landing-grid` | **articleCount ⚙️ FIXED** ctaText✅ | ✅ | 1 |
| `landing-stat-pills` | *(none)* | 🎛️ visibility toggle — `pills[]` default removed | 1 |
| `rich-text-block` | shared definition | ✅ | **3** |
| `cta-banner` | shared definition | ✅ | **2** |

### Detail-template family — 5 blocks

| Block | Props | Status |
|---|---|---|
| `detail-hero` | heroImageUrl🚫 showImage🚫 *(declared `text`, defaults boolean)* | 🚫 Stage 07 removal, confirmed by Option B |
| `detail-body` | *(none)* | 🚫 Stage 07 removal |
| `detail-related` | **title ⚙️ FIXED** articleCount⚙️ **now clamped 1–6** | ✅ |
| `detail-faq` | title🚫 | 🚫 Stage 07 removal |
| `detail-cta` | ctaText⚙️ ctaUrl⚙️ | ✅ |

### Directory family — 3 blocks

| Block | Props | Status |
|---|---|---|
| `directory-hero` | heroImageUrl🚫 title🚫 description🚫 | 🚫 Stage 07 — read manually by each route |
| `directory-grid` | columns🚫 | 🚫 Stage 07 — `required: true` yet unrenderable |
| `directory-cta` | ctaText⚙️ ctaUrl⚙️ | ✅ |

### Rendered but undeclared — 2

`landing-empty` and `landing-competition-disciplines` — internal resolver-injected elements, §4.

---

## 8. Unbounded query, fixed

`detail-related.articleCount` was `Number(…) || 3` with no clamp, feeding a Prisma `take`, so a large stored value issued an unbounded query on every entity-page render.

Now clamped to the declared range in both resolver branches: **min 1, max 6, default 3**. A stored `0` returns the default rather than the previous fall-through — a visible related-content block showing nothing is not a useful state. A boundary test asserts a stored value of 1000 yields at most 6.
