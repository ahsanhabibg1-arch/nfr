# Stage 06 — Handover to Stage 07

**Stage:** 06 of 10 · **Date:** 2026-11-09 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` (unchanged — no commit created)

**Stage 07 scope (from the Stage 02 roadmap):** Full Page Template Integration — detail-template composability, directory templates, and the renderer consolidation Stage 06 deliberately deferred.

---

## 1. What Stage 07 inherits

| Asset | Where | Use |
|---|---|---|
| **The three-panel Builder** | `views/admin/AdminPageLayoutEditor.tsx` | structure tree · canvas · inspector. Extend it; do not rebuild it |
| **The canvas** | `views/admin/BuilderCanvas.tsx` | iframe on the real preview route, device modes, parent-side message validation |
| **The bridge** | `components/builder/BuilderCanvasBridge.tsx` | click-to-select and highlight, with the six validation checks |
| **`data-slot-id` containers** | `components/blocks/PageRenderer.tsx` | editor-mode only. Any new block gets them free |
| **Editor-mode gate** | `app/(public)/layout.tsx` | one server-side decision for every public route. A route added in Stage 07 inherits it automatically |
| **Capability declaration** | `lib/cms/pageCapability.ts` | **update this when you change what a page or block can do** — see §3 |
| **Shared prop readers** | `lib/cms/slotProps.ts` | one implementation for resolvers and Admin. Use these, never a copy |
| **Content source summary** | `lib/cms/contentSourceSummary.ts` | extend `SOURCE_PHRASES` when a family gains a feed |
| **161 Stage 06 tests** | `tests/stage06-*.test.ts` | regression net for selection, security, capability, renderer |
| **Working browser harness** | `e2e/stage06-visual-builder.spec.ts` | the recipe is in §4 |

**Working baseline:** 95 files · 2046 tests · **2046 passing · 0 failed · 0 skipped** · `tsc` 0 errors · `next build` succeeds.

**There is still no known-failing test.** Any failure in Stage 07 is a new regression.

---

## 2. Recommended Stage 07 sequence

1. **Renderer consolidation first, on its own.** Move visibility filtering and order sorting from the four resolvers into `PageRenderer`, with the double-application proof Stage 06 could not produce cheaply. Do it **before** the template work, as a single reviewed change, so a later failure is attributable. `tests/stage06-renderer-slots.test.ts` asserts the current contract and will fail deliberately — rewrite it in the same change, do not delete it.
2. **Server-component conversion**, still separately. Four blocks use `useRouter`; they need handling before `PageRenderer` can leave the client. Stage 06 did not attempt this and the stage directive forbade combining it with the canvas.
3. **Remove the four unsupported blocks** — `detail-hero`, `detail-body`, `detail-faq`, `directory-grid`. Two cautions: all four appear in `buildDefaultSlots` for their family, so the default layout changes; and **`directory-grid` is `required: true`**, so its `required` flag must be dropped in the same change or a directory layout becomes unsavable. Re-run the stored-layout inventory first (§6).
4. **Detail-template composability.** Promote `landing-competition-disciplines` to a real definition while you are there — it renders two hardcoded headings on `/competition/` that no admin can edit.
5. **Directory templates and a directory content source.** Listings are fetched directly by each route through `listPublicCompetitors` / `listPublicVenues`, entirely outside the slot system. Giving `directory-hero` a real renderer would also make it canvas-selectable and let its badge drop from "Text only" to "Editable".
6. **Update `pageCapability.ts` and its tests in the same commits.** See §3.

---

## 3. The one thing that will break if you ignore it

`lib/cms/pageCapability.ts` mirrors the renderer list in `RENDERED_SECTION_TYPES` rather than importing `blockRegistry`, to keep the module server-safe and out of the Admin bundle.

**`tests/stage06-page-capability.test.ts` asserts that mirror equals `Object.keys(blockRegistry)` in both directions.** So:

- Adding a renderer → the test fails until you add the type to the mirror.
- Removing a renderer → the test fails until you remove it.

That is intentional. A stale mirror makes the Admin label a block "Editable" when nothing renders it — a confident lie to an operator, which is worse than a failing test. When Stage 07 gives `directory-hero` or `directory-grid` a renderer, update the mirror **and** remove the corresponding entry from `NON_RENDERER_CONSUMERS`, or the classification will contradict itself.

Likewise, `PAGE_CAPABILITIES` levels are asserted per family. Making detail templates genuinely composable means changing `template-appendage` → `composed` for those seven keys **and** updating the capability tests and the `DETAIL_FIXED` copy, which currently tells operators the template structure cannot be changed here. If that stops being true, the Admin must stop saying it.

---

## 4. Browser verification — keep it running

Stage 06 ran Chromium against the isolated test database. Preserve the recipe.

```bash
cd apps/web

# 1. No conflicting server
netstat -ano | grep -E ":3000|:3100" | grep LISTENING

