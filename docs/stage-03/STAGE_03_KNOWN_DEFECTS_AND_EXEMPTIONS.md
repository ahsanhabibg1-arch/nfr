# Stage 03 — Known Defects & Exemption Register

**Stage:** 03 of 10 · **Date:** 2026-11-09 · **HEAD:** `fd4fb10`

Stage 03 **captures** defects; it does not fix product behaviour. The one exception is Task G (layout-retrieval observability), which was in scope because a silent fallback would have masked regressions throughout Stages 04–10.

Nothing here is suppressed. The dedup invariant is left **failing** rather than skipped, because marking a known defect green is the precise reporting failure this programme exists to correct.

---

## 1. Known defects captured by a test

### KD-01 — Homepage renders duplicate articles · **CAPTURED, FAILING BY DESIGN** · owner: **Stage 05**

| | |
|---|---|
| **Test** | `tests/stage03-dedup-invariant.test.ts` → "no article appears more than once across resolved homepage slots" |
| **Status** | **FAILING.** This is the intended Stage 03 outcome and the single failing test in the suite. |
| **Executed evidence** | 7 entities resolved into more than one homepage slot: `art-02` ×2, `art-03` ×2, `art-04` ×2, `art-05` ×2, `hero-sec-02` ×2, `fixture-article-entertainment-article` ×2, `fixture-article-events-shopping-article` ×2 |
| **Independent confirmation** | Observed over HTTP against the running site during Stage 02: `/articles/how-to-watch-nfr-streaming-cable-cord-cutters/` rendered **3×** and five further articles **2×** on the live homepage |
| **Root cause** | `lib/cms/homepageData.ts` — the `shownInHero` exclusion list is passed only to the `latest-coverage` slot, and is never extended after the hero resolves. Sibling category slots therefore cannot deduplicate against the hero or against each other. |
| **Designed-but-unconnected fix** | `lib/cms/contentSourceEngine.ts` contains a `DeduplicationContext` built for exactly this, threaded through `resolveMultipleSources`. The module has **zero importers** (§3), so the capability was designed and then never connected. |
| **Why not fixed here** | Stage 05 owns the content-source layer. Fixing it in Stage 03 would change which articles appear in which homepage slots — a visible editorial change requiring owner preview, outside a testing stage. |
| **Verification at fix time** | This same test must turn green with no modification to its assertion. |

**Operational note for CI:** until Stage 05 lands, `npm test` exits non-zero on this one test. Treat the expected-failure count as exactly **1**, and treat any change in that number as a regression in either direction.

---

## 2. Defects fixed in Stage 03

### KD-02 — Layout retrieval silently swallowed database errors · **FIXED**

| | |
|---|---|
| **Was** | `getPublishedSections` / `getDraftSections` caught every error and returned family defaults with no log. A database outage was indistinguishable from "this page has no customised layout". |
| **Now** | Both route through `resolveSections`, which returns an explicit `SectionSource`: `stored` · `default-no-layout` · `default-empty` · `default-db-error`. The error path logs once via `log.error` and reports to the `database` category. |
| **Fallback** | **Preserved.** A public page still renders during an outage — only the silence is removed. |
| **Public contract** | Unchanged. Callers still receive a plain `SectionSlot[]`. Two diagnostic variants (`getPublishedSectionsResolved`, `getDraftSectionsResolved`) expose the outcome. |
| **Tests** | 8 in `tests/stage03-layout-observability.test.ts`, including a negative control that fails when the two outcomes collapse together |
| **Mutation-verified** | Yes — M2 |

---

## 3. Known defects captured in documentation only

Carried from the Stage 02 audit; no Stage 03 test covers them because each needs product work that belongs to a later stage.

