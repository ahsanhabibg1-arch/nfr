# NFRGuide.com — Stage 04 Completion Report
## Block Registry, Property Rendering & Admin Editor Reliability

**Stage:** 04 of 10 (absolute maximum 12) · **Date:** 2026-11-09
**Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` — unchanged, no commit created
**Written for:** the project owner and the independent reviewer authorizing Stage 05

### Evidence convention

**[EXECUTED]** — a command was run in this stage; the result is reported as returned. **[VERIFIED]** — established by reading or querying, cited. **[BLOCKED]** — not run, with the precise cause and prerequisite. Nothing unexecuted is reported as passing.

---

## A. Executive Summary

**Status: COMPLETE**, with the one pre-existing known failure (KD-01) intact and four harnesses documented as BLOCKED.

Stage 04 made the block registry authoritative. The Builder no longer advertises a single property it cannot deliver.

### What was accomplished

1. **All three inert properties fixed** — `landing-hero.heroImageUrl` (which required a component change, not wiring), `landing-grid.articleCount`, and `detail-related.title`. The `INERT` exemption register went from **3 entries to zero**.
2. **Duplicate registry definitions consolidated.** `rich-text-block` and `cta-banner` were each declared twice with divergent caps; first-wins dedupe silently discarded one, so the stricter landing caps (3 and 2) were unreachable. One definition each now carries `familyLimits`, and those caps are enforced server-side.
3. **Help text reaches the DOM.** It previously rendered in only 3 of 9 property-editor branches, so the one help string the project had added — on `quick-access.kicker`, a `text` property — never appeared. Field chrome is now produced in one place, with `htmlFor` and `aria-describedby` association.
4. **Property validation derives from each block's own `PropDef`.** Numeric bounds, select options, booleans, colours, featured id lists and URL schemes are all enforced; the markup check now catches `onerror=`, `<svg onload>` and `<iframe>`, which the old `/<script/i` test let through.
5. **The unbounded query is bounded.** `detail-related.articleCount` was `Number(…) || 3` feeding a Prisma `take`; it is now clamped 1–6.
6. **Conditional dependencies are visible.** 20 `requires` declarations, with editor guidance naming the prerequisite by its label — addressing a class of "this control is broken" report that was never an inert property at all.
7. **Undeclared and unsupported types resolved** within approved scope, with `landing-stat-pills` correctly reclassified as a visibility control rather than a missing renderer.
8. **90 new behavioural tests**, three mutations proving they can fail, and a production build executed successfully.

### Executed verification

| Check | Result |
|---|---|
| `npx vitest run` | **87 files · 1822 tests · 1821 passed · 1 failed (known KD-01) · 0 skipped** |
| `npx tsc --noEmit` | **0 errors** |
| `npx next build` | **SUCCESS (exit 0)** |
| Mutations S4-M1 / M2 / M3 | each red, then restored green |

From the Stage 03 baseline (re-measured at preflight: 84 / 1732 / 1731 / 1 known): **+3 files, +90 tests, same single known failure.**

### The blocking prerequisite, resolved first

The stored-layout inventory was completed **before** any behaviour-changing fix. The decisive finding: **both inspectable databases hold zero `PageLayout` rows** — and so do `PageLayoutRevision`, `SiteConfig`, `SectionConfig`, `Announcement` and `GlobalBlock`. The CMS has real content (11 articles in dev), but **the Builder has never been used to compose a page**. Every public page renders from code defaults.

So no Stage 04 fix could disturb saved admin intent. Production was not inspected, per the rules; documentary evidence indicates pre-launch, and every fix was nonetheless built so the **unset path is equivalent to the previous behaviour**, each proven by a paired test.

### Remaining blockers

None for Stage 04. **D-04 remains unapproved and blocks Stage 05.** D-11 (newsletter) needs an owner decision; findings and a recommendation are in the handover, and no public-facing change was made.

---

## B. Exact changed files

**10 files modified in Stage 04, 4 added. No schema change. No migration authored. No dependency added.**

[EXECUTED] `git diff --stat HEAD` — Stage 04 rows only:

```
 apps/web/lib/cms/sectionRegistry.ts            | 233 ++++++++++++---------
 apps/web/lib/cms/pageLayoutService.ts          | 212 ++++++++++++++++---
 apps/web/views/admin/AdminPageLayoutEditor.tsx | 106 +++++-----
 apps/web/tests/batch-i-hardening.test.ts       |  47 +++--
 apps/web/components/editorial/SectionLandingHero.tsx | 32 ++-
 apps/web/lib/cms/detailTemplateData.ts         |  30 ++-
 apps/web/tests/batch31-unit.test.ts            |  28 ++-
 apps/web/vitest.config.ts                      |  14 +-
 apps/web/lib/cms/slotUtils.ts                  |  13 ++
 apps/web/tests/batch32-unit.test.ts            |  11 +-
 apps/web/lib/cms/sectionLandingData.ts         |   9 +-
 apps/web/components/blocks/LandingBlocks.tsx   |   2 +
 apps/web/components/blocks/DetailBlocks.tsx    |   (+5)
