# Stage 07 — Test and Mutation Report

**Stage:** 07 of 10 · **Date:** 2026-11-11 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10`
**Database:** the isolated test database only (`TEST_DATABASE_URL` → `localhost:5432/nfrguide_test`). **Production was never contacted.**

---

## 1. Baseline verification, and the Stage 06 handover correction

The directive required the Stage 06 baseline to be verified before any edit, and flagged a documentation discrepancy. Both are confirmed.

| Item | Stage 06 Handover §1 claims | Stage 07 directive expects | **Measured** | Verdict |
|---|---|---|---|---|
| Vitest files | **95** | 97 | **97** | handover **wrong** |
| Tests | **2046** | 2079 | **2079** | handover **wrong** |
| Failures | 0 | 0 | **0** | ✓ |
| Skipped | 0 | 0 | **0** | ✓ |
| TypeScript | clean | clean | **0 errors** | ✓ |
| `next build` | succeeds | passing | **succeeds, 69/69 static pages** | ✓ |
| Prisma migrations | 19 | 19 | **19** | ✓ |
| Schema | unmodified | unmodified | **unmodified** (`git status prisma/` empty) | ✓ |
| Branch / HEAD | `office-sync-2026-11-08` / `fd4fb10` | same | **same** | ✓ |
| Builder page keys | 15 | 15 | **15** | ✓ |

**Correction recorded.** The Stage 06 handover understates its own baseline by **2 files and 33 tests**. The Stage 07 directive's figures are the correct ones. The discrepancy is consistent with the handover having been written before Stage 06's final two suites were added; it is a documentation error, not a missing-test error — every one of the 2,079 tests was present and passing at `fd4fb10`'s working tree.

The baseline run was completed in full before the first edit, and no two baseline runs overlapped.

---

## 2. Final regression gates

| Gate | Result |
|---|---|
| **Full Vitest suite** | **103 files · 2,283 tests · 2,283 passed · 0 failed · 0 skipped** |
| **TypeScript** (`tsc --noEmit`) | **0 errors** |
| **Next.js build** | **succeeds** — compiled in 44s, 69/69 static pages generated |
| **Chromium browser** | **32 passed · 0 failed** (Stage 06 spec 14 + Stage 07 spec 18) |
| **Route harness** (production server, port 3100) | **37 passed · 0 failed** |
| **Mutation tests** | **10 applied · 10 killed · 0 survived** |
| Stage 01 security regression | included in the full suite — passing |
| Stage 03 quality + behavioural regression | passing (gate upgraded — §5) |
| Stage 04 property/registry regression | passing (two tests generalised — §4.2) |
| Stage 05 content-source regression | passing, unmodified |
| Stage 06 canvas/security regression | passing (one block rewritten by instruction — §4.1) |
| Stage 07 behavioural suites | **211 new tests**, all passing |

Growth: **2,079 → 2,283 tests (+204)**; **97 → 103 files (+6)**.

**No test was deleted, skipped, weakened or marked `.todo` to achieve this.** Every changed assertion is recorded in §4 with the reason.

---

## 3. New Stage 07 suites

| File | Tests | What it proves |
|---|---|---|
| `tests/stage07-slot-selection.test.ts` | 31 | the authoritative visibility/order contract; **equivalence** against a literal transcription of the five replaced copies (9 cases + 300 generated layouts); **idempotence** (`select(select(x)) === select(x)`, 4 layouts + 300 generated); the `order: -1` regression |
| `tests/stage07-renderer-consolidation.test.ts` | 7 | the real resolvers against a real stored layout: ordering, hidden-slot omission, draft/published isolation; the renderer as final authority; the `SectionLandingSlots` partition is order-preserving |
| `tests/stage07-detail-template.test.ts` | 57 | all seven families; retirement safety; the four approved regions render, compose, reorder and hide; no default layout changed; no entity field storable; no second `<h1>`; template-level (not per-entity) layout |
| `tests/stage07-directory-template.test.ts` | 51 | four blocks render and classify as canvas; the required-block contradiction; search, filter, count, entries, empty state, pagination, labels; `columns` consumed and clamped; one `<h1>`; composition order; CMS ownership (adversarial); resolver emission against a stored layout |
| `tests/stage07-competition-landing.test.ts` | 57 | registered definition; editable kicker/heading/description; defaults reproduce the previous hardcoded strings; no double render; discipline links and relationships; no other default changed |
| `tests/stage07-directory-fixture-exclusion.test.ts` | 8 | the fixture-exclusion defect, asserted on the **where clause the query receives** |
| `e2e/stage07-templates.spec.ts` | 18 | Chromium: the rewritten public directories, canvas selection of the new blocks, frame-security regression |

**211 tests.** Every one calls real code and asserts a computed outcome or real rendered HTML. None is a source-text assertion.

---

## 4. Changed existing tests — each with its reason

The directive forbids masking failures by deleting tests, skipping checks or weakening assertions. Twenty-nine tests across nine files failed as a direct consequence of deliberate Stage 07 changes. All twenty-nine were **rewritten or re-targeted**, none removed. The conversions are listed because "we changed the test" is a claim that deserves scrutiny.

### 4.1 Rewritten by instruction — `tests/stage06-renderer-slots.test.ts`

The directive says: *"Update `stage06-renderer-slots.test.ts` to assert the new behavioral contract. Do not delete the test simply because the implementation changes."*

Its final block asserted that `PageRenderer` **neither** filtered **nor** sorted — the exact opposite of what Task A implements. The two behaviours were re-asserted against the new contract and **four more were added**: hidden slots are filtered from the canvas as well as from public HTML (so the operator's preview cannot disagree with the live page), a filtered slot produces no diagnostic noise, and pre-selecting before the renderer produces byte-identical output. 21 → 28 tests.

The Stage 06 versions are not lost: the literal pre-Stage-07 code is preserved as the `legacySelect` **oracle** in `tests/stage07-slot-selection.test.ts`, which proves the consolidated rule produces identical output for every stored layout.

### 4.2 Source-text assertions converted to behaviour — 16 tests

These failed because they asserted the **characters of the code** rather than its behaviour, and the code changed while the behaviour improved. This is the defect class Task J measures, and converting them is what the directive asks for ("Where practical, convert misleading source-text tests into actual behavioral tests").

| File | Tests | Was | Now |
|---|---|---|---|
| `batch-a-renderer` | 2 | `expect(src).toContain('slots.map')`; `toContain('.sort((a, b) => a.order - b.order)')` | renders two real blocks out of order and asserts the emitted order; delegation + a pointer to the behavioural proof |
| `batch-b-detail` | 1 | `toContain('.filter((s) => s.visible)')` | asserts the resolver delegates and does **not** reimplement the rule |
| `batch-e-directory` | 9 | `not.toContain("'directory-hero'")`, `toContain('form method="get"')`, `toContain('export function DirectoryCtaBlock')` … | renders the new hero and listing blocks and asserts the search form, filter options, entries, hrefs, count line, empty state and pagination from real HTML |
| `batch-i-hardening` | 3 | the same literal filter/sort strings, per resolver | delegation assertions pointing at the behavioural proof |
| `batch-f-preview` | 3 | `toContain('options?: { draft?: boolean }')`, `toContain('{ draft }')` | matches either options form and the new call shape; isolation proven behaviourally elsewhere |

`batch-e-directory`'s two worst offenders are worth naming: *"competitors page preserves search form, grid, pagination and empty state"* proved only that four substrings appeared in a route file. It would have passed with a page that rendered none of them, and it failed when Stage 07 moved that markup into a block **that renders all four**. It now renders the block and checks the output.

### 4.3 Deliberate count and classification updates — 13 tests

Each of these encodes documented state whose change is a conscious act. Every one carries its reason in a comment at the assertion.

| File | Assertion | Before → After | Why |
|---|---|---|---|
| `batch-h-integration` | registry entries | 22 → **24** | Task F gave the directory hero and listing renderers |
| `batch-h-integration` | "server-only types not in blockRegistry" | list corrected | `directory-hero`/`directory-grid` were in that list *as the defect*; now asserted present, with the four genuinely renderer-less types still asserted absent |
| `batch-i-hardening` | section-landing defs | 6 → **7** | Task E registered `landing-competition-disciplines` |
| `batch-i-hardening` | detail-template defs | 5 → **9** | Task D added four approved regions |
| `batch-i-hardening` | directory defs | 3 → **4** | Task F added `rich-text-block` |
| `batch31-unit` | directory route reads | `heroTitle` → `defaultHeroTitle` | the route supplies the default; the block renders the heading |
| `stage03-registry-contract` | family-array entries | 29 → **35** | shared blocks now serve more families **by reference** |
| `stage03-registry-contract` | distinct declared types | 27 → **28** | Task E |
| `stage03-registry-contract` | renderers | 22 → **24** | Task F |
| `stage03-registry-contract` | `noRenderer` list | 7 types → **4** | and every remaining one must now record its retirement |
| `stage03-registry-contract` | duplicate-definition test | count → **object identity** | see §4.4 |
| `stage04-property-fixes` | shared blocks "in two families" | → identity across **any number** of families | see §4.4 |
| `stage06-page-capability` | mirror size | 22 → **24** | Task F |

### 4.4 A test that caught a real design error — and the two tests that grew because of it

`tests/stage04-property-fixes.test.ts` asserts that a multi-family block is **one object**, not two declarations, because Stage 04 found `rich-text-block` and `cta-banner` declared twice with divergent caps where first-wins dedupe silently discarded one.

Stage 07's first implementation added the shared blocks to the detail family by **spreading** them:

```ts
{ ...SHARED_RICH_TEXT_BLOCK, excludeFromDefaults: true, familyLimits: { …, 'detail-template': 2 } }
```

That produced **four distinct definition objects** for `rich-text-block` and silently reintroduced exactly the divergence Stage 04 removed. **The Stage 04 test caught it.** The design was changed to per-family `familyLimits` / `excludeFromDefaultsIn` on a single shared object.

Both tests were then **strengthened**, not relaxed:

- Stage 04's hardcoded "exactly 2 families" became identity across however many families a block appears in, so it keeps working as families are added — plus a new assertion that every family offering a capped block resolves a cap.
- Stage 03's "reports duplicate block definitions (known defect)" became an **identity** test: the count alone can no longer distinguish Stage 04's fixed design from the original defect, but object identity can.
- A third assertion was added from the detail side (`stage07-detail-template.test.ts`), so the requirement is visible where the next family addition will be made.

### 4.5 Capability and Admin copy — 5 tests

| File | Assertion | Why it changed |
|---|---|---|
| `stage06-page-capability` | `detail-hero` etc. `unsupported` → **`retired`** | Task C retired them (D-02); `retired` tells the operator the removal is safe, `unsupported` only says something is broken |
| `stage06-page-capability` | `directory-hero` `server-composed` → **`canvas`** | it renders now |
| `stage06-builder-dom` | "Not rendered" / "Text only" badge assertions | both labels are gone from those blocks, correctly |
| `stage06-page-capability` + `stage06-builder-dom` | directory copy wording | the search form moved from the route into the required block, so the sentence describing who builds it changed |

Two **new** assertions were added alongside: *no block type in any family classifies as `unsupported`* (derived from the live registry, so a future renderer-less block fails there), and *the Admin also states what Stage 07 made editable* — honesty in both directions.

---

## 5. Task J — the test quality gate, measured before it was changed

The directive requires measuring the impact of expanding detection before expanding it, and forbids blindly adding exemptions or turning unrelated tests red.

### 5.1 Measurement, per candidate verb

`apps/web/scripts/stage07-quality-gate-impact.mts`, over the 29 test files that read product source (906 source-reading test titles):

| Verb | New violations it would flag (file-level) |
|---|---|
| `has` | **75** |
| `uses` | **57** |
| `handles` | 18 |
| `includes` | 13 |
| `supports` | 10 |
| `clamps` | 1 |
| **union, de-duplicated** | **172** → baseline 49 would become **221** |

### 5.2 The structural finding that mattered more than the verb list

The inherited gate asked *"does this **file** read source anywhere?"* and flagged every behaviourally-named test in it. Most of these files are mixed. `apps/web/scripts/stage07-gate-compare.mts`:

| Verbs | Level | Flagged |
|---|---|---|
| Stage 03 | **file** | **49** ← the inherited gate; reproduces the old baseline exactly |
| Stage 03 | assertion | 30 |
| Stage 07 | file | 78 |
| Stage 07 | **assertion** | **53** ← what the gate now enforces |

- **19 of the inherited 49 were false positives** — their bodies never touch source text.
- **The inherited gate missed 23 real violations.**

The decisive demonstration: Stage 07 Task F converted `batch-e-directory`'s misleading tests into real ones that render blocks through `renderToStaticMarkup`. **The old gate flagged those conversions as violations**, because the file still reads source elsewhere. A gate that punishes the fix it exists to encourage is the wrong gate.

### 5.3 What was adopted, and what was rejected

**Adopted:** assertion-level detection, and three verbs — `clamps`, `handles`, `supports`. They claim a **computed outcome**: that code, given an input, does a thing. A source substring cannot prove that, and all three appear in the examples the Stage 06 handover gave as the gap it found.

**Rejected on the measurement:** `has`, `uses`, `includes` — together ~145 hits that are overwhelmingly **legitimate** structural claims where source text is the right proof: *"has pageKey field"*, *"has unique constraint on (pageKey, revisionNo)"*, *"service Zod schema includes id field"*. Adopting them would have registered correct tests as debt — precisely the "hundreds of exemptions" the directive forbids.

### 5.4 Baseline movement: 49 → 53

| | Count |
|---|---|
| Inherited baseline | 49 |
| − false positives removed | −19 |
| + real violations newly found | +23 |
| **Stage 07 baseline** | **53** |

The baseline did **not** grow for convenience; it became a census instead of a floor. The enforcement model is unchanged: it may shrink but never grow, and a stale entry still fails the gate.

### 5.5 A self-inflicted bug worth recording

The first assertion-level detector keyed off variable names ending in `Src`/`Source`. It **missed two whole classes** of real violation:

- `expect(src)` — the pattern required a character before the suffix, so the three-letter name never matched;
- `expect(editor)` — the variable is named after what it *contains*, not after what it *is*.

Both were genuine source-text assertions already in the grandfathered set, so an under-detecting gate would have quietly released them. Detection now **follows the assignment** (`sourceVariables`) instead of guessing the name, and the bug is pinned by its own test. Caught by spot-checking the 33 entries the first regeneration proposed to remove — not by a failing test, which is the honest account.

### 5.6 Conversions contributed

Stage 06 converted 8 grandfathered structural tests. **Stage 07 converted 16** (§4.2), and the gate's own accuracy improvement makes the remaining register trustworthy. Detection logic now lives in `tests/support/testQualityGate.ts`, shared by the gate and both measurement scripts, so a measurement can never disagree with enforcement.

### 5.7 Migration plan for the remaining 53

| Cluster | Count | Plan |
|---|---|---|
| preview-URL mapping (`batch-i-hardening`, `batch-t2`, `batch-t3`) | 11 | `pageKeyToUrl` in `app/admin/(dashboard)/website/preview/route.ts` is private and async. Export it as a test seam and call it against the test database. **Best next conversion: one small change clears 11.** |
| admin editor UI claims (`batch31`, `batch32`, `batch33`) | ~13 | the editor already renders under `renderToStaticMarkup` in `stage06-builder-dom.test.ts`; retarget each claim there |
| legal/info page rendering (`batch-g-info-pages`) | 7 | needs `LegalPageView` render fixtures; Stage 09 touches this area |
| revision/scheduling UI (`batch-c`, `batch-d`) | 6 | Stage 08 owns revisions and the scheduler; convert as it touches them |
| schema-shape and misc. | ~16 | mostly legitimate structural claims whose titles should simply gain `[structural]` |

---

## 6. Mutation testing — 10 applied, 10 killed

Each mutation is a single deliberate change to **product** code, followed by running only the suites that claim to protect that guarantee. A mutation that leaves them green means the assertion is decorative. Runner: `mutate.py` (recorded in the stage working directory); every mutation was reverted and the suites re-confirmed green afterwards.

| # | Guarantee attacked | Mutation | Result | Tests failed |
|---|---|---|---|---|
| **M1** | the renderer is the selection authority | `PageRenderer` renders `slots` instead of `selectRenderableResolved(slots)` | **KILLED** | 8 |
| **M2** | injected system slots carry a real order | `orderAfter` returns `-1` again (the Stage 06 placeholder) | **KILLED** | 3 |
| **M3** | hidden blocks never reach the public page | `isSlotVisible` returns `true` unconditionally | **KILLED** | 13 |
| **M4** | the detail resolver is registry-driven | restore the hardcoded `detail-related`/`detail-cta` allowlist | **KILLED** | 9 |
| **M5** | no live detail page gained a section | drop `excludeFromDefaultsIn` from `faq-block` | **KILLED** | 2 |
| **M6** | directory records stay in the database | let `directory-grid` read `items` from slot props | **KILLED** | 1 |
| **M7** | retirement is classified across all families | restore the two-family retirement check | **KILLED** | 3 |
| **M8** | fixtures never reach production visitors | drop `publicSlugWhere()` from the competitor query | **KILLED** | 3 |
| **M9** | the discipline grid never renders twice | remove the injection guard | **KILLED** | 2 |
| **M10** | the quality gate detects direct source assertions | stop detecting `expect(read(...))` | **KILLED** | 1 |

**10/10 killed. No survivors.** Every critical renderer, composition and ownership guarantee Stage 07 claims is load-bearing.

### 6.1 Mutation gaps still open — carried forward unchanged

Two gaps noted by Stage 03 and Stage 05 remain, and Stage 07 did not close them:

- **Draft isolation** still has no mutation proving its assertion is load-bearing. The honest mutation leaks unpublished content and deserves a deliberate run with the owner's awareness. (Stage 07 did add *behavioural* draft/published isolation assertions for the directory and detail families — M-series coverage of the isolation predicate itself is what is missing.)
- **The quality gate** is now mutation-tested for its detection (M10), which closes half of the Stage 03 gap. What remains is an end-to-end proof that a deliberately-bad test file is **blocked**, rather than merely detected.

---

## 7. Browser verification — 32 passed

Recipe (unchanged from Stage 06; `APP_ENV=test` satisfies the environment isolation guard, which was **not** weakened):

```bash
cd apps/web
netstat -ano | grep -E ":3000|:3100" | grep LISTENING    # confirmed free
export DATABASE_URL="<TEST_DATABASE_URL from .env>"
export APP_ENV=test
npx next build
npx playwright test e2e/stage06-visual-builder.spec.ts e2e/stage07-templates.spec.ts --reporter=list
```

Chromium `ms-playwright/chromium-1248` — already installed, no download.

| Spec | Tests | Result |
|---|---|---|
| `e2e/stage06-visual-builder.spec.ts` | 14 | **14 passed** |
| `e2e/stage07-templates.spec.ts` | 18 | **18 passed** |

### 7.1 What the browser proved that no unit test could

- the rewritten `/competitors/` and `/venues/` serve a working page with **exactly one `<h1>`**, a labelled search form and a listing;
- submitting the search form **navigates**, echoes the query back and shows the empty state and a Reset link;
- pagination navigates to page 2;
- `directory-hero` and `directory-grid` appear **in the real canvas** with stable, allow-list-conforming `data-slot-id`s, and **clicking the listing selects it** in the Builder;
- the inspector shows the "Content comes from the database" notice for the listing;
- the Builder offers the four new detail regions and offers **no** retired marker;
- `X-Frame-Options: SAMEORIGIN` and CSP `frame-ancestors`/`frame-src 'self'` still hold on three routes; an **opaque-origin** frame cannot render a directory page; the embed preview route still refuses an unauthenticated request.

### 7.2 Five browser failures on the first run — four were my test bugs, one was a real harness defect

Reported because a first-run result that is quietly re-run until green is worthless.

| Failure | Cause | Resolution |
|---|---|---|
| `competitors`/`venues`: "submitting the search form…" ×2 | **my test bug.** `input[name="q"]` matched **two** elements — the site header carries its own search input with the same name | scoped to `#directory-q`. Worth knowing: the directory form must be addressable independently of the chrome |
| "the Builder offers the new approved regions…" | **my test bug.** The block library is an overlay behind **"+ Add Section"**, not a button named "Add a Block" | opens the real control; a second test added asserting no retired marker is offered |
| "a cross-origin page cannot frame a directory page" | **my test bug, and it proved nothing.** `page.setContent` ran while the page was already on the site's own origin, so the iframe was **same**-origin and loaded correctly — the assertion failed, and deserved to | rewritten to frame from a `data:` document, which has an **opaque** origin genuinely foreign to the server |
| Stage 06: "the canvas reloads after a successful Save Draft" | **a real, pre-existing harness defect.** The test relied on "a page with no stored layout starts dirty" — and then **saved one**, destroying its own precondition. It passed in Stage 06 because that was the first run against a fresh database; the `homepage` `PageLayout` row it wrote was never removed, so every later run found Save Draft disabled | **two fixes.** The test now makes the page dirty explicitly (hide/show the first section), which holds whether or not a layout is stored and weakens no assertion. And `e2e/global-teardown.ts` now clears `PageLayout` / `PageLayoutRevision`, so the suite is genuinely self-cleaning — the Stage 06 handover's claim that the test database is "written only by the existing e2e global-setup, which cleans up after itself" was **not true** for the Builder specs |

