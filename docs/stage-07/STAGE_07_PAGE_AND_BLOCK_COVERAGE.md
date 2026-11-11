# Stage 07 — Page and Block Coverage

**Stage:** 07 of 10 · **Date:** 2026-11-11 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10`

Every table in this document is **generated from live code**, not transcribed. The generator is `apps/web/scripts/stage07-capability-matrix.mts` (page matrix) and `apps/web/scripts/stage07-inspect.mts` (family composition); re-run either to re-derive the state.

---

## 1. The 15-page capability matrix

| Page key | Family | Level | Canvas-selectable | Default layout | Addable (library, with cap) | System / fixed / retired |
|---|---|---|---|---|---|---|
| `homepage` | homepage | `composed` | 14 | editorial-hero, latest-coverage, quick-access, competition, plan-and-watch, entertainment, events-shopping, more-rodeo, learning, rich-text-block, image-text-block, stats-banner, cta-banner, faq-block | editorial-hero×1, latest-coverage×3, quick-access×1, competition×1, plan-and-watch, entertainment, events-shopping, more-rodeo×1, learning, rich-text-block×5, image-text-block×5, stats-banner×3, cta-banner×3, faq-block×3 | newsletter-signup (Retired, D-11) |
| `section:competition` | section-landing | `composed` | 6 | landing-hero, landing-featured, landing-grid, landing-stat-pills, rich-text-block, cta-banner | landing-hero×1, landing-featured×1, landing-grid×1, landing-stat-pills×1, **landing-competition-disciplines×1**, rich-text-block×3, cta-banner×2 | landing-stat-pills (Show / hide), landing-empty (System, injected) |
| `section:entertainment` | section-landing | `composed` | 6 | *(as above)* | *(as above)* | *(as above)* |
| `section:events-shopping` | section-landing | `composed` | 6 | *(as above)* | *(as above)* | *(as above)* |
| `section:plan-watch` | section-landing | `composed` | 6 | *(as above)* | *(as above)* | *(as above)* |
| `section:rodeo-events` | section-landing | `composed` | 6 | *(as above)* | *(as above)* | *(as above)* |
| `template:article` | detail-template | `template-appendage` | 6 | detail-related, detail-cta | detail-related×1, detail-cta×1, **rich-text-block×2, image-text-block×2, faq-block×1, cta-banner×1** | detail-hero, detail-body, detail-faq (all Retired, D-02) |
| `template:rodeo-hub` | detail-template | `template-appendage` | 6 | *(as above)* | *(as above)* | *(as above)* |
| `template:rodeo-edition` | detail-template | `template-appendage` | 6 | *(as above)* | *(as above)* | *(as above)* |
| `template:discipline` | detail-template | `template-appendage` | 6 | *(as above)* | *(as above)* | *(as above)* |
| `template:category` | detail-template | `template-appendage` | 6 | *(as above)* | *(as above)* | *(as above)* |
| `template:competitor` | detail-template | `template-appendage` | 6 | *(as above)* | *(as above)* | *(as above)* |
| `template:venue` | detail-template | `template-appendage` | 6 | *(as above)* | *(as above)* | *(as above)* |
| `directory:competitors` | directory | `directory-limited` | 4 | directory-hero, directory-grid, directory-cta | directory-hero×1, **directory-grid×1**, directory-cta×1, **rich-text-block×2** | — (none unsupported) |
| `directory:venues` | directory | `directory-limited` | 4 | directory-hero, directory-grid, directory-cta | *(as above)* | — |

**Bold** marks what Stage 07 added or newly made real.

### 1.1 Composition level — and why two did not change

| Level | Pages | Honest? |
|---|---|---|
| `composed` | homepage + 5 section landings | Yes. Every section on the page comes from the Builder |
| `template-appendage` | 7 detail templates | Yes, and **deliberately not upgraded to `composed`**. Owner decision D-02 was approved as Option B specifically to KEEP the shared structured template; the record's title, body, metadata and breadcrumbs remain CMS-owned and route-rendered. The directive forbids marking a page `composed` while its structured core sits outside Builder control |
| `directory-limited` | 2 directories | Yes, and **deliberately not upgraded**. All four block types render and are selectable, but the listing's contents, search, filters and pagination come from the database query and the listing is required |

### 1.2 Content-source behaviour per family

| Family | Content source | Deduplication | Bounded? |
|---|---|---|---|
| homepage | `slotUtils` `pickedThenAuto` + one per-request `SelectionContext` | Yes, cross-slot (Stage 05, KD-01) | `numProp` clamps every count |
| section-landing | same; one feed per landing, so nothing to deduplicate across slots | n/a | `limitList` clamps `articleCount` |
| detail-template | `detail-related` → `getRelatedPublishedArticles(id, count)`; the four appendage regions are entirely **prop-driven** (no query) | n/a | `relatedCount` clamps 1–6 |
| directory | the **route's** `listPublicCompetitors` / `listPublicVenues`; attached to the `directory-grid` slot by the resolver | n/a | `take: PAGE_SIZE`, `clampPage`, **and now `publicSlugWhere()`** |

### 1.3 Save / publish compatibility

Unchanged for every page key. `saveDraft` validates against `getKnownSectionTypes(family)`, which still contains every retired type, so:

- a stored layout holding `detail-hero`, `detail-body`, `detail-faq` or `newsletter-signup` **remains saveable and editable**;
- the four newly added detail regions and the directory `rich-text-block` are in `getAvailableBlockTypes`, so they are addable and savable;
- per-family caps are now enforced **and displayed** consistently via `resolveMaxInstances`.

---

## 2. Block inventory — all 29 previously inventoried types, re-verified

`getKnownSectionTypes` across the four families yields **28 distinct types** (27 before Stage 07, plus `landing-competition-disciplines`), and `blockRegistry` holds **24 renderers** (22 before, plus the two directory blocks). Two renderers have no definition by design (`landing-empty`) — see §2.3.

### 2.1 Types with a renderer and a definition — "Editable" (canvas)

| Type | Families | Stage 07 change |
|---|---|---|
| `editorial-hero` | homepage | — |
| `latest-coverage` | homepage | — |
| `quick-access` | homepage | — |
| `competition` | homepage | — |
| `plan-and-watch` | homepage | — |
| `entertainment` | homepage | — |
| `events-shopping` | homepage | — |
| `more-rodeo` | homepage | — |
| `learning` | homepage | — |
| `stats-banner` | homepage | — |
| `rich-text-block` | homepage, section-landing, **detail-template**, **directory** | extended to 2 more families; one shared object, per-family caps |
| `cta-banner` | homepage, section-landing, **detail-template** | extended; one shared object |
| `image-text-block` | homepage, **detail-template** | **extracted** to a shared definition; extended |
| `faq-block` | homepage, **detail-template** | **extracted** to a shared definition; extended. Supersedes `detail-faq` |
| `landing-hero` | section-landing | — |
| `landing-featured` | section-landing | — |
| `landing-grid` | section-landing | — |
| `landing-competition-disciplines` | section-landing | **registered** — gained a definition and editable kicker/heading/description (Task E) |
| `detail-related` | detail-template | — |
| `detail-cta` | detail-template | — |
| `directory-hero` | directory | **gained a renderer**; `heroImageUrl` now consumed; `kicker` added; emits the single `<h1>` (Task F) |
| `directory-grid` | directory | **gained a renderer**; `columns` now consumed and clamped; `required` became truthful; `systemContent` (Task F) |
| `directory-cta` | directory | — |

### 2.2 Retired — definition retained, renders nothing

| Type | Decision | Why retained rather than deleted |
|---|---|---|
| `newsletter-signup` | D-11 (Stage 05) | a layout stored before retirement stays valid and editable |
| `detail-hero` | **D-02 (Stage 07)** | production never inspected; deleting it would make a stored layout unsavable |
| `detail-body` | **D-02 (Stage 07)** | same |
| `detail-faq` | **D-02 (Stage 07)** | same; superseded by `faq-block` |

### 2.3 Not a visible block, by design

| Type | Classification | Note |
|---|---|---|
| `landing-stat-pills` | `resolver-flag` — "Show / hide" | the resolver reads whether it is present and visible, derives `pillsVisible`, then skips it; the pills render inside the hero |
| `landing-empty` | `system` | injected only when a section has no published articles; nothing for an operator to configure about an empty state |

### 2.4 Unsupported

**None.** This is the Stage 07 completion criterion, and it is now asserted from the live registry rather than from a list:

```
tests/stage06-page-capability.test.ts
  "no block type is left classified `unsupported`"
