# Stage 03 — Handover to Stage 04

**Stage:** 03 of 10 · **Date:** 2026-11-09 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` (unchanged — no commit created)

**Stage 04 scope (from the Stage 02 roadmap):** Block Registry & Property Rendering — make the registry authoritative, so every advertised property either works or is removed.

---

## 1. What Stage 03 hands you

A verification capability that did not exist before. Concretely:

| Asset | Path | Use in Stage 04 |
|---|---|---|
| **Registry contract suite** | `tests/stage03-registry-contract.test.ts` | **This is Stage 04's acceptance mechanism.** Coverage derives from the live registry, so fixing a property is proven by removing its exemption entry and watching the suite stay green |
| **Exemption register** | `tests/support/stage03BlockFixtures.ts` → `EXEMPTIONS` | Stage 04's work list. 16 entries; **it must shrink** |
| **Block render fixtures** | same file → `BLOCK_FIXTURES` | Minimum data per block to render non-null; reuse rather than rebuild |
| **Causation suite** | `tests/stage03-draft-publish-causation.test.ts` | Proves draft→publish→public still works after any registry change |
| **Observability seam** | `getPublishedSectionsResolved` / `getDraftSectionsResolved` | Distinguishes a DB fault from a default layout — stops Stage 04 regressions being misread as "layout reset" |
| **Test quality gate** | `tests/stage03-test-quality-gate.test.ts` | Blocks new source-text tests claiming rendered behaviour |
| **Mutation discipline** | `STAGE_03_MUTATION_VERIFICATION.md` | The pattern every new invariant must follow |

**Working baseline:** 84 files · 1732 tests · 1731 passed · **1 intended failure (KD-01)** · 0 skipped · `tsc --noEmit` 0 errors.

---

## 2. Stage 04 prerequisites

### 2.1 Blocking — must happen first

**P1. Inventory stored layout values before touching any inert property.** Wiring a previously-ignored property **changes a live page on the next publish** for any owner who already saved a value for it. This was deferred from Stage 02 (code-read-only) and from Stage 03 (no product changes).

Query both JSON columns on a verified non-production database for the 10 inert property keys plus any undeclared keys:

```sql
-- against an isolated / non-production database only
SELECT "pageKey", "draftSections", "publishedSections"
FROM "PageLayout"
WHERE "draftSections"::text ~ 'heroImageUrl|articleCount|showImage|columns|pills'
   OR "publishedSections"::text ~ 'heroImageUrl|articleCount|showImage|columns|pills';
