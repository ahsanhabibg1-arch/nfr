# Stage 05 — Completion Report

**Stage:** 05 of 10 — Dynamic Content Source Architecture, Homepage Deduplication & Content Selection Reliability
**Date:** 2026-11-09 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` (unchanged — nothing committed)
**Status:** complete, awaiting owner review

---

## 1. Summary

Stage 05 closed **KD-01**, the homepage duplication defect that Stage 03 deliberately left failing. It did so by giving the homepage resolver a shared, first-claim-wins selection context, and it then removed the dead parallel engine (D-04) and retired the newsletter block (D-11) under the two owner decisions approved for this stage.

The headline result is that **the programme now has no known-failing test**: 1885 of 1885 pass, and the KD-01 assertion that proves it was never touched.

| | Stage 04 exit | Stage 05 exit |
|---|---|---|
| Test files | 87 | **90** |
| Tests | 1822 | **1885** |
| Passing | 1821 | **1885** |
| **Known failures** | 1 (KD-01) | **0** |
| `tsc --noEmit` | 0 errors | **0 errors** |
| `next build` | success | **success** |
| Route harness | blocked | **executed — 33/37** |

Three things are worth the owner's attention before the detail:

1. **KD-01's fix is a product decision as well as an engineering one.** The hero now claims its articles before any other slot, so a lead story outranks a category feed. That is deterministic and documented, but it is an editorial judgement I made in code — §12 flags it for ratification.
2. **A slot may now legitimately show fewer articles than its count** when unique content runs out. That is the correct behaviour under the stage's own requirement, but an admin will read it as a bug unless the Builder says so. §11 proposes the fix.
3. **The production database was never inspected**, in Stage 04 or Stage 05. Every claim about what is in stored layouts rests on the development and test databases only.

---

## 2. D-04 — dead content engine retired

### What was there

`apps/web/lib/cms/contentSourceEngine.ts`, 402 lines, imported by nothing. It was a second, more elaborate content-selection design that had been written but never wired in — a parallel engine sitting beside the four live resolvers.

### What was done

**Deleted.** The file is gone from the working tree. One idea was carried across: its `DeduplicationContext` became the `SelectionContext` now in `lib/cms/slotUtils.ts`. Nothing else was salvaged, and no new module replaced it. The live pathway remains `slotUtils.ts` plus the four resolvers, which is what the stage directive required — no parallel content engine.

### Evidence

| Check | Result |
|---|---|
| File present | **no** — `git status` shows ` D apps/web/lib/cms/contentSourceEngine.ts` |
| Importers before deletion | **0** (verified by a repo-wide scan before deleting) |
| `import` / `require` / dynamic `import()` of it anywhere now | **0** — asserted by a test that scans every `.ts`/`.tsx` file |
| Recoverable | yes — present at `fd4fb10`; also copied outside the repo before deletion |
| Behaviour change on the public site | **none** — nothing called it |

The scanner lives in `tests/batch33-unit.test.ts`. Three surviving mentions of the name are comments and one regex (the scanner's own pattern); there is no live reference.

### Why this is a net gain

Six tests in `batch33-unit.test.ts` previously asserted on the engine's **source text** — they checked that strings appeared in a file that never ran. They passed while proving nothing about the site. Those six were replaced by four behavioural tests of the real pathway. That is the Stage 03 discipline applied to the code it was written for.

---

## 3. D-11 — newsletter block retired

The `newsletter-signup` block rendered a subscription form with no backend. A visitor could type an email address and submit it; nothing received it. The stage directive was explicit: no subscription backend, no visitor email collection, no newsletter provider.

### How it was retired

Retirement rather than deletion, because a stored layout might reference the type and deleting it would make that layout unsavable.

| Layer | Change | File |
|---|---|---|
| Definition | `retired: true`, label becomes `Newsletter Signup (retired)` | `lib/cms/sectionRegistry.ts:370,392` |
| Block library | hidden — `getAvailableBlockTypes` filters retired | `sectionRegistry.ts:616` |
| Default layouts | excluded — `buildDefaultSlots` filters retired | `sectionRegistry.ts:644` |
| Save validation | **still accepts** the type, via `getKnownSectionTypes` | `pageLayoutService.ts:128` |
| Renderer | **unregistered** — no entry in `blockRegistry` | `components/blocks/registry.tsx:148` |
| Component | retained but unreachable, annotated "DO NOT re-register" | `PremiumBlocks.tsx` |

### What this means in practice

- An admin **cannot add** the block.
- A layout that **already contains** one still saves and still loads — no admin is locked out of their own page.
- The block **renders nothing**: with no registry entry, `PageRenderer` skips the slot. No form, no input, no request, no data.
- `blockRegistry` is now **22 renderers** (was 23). Five legacy tests that asserted 23 were updated to 22, and the registry-contract test reclassified newsletter from a renderer to `RETIRED`.

### Verified

16 tests in `tests/stage05-registry-retirement.test.ts` cover: the type is absent from the block library and from every default layout; a stored slot still validates; the rendered output contains no form element, no input and no email field; and **no API route exists** that would accept a subscription. The last is the one that matters most — it proves the absence of collection, not just the absence of a form.

---

## 4. KD-01 — homepage deduplication

### The defect

`homepageData.ts` built a one-way `shownInHero: string[]`, passed it to the `latest-coverage` slot **only**, and never extended it. Every other article slot — three category feeds and the learning rail — deduplicated against nothing but its own picks.

```
BEFORE
  shownInHero = [hero lead, ...hero secondary]
  latest-coverage   -> excluded
  plan-and-watch    -> NOT excluded
  entertainment     -> NOT excluded
  events-shopping   -> NOT excluded
  learning          -> NOT excluded