```

New files:

```
 apps/web/views/admin/PropField.tsx                      (shared field chrome)
 apps/web/tests/stage04-property-fixes.test.ts           (34 tests)
 apps/web/tests/stage04-property-validation.test.ts      (34 tests)
 apps/web/tests/stage04-editor-dom.test.ts               (22 tests)
```

Carried unchanged from Stages 01–03: `.env.example`, `app/api/internal/revalidate/route.ts`, `lib/cms/scheduledPublishRunner.ts`, `tests/batch-c-revisions.test.ts`, `tests/batch-d-scheduling.test.ts`, plus the Stage 01/03 test suites.

### Why each Stage 04 change was necessary

| File | Change | Necessity |
|---|---|---|
| `sectionRegistry.ts` | `PropDef.min` / `requires`; `SectionDef.familyLimits`; two shared definitions extracted; `resolveMaxInstances()`; `landing-stat-pills` cleaned up; 20 `requires` added | Task B needed one definition per type; Tasks C and F needed the metadata to validate and guide against |
| `pageLayoutService.ts` | `validateOneProp()` per `PropDef`; `PropWarning` for undeclared keys; family-aware `validateBlockLimits` | Task C — the server must enforce the contract the Builder advertises |
| `PropField.tsx` *(new)* | `PropFieldShell`, `SimplePropField`, `unmetDependency`, `propFieldIds`, `describedBy` | Task A. Extracting it is what makes help text impossible to omit **and** makes the panel testable — the editor selects a block only in a click handler, so a static render never reached the properties panel. That is precisely why the original guarding test asserted on source text |
| `AdminPageLayoutEditor.tsx` | Delegates to `SimplePropField`; picker branches use the same chrome; `addBlock`/`duplicateBlock` family-aware | Tasks A, B, F |
| `SectionLandingHero.tsx` | Optional `backgroundImageUrl` / `backgroundImageAlt` | Task D — `landing-hero.heroImageUrl` was structurally unconsumable; the component had no image field at all |
| `LandingBlocks.tsx` | Passes `heroImageUrl` through | Task D |
| `sectionLandingData.ts` | `limitList(...)` for `landing-grid` | Task D |
| `slotUtils.ts` | `limitList()` helper | Task D — gives the resolver a tested seam instead of an inline slice |
| `detailTemplateData.ts` | `relatedCount()` clamp; `relatedTitle()` pass-through | Tasks C and D |
| `DetailBlocks.tsx` | Forwards `data.title` to `RelatedArticles` | Task D |
| `vitest.config.ts` | `testTimeout` 30s → 90s | Resolves pre-existing `seo-intel` timeout fragility exposed by added load. **No assertion changed** — §F |
| 3 legacy test files | 10 assertions retargeted | They asserted the old implementation's literals; §E-4 |

---

## C. Registry counts, properties fixed, remaining exemptions

| Measure | Before | After |
|---|---|---|
| Definition entries across four families | 29 | **29** |
| Distinct definition objects | 27 | **27** |
| **Duplicate declarations** | **2** | **0** ✅ |
| Renderer entries | 23 | **23** |
| Declared types with no renderer | 6 | **5** |
| **`INERT` exemptions** | **3** | **0** ✅ |
| `NO_RENDERER` exemptions | 9 | **8** |
| `VIA_RESOLVER` exemptions | 5 | **6** |
| `BY_DESIGN` exemptions *(new reason)* | — | **1** |
| Total register entries | 17 | **15** |
| `requires` declarations | 0 | **20** |

**Properties fixed:** `landing-hero.heroImageUrl`, `landing-grid.articleCount`, `detail-related.title`. Plus `detail-related.articleCount` clamped, and `quick-access.kicker` help text now rendering.

**Remaining 15 exemptions** — 8 `NO_RENDERER` on `detail-*` / `directory-*` types coordinated with Stage 07 under approved Option B; 6 `VIA_RESOLVER` (consumed through resolver data, proven in the causation and Stage 04 suites); 1 `BY_DESIGN` (`landing-stat-pills`, a visibility toggle that correctly has no renderer).

`detail-related.title` moved to `VIA_RESOLVER` rather than being deleted from the register: it is wired, but through resolver `data`, so a component-level slot sentinel cannot prove it. Keeping an accurate entry and proving it where it flows is more honest than removing the entry to tidy a count.

Full matrix: `STAGE_04_REGISTRY_AND_PROPERTY_MATRIX.md`.

---

## D. Stored-layout compatibility findings

Completed before any behaviour-changing fix. Full detail in `STAGE_04_STORED_LAYOUT_IMPACT_AUDIT.md`.

| Database | `PageLayout` rows | Watched props stored | Undeclared keys | Legacy types stored |
|---|---|---|---|---|
| `nfrguide_test` | **0** | 0 | 0 | 0 |
| `nfrguide_dev` | **0** | 0 | 0 | 0 |
| production | **NOT INSPECTED** | — | — | — |

Supporting dev counts [VERIFIED]: `PageLayoutRevision` 0 · `SiteConfig` 0 · `SectionConfig` 0 · `Announcement` 0 · `GlobalBlock` 0 · `NavigationItem` 15 (seeded) · `Article` 11.

**Interpretation:** the Builder has never saved a layout, so every public page renders from `buildDefaultSlots(family)`. No Stage 04 change could alter a stored page.

**Limitation, stated plainly.** Production was not connected to, per the rules. A zero-row result in dev and test does **not** prove production is safe. Documentary evidence indicates pre-launch — `.env.example:42` describes the cloud database as *"The **FUTURE** deployed site's PostgreSQL"*, `NEXT_PUBLIC_SITE_URL` is localhost, `INTERNAL_REVALIDATE_SECRET` is unset, and the project's own guard refuses to boot a production build against a local database. That is an inference from configuration, **not** a database observation.

**Defence in depth.** Because production could not be verified, every fix was built so the unset path matches previous behaviour, each with a paired test: `landing-hero` renders **no `<img>` at all** when unset or blank; `landing-grid` returns the full list when the count is absent **or zero**; `detail-related` falls back to its documented default heading. Undeclared keys are warned about and **preserved** — a test inspects what gets written. The production re-check queries are in §5 of the audit.

---

## E. Behavioural test evidence and full-suite result

### E-1 Executed results

| Command | Status | Result |
|---|---|---|
| `npx vitest run` | **EXECUTED** | **87 files · 1822 tests · 1821 passed · 1 failed (KD-01) · 0 skipped · 275.79s** |
| `npx tsc --noEmit` | **EXECUTED** | **0 errors** |
| `npx next build` | **EXECUTED** | **SUCCESS (exit 0)** — full route manifest, SSG prerendering across all entity families |
| Stage 04 suites in isolation | **EXECUTED** | **90/90** |
| `npm run test:routes` | **ATTEMPTED → BLOCKED** | cause in §G |
| `npm run test:cache` / `test:e2e` / `test:migration` | **BLOCKED** | §G |

### E-2 Expected vs unexpected failures

**Expected: exactly 1** — KD-01, unaltered:

```
× Stage 03 Task D — homepage deduplication invariant (KNOWN FAILING, Stage 05)
  → 7 article(s) resolved into more than one homepage slot
