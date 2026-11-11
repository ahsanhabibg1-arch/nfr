# Stage 07 — Completion Report

**Programme:** Controlled Hybrid Website Builder, CMS & SEO Remediation
**Stage:** 07 of 10 — Full Page Template Integration, Directory Composability & Renderer Consolidation
**Date:** 2026-11-11 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` (unchanged — no commit created)

**Status: COMPLETE**, with two items reported as deliberately deferred and one carried-forward defect. Both are named in §7 and neither is a bypassed requirement.

---

## 1. Summary

Stage 07 made the detail templates and the two public directories genuinely manageable through the existing Visual Builder, and consolidated the renderer's visibility-and-order rule into one authority — the change Stage 06 deferred because it could not prove it was safe.

| Task | Subject | Outcome |
|---|---|---|
| **A** | Renderer consolidation | **DONE.** One authority (`lib/cms/slotSelection.ts`), five hand-written copies removed, idempotence proven, and the hazard that made Stage 06 defer it found and fixed |
| **B** | Server Component boundary | **DECISION: RETAIN THE CLIENT COMPONENT**, with measured evidence. Conversion would cost 71 regression tests or a documented architectural guarantee, for near-zero benefit |
| **C** | Unsupported block resolution | **DONE.** Three inert markers retired under D-02; the `directory-grid` contradiction resolved by making `required` truthful. **No type physically deleted** — production was never inspected |
| **D** | Seven detail template families | **DONE.** Four approved appendage regions that genuinely render, composing in all seven real public routes, with the structured core still CMS-owned |
| **E** | Competition landing page | **DONE.** `landing-competition-disciplines` registered; two hardcoded headings became editable copy; no double render; public output unchanged by default |
| **F** | Competitor and venue directories | **DONE.** Four blocks render and are canvas-selectable; search, filters and pagination preserved; a production data-exposure defect found and fixed |
| **G** | Capability and registry synchronisation | **DONE.** Mirror resynced; a two-family retirement bug fixed; **no block type is `unsupported` any more**, asserted from live code |
| **H** | Canvas integration | **DONE.** No second renderer; new blocks verified selectable in the real Chromium canvas |
| **I** | Security and content integrity | **DONE.** Frame headers unchanged and retested; foreign-origin framing refused; no autosave; guard not weakened |
| **J** | Testing quality improvement | **DONE.** Measured first; three of six verbs adopted on the evidence; detection moved from file level to assertion level; baseline became a census |
| **K** | Behavioural and browser verification | **DONE.** 211 new tests, 32 browser tests, 37 route checks, 10/10 mutations killed |

---

## 2. Verified baseline, and the handover correction the directive asked for

The full baseline was run to completion before any edit, with no overlapping runs.

| Item | Stage 06 Handover | Directive expected | **Measured** |
|---|---|---|---|
| Vitest files | **95** | 97 | **97** |
| Tests | **2046** | 2079 | **2079** |
| Failures / skipped | 0 / 0 | 0 / 0 | **0 / 0** |
| TypeScript | clean | clean | **0 errors** |
| `next build` | succeeds | passing | **succeeds, 69/69** |
| Migrations | 19 | 19 | **19** |
| Page keys | 15 | 15 | **15** |

**The Stage 06 handover understates its own baseline by 2 files and 33 tests.** The directive's figures are correct. This is a documentation error, not a missing-test error: all 2,079 tests were present and passing at the `fd4fb10` working tree. Recorded as required.

---

## 3. Architectural boundaries — preserved

| Domain | Owns | Stage 07 |
|---|---|---|
| **Structured CMS** | articles, competitions, rodeo records, categories, disciplines, competitors, venues, editions, schedules, results, relationships, publishing state | **untouched.** No schema change, no migration, no factual field moved into layout JSON |
| **Visual Builder** | approved blocks, order, visibility, layout configuration, content references, reusable page-family presentation | **extended** — five more block offerings across three families, two blocks given real renderers, one registered |
| **SEO Intelligence** | metadata, canonicals, robots, structured data, indexability, landing overrides | **untouched.** No `lib/seo/*` module, `buildMetadata` input, `EntitySeo` or `ArticleSeo` read was modified |

No factual record was moved into layout JSON; no second renderer or parallel content engine was created. The Stage 02 non-duplication rule (§2.2) is now tested **adversarially** for directories: props bearing entity-shaped keys produce no entries.

---

## 4. Results by task

Full design rationale is in `STAGE_07_TEMPLATE_ARCHITECTURE.md`; per-page state in `STAGE_07_PAGE_AND_BLOCK_COVERAGE.md`; evidence in `STAGE_07_TEST_AND_MUTATION_REPORT.md`.

### Task A — renderer consolidation

The rule was implemented **five times by hand** across four files and applied nowhere in the renderer. It now lives in `lib/cms/slotSelection.ts`, and `PageRenderer` enforces it as the last word before HTML.

**The proof Stage 06 could not produce.** The Stage 06 note in `PageRenderer` blamed `resolveSections` for already sorting and filtering — it never did. The real hazard: `resolveSectionLandingSlots` **injected** two system slots at a **positional index** while stamping them `order: -1`, so array order and `order` fields contradicted each other. A sort in the renderer would have hoisted the discipline guides and the empty state **above the section hero** on `/competition/`. Fixed at source with `orderAfter`, which gives an injected slot a real fractional order; selection is then provably idempotent (`select(select(x)) === select(x)` over 304 cases).

Behaviour-preserving by design: the visibility predicate is the same truthiness test the replaced copies used, pinned against a literal transcription of the old code over 309 cases. The "improvement" of rendering slots whose `visible` key is missing was **rejected** — `SectionSlotSchema` requires the field, so the two semantics differ only for hand-edited JSON, and the change would alter live HTML on a page no operator touched.

### Task B — server component boundary: **RETAIN**, with evidence

`useRouter` is the smaller half of the problem. Two of the four blocks (`LatestCoverage`, `CompetitionSection`) hold their own `useState` filters and must remain client islands regardless. The real blocker is the editor-mode **context**, and both exits are expensive:

- threading an `editorMode` prop loses the Stage 06 guarantee that every public route inherits the flag — the failure mode being an un-selectable block with no error;
- calling `isStaffDraftPreview()` inside the renderer makes it unrenderable under Vitest, breaking **71 tests across 4 files** that are the regression net for public-vs-editor parity, retired-block inertness and now ordering.

And the benefit is near zero: `registry.tsx` carries `'use client'` and imports all 22 blocks, so conversion moves the boundary without reducing what ships. The Stage 02 architecture itself calls this "an optimisation, not a correctness fix". **Retained**, and `tests/batch-a-renderer.test.ts` now encodes the decision. A real conversion path — splitting the registry into server and client halves — is recommended for a later stage.

### Task C — unsupported blocks: retired, not deleted

**The safety gate was honoured.** Production was never inspected, so **no block type was physically deleted**: removing a definition would make `saveDraft` reject a stored layout containing it, locking an operator out of a page they never touched.

`detail-hero`, `detail-body` and `detail-faq` are `retired` under D-02 ("confirmed for removal rather than promotion"), with a new `retiredBy` field recording which decision applied. `required` was dropped from all three — a required block with no renderer could be neither removed nor hidden while contributing nothing.

`directory-grid`'s contradiction (`required: true` + unrenderable) was resolved **atomically with the new directory design** by making `required` **true**: the search form, entries and pagination it represents really are mandatory and really are on the page. Deleting it would have left the listing unrepresented in the Builder, which is the dishonesty this programme exists to remove.

### Task D — seven detail families

Under D-02 Option B and D-03 (template-level layout, no per-entity override — **not invented**), four approved regions were added: `rich-text-block`, `image-text-block`, `faq-block` (which **supersedes** the inert `detail-faq`) and `cta-banner`. Each already had a working renderer.

The change that makes composition real is the removal of the resolvers' hardcoded allowlist, exactly as the approved architecture §3.4 requires. All seven routes already mount `ArticleAppendageSlots` after the record body, so composition works in the **actual public route** for every family — asserted per key against a real stored layout.

**No live detail page changed.** All four regions are `excludeFromDefaultsIn` the detail family, because three of them render a `<section>` even with empty props and would otherwise have added visible empty bands to every article, discipline, category, competitor, venue, hub and edition page.

### Task E — competition landing

`landing-competition-disciplines` had a renderer and **no definition anywhere**, printing two headings no administrator could reach. It is now a registered block with editable kicker, heading and description; its defaults are the previous literals, so `/competition/` renders what it rendered before; the resolver injection is kept as the backward-compatible default and **guarded**, so the grid can never render twice; and it is excluded from the other four section-landing defaults. The data still comes from the one existing `getAllDisciplines()` call.

### Task F — directories

The route keeps the authoritative, bounded, page-clamped query; the Builder gets the presentation. `directory-hero` and `directory-grid` have real renderers, so both are canvas-selectable, `heroImageUrl` is finally rendered, and `columns` — declared and ignored for three stages — is consumed and clamped. `rich-text-block` was added so a directory has one genuine composition choice. Search, filters, pagination, entity links and empty states are preserved and proven from rendered HTML and in the browser. The level stays `directory-limited` because the listing's contents are not Builder-owned.

**A production data-exposure defect was found and fixed**: neither directory query applied `publicSlugWhere()`, so a `fixture-` competitor or venue would have been listed to real visitors in production. Neither model carries a publication state, so the fixture prefix is the only available filter.

### Task G — capability synchronisation

Mirror 22 → 24; `directory-hero` removed from `NON_RENDERER_CONSUMERS`; `landing-competition-disciplines` removed from `SYSTEM_OWNED_SECTION_TYPES`; **`classifyBlockSupport`'s retirement check fixed** — it inspected only 2 of 4 families, so every detail-family retirement would have been mislabelled "No renderer exists for this block" rather than "Retired … you can remove it safely".

Detail pages stay `template-appendage` and directories stay `directory-limited`, deliberately: the directive forbids marking a page `composed` while its structured core sits outside Builder control, and D-02 exists precisely to keep that core. The Admin copy was rewritten in both directions — it still says what is fixed, and now also says what became editable.

Three editor-side fixes followed, because the editor **re-computes** what the server computes: the tree now honours `excludeFromDefaultsIn` (a mismatch would have silently broken click-to-select, as Stage 06 proved), the cap shown is now the cap enforced (`familyLimits` was ignored), and a new notice states when a block's content comes from the database.

### Tasks H, I — canvas and security

No second renderer; the canvas still mounts the real preview route, so the new blocks appear in it once they have renderers — verified in Chromium, not asserted. Frame headers are unmodified and retested on three routes; a foreign-origin frame cannot render a directory page; the embed preview route still refuses an unauthenticated request. No autosave was introduced and the environment isolation guard was not weakened.

### Task J — quality gate

Measured before changed, as instructed. All six nominated verbs would have added **172** violations and taken the baseline to 221 — the "hundreds of exemptions" the directive forbids — and 145 of those hits are **legitimate** structural claims. Three verbs were adopted (`clamps`, `handles`, `supports`); three were rejected on the evidence.

The larger finding was structural: the inherited gate decided at **file** level, so **19 of its 49 entries were false positives** and it **missed 23 real violations**. It also flagged Stage 07's own correct conversions — a gate that punishes the fix it exists to encourage. Detection is now assertion-level and shared with the measurement scripts. Baseline 49 → 53: −19 false positives, +23 real findings. Stage 07 also **converted 16** grandfathered tests, double Stage 06's eight.

### Task K — verification

| Gate | Result |
|---|---|
| Full Vitest | **103 files · 2,283 tests · 0 failed · 0 skipped** |
| TypeScript | **0 errors** |
| `next build` | **succeeds**, 69/69 static pages |
| Chromium | **32 passed · 0 failed** |
| Route harness | **37 passed · 0 failed** |
| Mutation tests | **10 applied · 10 killed · 0 survived** |

Five browser tests failed on the first run. **Four were bugs in Stage 07's own test code** and one was a **real, pre-existing harness defect** — the Stage 06 Save-Draft test depended on a page having no stored layout and then saved one, so it passed only on a clean database. All five are documented in the test report with their fixes; the test was made idempotent and the e2e teardown made genuinely self-cleaning.

---

## 5. Public rendering and SEO preservation

Only two routes changed their public HTML: `/competitors/` and `/venues/`, where the header, search form, listing and pagination now come from blocks through `PageRenderer` instead of literal route JSX. Preserved exactly: `generateMetadata`, `directoryListingRobots` on filtered views, breadcrumb JSON-LD, the single `<h1>`, every entity href, the query-string shape, `revalidate = 300`.

One intentional difference: the venue card's tag line no longer renders an **empty `<p>`** when a venue has neither capacity nor editions. No text was lost.

**No other public route changed**, because the consolidation is behaviour-preserving, injected slots keep their composed position, all five new block offerings are excluded from their new families' defaults, and the competition block's defaults reproduce the previous hardcoded strings.

---

## 6. Completion criteria

| Criterion | Status | Evidence |
|---|---|---|
| Actual public template behaviour matches declared Builder capability | **MET** | capability matrix generated from live code; `no block type is unsupported` asserted; browser-verified canvas selection |
| Renderer filtering and ordering consistent and regression-tested | **MET** | one authority; 309-case equivalence oracle; 304-case idempotence; mutations M1–M3 killed |
| Seven detail families retain factual ownership while gaining approved control | **MET** | four regions render and compose in all seven real routes; no entity field storable; no second `<h1>`; M4–M5 killed |
| Competitor and venue directories meaningfully integrated | **MET** | four blocks render and are selectable; search/filter/pagination preserved; M6, M8 killed |
| Unsupported blocks resolved or safely retired without breaking legacy layouts | **MET** | zero `unsupported`; every retired type still saveable; legacy-slot handling proven |
| New blocks work in the real Stage 06 canvas | **MET** | Chromium: slot ids present, click-to-select works, inspector notice shown |
| SEO and publishing behaviour preserved | **MET** | §5; no SEO module touched; draft/published isolation tested per family |
| Security checks pass | **MET** | headers retested on three routes; foreign-origin framing refused; preview route gated |
| Browser tests pass | **MET** | 32/32 |
| No unexplained test failures remain | **MET** | 0 failed, 0 skipped; all 29 changed assertions justified individually |

---

## 7. Deliberately not done, and why

Neither item is a bypassed requirement; both are recorded with the reason the directive asks for.

| Item | Why | Where it goes |
|---|---|---|
| **Physical deletion of the four legacy block types** | the directive's own safety gate: production has never been inspected, and deleting a type makes a stored layout unsavable. Retirement delivers every behavioural outcome deletion would, reversibly | **Blocked on owner action**: run the production inventory, or confirm in writing that no production layouts exist |
| **`PageRenderer` → Server Component** | investigated and **declined on evidence** (§4, Task B). The directive explicitly permits retaining the Client Component with a documented reason | recommended for a later stage, as a registry split |
| **`EditorialHero` secondary-story accessibility fix** | a genuine defect found while investigating Task B: `<article onClick>` is not keyboard-focusable and has no crawlable `href`. Fixing it changes the public markup of the homepage's most prominent element and needs its own visual verification; the directive forbids folding an unrelated conversion into this stage | **Stage 08 prerequisite**, with the recommendation recorded in the handover |

---

## 8. Unresolved owner decisions

**None blocks Stage 07, and none was invented or assumed.** Decisions relied upon: **D-01**, **D-02 (Option B)**, **D-03**, **D-04**, **D-11**, **D-15** — all previously approved.

| Priority | ID | Decision | Blocks |
|---|---|---|---|
| **New** | — | **Production `PageLayout` inventory**, or written confirmation that none exists, before any block type is physically deleted | the deletion itself; nothing else |
| 1 | **D-13** | Legal content approval and indexing | Stage 09 |
| 2 | **D-07** | Revision retention policy | Stage 08 |
| 3 | **D-05** | Footer ownership | Stage 08 |
| 4 | **D-06** | Appearance controls | Stage 08 |
| 5 | **D-12** | Scheduler and deployment target | Stage 08 |
| 6 | **D-14** | Sitewide `Organization`/`WebSite` JSON-LD | Stage 09 |
| 7 | **D-09** | Info-page publication workflow | Stage 09 |

Still awaiting ratification, carried unchanged: the **homepage hero content priority** (the hero claims its articles before any other slot, regardless of placement). Stage 07 **changed no content-selection precedence**.

---

## 9. Repository and environment state

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` — unchanged |
| HEAD | `fd4fb10` — **unchanged; no commit, push, merge, reset or branch created** |
| Prisma migrations | **19 — unchanged**; none authored or applied |
| Schema | **unmodified** |
| Production database | **never contacted** |
| Development database | **never written to** |
| Isolated test database | written only under reserved page keys by suites that clean up after themselves, plus the e2e harness, whose teardown Stage 07 **fixed** to be genuinely self-cleaning. Verified empty of `PageLayout` rows afterwards |
| `.next` | holds a test-database build; harmless for `npm run dev`, overwritten by the next build |
| Dev servers | terminated; ports 3000 and 3100 confirmed free |
| Prior stages' work | **fully preserved** |

Git finalization remains deferred until the owner explicitly requests it. **Stage 08 was not started.**

---

## 10. Deliverables

| Document | Contents |
|---|---|
| `STAGE_07_COMPLETION_REPORT.md` | this document |
| `STAGE_07_TEMPLATE_ARCHITECTURE.md` | design decisions and the evidence behind each |
| `STAGE_07_PAGE_AND_BLOCK_COVERAGE.md` | the 15-page capability matrix and full block inventory, generated from live code |
| `STAGE_07_TEST_AND_MUTATION_REPORT.md` | baseline, every gate, every changed test with its reason, the Task J measurement, 10 mutations, 9 defects |
| `STAGE_07_HANDOVER.md` | what Stage 08 inherits, the traps, and the carried-forward items |