| ID | Defect | Evidence | Owner |
|---|---|---|---|
| KD-03 | **10 inert block properties** — advertised in the Builder, no effect on output | Registered in the Task A exemption register; the register's stale-entry check fails the suite the moment any of them starts working | **Stage 04** |
| KD-04 | **`contentSourceEngine.ts` is dead code** — 402 lines, **zero importers**, unreachable by construction (`parseContentSource` returns `null` without `props.sourceMode`, and `sourceMode` appears nowhere in the registry). It also omits the fixture-exclusion filter the live path applies at 24 call sites | Re-verified in Stage 02; count of `sourceMode` in `sectionRegistry.ts` is **0** | **Stage 05** (decision **D-04**, still unapproved) |
| KD-05 | **2 block types declared twice** (`rich-text-block`, `cta-banner`) with divergent `maxInstances`; first-wins dedupe means homepage limits silently apply on landing pages | Asserted in the Task A shape invariants | **Stage 04** |
| KD-06 | **`detail-related.articleCount` is unclamped** — `Number(…) \|\| 3` feeds a Prisma `take`, so a large stored value issues an unbounded query | Stage 02 source review | **Stage 04** |
| KD-07 | **Property validation is string-only** — XSS check is `/<script/i` alone; `select` options unvalidated; non-string props unchecked; no prop whitelist; `required` unenforced server-side | Stage 02 source review | **Stage 04** |
| KD-08 | **Draft save flushes the entire public cache** — `rev()` calls `revalidatePath('/', 'layout')` from `saveDraftAction` | Stage 01 follow-up FU-1 | **Stage 08** |
| KD-09 | **No optimistic concurrency on interactive saves** — two admins silently overwrite each other | Stage 02; `version` is incremented only inside `executeScheduledPublish` | **Stage 08** |
| KD-10 | **Revision number computed outside its transaction** — `nextRevisionNo()` is awaited while building the `$transaction` array; concurrent publishes can collide on `@@unique([pageKey, revisionNo])` | Stage 02 | **Stage 08** |
| KD-11 | **7 legal pages serve `noindex` plus a visitor-facing draft banner** | Observed over HTTP in Stage 02 | **Stage 09** + decision **D-13** (owner/legal) |
| KD-12 | **Editing a published `InfoPage` reverts the public page to hardcoded text or 404s** | Stage 02 source review | **Stage 09**, migration S-1 |
| KD-13 | **Homepage emits zero JSON-LD**; no sitewide `Organization`/`WebSite` entity | Observed over HTTP in Stage 02 | **Stage 09** + decision **D-14** |
| KD-14 | **`/info/<slug>/` is indexable but absent from the sitemap** | Stage 02 source review | **Stage 09** |

---

## 4. New findings from Stage 03

Discovered while building the suites. Neither is a rendering defect, so neither blocks this stage.

### NF-01 — Undeclared conditional property dependencies

Several properties take effect **only** when a partner property is also set. They are genuinely consumed, so they are not exempt — but the Builder presents them as independent fields, so an admin who sets only one sees no change and reasonably concludes the control is broken.

| Property | Requires | Evidence |
|---|---|---|
| `editorial-hero.heroImageAlt` | `heroImageUrl` | `components/sections/EditorialHero.tsx:27` — the alt is used only when a hero image URL is present |
| `ctaUrl` on `latest-coverage`, `plan-and-watch`, `entertainment`, `events-shopping`, `learning` | `ctaText` | e.g. `components/sections/PlanAndWatchSection.tsx:23-24` — `actionHref` is set only when `ctaText` is non-empty |
| `stats-banner.statNLabel` / `statNValue` | each other | `PremiumBlocks.tsx:42` filters out incomplete pairs |
| `faq-block.qN` / `aN` | each other | `PremiumBlocks.tsx:82` filters out incomplete pairs |

**Recommendation (Stage 04):** express the dependency in the registry — e.g. a `requires` field on `PropDef` — and have the editor disable or annotate the dependent field until its partner is set. **Owner approval: not required** (UX correction within approved scope).

### NF-02 — Trailing slashes are normalised in rendered hrefs