```

Without this, Stage 04 cannot distinguish "nobody ever set this" from "wiring it will visibly change a published page".

**P2. Owner decision D-11 (newsletter block).** It currently renders a non-functional email form publicly. The Blueprint documents it as hidden until a backend exists; the deferral was decided but never enforced. Removing a block type requires P1 first.

### 2.2 Not blocking — already resolved

**Option B is approved.** The owner's Option C approval ("shared structured editorial templates, with optional approved appendage sections") settles D-02 as Option B. This confirms `detail-hero`, `detail-body` and `detail-faq` for **removal**, not promotion — which retires 5 of the 9 `NO_RENDERER` exemptions. Recorded in `docs/stage-02/STAGE_02_DECISION_REGISTER.md`.

Those three types are declared in the **detail-template** family, so their removal is Stage 07 work by the roadmap's division. If Stage 04 prefers to remove them earlier, that is now unblocked — note only that `directory-grid` carries `required: true`, so removing it needs the `required` flag dropped in the same change or an admin will be unable to save a directory layout.

### 2.3 Environment

**The isolated test database was migrated during Stage 03, with owner approval.** `nfrguide_test` had been 3 migrations behind, which blocked 27 tests. After safety verification (local host · database named exactly `nfrguide_test` · not identical to `DATABASE_URL` or `CLOUD_DATABASE_URL` · all 3 migrations committed at HEAD · zero destructive SQL — 4 `CREATE TABLE`, 2 `CREATE TYPE`, 5 additive `ALTER TABLE`), `prisma migrate deploy` was applied **to that database only**. The development database was already current and was not modified.

Stage 04 therefore starts with a schema-current test database. **If the schema advances again, the test DB will need the same treatment** — the capability probes in the Stage 03 suites will skip loudly rather than fail silently, so the symptom will be visible.

---

## 3. Recommended Stage 04 sequence

Ordered so each step is provable by an existing test before the next begins.

1. **`helpText` in shared field chrome** (`views/admin/AdminPageLayoutEditor.tsx`). It currently renders in only 3 of 9 property-editor branches, and `quick-access.kicker` is a `text` prop — so the project's only help string never reaches the DOM. Fixing it in shared chrome makes every type inherit it. Add a **DOM** assertion on the editor panel; Stage 03 proves block rendering, not editor rendering.
2. **Single definition per block type** — give `SectionDef` a `families: string[]` and collapse the `rich-text-block` / `cta-banner` duplicates. The Task A shape test pins the current 29/27/23 counts, so it will fail until you update those numbers deliberately — that is intended.
3. **Clamp and validate** — `detail-related.articleCount` via `numProp` (KD-06, currently an unbounded `take`), then per-`PropDef` validation of type, `max` and `select` options. Ship the undeclared-key whitelist **warn-only** first, per D-10, until P1 confirms the blast radius.
4. **Resolve the 3 INERT properties.** `detail-related.title` is wiring; `landing-grid.articleCount` is resolver plus component; `landing-hero.heroImageUrl` needs an image field added to `SectionLandingHeroProps` — treat it as a component change, not a one-liner.
5. **Declare or remove the 2 synthetic slots** (`landing-empty`, `landing-competition-disciplines`), which render publicly but are absent from the registry.
6. **NF-01 — express conditional property dependencies** in the registry so the editor can disable or annotate a dependent field. See §4.
7. **Delete each exemption entry as its property starts working.** The stale-entry test fails until you do, so the register is forced to shrink.

---

## 4. Findings Stage 04 should act on

### NF-01 — undeclared conditional property dependencies *(new in Stage 03)*

Some properties take effect only when a partner is also set. They are genuinely consumed — so not exempt — but the Builder shows them as independent fields, and an admin who sets only one sees nothing happen.

| Property | Requires | Evidence |
|---|---|---|
| `editorial-hero.heroImageAlt` | `heroImageUrl` | `components/sections/EditorialHero.tsx:27` |
| `ctaUrl` on `latest-coverage`, `plan-and-watch`, `entertainment`, `events-shopping`, `learning` | `ctaText` | `components/sections/PlanAndWatchSection.tsx:23-24` |
| `stats-banner.statNLabel` / `statNValue` | each other | `components/blocks/PremiumBlocks.tsx:42` |
| `faq-block.qN` / `aN` | each other | `components/blocks/PremiumBlocks.tsx:82` |

This is a plausible source of "the control does nothing" reports that are not actually inert properties — worth fixing alongside the real ones so the distinction stays clear.

### NF-02 — trailing slashes normalised in hrefs

`next/link` emits `href="/x"` for a stored `/x/`. Any assertion on a stored URL must expect the normalised form.

---

## 5. Carried-forward obligations

| Item | Owner stage | Note |
|---|---|---|
| **KD-01 homepage duplication** | **Stage 05** | The dedup invariant **is failing now**. Expected-failure count is exactly **1**; any change in that number is a regression in either direction |
| **D-04 content engine** | **Stage 05** | **Still unapproved — blocks Stage 05.** Needs the decision before that stage can be scoped |
| KD-08 draft-save cache flush | Stage 08 | Needs `scripts/cache-invalidation.mts` wired into CI as its harness |
| KD-09/KD-10 concurrency | Stage 08 | Interactive `expectedVersion`; atomic revision numbering |
| KD-11/KD-12 legal pages | Stage 09 + D-13 | Engineering fix is separable from the owner/legal publication decision |
| KD-13/KD-14 SEO gaps | Stage 09 | Task E establishes the reusable causation pattern |
| **49 grandfathered source-text tests** | opportunistic | Convert as each stage touches the area; trim the baseline each time. No dedicated sweep — the gate already caps the debt |
| **Blocked harnesses** | **wire in Stage 04 if possible** | `test:routes`, `test:cache`, `test:e2e`, `test:migration` have **never executed in this programme**. Stage 10 should not be their first run. Each needs a running server and an isolated seeded database; `test:cache` and `test:migration` also write |

### Mutation gaps to close

Three invariants are asserted by executed tests but not yet mutation-proven: **draft isolation** (B3/Task C — the honest mutation would make published retrieval read the draft column, so it deserves a deliberate run), the **dedup invariant** (meaningful only after Stage 05 fixes it), and the **test quality gate** end to end (its detector is self-tested against synthetic titles, but no deliberately-bad test file was added to confirm the gate blocks it).

---

## 6. What Stage 04 must not do

- **Do not weaken or skip the dedup invariant** to make the suite green. It is the stage's primary artefact. Stage 05 fixes it.
- **Do not add a source-text assertion** to a test whose name claims a rendering outcome — the gate will fail, and it is right to.
- **Do not grow the exemption register.** An unregistered exemption fails the suite. If a property genuinely cannot be proven at component level, add it with a reason and a pointer to where it *is* proven.
- **Do not wire an inert property before completing P1.** It changes live pages.
- **Do not build a second renderer, SEO engine or content store** — excluded by the approved Option C model.
- **Do not treat the Blueprint as approved requirements.** It declares itself planning-only on a baseline 4 commits behind HEAD, and three of its claims were already found stale in Stage 02.

---

## 7. Git state at handover

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` |
| HEAD | `fd4fb10` — **unchanged; no commit, push, merge or branch created** |
| Modified tracked files | **8** — see `STAGE_03_COMPLETION_REPORT.md` §D |
| New untracked test files | 8 (6 Stage 03 suites + 2 support files) |
| Database | Test DB migrated with approval; **dev and production untouched** |

Git finalization remains deferred until the owner requests it.
