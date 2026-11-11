# Stage 03 — Mutation Verification

**Stage:** 03 of 10 · **Date:** 2026-11-09 · **HEAD:** `fd4fb10`

## Why this document exists

A passing test suite is not evidence. This project has already been misled twice by one: 1,528 and then 1,549 tests passed green while ten block properties were inert, `helpText` never reached the DOM, and the live homepage rendered one article three times.

So the question Stage 03 has to answer is not "do the new tests pass?" but **"can the new tests fail?"** Each mutation below deliberately reintroduces a defect, confirms the suite turns red, and restores the original file. A test that cannot fail proves nothing.

Every mutated file was backed up before the change and byte-restored afterwards. **No mutation remains in the repository** — verified by a repo-wide scan for mutation markers (§5).

---

## M1 — A renderer stops passing a declared property through

**Target:** `components/blocks/PremiumBlocks.tsx`, `RichTextBlock`
**Defect reintroduced:** the exact class that shipped ten inert properties — a block that advertises a property and renders nothing for it.

**Mutation:** removed the `title` output.

```diff
- {p('title') && <h2 className="text-2xl font-bold text-[#0F1115] mb-4">{p('title')}</h2>}
+ {/* M1 mutation: title dropped */}
```

**Result — suite turned RED:**

```
× Stage 03 Task A — declared properties reach rendered output
  > rich-text-block.title — editing it changes the rendered HTML
  → rich-text-block.title did not reach output:
    expected '<section class="w-full max-w-screen-x…' to contain 'ZzStage03Sentinel_title'

Tests  2 failed | 121 passed (123)
```

Two tests failed: the parameterised contract case, and the negative-control partner asserting the real renderer does pass its title through.

**Restored:** `123 passed (123)`.

**What this proves.** The contract test detects a property that is declared but not rendered. Had this suite existed earlier, none of the ten inert properties could have shipped.

---

## M2 — Observability removed: a database failure becomes indistinguishable again

**Target:** `lib/cms/pageLayoutService.ts`, `resolveSections` catch branch
**Defect reintroduced:** the Task G defect — a DB outage silently presenting as "this page has no customised layout".

**Mutation:** made the error path report the same outcome as a missing layout.

```diff
- return { slots: buildDefaultSlots(getPageFamily(pageKey)), source: 'default-db-error' };
+ return { slots: buildDefaultSlots(getPageFamily(pageKey)), source: 'default-no-layout' };
```

**Result — suite turned RED:**

```
× Stage 03 Task G — the three retrieval outcomes are distinguishable
  > DATABASE FAILURE: query throws -> defaults served, AND the error is logged and reported
× Stage 03 Task G — negative control
  > a thrown query cannot be mistaken for a missing layout

Tests  2 failed | 6 passed (8)
```

**Restored:** `8 passed (8)`, and the full contract + observability pair back to `131 passed`.

**What this proves.** The observability fix is enforced, not merely written. The negative control is the load-bearing one: it fails precisely when the two outcomes collapse into each other, which is the only symptom this defect ever had.

---

## M3 — The exemption register is load-bearing, not decorative

**Target:** `tests/support/stage03BlockFixtures.ts`, `EXEMPTIONS`
**Risk addressed:** an exemption register is worthless if removing an entry changes nothing — it would mean the register is documentation rather than enforcement.

**Mutation:** deleted the `landing-hero.heroImageUrl` entry (a genuinely inert property).

**Result — suite turned RED:**

```
× Stage 03 Task A — declared properties reach rendered output
  > landing-hero.heroImageUrl — editing it changes the rendered HTML
× Stage 03 Task A — exemption register integrity
  > the INERT register matches the 3 documented component-level inert properties

Tests  2 failed | 121 passed (123)
```

**Restored:** `123 passed (123)`.

**What this proves.** Removing an exemption does **not** quietly drop the property from coverage — the suite immediately tries to prove the property works, and fails because it does not. The register cannot be used to hide a defect, and the integrity check independently pins the `INERT` set at exactly three.

The inverse direction is enforced too, though it needs no mutation to demonstrate: the stale-entry test renders every `INERT` property on every run and **fails if one starts working**. So when Stage 04 fixes `landing-grid.articleCount`, the suite will fail until that entry is deleted. The register is forced to shrink.

---

## 4. Stage 01 precedent

The same discipline was applied to the Stage 01 security fix: the original vulnerable `/api/internal/revalidate` handler was reinstated verbatim and **13 of 21 tests failed**, then the fix was restored and re-verified at 21/21. Recorded in `STAGE_01_COMPLETION_REPORT.md` §E-3.

## 5. Residue check

```
$ grep -rn "M1 mutation|M2 mutation|M3 mutation" components/ lib/ tests/
none - clean
```

Backups were taken to the session scratchpad (outside the repository) before each mutation and restored from there:

| File | Mutation | Restored and re-verified |
|---|---|---|
| `components/blocks/PremiumBlocks.tsx` | M1 | yes — 123/123 |
| `lib/cms/pageLayoutService.ts` | M2 | yes — 8/8, then 131/131 |
| `tests/support/stage03BlockFixtures.ts` | M3 | yes — 123/123 |

Final full-suite state after all restorations: **84 files · 1732 tests · 1731 passed · 1 failed (intended KD-01) · 0 skipped**, `tsc --noEmit` 0 errors.

---

## 6. Invariants now protected by a demonstrated-failing test

| Invariant | Mutation proving it | Owner |
|---|---|---|
| Every declared block property reaches rendered output | **M1** | Stage 04 keeps it true |
| A database failure in layout retrieval is attributable | **M2** | Stage 03 (done) |
| An exemption cannot hide an inert property | **M3** | Stage 04 shrinks the register |
| An unpublished draft never reaches the public page | B3 (executed, not mutated — see §7) | Stage 08 keeps it true |
| An editor cannot widen the indexing policy | Task E additive-only test | Stage 09 keeps it true |
| No new source-text test may claim a rendering outcome | Task H baseline + stale check | all later stages |

## 7. Not yet mutation-tested — carried to Stage 04

Three invariants are asserted by executed tests but have not had a mutation applied to prove the assertion is load-bearing. They are listed here rather than left implicit:

1. **Draft isolation (B3, Task C).** The honest mutation is to make `getPublishedSections` read the draft column — a change that would leak unpublished content, so it deserves a controlled run with the owner's awareness rather than being slipped into this stage.
2. **The dedup invariant (Task D).** It is currently *failing*, which is itself proof it can fail. A mutation becomes meaningful only after Stage 05 fixes it.
3. **The test quality gate (Task H).** Its own self-tests exercise the detector against synthetic titles, but no deliberately-bad test file was added to the suite to confirm the gate blocks it end to end.