```

### The fix

A shared `SelectionContext`, created once per request. The hero resolves and claims first, regardless of where the admin placed the block. Every article slot then receives the same context.

```
AFTER
  ctx = createSelectionContext()
  hero resolves and claims FIRST
  every article slot -> pickedThenAuto(props, count, auto, ctx)
     1. manual picks skip ids already placed
     2. auto-fill receives ctx.excluded()
     3. the result loop rejects a duplicate even so
     4. ctx.claim(final selection)
```

Layer 3 is deliberate defence: layers 1 and 2 both trust a resolver to honour its exclude list. A future query that forgets the parameter cannot reintroduce a duplicate.

### Before and after

| Measure | Before | After |
|---|---|---|
| `tests/stage03-dedup-invariant.test.ts` | **FAILING** — 7 duplicated entities | **PASSING** |
| The assertion itself | — | **unchanged** — `git diff HEAD` on that file is empty |
| Duplicates reported by the resolver | `hero-sec-02`, `art-02`, `art-03`, `art-04`, `art-05`, 2 fixtures — each twice | **none** |
| Live homepage HTML | one article at 3x, five at 2x | **uniform 2x across all 6** |

**Reading the live HTML correctly:** every card renders two links to the same article — an `aria-hidden` image link and the title link. So a genuine duplicate shows as **4x**, not 2x. After the fix the distribution is uniformly 2x with nothing at 3x or 4x. Before, one article sat at 3x. I state this explicitly because a naive count of article hrefs looks alarming and proves nothing.

The fix was also verified against the real database, not only mocks: `tests/stage05-content-ownership.test.ts` drives the actual resolver and asserts no entity appears in two slots.

---

## 5. Content source contract and resolver map

`lib/cms/slotUtils.ts` is the single authoritative pathway. Full detail is in `STAGE_05_CONTENT_SOURCE_ARCHITECTURE.md`; the contract in brief:

| Function | Role |
|---|---|
| `numProp(props, key, def, min, max)` | clamped integer read — an out-of-range stored value can never produce an unbounded query |
| `idListProp(props, key)` | accepts a comma string or an array; trims, drops empties |
| `limitList(list, props, key, def, min, max)` | resolver-side slice (extracted in Stage 04 as a testable seam) |
| `createSelectionContext(initial?)` | the per-request shared claim set |
| `pickedThenAuto(props, count, auto, ctx?)` | **the contract**: manual picks in editor order, then auto-fill, deduplicated three ways |

`ctx` is optional, so a caller that passes nothing behaves exactly as before Stage 05 — asserted by its own test.

| Family | Resolver | Manual | Auto | Count bound | Cross-slot dedup |
|---|---|---|---|---|---|
| Homepage | `homepageData.ts` | yes — `featuredIds` | yes | 0–12 | **shared context** |
| Section landing | `sectionLandingData.ts` | yes (featured) | yes | 0–20 (grid) | per-slot — one feed each, nothing to deduplicate |
| Detail template | `detailTemplateData.ts` | — | yes, related | 1–6 | n/a — single block |
| Directory | `directoryData.ts` | — | — | — | — |

**Directory has no configurable content source.** Listings are fetched directly by each route, outside the slot system. Documented as a gap and handed to Stage 07 rather than invented here.

---

## 6. Files changed

**25 files in the working tree: 24 modified, 1 deleted.** Ten of the modifications carry over from Stages 01–04; the Stage 05 changes are:

### Source

| File | Change |
|---|---|
| `lib/cms/slotUtils.ts` | `SelectionContext`, `createSelectionContext`, `pickedThenAuto` rewritten with three dedup layers |
| `lib/cms/homepageData.ts` | KD-01 — one-way array replaced by the shared context; hero claims first |
| `lib/cms/sectionRegistry.ts` | `SectionDef.retired`; `isRetiredSectionType`; newsletter retired; library and default-layout filters |
| `lib/cms/pageLayoutService.ts` | save validation moved to `getKnownSectionTypes` so retired blocks stay saveable |
| `components/blocks/registry.tsx` | newsletter renderer unregistered (23 to 22), with an explanatory comment in its place |
| `components/blocks/PremiumBlocks.tsx` | `NewsletterSignup` annotated as retired and unreachable |
| `lib/cms/contentSourceEngine.ts` | **deleted** (402 lines) |

### Tests added

| File | Tests | Covers |
|---|---|---|
| `tests/stage05-content-source.test.ts` | 36 | selection modes, ordering, bounds, cross-slot dedup, fixture exclusion across all three env values |
| `tests/stage05-registry-retirement.test.ts` | 16 | D-11 — hidden, saveable, renders nothing, collects nothing |
| `tests/stage05-content-ownership.test.ts` | 13 | DB-backed: references not copies, KD-01 through the real resolver |

### Tests retargeted

`batch33-unit.test.ts` (6 source-text to 4 behavioural), `stage03-registry-contract.test.ts` (23 to 22; newsletter to `RETIRED`), `batch-t1-featured-picker.test.ts` (3), `batch-h-integration.test.ts` (1), `batch-i-hardening.test.ts` (1).

No test was skipped, weakened or deleted to make this stage green. Six were **replaced** by stronger ones, and that is argued in §8 rather than asserted.

---

## 7. Query and performance assessment

Per homepage request: **at most 6 article slots, 2 bounded queries each** (one `findMany` by id for manual picks, one filtered fetch for auto-fill), each capped at 12 items, plus the hero. A slot with `articleCount: 0` issues **no query at all** — asserted.

**Slot resolution is sequential, and deliberately so.** Cross-slot deduplication cannot work in parallel: a slot resolving concurrently cannot know what a sibling just claimed. The cost is latency proportional to slot count, which is small and bounded. If it ever matters, the correct answer is one batched candidate fetch shared across slots — **not** reintroducing parallelism, which would reopen KD-01.

The exclusion list grows within a request, bounded by articles already placed (well under 100 at a 12-item cap) and de-duplicated before reaching a query. No N+1 pattern was introduced; the `getPublishedArticlesByIds` call is a single `IN` query.

---

## 8. Tests and actual results

```
npx vitest run
  Test Files  90 passed (90)
       Tests  1885 passed (1885)
     Skipped  0
      Failed  0
    Duration  135.55s