# 2. Build against the ISOLATED test database (APP_ENV=test satisfies the
#    environment isolation guard — do not weaken the guard instead)
DATABASE_URL="<TEST_DATABASE_URL from .env>" APP_ENV=test npx next build

# 3. Run the spec. playwright.config.ts starts `next start -p 3100` itself with
#    the same DB and APP_ENV, and refuses to run on a non-test database.
npx playwright test e2e/stage06-visual-builder.spec.ts --reporter=list
```

Notes:

- **Chromium is installed** (`ms-playwright/chromium-1248`). No browser download is needed.
- The fixture admin comes from the existing `e2e/global-setup.ts`, which writes ephemeral rows to the isolated test database and removes them in teardown. Stage 06 added **no** fixtures of its own.
- `.next` afterwards holds a test-database build. Harmless for `npm run dev` (dev ignores the production build) and overwritten by the next `next build`.
- `e2e/page-builder.spec.ts` was updated for the rename: the left panel is **"Page Structure"**, and there is now a separate **"Canvas"** heading.

### Vitest has no DOM

`vitest.config.ts` uses `environment: 'node'` with no jsdom or happy-dom installed, and `include` matches only `*.test.ts` (not `.tsx`). So Stage 06's Vitest suites use `renderToStaticMarkup` for structure and call the exported pure predicates for behaviour; real event interaction is proven in the browser. **Adding jsdom would be a dependency change** — if Stage 07 wants in-process event tests, that is the decision to take first, deliberately.

---

## 5. Carried-forward items

| Item | Stage | Note |
|---|---|---|
`detail-hero` / `detail-body` / `detail-faq` removal | 07 | see §2.3 cautions |
`directory-grid` removal or renderer | 07 | **`required: true` and unrenderable** |
`directory-hero` renderer | 07 | would make it canvas-selectable |
`landing-competition-disciplines` promotion | 07 | hardcoded headings on `/competition/` |
Directory content source | 07 | listings bypass the slot system entirely |
Renderer filter/sort consolidation | 07 | deferred from Stage 06 **by instruction**, needs the double-application proof |
Server-component conversion of `PageRenderer` | 07 | four blocks use `useRouter` |
Section-landing cross-slot dedup | 07, if needed | one feed per landing today, so nothing to deduplicate |
**Undo/redo** | unscheduled | no undo in the draft architecture. **No buttons were added** — a dead control is worse than none. Revision history is the recovery path |
**Live canvas for unsaved edits** | unscheduled | needs silent autosave (forbidden without verified safety) or a second renderer (forbidden). Current behaviour: canvas shows the saved draft and says so |
`richtext` prop type | unscheduled | declared in `PropType`, used by no block, rendered as a plain textarea |
KD-08 draft-save cache flush | 08 | **needs `test:cache` wired up first** |
KD-09 / KD-10 concurrency | 08 | interactive `expectedVersion`; atomic revision numbering |
KD-11 / KD-12 legal pages | 09 + D-13 | |
KD-13 / KD-14 SEO gaps | 09 | |
47 grandfathered structural tests | opportunistic | Stage 06 converted **8** (see below); convert more as each stage touches the area |
Newsletter component | when D-11 is revisited | `NewsletterSignup` remains in `PremiumBlocks.tsx`, unreachable. **Do not re-register** |

### Grandfathered structural tests converted in Stage 06

Eight source-text tests became behavioural ones because the code moved beneath them or the claim was never checked:

- `batch-t1-featured-picker.test.ts` — six `numProp`/`idListProp` tests that grepped `slotUtils.ts` for strings like `'Math.min(max, Math.max(min, Math.round(n)))'`. They now **call** the functions through `slotUtils`, which also proves the re-export surface.
- `batch-t2-detail-templates.test.ts` — "existing shared slotUtils is preserved" now asserts the module's exported surface rather than the file's characters.
- `batch32-unit.test.ts` — "editor has three-panel layout: Canvas and Properties" passed for two stages by finding two substrings while the editor had two panels and no canvas. Retargeted to a wiring check, with the layout proven against DOM in `stage06-builder-dom.test.ts`.

**The grandfathered registry still holds 49 entries — unchanged.** I first wrote "47" here and it was wrong; checking it produced a finding worth carrying forward.

**None of the eight tests converted above was in `tests/support/stage03LegacyStructuralTests.json`.** The Stage 03 quality gate flags a source-text assertion when the test's *name* claims a rendering outcome — "renders", "shows", "displays". It does not flag one whose name claims a *behaviour*: "numProp **clamps** to min/max bounds", "idListProp **handles** array input", "editor **has** three-panel layout". All eight were pure `expect(src).toContain(...)` assertions, and the gate never saw them.

So the registry's 49 is a floor, not a census. **Stage 07 should consider widening the gate's verb list** — `clamps`, `handles`, `has`, `supports`, `uses`, `includes` would have caught all eight — and then re-registering whatever that surfaces. That is a change to the gate's own strictness, so it deserves its own deliberate step rather than being folded into template work.

### Mutation gaps still open

Unchanged from Stage 03 and Stage 05: **draft isolation** has no mutation proving its assertion is load-bearing (the honest mutation leaks unpublished content and deserves a deliberate run with the owner's awareness), and the **test quality gate** is self-tested against synthetic titles but no deliberately-bad test file has proved it blocks one end to end.

---

## 6. Database caveat that still stands

The stored-layout inventory from Stage 04 found **zero `PageLayout` rows in both the development and test databases**, and zero rows in `PageLayoutRevision`, `SiteConfig`, `SectionConfig`, `Announcement` and `GlobalBlock`. **Production has never been inspected**, in any stage.

This matters more for Stage 07 than it did for Stage 06, because Stage 07 **deletes block types**. A production layout holding a `detail-body` slot would, after deletion, fail save validation — the type would no longer be in `getKnownSectionTypes`, so the operator could not save their own page.

**Run the inventory against production, or get written confirmation that no production layouts exist, before deleting any block type.** `.env.example:42` describes the cloud database as the "FUTURE deployed site's", which suggests there is no production data yet — but that is an inference, not a verification.

---

## 7. Owner decisions

**Resolved to date:** D-15, D-01, D-02 (Option B), D-03 (Stage 03) · D-04, D-11 (Stage 05) · D-10 settled as engineering.

| Priority | ID | Decision | Blocks |
|---|---|---|---|
| 1 | **D-13** | Legal content approval and indexing — 7 pages serve `noindex` with a visitor-facing draft banner | Stage 09 |
| 2 | **D-07** | Revision retention policy — unbounded today | Stage 08 |
| 3 | **D-05** | Footer ownership — nav edits silently overridden by `SiteConfig` | Stage 08 |
| 4 | **D-06** | Appearance controls — the tab governs only the homepage banner | Stage 08 |
| 5 | **D-12** | Scheduler and deployment target | Stage 08 |
| 6 | **D-14** | Sitewide `Organization` / `WebSite` JSON-LD — needs owner-supplied publisher facts | Stage 09 |
| 7 | **D-09** | Info-page publication workflow | Stage 09 |

**None blocks Stage 07.** All land in Stage 08 or later.

### Still awaiting ratification, carried from Stage 05

**Hero priority.** The homepage hero claims its articles before any other slot, regardless of where the admin places the block, so a lead story outranks a category feed. Stage 06 **preserved this provisionally and changed no content-selection precedence**, as instructed. It remains an editorial judgement embedded in a resolver, and a one-line change if the owner prefers block position to decide.

### New, raised by Stage 06

**Canvas fidelity vs. live editing.** The canvas shows the last *saved* draft. Closing that gap requires either silent autosave or a second client-side renderer, and both are currently forbidden. If the owner wants a live canvas, that is a product decision with an architectural cost, and it should be taken explicitly rather than drifted into.

---

## 8. What Stage 07 must not do

- **Do not build a second renderer.** The canvas mounts the real preview route; keep it that way.
- **Do not weaken the environment isolation guard** to get a build or a harness running. `APP_ENV=test` with the isolated database satisfies it (§4).
- **Do not reintroduce parallel slot resolution** — it would reopen KD-01.
- **Do not combine the renderer consolidation with the server-component conversion.** Two changes, two reviews.
- **Do not let `pageCapability.ts` drift** from what the code does (§3).
- **Do not add a content-source control that does not exist.** A test asserts the inspector never mentions `fallbackPolicy`, `emptyBehavior`, tag/author/date filters, sort order, randomisation, trending or personalisation.
- **Do not re-register the newsletter block**, add a subscription backend, or collect visitor data.
- **Do not grant the canvas iframe `allow-popups`, `allow-top-navigation` or `allow-downloads`**; a test asserts their absence.
- **Do not use `postMessage` with a `'*'` target origin**, and do not relax the `event.source` check — it is the check that actually distinguishes the Builder from a hostile same-origin frame.
- **Do not add a source-text assertion** to a test whose name claims a rendering outcome.
- **Do not add undo/redo buttons** until the draft architecture supports undo.

---

## 9. Git and environment state at handover

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` |
| HEAD | `fd4fb10` — **unchanged; no commit, push, merge or branch created** |
| Prisma migrations | **19 — unchanged**; no migration authored or applied |
| Schema | **unmodified** |
| Databases | production never contacted; development never written to; the isolated test database written only by the existing e2e global-setup, which cleans up after itself |
| `.next` | holds a **test-database** build from the browser run — harmless for dev, overwritten by the next build |
| Dev servers | terminated; ports 3000 and 3100 confirmed free |
| Docker / deployment | none |
| Prior stages' work | **fully preserved** — nothing reset, discarded or cleaned up |

Git finalization remains deferred until the owner explicitly requests it.
