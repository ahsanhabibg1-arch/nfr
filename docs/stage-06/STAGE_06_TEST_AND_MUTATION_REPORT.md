# Stage 06 — Test & Mutation Report

**Stage:** 06 of 10 · **Date:** 2026-11-09 · **HEAD:** `fd4fb10`

---

## 1. Headline results

| Gate | Result |
|---|---|
**Vitest** | **97 files · 2079 tests · 2079 passed · 0 failed · 0 skipped** (133.58s) |
**TypeScript** (`tsc --noEmit`) | **0 errors** |
**Production build** (`next build`) | **success, exit 0** |
**Browser** (Chromium, isolated test DB) | **20 passed · 0 failed** |
**Route harness** (production server) | **37 passed · 0 failed** |
**Mutations** | **10 introduced · 10 detected · 10 restored** |

### Movement from the Stage 05 baseline

The baseline was **measured to completion before any code was changed** — the process rule this programme had failed twice. It matched the expected figures exactly:

```
BEFORE (measured 17:02, no edits made):  90 files · 1885 tests · 1885 passed · 0 failed · 0 skipped
AFTER:                                   97 files · 2079 tests · 2079 passed · 0 failed · 0 skipped
```

**+7 files · +194 tests · still zero known failures.**

---

## 2. Tests added

| File | Tests | Proves |
|---|---|---|
`stage06-canvas-bridge.test.ts` | 50 | message validation in both directions; hostile slot ids; canvas activation context; the bridge's lack of any transport |
`stage06-builder-dom.test.ts` | 41 | three panels, canvas iframe + embed URL, sandbox, device controls, capability notices, tree semantics, support badges, slot-id agreement, save-outcome rule |
`stage06-content-source-inspector.test.ts` | 30 | selection mode, clamped counts, over-pin warning, deduplication explanation in every mode, no speculative controls |
`stage06-page-capability.test.ts` | 28 | the renderer mirror in both directions; block classification; all 15 page keys |
`stage06-renderer-slots.test.ts` | 23 | `data-slot-id` in editor mode, public output unchanged, unknown-block handling, bounded logging |
`stage06-frame-headers.test.ts` | 17 | the framing relaxation is same-origin only, and the rest of the baseline is intact |
`stage06-save-outcome.test.ts` | 5 | save-error wiring, no autosave, publish confirmation — named `[structural]` |
| **Total** | **194** | |

### Tests retargeted, not weakened

Eight pre-existing source-text tests were converted to behavioural ones because the code moved beneath them or the claim had never been checked:

| Test | Was | Now |
|---|---|---|
`batch-t1` × 6 (`numProp`, `idListProp`) | grepped `slotUtils.ts` for strings like `'Math.min(max, Math.max(min, Math.round(n)))'` | **call** the functions through `slotUtils`, covering clamping, rounding, fallbacks, arrays, comma strings, trimming |
`batch-t2` "existing shared slotUtils is preserved" | grepped for three `export function` strings | asserts the module's exported **surface** |
`batch32` "editor has three-panel layout: Canvas and Properties" | found two substrings in the editor file | a wiring check, renamed to say so; the layout is proven against DOM |

**No test was skipped, suppressed or deleted to make this stage green.** The `batch32` case deserves emphasis: it was named for a three-panel layout and passed for two stages while the editor had two panels and no canvas. That is the defect class this programme exists to remove, and it was sitting inside the test suite.

### Why these tests are shaped the way they are

The runner has `environment: 'node'` with no jsdom or happy-dom installed, and `include` matches only `*.test.ts`. So:

- **structure** is proven with `renderToStaticMarkup` against the real component tree — real output, not source text;
- **security predicates** are proven by calling the real exported functions (`isTrustedBuilderMessage`, `isTrustedCanvasMessage`, `isValidSlotId`, `readCanvasContext`) with hostile inputs;
- **event interaction** — a click inside the iframe, a highlight crossing the frame boundary — is proven **in Chromium**, because it cannot honestly be proven anywhere else.