```

```
npx tsc --noEmit     -> 0 errors
npx next build       -> SUCCESS (exit 0)
```

**KD-01 is green with its assertion untouched.** `git diff --stat HEAD -- tests/stage03-dedup-invariant.test.ts` produces no output.

### One honest process failure

I started a baseline test run in the background and then began editing — **twice**, in Stage 04 and again here. Both baseline runs were therefore void, because the tree changed underneath them. The correct order is measure, then edit. I did not do that, and the pre-change numbers in this report come from the Stage 04 completion report rather than from a run I made at the start of this stage. Recording it so the next stage does not repeat it.

### Mutation evidence

Three mutations were introduced, observed, and reverted; a residue scan afterwards confirmed the tree is clean.

| Mutation | Expected | Observed |
|---|---|---|
| Remove the `ctx?.has(a.id)` guard from the pick loop | KD-01 and the manual-pick dedup test fail | **both failed** |
| Pass an empty array instead of `ctx.excluded()` to auto-fill | the cross-slot exclusion test fails | **failed** |
| Make `excludeFixturesFromPublic` return `false` unconditionally | the production fixture test fails | **failed** |

Full detail, including the two mutations whose first attempt revealed my own test premise was wrong, is in `STAGE_05_TEST_AND_MUTATION_REPORT.md`.

### Still-open mutation gaps

Carried from Stage 03, unchanged: **draft isolation** has no mutation proving its assertion is load-bearing — the honest mutation makes published retrieval read the draft column, which leaks unpublished content, and deserves a deliberate run with the owner's awareness rather than a quiet one. The **test quality gate** is self-tested against synthetic titles but no deliberately-bad test file has yet proved it blocks one end to end.

---

## 9. Route harness

**Executed for the first time in this programme.** Stage 04 could not run it; the cause was never the harness.

`npm run start` sets `NODE_ENV=production`, which activates the project's own environment isolation guard — and that guard **correctly refuses** a production build pointed at a local database. Stage 04 read the resulting 500s as a harness fault. They were the guard doing its job. Stage 05 ran the harness against `next dev` instead, and **the guard was not weakened, bypassed or modified.**

```
SMOKE_BASE_URL=http://localhost:3100 npx tsx scripts/route-smoke.mts
  -> 33 passed, 4 failed