The stale `homepage` row was removed from the isolated test database before re-running. **Re-run after the fixes: 32/32 passed.**

---

## 8. Route harness — 37 passed

```bash
npx next start -p 3100            # production server; dev returns 200 for notFound()
SMOKE_BASE_URL=http://localhost:3100 npx tsx scripts/route-smoke.mts
```

**37 passed, 0 failed.** Includes `/competitors/` and `/venues/`, the two routes Stage 07 rewrote, plus robots, sitemap, legacy redirects and admin gating. Server terminated afterwards; ports 3000 and 3100 confirmed free.

---

## 9. Coverage against the directive's 20 required test areas (Task K)

| # | Area | Where | Kind |
|---|---|---|---|
| 1 | visibility and ordering after consolidation | `stage07-slot-selection` (31), `stage06-renderer-slots` (28), `stage07-renderer-consolidation` | behavioural + DB |
| 2 | hidden and required blocks | `stage06-renderer-slots`, `stage07-directory-template` | rendered HTML |
| 3 | no double filtering | `stage07-slot-selection` idempotence (304 cases), `stage06-renderer-slots` pre-select equality | behavioural |
| 4 | no duplicate article placement | `stage03-dedup-invariant` (unchanged, passing) | DB |
| 5 | legacy unsupported-block compatibility | `stage07-detail-template` (7 per retired type), `stage07-directory-template` legacy-slot case | rendered HTML + DB |
| 6 | detail-template composition | `stage07-detail-template` | rendered HTML + DB |
| 7 | all seven detail families | `stage07-detail-template`, one DB-backed case per key | DB |
| 8 | competition landing block | `stage07-competition-landing` (57) | rendered HTML + DB |
| 9 | competitor directory | `stage07-directory-template`, `e2e/stage07-templates` | HTML + browser |
| 10 | venue directory | the same | HTML + browser |
| 11 | directory search/filter/pagination | `stage07-directory-template` (12), browser (navigation) | HTML + browser |
| 12 | draft/published isolation | `stage07-renderer-consolidation`, `stage07-detail-template`, `stage07-directory-template` | DB |
| 13 | CMS factual ownership | `stage07-detail-template`, `stage07-directory-template` (adversarial) | behavioural |
| 14 | SEO metadata preservation | `batch-e-directory` SEO block (unchanged), single-`<h1>` assertions, browser | source + HTML + browser |
| 15 | registry/capability consistency | `stage06-page-capability` (30, incl. the new no-`unsupported` assertion) | behavioural |
| 16 | canvas selection of new blocks | `e2e/stage07-templates` | **browser** |
| 17 | save and refresh behaviour | `e2e/stage06-visual-builder` (now idempotent), `stage06-save-outcome` | browser |
| 18 | RBAC and preview security | `e2e/stage07-templates`, `e2e/stage06-visual-builder`, `stage06-frame-headers` | browser + unit |
| 19 | fixture exclusion | `stage07-directory-fixture-exclusion` (8) — **a defect found and fixed** | behavioural |
| 20 | keyboard and accessibility | `stage07-directory-template` (label/`for` associations, submit button), browser label check, `stage06-visual-builder` keyboard-only tree | HTML + browser |