```

**Unexpected: 0.** Two groups of failures arose during the stage and both were resolved:

1. **10 legacy source-text tests** broke because Stage 04 changed the implementations they asserted on. Retargeted to the new markers, each annotated with the behavioural test that now proves the guarantee. §E-4.
2. **8 `seo-intel` timeouts** — pre-existing fragility, not a functional regression. §F.

### E-3 What the 90 new tests prove

| Task | Tests | Representative guarantees |
|---|---|---|
| A — help text | 10 | renders for all 8 shared-field types; **exactly once**; `aria-describedby` points at a present element; `htmlFor` binds label to input; no description element when none is declared |
| B — consolidation | 6 | one definition **object** per type; both shared blocks available on both families; **the stricter landing cap is now enforced** (3 → rejected on landing, allowed on homepage) |
| C — validation | 34 | out-of-range, fractional and non-numeric rejected; non-option selects rejected; `javascript:` **and `data:`** rejected; `onerror=`, `<svg onload>`, `<iframe>` rejected — all three of which the old check allowed; undeclared keys accepted, warned **and preserved**; `expect(upsert).not.toHaveBeenCalled()` on every rejection |
| D — fixed properties | 15 | each property reaches output when set, **and the unset path renders as before** |
| E — `landing-stat-pills` | 6 | still offered; correctly has no renderer; inert `pills[]` gone; hero shows pills when visible, omits when hidden |
| F — dependencies | 14 | guidance names the prerequisite **by label, not key**; clears when satisfied; **preserves the stored value**; leaves the field enabled; every `requires` names a real sibling |

Every assertion is on observable output or a real function's behaviour. **None reads source text** — confirmed by the Stage 03 quality gate, which asserts Stage 04 introduced zero new violations.

### E-4 The 10 legacy regressions

All ten asserted the *old* implementation's literals while the guarantees became stronger:

| File | Tests | Was asserting | Now asserts |
|---|---|---|---|
| `batch-i-hardening` | 5 | `val.length > 2000`, `<script`, `/url$/i`, `javascript:`, `maxInstances` | `MAX_PROP_CHARS`, `UNSAFE_MARKUP`, `SAFE_URL`, `UNSAFE_SCHEME`, `resolveMaxInstances` |
| `batch31-unit` | 3 | old validation literals; editor branch strings; the `isUrlProp` key heuristic | new markers; `PropField.tsx` + `SimplePropField`; type-driven `case 'url'` / `case 'image'` |
| `batch32-unit` | 2 | `maxInstances`; editor prop-type branches | `resolveMaxInstances`; `PropField.tsx` branches |

**Worth recording as a finding:** ten tests broke because the code improved, while behaviour was preserved and strictly better. That fragility is what the Stage 03 gate exists to stop accumulating, and it is why each retargeted assertion now names the behavioural test that actually proves its guarantee.

---

## F. The `seo-intel` timeout, and why it is not a regression

The first full run after Stage 04's changes showed 8 extra failures, all `Test timed out in 30000ms`, in `tests/seo-intel.test.ts`.

[EXECUTED] Diagnosis — **not functional**:

- The file passes **12/12 in isolation** (107.94s).
- Individual cases take **21–25s** even alone, against the former 30s limit.
- Stage 04 added ~90 tests of concurrent load, pushing them over.
- Stage 04 changed nothing under `lib/seo-intel/`.

**Resolution:** `testTimeout` / `hookTimeout` raised 30s → 90s in `vitest.config.ts`, with a comment recording this reasoning. **No assertion was changed** — only the allowance for a genuinely slow database suite. After the change the full suite returns to exactly one failure.

Reported prominently because raising a timeout can be a way to hide a real problem. Here it is not: the evidence that it is load contention rather than breakage is the isolation run.

---

## G. Browser and harness status

**Production build: EXECUTED ✅** — `npx next build` exit 0, safe because no dev server was active.

**`test:routes`: ATTEMPTED, BLOCKED with a precise cause.** Prerequisites were closer than previous stages assumed — the test database **is** seeded (17 articles, 6 `fixture-` records) and schema-current. A server was started on port 3100 against it. **Every route returned 500**, and the server log gives the reason:

```
environment INVALID: NEXT_PUBLIC_SITE_URL must be https in production;
DATABASE_URL points at localhost in production (expected the managed cloud database);
APP_ENV=production but DATABASE_URL targets a local database
→ Failed to prepare server: error loading instrumentation hook
```

**This is the project's own environment isolation guard working correctly.** `next start` sets `NODE_ENV=production`, activating `lib/env.ts` / `lib/env-guard.ts`, which refuses to boot a production build against a local database. It is a safety feature and was **not** worked around. A dev-mode retry collided with an already-running dev server and was abandoned rather than pursued; all stray servers were then terminated and ports 3000 and 3100 confirmed free.

**The practical plan** — run the harnesses against `next dev`, which does not trip the guard — is in `STAGE_04_HANDOVER.md` §5 with exact commands.

**`test:cache`: BLOCKED** — same guard, plus it **writes** to the database (ephemeral admin, throwaway article). **Stage 08 cannot verify the cache-scoping fix (KD-08) without it**, so wiring it earlier is worthwhile.

**`test:e2e`: BLOCKED** — same guard via `playwright.config.ts:39-40`, plus admin-login fixtures and Playwright browsers not installed.

**`test:migration`: BLOCKED** — creates a throwaway database; not authorized. The Stage 03 authorization covered applying existing migrations to the existing test database only.

**No blocked harness is reported as passing.**

---

## H. Security and database safety checks

| Restriction | Status |
|---|---|
| No production database mutation | **CONFIRMED** — production never connected to, read or written |
| No unauthorized development database mutation | **CONFIRMED** — dev accessed **read-only** for the layout inventory; zero writes |
| No destructive migration | **CONFIRMED** — `prisma/migrations/` unchanged at **19**; no migration authored or applied in Stage 04 |
| No deployment | **CONFIRMED** |
| No Docker | **CONFIRMED** |
| No branch switching | **CONFIRMED** — still `office-sync-2026-11-08` |
| No commit or push | **CONFIRMED** — HEAD identical at start and end |
| No reset, cleanup or discard of pre-existing work | **CONFIRMED** — all Stage 01–03 artefacts intact |
| No exposed credentials | **CONFIRMED** — env checks printed hostname, database name and booleans only; the inventory printed property types and lengths, never values |
| No unapproved product redesign | **CONFIRMED** — no new block types, page families or routes |
| No parallel renderer or SEO engine | **CONFIRMED** — `PropField` is an extraction from the existing editor, not a second renderer |
| No premature Stage 05 implementation | **CONFIRMED** — KD-01 untouched; the dead content engine neither wired nor deleted (D-04 unapproved) |
| Data model unchanged | **CONFIRMED** — `prisma/schema.prisma` not modified |

**Security posture improved, not weakened.** Stage 04 strengthened input validation: unsafe URL schemes extended from `javascript:` alone to also cover `data:`, `vbscript:`, `file:` and `blob:`; the markup check extended from `/<script/i` to also catch `iframe`, `object`, `embed`, `style`, `link`, `meta`, `base`, `svg`, any `on*=` event attribute, and `srcdoc=`. Each has a test, and each test records that the old check let it through. Stage 01's security fix, RBAC, draft isolation, fixture exclusion and the SEO indexing policy were untouched.

Temporary artefacts removed: two inventory scripts and three mutation backups, all outside the repository or deleted. Mutation residue scan: **clean**.

---

## I. Acceptance criteria matrix

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Stored-layout impact assessed **before** behaviour-changing fixes | **PASS** | §D — inventory run first; 0 rows in both inspectable databases; production limitation stated |
| 2 | Supported editor help text works | **PASS** | §E-3 — 10 DOM tests; all 8 shared-field types; exactly once; ARIA association; mutation-verified (S4-M3) |
| 3 | Duplicate registry definitions resolved | **PASS** | §C — 2 → 0; object-identity test; per-family caps enforced server-side |
| 4 | Property validation enforced | **PASS** | §E-3 — 34 tests; `PropDef`-driven; mutation-verified (S4-M2) |
| 5 | The three inert properties functional, with no unsafe partial implementation | **PASS** | §C — `INERT` 3 → 0; each fix paired with an unset-path test; mutation-verified (S4-M1) |
| 6 | Block registration/rendering inconsistencies addressed within approved scope | **PASS** | Matrix §4 — `landing-stat-pills` resolved; `landing-empty` and `landing-competition-disciplines` documented as internal; detail/directory coordinated with Stage 07 as instructed |
| 7 | Conditional dependencies understandable in the Admin UI | **PASS** | §E-3 — 20 declarations; guidance names the prerequisite by label; value preserved; field stays enabled |
| 8 | Behavioural tests and mutation checks verify the corrections | **PASS** | 90 new tests; 3 mutations each red then restored; no residue |
| 9 | No new unexplained test failure | **PASS** | §E-2 — exactly 1 expected failure (KD-01). Both failure groups that arose are explained and resolved |
| 10 | All safety restrictions respected | **PASS** | §H |

**10 of 10 PASS.**

---

## J. Pending owner decisions and Stage 05 prerequisites

**Resolved earlier:** D-15, D-01, D-02 (Option B), D-03. **Settled by Stage 04 as engineering:** D-10.

| Priority | ID | Decision | Blocks |
|---|---|---|---|
| **1** | **D-04** | Content engine: retire `contentSourceEngine.ts` and promote `slotUtils`, or integrate it | **Stage 05 — blocking** |
| 2 | **D-11** | Newsletter block — findings and recommendation (remove from registry) in the handover §7. **No public-facing change was made.** | Stage 05/06 |
| 3 | D-13 | Legal content approval and indexing | Stage 09 |
| 4–9 | D-05, D-06, D-07, D-12, D-14, D-09 | Footer ownership, appearance, revision retention, scheduler, sitewide JSON-LD, info-page workflow | Stages 08–09 |

**Stage 05 prerequisites**

1. **D-04 approval** — the only hard blocker. If delayed, **Stage 06 is fully unblocked** and was identified in the Stage 02 roadmap as the swap-ahead candidate.
2. **KD-01 is Stage 05's deliverable.** Its assertion must not be weakened, skipped or altered; it must turn green unmodified. Root cause and the designed-but-unconnected `DeduplicationContext` are documented in the handover §3.
3. **Harness wiring** — the precise cause of the HTTP-harness blockage is now known, with exact commands in the handover §5. Worth doing in Stage 05 or 06 so Stage 08 can verify cache scoping and Stage 10 is not their first run.

---

## K. Final Verdict

**STAGE 04: COMPLETE**

The registry is now authoritative: zero `INERT` exemptions, zero duplicate declarations, validation driven by each block's own declared contract, and help text that actually reaches the DOM. The three properties that an admin could edit to no effect now work, and each carries a test proving the unset path is unchanged — which is what made them safe to ship without production visibility.

Two defects were fixed that no task had asked for but the work exposed: an unbounded Prisma query behind `detail-related.articleCount`, and a class of "broken control" that was never an inert property at all but an undeclared conditional dependency between fields.

The homepage duplication defect remains **failing on purpose**. Stage 05 owns it, and its assertion is untouched.

No commit, push, merge or branch was created. HEAD is unchanged at `fd4fb10`, migrations remain at 19, the schema is unmodified, and production and development databases were not written to.

**Stage 05 has not been started.** Awaiting independent review and explicit authorization.