```

**The 4 failures are a dev-mode artefact, and I checked rather than assumed.** All four assert a 404 status for an unknown slug. In dev, `notFound()` renders the 404 page but returns status 200. Verified: the route does call `notFound()` (`app/(public)/articles/[slug]/page.tsx:45`), the response body *is* the 404 page, and the harness docstring says it is written for `npm run start`. Confirming the status code needs a production-mode server against an isolated database — recorded as a Stage 06/07 task in the handover, not waved away.

Still unauthorized and not run: `test:cache` (writes to the database — **Stage 08 needs it**), `test:migration` (creates a throwaway database), `test:e2e` (production server plus Playwright browsers not installed).

---

## 10. Database safety verification

| Constraint | Evidence |
|---|---|
| No production database mutation | production was **never contacted** in this stage — no connection string, no query |
| No unauthorized development database mutation | development was read in Stage 04's inventory only; Stage 05 **never wrote** to it |
| No destructive operation | none performed |
| No Prisma schema migration | **19 migrations, unchanged**; `git diff HEAD -- prisma/schema.prisma` is empty |
| No schema modification | the data model is untouched |
| Test-database writes | only the suites' own fixtures, reusing an existing seeded author and category, creating and deleting only their own articles |
| Secrets | no `.env` value or credential appears in any Stage 05 file or report |
| Environment isolation guard | **not weakened** — §9 |

**Limitation, stated plainly:** the Stage 04 stored-layout inventory found **zero `PageLayout` rows in both the development and test databases**, and zero rows in `PageLayoutRevision`, `SiteConfig`, `SectionConfig`, `Announcement` and `GlobalBlock`. **Production was not inspected.** `.env.example:42` describes the cloud database as the "FUTURE deployed site's", which suggests there may be no production data yet — but that is an inference, not a verification. Every conclusion in this report about what stored layouts contain carries that caveat. The re-check queries are in the Stage 04 report and should be run before any stage that deletes a block type.

---

## 11. Registry and newsletter compatibility findings

- `blockRegistry` is now **22 renderers**; the definition register holds 29 entries across 4 families, resolving to **27 unique types** (two blocks are deliberately shared between families and asserted by **object identity**, not entry count — an earlier test of mine got that wrong).
- The exemption register stands at **16 entries with zero `INERT`**. Stage 05 added none.
- A **retired block renders as `null` silently**, because `PageRenderer` skips an unknown type without logging (`PageRenderer.tsx:17`). This satisfies D-11 but violates the Blueprint's invariant R1, which requires "skipped **and** logged". It is now a live concern rather than a theoretical one: an operator with a legacy newsletter slot gets no signal. Handed to Stage 06 with the `data-slot-id` work, since both touch the same file.
- **A slot can legitimately render fewer items than its requested count** when unique content is exhausted. This is the stage's own requirement 8 — never pad a slot with an already-displayed article to meet a count — and it is asserted by two tests. But the admin sees "4" configured and 2 rendered. **Recommendation:** the Builder should say "showing 2 of 4 — not enough unique articles". Cheap, and it pre-empts a plausible bug report against correct behaviour.

---

## 12. Pending owner decisions

**Resolved:** D-15, D-01, D-02 (Option B), D-03 in Stage 03; **D-04 and D-11 in this stage**; D-10 settled as engineering. All recorded additively in `docs/stage-02/STAGE_02_DECISION_REGISTER.md`, preserving the original findings rather than overwriting them.

| Priority | ID | Decision | Blocks |
|---|---|---|---|
| 1 | **D-13** | Legal content approval and indexing — 7 pages serve `noindex` behind a visitor-facing draft banner | Stage 09 |
| 2 | **D-07** | Revision retention policy — unbounded today | Stage 08 |
| 3 | **D-05** | Footer ownership — nav edits are silently overridden by `SiteConfig` | Stage 08 |
| 4 | **D-06** | Appearance controls — the tab governs only the homepage banner | Stage 08 |
| 5 | **D-12** | Scheduler and deployment target | Stage 08 |
| 6 | **D-14** | Sitewide `Organization` / `WebSite` JSON-LD — needs owner-supplied publisher facts | Stage 09 |
| 7 | **D-09** | Info-page publication workflow | Stage 09 |

**None of these blocks Stage 06.** The first four all land in Stage 08, so resolving them during Stage 06 or 07 keeps that stage unblocked.

### One decision I made in code that the owner should ratify

**Hero priority.** The homepage hero claims its articles before any other slot, regardless of where the admin positioned the block. So if the lead story also qualifies for a category feed, the hero keeps it and the feed moves on to its next candidate. The alternative is to let block position decide. The current rule is deterministic, documented and tested — but it is an editorial judgement embedded in a resolver, and it is a one-line change if the owner prefers position order. Flagging it rather than leaving it implicit.

---

## 13. Stage 06 prerequisites

**Stage 06 — Visual Builder Canvas & Responsive Editing — is fully unblocked.** Its one prerequisite was Stage 04's property-integrity work, which is complete: zero `INERT` exemptions, duplicate definitions consolidated, validation `PropDef`-driven. That ordering mattered — a visual canvas that visibly ignored edited properties would have been worse than a list, because the admin could then *see* that nothing changed.

It inherits a working preview iframe at `app/admin/(dashboard)/website/preview/route.ts:38-64`, which already renders real draft pages behind a permission check. **Stage 06 should mount that as the canvas, not build a second renderer.** Full sequencing, the postMessage origin-validation requirement, the architecture notes it will hit, and the explicit must-nots are in `STAGE_05_HANDOVER.md`.

One tripwire changes with this stage: **there is no longer a known-failing test**, so any failure in Stage 06 is a new regression rather than an expected one.

---

## 14. Git and environment state

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` |
| HEAD | `fd4fb10` — **unchanged; no commit, push, merge, branch or checkout** |
| Working tree | **24 modified, 1 deleted, 3 new untracked test files** (plus Stage 01–05 documentation) |
| Deleted | `apps/web/lib/cms/contentSourceEngine.ts` — recoverable from `fd4fb10` |
| Diffstat | 25 files changed, 872 insertions, 707 deletions |
| Migrations | **19 — unchanged** |
| Schema | **unmodified** |
| Prior stages' work | **fully preserved** — 10 of the 24 modified files are Stage 01–04 changes, still present |
| Dev servers | terminated; ports 3000 and 3100 confirmed free |
| Docker / deployment | none |