`next/link` emits `href="/x"` for a stored value of `/x/`. Harmless, but it means any future assertion on a stored URL must expect the normalised form. Recorded so it is not rediscovered as a bug.

---

## 5. Task A exemption register — current state

16 entries. The register may **shrink** but never grow silently: an unregistered exemption fails the suite, and a stale entry fails it too.

### NO_RENDERER — 9 entries across the 6 declared types with no `blockRegistry` entry

`landing-stat-pills` (whole type) · `detail-body` (whole type) · `detail-hero.heroImageUrl` · `detail-hero.showImage` · `detail-faq.title` · `directory-hero.heroImageUrl` · `directory-hero.title` · `directory-hero.description` · `directory-grid.columns`

Resolution: **Stage 07** for the detail and directory types, under the now-approved **Option B** (shared structured templates with optional appendage sections) — which confirms `detail-hero`, `detail-body` and `detail-faq` for **removal** rather than promotion. `landing-stat-pills` is **Stage 04**.

### INERT — exactly 3, pinned by an integrity test

| Entry | Why | Fix class | Owner |
|---|---|---|---|
| `landing-hero.heroImageUrl` | **Structurally unconsumable** — `SectionLandingHeroProps` (`components/editorial/SectionLandingHero.tsx:4-12`) has no image field at all. Needs a component change, not wiring | component change | Stage 04 |
| `landing-grid.articleCount` | `sectionLandingData` passes `secondaryStories` unsliced; `LandingGridBlock` renders the full array with a hardcoded `columns={3}` | resolver + component | Stage 04 |
| `detail-related.title` | The resolver never copies `title` into `data`; the block reads `data` only, and `RelatedArticles` hardcodes its heading | wiring | Stage 04 |

### VIA_RESOLVER — 4 entries, proven elsewhere

`detail-cta.ctaText` · `detail-cta.ctaUrl` · `directory-cta.ctaText` · `directory-cta.ctaUrl` — consumed through resolver `data` rather than `slot.props`. Persistence is proven in the causation suite. `detail-related.articleCount` is also registered here, with its unclamped-query defect noted (KD-06).

Additionally, `featured`- and `number`-typed properties are exempt **by type** rather than by entry, because the resolver reads them. Their round trip is proven in the causation suite.

---

## 6. Legacy structural-test baseline — 49 entries

`tests/support/stage03LegacyStructuralTests.json` grandfathers 49 pre-existing tests whose names claim a rendering outcome while their assertions read source text. The gate caps the set: new violations fail, and stale entries fail.

Concentration: `batch-t2-detail-templates` (9) · `batch-g-info-pages` (7) · `batch-a-renderer` (6) · `batch-c-revisions` (4) · `batch-i-hardening`, `batch-e-directory`, `batch-d-scheduling`, `batch-t4-quick-access-helptext`, `batch-t3-competitor-venue`, `batch-b-detail`, `batch19-admin-ui`, `batch-t1-featured-picker` (remainder).

The reference case remains `batch-t4-quick-access-helptext.test.ts` — "editor renders helpText for text props", whose assertion searches the whole editor file for `helpText`, matches three unrelated prop branches, and passes while the `text` branch renders nothing.

**Recommendation:** convert these opportunistically as each stage touches the relevant area, trimming the baseline each time. Do not schedule a dedicated conversion sweep — the gate already prevents the debt growing.

---

## 7. Decisions still requiring owner approval

Unchanged by Stage 03 except where the Option C approval resolved them (recorded in `docs/stage-02/STAGE_02_DECISION_REGISTER.md`).

**Resolved by the Option C approval:** D-15, D-01, D-02 (Option B), D-03.

**Still open:** **D-04** (content engine retire/integrate — **blocks Stage 05**) · D-05 footer ownership · D-06 appearance controls · D-07 revision retention · D-09 publication half · D-11 newsletter block · D-12 scheduler/deployment · D-13 legal content · D-14 sitewide JSON-LD · D-10 is engineering, no approval needed.