Area 20 is **partially** covered, honestly: the Builder's new control (the `systemContent` notice) is a static region with no new interactive affordance, and the directory form's label associations are asserted. A **defect was found and not fixed** in this area — see §10.

---

## 10. Defects found by Stage 07

| # | Defect | Severity | Status |
|---|---|---|---|
| 1 | `listPublicCompetitors` / `listPublicVenues` never applied `publicSlugWhere()`, so a `fixture-` competitor or venue would be listed to real visitors in production. Neither model carries a publication state, so the prefix is the only available filter | **High** (production data exposure) | **FIXED**, with 8 behavioural tests and mutation M8 |
| 2 | The Stage 06 note in `PageRenderer` stated that `resolveSections` "sorts and filters" — it never did. The real hazard was the `order: -1` placeholder on positionally-injected slots | Medium (misleading the next stage) | **FIXED**: note corrected, hazard removed, regression test added |
| 3 | `classifyBlockSupport` checked retirement in only 2 of 4 families, so any detail- or directory-family retirement would be mislabelled "No renderer exists for this block" instead of "Retired … you can remove it safely" | Medium (Admin honesty) | **FIXED**, mutation M7 |
| 4 | The Builder's block library showed and gated on `maxInstances`, ignoring `familyLimits` — so a per-family cap (Stage 04 Task B) was displayed wrong and enforced only on save | Medium | **FIXED** |
| 5 | The e2e Builder specs wrote a `PageLayout` row that nothing removed, and the Stage 06 Save-Draft test depended on its own absence — so the browser suite passed only on a clean database | Medium (false confidence) | **FIXED**: test made idempotent, teardown made self-cleaning |
| 6 | `directory-grid.columns` was declared in the registry and ignored for three stages | Low | **FIXED**: consumed and clamped |
| 7 | `directory-hero.heroImageUrl` was resolved and then dropped | Low | **FIXED**: rendered |
| 8 | **`EditorialHero` secondary stories are `<article onClick={…}>`** — not keyboard-focusable, not announced as links, and carrying **no `href`**, so they are invisible to crawlers and cannot be opened in a new tab. The lead story's CTA is a `<button>` with the same crawlability consequence | **Medium** (accessibility + internal linking on the homepage's most prominent element) | **REPORTED, NOT FIXED.** It changes the public markup of the homepage hero and needs its own visual verification across the three device widths; the directive forbids folding an unrelated conversion into this stage. Carried forward with a recommendation |
| 9 | The first assertion-level gate detector under-detected `expect(src)` and `expect(editor)` | Low (would have released real violations) | **FIXED** before the baseline was regenerated; pinned by its own test |

---

## 11. Repository and environment state

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` — **unchanged** |
| HEAD | `fd4fb10` — **unchanged; no commit, push, merge, reset or branch created** |
| Prisma migrations | **19 — unchanged**; none authored or applied |
| `prisma/schema.prisma` | **unmodified** |
| Production database | **never contacted.** No credentials used, no query run |
| Development database | **never written to** |
| Isolated test database | written by the Stage 07 DB suites under reserved page keys, each removed in `afterAll`; by the e2e global-setup, which cleans up; and by the Builder Save-Draft specs, which the **new teardown** now cleans up. Verified empty of `PageLayout` rows after the work |
| `.next` | holds a **test-database** build from the browser run — harmless for `npm run dev`, overwritten by the next build |
| Dev servers | terminated; ports 3000 and 3100 confirmed free |
| Docker / deployment | none |
| Prior stages' work | **fully preserved** — nothing reset, discarded or cleaned up |

Git finalization remains deferred until the owner explicitly requests it.