Git finalization remains deferred until the owner explicitly requests it.

---

## 15. Preservation checklist

Every item the stage directive required to be strictly preserved, and how I know:

| Preserved | Verification |
|---|---|
| RBAC and session authentication | untouched; the full suite's auth tests pass |
| Draft / public isolation | untouched; `isStaffDraftPreview()` double gate intact, Stage 03 suite passing |
| Central SEO metadata and indexing rules | untouched; no SEO engine added or modified |
| Fixture exclusion | strengthened — Stage 05 added the **first behavioural tests** of it; the prior assertion merely checked the filter object existed, which would have passed with the production branch broken |
| Existing publishing and revision workflows | untouched |
| Existing CMS data ownership | untouched; articles are referenced by id, never copied into layout props — asserted against the real database |
| Production environment isolation guard | **not weakened** — the harness was run in dev mode instead (§9) |
| All uncommitted work from previous stages | intact — nothing reset, discarded or cleaned up |

### Scope boundaries honoured

No parallel content engine, no new renderer, no new SEO engine. No subscription backend, no newsletter provider, no visitor email collection, no personal data collected. No source-text assertion was added to any test whose name claims a rendering outcome. KD-01's assertion was neither skipped, suppressed, weakened nor altered. **Stage 06 was not started.**

---

## 16. Deliverables

| File | Contents |
|---|---|
| `STAGE_05_COMPLETION_REPORT.md` | this document |
| `STAGE_05_CONTENT_SOURCE_ARCHITECTURE.md` | the contract, the resolver map, the retirement rationale |
| `STAGE_05_DEDUPLICATION_AND_SELECTION_MATRIX.md` | KD-01 before/after, the three guard layers, 16 selection scenarios, bounds and exclusion matrices |
| `STAGE_05_TEST_AND_MUTATION_REPORT.md` | test inventory, actual results, mutation runs, the two wrong premises I found and corrected |
| `STAGE_05_HANDOVER.md` | Stage 06 sequencing, inherited assets, the working harness recipe, carried-forward items, must-nots |