Adding jsdom would be a dependency change, so it was not done unilaterally; it is recorded in the handover as a decision for Stage 07.

---

## 3. Browser verification

```
DATABASE_URL=<TEST_DATABASE_URL> APP_ENV=test npx next build
npx playwright test e2e/stage06-visual-builder.spec.ts e2e/page-builder.spec.ts
  → 20 passed (1.3m)
```

Chromium 1248, against `next start -p 3100` on the **isolated test database**, through the existing guarded Playwright config. The environment isolation guard was satisfied with `APP_ENV=test`, **not bypassed**.

| # | Check | Result |
|---|---|---|
1 | three panels render together | ✅ |
2 | canvas loads the real draft page via the preview route (`_pk=homepage`, `_canvas=1`) | ✅ |
3 | every rendered block carries a unique, non-empty `data-slot-id` | ✅ |
4 | **clicking a section in the canvas selects it in the Builder** | ✅ |
5 | clicking a canvas link selects instead of navigating | ✅ |
6 | **selecting in the tree highlights the section on the canvas** | ✅ |
7 | the tree is operable by keyboard alone | ✅ |
8 | device modes change the canvas viewport width | ✅ |
9 | a narrow window clamps the canvas; no horizontal page scroll | ✅ |
10 | the canvas reloads after a successful Save Draft | ✅ |
11 | a public visitor receives no slot ids and no bridge | ✅ |
12 | adding `?_canvas=1` by hand grants a visitor nothing | ✅ |
13 | the embed route refuses an unauthenticated request | ✅ |
14–20 | the seven existing `page-builder.spec.ts` tests, updated for the rename | ✅ |

### The browser run found two real defects that every unit test missed

This is the most important result in this report, and it is worth being blunt about: **the first browser run was 5 passed, 7 failed, while the entire Vitest suite was green.**

**Defect 1 — `X-Frame-Options: DENY` blanked the canvas.** The public pages refused to render inside the admin's own iframe. The CSP's `frame-ancestors 'none'` was report-only and merely logged 36 violations; the enforcing `X-Frame-Options` header was the actual blocker. Fixed by `SAMEORIGIN` and `'self'` — same-origin only, cross-origin framing still refused — and pinned by 17 new tests, because **no test had asserted any of those three values before this stage.**

**Defect 2 — default slot ids were random, so selection silently did nothing.** Registry defaults were computed twice and independently: in the browser for the tree, on the server for the canvas. Both minted fresh UUIDs, so the ids never matched. Click-to-select and highlighting did nothing at all — on every page, because the development and test databases hold zero `PageLayout` rows. Fixed with a deterministic `defaultSlotId(family, type)`, and guarded by a test that asserts the editor's rendered `tree-item-<id>` ids are exactly the ids `buildDefaultSlots` produces, for all four families.

Neither was findable without a browser: no Vitest suite compared the two id sources, and headers are not exercised by a unit test. After the fixes, 20/20 passed and the CSP frame violations went from **36 to 0**.

### Three test premises of mine were wrong

Recorded because the pattern matters more than the individual mistakes.

1. **Device widths.** I asserted a strict `mobile < tablet < desktop` ordering. At a 1280px window the canvas column is ~310px and at 1900px it is ~686px, so `maxWidth: 100%` clamps tablet and desktop to the same value. The code was right twice; the assertion was wrong twice. The real contract is `width = min(deviceWidth, availableColumn)`, and that is what is now asserted, plus a separate test for the clamp and the absence of horizontal page scroll.
2. **`not.toContain('disabled')` on a button tag.** It matched the Tailwind class `disabled:opacity-50`, so it would have passed whatever the button's real state was. Replaced with an attribute test. This one is a genuine false pass I wrote and caught.
3. **The unsaved-defaults banner.** I asserted the stale warning on first load, which exposed a real contradiction instead — see §5.

---

## 4. Route harness — Stage 05's four failures resolved

Stage 05 reported **33/37**, with four unknown-slug checks failing because `next dev` returns HTTP 200 while rendering the 404 page. Stage 06 ran the harness against a **production-mode server** on the isolated test database:

```
DATABASE_URL=<TEST_DATABASE_URL> APP_ENV=test npx next start -p 3100
SMOKE_BASE_URL=http://localhost:3100 npx tsx scripts/route-smoke.mts
  → Route smoke: 37 passed, 0 failed
```

**37/37.** The four failures were dev-mode artefacts exactly as diagnosed.

The harness was **not** adapted, loosened, or made environment-aware, and a true HTTP 404 requirement was **not** replaced with a body-only check. The stage directive permitted an environment-aware adaptation; it turned out not to be needed, because `APP_ENV=test` satisfies the environment isolation guard and gives a real production server without weakening it.

Still not run, unchanged from Stage 05: `test:cache` (writes to the database — Stage 08 needs it), `test:migration` (creates a throwaway database).

---

## 5. A contradiction found while writing a test

Writing "the canvas warns when there are unsaved changes" failed, and the reason was not the canvas.

`dirty` was initialised to `false`, while `selectPage` set it from `!layout || !layout.draftSections.length` when the operator switched pages. So on **first** load of a page with no stored layout, the top bar read *"Showing defaults — save draft to persist"* while the Save Draft button — disabled unless `dirty` — was greyed out. The editor instructed an action it had disabled, and the only way to save the defaults was the unrelated "Restore defaults" button.

The initialiser now uses the same rule `selectPage` already used. Two tests pin it: Save Draft is enabled when showing unsaved defaults, and disabled once the draft matches storage. Both check the `disabled` **attribute**, not the substring.

---

## 6. Mutation testing

Ten mutations, each applied to one file, verified against the suites that should catch it, then restored and byte-compared. Full runner: the mutation script in the session scratchpad; results below are the actual observed outcomes.

| # | Mutation | Expected | Observed |
|---|---|---|---|
**M1** | bridge: remove the `event.origin` check | origin-rejection tests fail | ✅ **detected** |
**M2** | bridge: remove the `event.source` check | sibling-frame and no-parent tests fail | ✅ **detected** |
**M3** | bridge: accept any slot id (`/^[\s\S]*$/`) | hostile-id tests fail | ✅ **detected** |
**M4** | Builder: remove the `pageKey` context check | wrong-page selection test fails | ✅ **detected** |
**M5** | `PageRenderer`: stop emitting `data-slot-id` | slot-id emission tests fail | ✅ **detected** |
**M6** | `PageRenderer`: emit containers on the **public** site | public-output-unchanged tests fail | ✅ **detected** |
**M7** | registry: restore random default ids | tree/canvas id agreement tests fail | ✅ **detected** |
**M8** | config: restore `X-Frame-Options: DENY` | frame-header tests fail | ✅ **detected** |
**M9** | inspector: drop the deduplication note (manual branch) | dedup explanation test fails | ❌ **NOT detected** → fixed, see below |
**M10** | capability: claim a renderer that does not exist | renderer-mirror test fails | ✅ **detected** |

**9/10 on the first pass. M9 found a real coverage gap**, which is what mutation testing is for.

Deleting the deduplication note from the **fully manual** branch broke nothing. The automatic and mixed branches were covered; the manual one was not — so the inspector could have silently stopped explaining the shortfall for pinned-only blocks, which is precisely the false-bug-report that note exists to prevent. The note genuinely belongs there: `pickedThenAuto`'s first guard skips a manual pick an earlier section already placed, so a fully manual slot can render fewer items than its count exactly as an automatic one can.

Three tests were added — the manual branch, the over-pinned branch, and one that asserts the note is attached to **every** configured feed in every mode, so a future branch cannot be added without it. M9 was then re-run: **3 tests failed, mutation detected**, file restored byte-identical.

**Final mutation score: 10/10 detected.**

### Restoration verified