```

Before Stage 07 the `unsupported` set was `detail-hero`, `detail-body`, `detail-faq`, `directory-grid`, plus `directory-hero` mislabelled `server-composed`.

---

## 3. Public rendering and SEO preservation evidence

### 3.1 Pages whose public HTML changed

| Route | What changed | What did not |
|---|---|---|
| `/competitors/` | header, search form, listing and pagination now come from `directory-hero` + `directory-grid` through `PageRenderer` instead of literal route JSX | `generateMetadata` (title, description, `directoryListingRobots` on filtered views), breadcrumb JSON-LD, the single `<h1>`, every entity href, the query-string shape, `revalidate = 300` |
| `/venues/` | the same | the same |

**One intentional markup difference:** the venue card's monospaced tag line previously rendered an **empty `<p>`** when a venue had neither a capacity nor an edition count. The block omits the element instead. That is a strict improvement and no text was lost.

**No other public route changed.** The homepage, the five section landings and the seven detail templates render identical HTML, because:

- the consolidated selection is behaviour-preserving (oracle suite, 300 generated layouts);
- injected system slots keep their composed position (`orderAfter`);
- all five newly-offered blocks are `excludeFromDefaultsIn` their new families, so no default layout changed;
- `landing-competition-disciplines` defaults reproduce the previously hardcoded strings exactly.

### 3.2 SEO ownership — unchanged

| Owner | Artifact | Stage 07 |
|---|---|---|
| SEO Intelligence | metadata, canonical, robots, OG/Twitter, JSON-LD, sitemap eligibility | **untouched**. No `buildMetadata` input, `EntitySeo` read, `ArticleSeo` read or `lib/seo/*` module was modified |
| Structured CMS | records and relationships | **untouched**. No schema change, no migration, no entity field written |
| Visual Builder | which approved blocks appear, their order and visibility, presentation copy, references | extended as described |

Asserted behaviourally: no approved appendage region emits an `<h1>` (all seven detail families), a full directory page has exactly one `<h1>`, and no detail- or directory-family block declares an entity field name as an editable prop.

### 3.3 The non-duplication rule (Stage 02 §2.2)

Still enforced, and now tested adversarially for directories: props bearing entity-shaped keys (`items`, `slug`, `title`) produce **no** entries — the listing reads only the data channel the route fills from the authoritative query.

---

## 4. Family composition, before and after

```
                       defaults                                   library
homepage               unchanged (14)                             unchanged (14)
section-landing        unchanged (6)                              6 → 7  (+landing-competition-disciplines)
detail-template        5 → 2      (3 retired markers removed)     5 → 6  (+4 regions, −3 retired)
directory              unchanged (3)                              3 → 4  (+rich-text-block)
```

The detail default shrank because the three removed entries **never rendered anything**. The two remaining defaults, `detail-related` and `detail-cta`, are exactly the two that did.

Default slot ids are unchanged, because `defaultSlotId(family, type)` is a pure function of family and type and does not depend on position — so canvas click-to-select keeps working on every page that has no stored layout, which Stage 04's inventory says is all of them.

---

## 5. Files changed

### 5.1 New (Stage 07)

| File | Lines | Purpose |
|---|---|---|
| `apps/web/lib/cms/slotSelection.ts` | 143 | the single authoritative visibility/order contract (Task A) |
| `apps/web/tests/support/testQualityGate.ts` | 176 | shared gate detection, so measurement and enforcement agree (Task J) |
| `apps/web/tests/stage07-slot-selection.test.ts` | 301 | the contract, the equivalence oracle, the idempotence proof |
| `apps/web/tests/stage07-renderer-consolidation.test.ts` | 214 | the real resolvers and renderer, DB-backed |
| `apps/web/tests/stage07-detail-template.test.ts` | 398 | retirement, the four regions, all seven families |
| `apps/web/tests/stage07-directory-template.test.ts` | 473 | the directory model end to end |
| `apps/web/tests/stage07-competition-landing.test.ts` | 307 | Task E, including the no-double-render guard |
| `apps/web/e2e/stage07-templates.spec.ts` | 249 | Chromium: public directories, canvas selection, frame security |
| `apps/web/scripts/stage07-quality-gate-impact.mts` | 187 | Task J measurement, per verb and per level |
| `apps/web/scripts/stage07-gate-compare.mts` | 27 | the four detection variants side by side |
| `apps/web/scripts/stage07-regen-gate-baseline.mts` | 29 | regenerate the grandfathered baseline deliberately |
| `apps/web/scripts/stage07-capability-matrix.mts` | — | emits §1 of this document from live code |
| `apps/web/scripts/stage07-inspect.mts` | 7 | emits §4 of this document from live code |

### 5.2 Modified — application code

| File | Change |
|---|---|
| `lib/cms/sectionRegistry.ts` | `retiredBy`, `excludeFromDefaultsIn`, `systemContent` fields; `image-text-block` and `faq-block` extracted to shared definitions; three detail markers retired; four regions added to the detail family; `rich-text-block` added to the directory family; `landing-competition-disciplines` registered; `directory-hero`/`directory-grid` redefined; `buildDefaultSlots` honours `excludeFromDefaultsIn` |
| `lib/cms/slotSelection.ts` | **new** (above) |
| `lib/cms/homepageData.ts` | uses the shared selection |
| `lib/cms/sectionLandingData.ts` | uses the shared selection; injected slots get real orders via `orderAfter`; injection guarded against a stored slot; stored discipline slot receives data |
| `lib/cms/detailTemplateData.ts` | uses the shared selection; resolver allowlist removed (registry-driven); `detailCta` helper; `detailTemplateKnownTypes` test seam |
| `lib/cms/directoryData.ts` | rewritten: shared selection, registry-driven emission, `ResolveDirectoryOptions` carrying the route's listing data, route-default heading fallback |
| `lib/cms/pageCapability.ts` | mirror 22 → 24; `directory-hero` out of `NON_RENDERER_CONSUMERS`; `landing-competition-disciplines` out of `SYSTEM_OWNED_SECTION_TYPES`; **retirement checked across all families**; detail and directory copy rewritten |
| `lib/batch12Content.ts` | **`publicSlugWhere()` applied** to both directory queries (fixture-exclusion defect) |
| `components/blocks/PageRenderer.tsx` | applies `selectRenderableResolved` as the final authority; the inaccurate Stage 06 note replaced with the real proof |
| `components/blocks/registry.tsx` | `directory-hero` and `directory-grid` registered |
| `components/blocks/DirectoryBlocks.tsx` | `DirectoryHeroBlock` and `DirectoryGridBlock` added; listing markup moved here from the two routes |
| `components/blocks/LandingBlocks.tsx` | `CompetitionDisciplinesBlock` consumes kicker/title/description |
| `app/(public)/competitors/page.tsx` | delegates presentation to the blocks; keeps the authoritative query and all SEO |
| `app/(public)/venues/page.tsx` | the same |
| `views/DirectorySlots.tsx` | `DirectoryCtaSlot` → `DirectorySlots`, rendering the whole resolved list |
| `app/admin/(dashboard)/website/page.tsx` | passes `familyLimits`, `excludeFromDefaultsIn`, `systemContent`, `retiredBy` to the editor |
| `views/admin/AdminPageLayoutEditor.tsx` | default-layout copy honours `excludeFromDefaultsIn`; cap shown is the cap enforced; `systemContent` notice; `retiredBy` in the retirement notice |

### 5.3 Modified — tests

| File | Change |
|---|---|
| `tests/stage06-renderer-slots.test.ts` | the ordering/visibility block **rewritten** to the new contract (not deleted), plus a no-noise and a double-application assertion |
| `tests/batch-a-renderer.test.ts` | 2 source-text tests → behavioural |
| `tests/batch-b-detail.test.ts` | 1 → delegation + behavioural pointer |
| `tests/batch-e-directory.test.ts` | 9 source-text tests → behavioural renders of the new blocks |
| `tests/batch-f-preview.test.ts` | 3 updated for the widened options type and the new call shape |
| `tests/batch-h-integration.test.ts` | registry count 22 → 24; "server-only types" list corrected |
| `tests/batch-i-hardening.test.ts` | 3 family counts updated with reasons; 3 delegation assertions |
| `tests/batch31-unit.test.ts` | 2 directory route assertions updated |
| `tests/stage03-registry-contract.test.ts` | counts 29/27/22 → 35/28/24; duplicate test became an **identity** test; NO_RENDERER closure 8 → 4, each required to record its retirement |
| `tests/stage03-test-quality-gate.test.ts` | rewritten onto the shared detection; baseline 49 → 53; new tests for the assertion-level mechanism |
| `tests/stage04-property-fixes.test.ts` | shared-definition test generalised to identity across any number of families; new per-family cap assertion |
| `tests/stage06-page-capability.test.ts` | mirror 24; retirement and canvas classifications rewritten; **new**: no type is `unsupported`; new directory copy assertions |
| `tests/stage06-builder-dom.test.ts` | retired vs unsupported labels; directory copy both directions |
| `tests/support/stage03BlockFixtures.ts` | fixtures for `directory-hero` and `directory-grid`; 4 directory exemptions resolved; 4 detail exemptions re-recorded as retirements |
| `tests/support/stage03LegacyStructuralTests.json` | regenerated from the accurate detection |