Each mutation was restored from a backup held outside the repository and byte-compared (`restored=true` for all ten; M9's re-run confirmed `IDENTICAL`). A residue scan afterwards found no mutation marker anywhere in `components/`, `views/`, `lib/` or `next.config.mjs`, and confirmed the three load-bearing strings are intact: `defaultSlotId(family, def.type)`, `PICK_INTEGRITY_NOTE, DEDUP_NOTE`, and `value: 'SAMEORIGIN'`.

### What the mutations establish

M1–M4 are the ones that matter for the security claims: the stage requires proof that **breaking origin validation causes tests to fail**, and it does, as does breaking sender validation, slot-id validation and page-context validation. M5–M7 establish that **breaking selection synchronisation causes tests to fail** — in three different ways, including the exact defect the browser found. M8 establishes the header ratchet. M10 establishes that the capability mirror cannot drift.

---

## 7. Regression gates (§14)

| Gate | Result |
|---|---|
Full Vitest suite | **2079/2079** |
TypeScript | **0 errors** |
Next.js build | **success** |
Stage 01 security regression (`stage01-revalidate-security`) | 21/21 ✅ |
Stage 03 behavioural (dedup-invariant, draft-publish-causation, layout-observability, registry-contract, seo-causation, test-quality-gate) | 183/183 ✅ |
Stage 04 property/registry (editor-dom, property-fixes, property-validation) | 90/90 ✅ |
Stage 05 content-source and deduplication (content-source, content-ownership, registry-retirement) | 65/65 ✅ |
Stage 06 visual editor | 194/194 ✅ |
Route harness | 37/37 ✅ |
Browser | 20/20 ✅ |

**Zero failed · zero skipped · zero regressions.** KD-01 remains green with its assertion untouched.

### The quality gate caught me

`tests/stage03-test-quality-gate.test.ts` failed during final verification, flagging **seven** tests in `stage06-builder-dom.test.ts`. The cause was mine: I had added one source-reading assertion to that file, and the gate works per **file** — once a file reads product source, every test in it whose title contains a rendering verb is treated as a source-text claim. Seven legitimate DOM tests were tainted by one structural one.

The gate was right. The fix was to move the structural assertion into its own file (`stage06-save-outcome.test.ts`) with `[structural]` in every title, **not** to grandfather the seven. One further quirk: the gate scans raw file text, so merely *naming* the file-reading API in an explanatory comment re-tripped it. Crude, but erring toward false positives is the correct bias for a gate like this, and the comment now describes the API without naming it.

**The grandfathered baseline is unchanged at 49 entries.** Nothing was added to it.

### A gap in the gate itself

None of the eight tests converted in §2 was in the baseline. The gate's verb list is `renders|shows|displays|rendered|visible`; it does not flag a name that claims a *behaviour* — "numProp **clamps** to min/max bounds", "idListProp **handles** array input", "editor **has** three-panel layout". All eight were pure source-text assertions and the gate never saw them. So 49 is a floor, not a census. Widening the verb list is proposed in the handover as its own deliberate step.

---

## 8. Database and safety verification

| Constraint | Evidence |
|---|---|
No production database access | production was **never contacted** — no connection string, no query, in any run |
No development database mutation | development was read by `next build` only; **never written to** |
No destructive operation | none performed |
No Prisma migration | **19 — unchanged**; `git diff HEAD -- prisma/schema.prisma` is **empty** (0 lines) |
No schema modification | the data model is untouched |
Test-database writes | only the **existing** `e2e/global-setup.ts` fixtures, which the teardown removes. Stage 06 added **no** fixtures and wrote no rows of its own |
Browser install | **none** — Chromium 1248 was already present |
Secrets | `TEST_DATABASE_URL` was read into an environment variable and never printed; no credential appears in any file or report |
Environment isolation guard | **not weakened** — `APP_ENV=test` satisfies it for both the build and the production server |
Docker / deployment | none |
Branch operations | none — no commit, push, merge, branch or checkout |

**Standing limitation, unchanged:** the production database has never been inspected, in any stage. All stored-layout conclusions rest on development and test, both of which hold **zero** `PageLayout` rows. This matters more for Stage 07, which deletes block types — see the handover.

One housekeeping note: `.next` currently holds a **development-database** build, from the final verification build. The intermediate test-database builds were overwritten. Harmless either way.
