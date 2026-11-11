# Stage 06 — Completion Report

**Stage:** 06 of 10 — Premium Visual Website Builder Canvas & Responsive Editing
**Date:** 2026-11-09 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` (unchanged — nothing committed)
**Status:** **COMPLETE**

---

## 1. Summary

The Builder now has a real visual canvas. The centre panel renders the actual draft page — produced by the same routes, resolvers and `PageRenderer` that serve the public site — and selection works in both directions: click a section on the page and it selects in the tree; select in the tree and it outlines on the page.

| Gate | Result |
|---|---|
Vitest | **97 files · 2079 tests · 2079 passed · 0 failed · 0 skipped** |
TypeScript | **0 errors** |
`next build` | **success** |
Browser (Chromium, isolated test DB) | **20 passed · 0 failed** |
Route harness (production server) | **37 passed · 0 failed** — up from 33/37 |
Mutations | **10 introduced · 10 detected · 10 restored** |

Baseline was measured to completion **before** any edit — the process rule this programme had failed twice — and matched exactly: 90 files / 1885 tests / 0 failures. Movement: **+7 files, +194 tests, still zero known failures.**

### Four things the owner should read before the detail

1. **The browser run found two real defects that the entire unit suite missed.** The first browser pass was 5 passed / 7 failed while Vitest was fully green. `X-Frame-Options: DENY` was blanking the canvas, and default slot ids were random so selection silently did nothing on every page. Both are fixed and guarded. §7 and §10.
2. **One security header was relaxed**, from `DENY` to `SAMEORIGIN` (plus the two matching CSP directives, `'none'` → `'self'`). Cross-origin framing is still refused; only our origin framing itself is permitted. No test had asserted those values before, so 17 now pin them. §8.
3. **The canvas shows the last *saved* draft, not unsaved edits**, and says so on screen. Closing that gap needs either silent autosave or a second renderer — both currently forbidden — so it is a labelled limitation, not a polish item. §11.
4. **Stage 05 overclaimed on D-11.** My Stage 05 report said an admin "cannot add" the retired newsletter block. That was true of the service helper and false of the actual Admin UI, which never called it. Corrected here. §6.

---

## 2. Implementation scope

| Delivered | Where |
|---|---|
Three-panel workspace: structure tree · canvas · inspector | `views/admin/AdminPageLayoutEditor.tsx` |
Canvas mounting the **existing** authenticated preview route | `views/admin/BuilderCanvas.tsx`, `app/admin/(dashboard)/website/preview/route.ts` |
`data-slot-id` containers, editor-mode only | `components/blocks/PageRenderer.tsx` |
Editor-mode gate, established once, server-side | `app/(public)/layout.tsx`, `components/blocks/BuilderEditorMode.tsx` |
Secure bidirectional `postMessage` bridge | `components/builder/BuilderCanvasBridge.tsx` |
Device modes 1280 / 768 / 390 on the real viewport | `views/admin/BuilderCanvas.tsx` |
Page + block capability declaration | `lib/cms/pageCapability.ts` |
Content Source inspector | `lib/cms/contentSourceSummary.ts`, `lib/cms/slotProps.ts` |
Unknown/retired block diagnostics | `components/blocks/PageRenderer.tsx` |
Keyboard tree, ARIA, focus, announcements | `views/admin/AdminPageLayoutEditor.tsx` |
Framing headers relaxed to same-origin | `next.config.mjs` |

**No second renderer was built. No parallel content engine. No newsletter re-registration. No schema change. Stage 07 was not started.**

---

## 3. Files changed

**32 files in the diffstat (31 modified, 1 deleted) — 1460 insertions, 820 deletions — plus 14 new untracked files.** Of the 31 modified, 21 carry over from Stages 01–05.

### New in Stage 06

| File | Role |
|---|---|
`components/blocks/BuilderEditorMode.tsx` | editor-mode context, default `false` |
`components/builder/BuilderCanvasBridge.tsx` | in-canvas bridge: click-to-select, highlight, validation |
`views/admin/BuilderCanvas.tsx` | centre panel: iframe, device modes, parent-side validation, `canvasTokenAfterSave` |
`lib/cms/pageCapability.ts` | page/block capability + the test-enforced renderer mirror |
`lib/cms/contentSourceSummary.ts` | plain-language selection summary |
`lib/cms/slotProps.ts` | the three pure prop readers, shared by resolvers and Admin |
`e2e/stage06-visual-builder.spec.ts` | 13 browser checks |
7 × `tests/stage06-*.test.ts` | 194 tests |

### Modified by Stage 06

| File | Change |
|---|---|
`views/admin/AdminPageLayoutEditor.tsx` | three panels; tree semantics + keyboard; support badges; capability notice; content-source summary; retired-block filter; `dirty` initialiser fix; deterministic default ids |
`components/blocks/PageRenderer.tsx` | `editorMode`, slot containers, bounded unknown-type diagnostics |
`app/(public)/layout.tsx` | establishes editor mode once; renders the bridge when gated |
`app/admin/(dashboard)/website/preview/route.ts` | `embed=1` redirect mode, tolerant of a missing draft |
`app/admin/(dashboard)/website/page.tsx` | passes `retired` through to the editor |
`lib/cms/sectionRegistry.ts` | `defaultSlotId()` — deterministic default-layout ids |
`lib/cms/slotUtils.ts` | re-exports the moved readers |
`next.config.mjs` | `X-Frame-Options: SAMEORIGIN`; CSP `frame-ancestors`/`frame-src` → `'self'` |
`e2e/page-builder.spec.ts` | updated for the panel rename; now asserts three panel headings |
`tests/batch-t1-*`, `tests/batch-t2-*`, `tests/batch32-*` | 8 source-text tests converted to behavioural ones |

---

## 4. Before and after

| Capability | Before | After |
|---|---|---|
Centre panel | a **list of block names** | the **real draft page**, rendered by the production chain |
Page preview | a separate browser tab | in-place, beside the tree and inspector |
Click a section on the page | impossible | selects it in the Builder |
Select in the tree | highlighted the list row | **outlines the section on the page**, scrolls it into view |
Responsive check | none | 1280 / 768 / 390 on the real viewport |
Keyboard operation | **none** — a div with an `onClick` | `role="tree"`, Arrow/Home/End/Enter/Space, Alt+Arrow to reorder |
Page capability | identical UI for all 15 keys | each page states its real level and its fixed parts |
Block status | label + REQ/DUP badges | six-way support classification with plain-language help |
Unknown/retired block | **silently invisible** | amber in-canvas notice + tree badge + bounded log |
Content source | raw `featuredIds` / `articleCount` fields | plain-language summary of mode, counts and the dedup caveat |
Retired newsletter | **still offered in "Add a Block"** | hidden from the library, still saveable in stored layouts |
Save Draft on a defaults page | **disabled, while the UI asked for a save** | enabled, with the unsaved state flagged |
Canvas vs. unsaved edits | n/a | explicitly labelled as the saved draft |

---

## 5. Page-family capability matrix

| Level | Pages | Canvas click-select | The Builder does not control |
|---|---|---|---|
**Composed** | `homepage`, 5 × `section:*` | ✅ all blocks | header, footer, section intro heading |
**Template + appendage** | 7 × `template:*` | ✅ appendage blocks only | title, body, metadata, template structure |
**Directory (limited)** | 2 × `directory:*` | ⚠️ CTA block only | search form, filters, pagination, the list |

**6 composed · 7 template-appendage · 2 directory-limited = 15.** Each shows its level and its fixed parts above the canvas, so the Builder never implies that reordering a block will restructure an article or a generated listing.

### Block support (22 renderers, unchanged)

| Support | Count | Types |
|---|---|---|
`canvas` — Editable | 20 | the fully supported blocks |
`system` — System | 2 | `landing-competition-disciplines`, `landing-empty` |
`server-composed` — Text only | 1 | `directory-hero` |
`resolver-flag` — Show / hide | 1 | `landing-stat-pills` |
`retired` — Retired | 1 | `newsletter-signup` |
`unsupported` — Not rendered | 4 | `detail-hero`, `detail-body`, `detail-faq`, `directory-grid` |

Two of these categories exist because the plain four-way split would have lied. `directory-hero`'s **text does appear** (the route reads its props into its own header), so "Not rendered" is false — but no renderer emits an element for it, so "Editable" is false too. `landing-stat-pills` is a flag the landing resolver reads, not a section. Each entry names the consuming file, and a test enforces that.

The capability module mirrors the renderer list rather than importing the client registry; a test asserts the mirror equals `Object.keys(blockRegistry)` **in both directions**, so a future stage cannot leave the Admin confidently mislabelling a block.

---

## 6. The Stage 05 overclaim, corrected

My Stage 05 completion report stated, under D-11: *"An admin **cannot add** the block."*

The service-level helper `getAvailableBlockTypes` does exclude retired types, and the Stage 05 test asserted that function. But `app/admin/(dashboard)/website/page.tsx` built the editor's registry from the **raw** `HOMEPAGE_SECTIONS` array and never called that helper — and it did not pass `retired` through at all, so the editor had no way to tell a retired block from a live one. The retired newsletter block was therefore **still listed in "Add a Block"** in the real Admin, the server accepted it (retired types stay saveable by design), and it then rendered nothing.

The claim was true of the service and false of the product. Two changes close it: the server now passes `retired`, and the panel filters on it. The new tests assert the **editor's own payload and rendered tree**, not the helper — so what is proven is the thing the operator sees.

A stored newsletter slot still appears in the tree with its label and the `Retired` badge, still saves, and still renders nothing.

---

## 7. Selection synchronisation

```
canvas (public page in the iframe)        Builder (admin page, the parent)
click on [data-slot-id]
  preventDefault + stopPropagation
  postMessage(slot-selected) ───────────▶ isTrustedCanvasMessage() → selectBlock()
  isTrustedBuilderMessage() ◀─────────── postMessage(highlight)
  → outline class + scrollIntoView
```

One shared `selectBlock` handler serves both directions, so they cannot drift. Slot ids are the stored ids, so selection survives a refresh; the highlight is re-pushed when the canvas signals `ready`.

A slot container is emitted **even when the block renders nothing**, so a zero-DOM block is selectable from the tree rather than invisible, and the bridge marks such wrappers with an honest in-canvas explanation. An unrenderable slot gets the same treatment plus an amber notice.

### The defect the browser found

Selection worked for stored layouts and did **nothing at all** for pages with no stored layout — which, with zero `PageLayout` rows in development and test, meant every page. Registry defaults were computed twice and independently, in the browser for the tree and on the server for the canvas, and both called `generateBlockId()`, minting fresh UUIDs each time. The ids never matched.

No Vitest suite compared the two sources, so none could see it. The fix is that a default layout is a pure function of (family, section type), so its ids are too — `defaultSlotId(family, type)` → `default-homepage-editorial-hero`. The guard is a test asserting the editor's rendered `tree-item-<id>` ids are exactly the ids `buildDefaultSlots` produces, across all four families.

---

## 8. Preview security model

| Preserved | How |
|---|---|
Database-session authentication | the canvas enters through `requireUser()` on the existing route |
RBAC | `roleHasPermission('system.config')`, unchanged |
Draft/public isolation | `isStaffDraftPreview()` requires draft mode **and** the permission; `data-slot-id` and the bridge are gated on it |
Draft content never public | permission-gated, not URL-gated — a visitor adding `?_canvas=1` gets nothing, **asserted in the browser** |
CSRF / origin protections | untouched; the bridge adds no endpoint |
Environment isolation guard | untouched, not bypassed — `APP_ENV=test` satisfied it |
SEO / robots | untouched; the preview route still sends `X-Robots-Tag: noindex` |

**Six checks on every message, in both directions:** exact origin (never a wildcard or prefix), expected sender window, provenance marker, type allow-list, page context, and a strict slot-id allow-list. The strongest property is an absence: the bridge **has no transport** — it imports only `react` and contains no `fetch`, socket or server action, so a forged message can only ever change a CSS class and a scroll position. Tests assert that absence, so adding a transport fails the suite rather than silently invalidating the reasoning.

Nothing from a message is ever inserted into the DOM. The iframe is sandboxed `allow-same-origin allow-scripts allow-forms`, **without** `allow-popups`, `allow-top-navigation` or `allow-downloads`, and a test asserts their absence.

### The relaxation, stated plainly

| Setting | Before | After |
|---|---|---|
`X-Frame-Options` | `DENY` | **`SAMEORIGIN`** |
CSP `frame-ancestors` | `'none'` | **`'self'`** |
CSP `frame-src` | `'none'` | **`'self'`** |

`X-Frame-Options: DENY` is enforcing and was the actual blocker; the CSP is report-only and merely logged 36 violations while the canvas stayed blank. `SAMEORIGIN` and `'self'` still refuse **every** cross-origin framing attempt — the entire clickjacking threat these headers address — and add only our origin framing itself.

No test asserted any of the three values before this stage. Seventeen now do, including that no wildcard, external scheme or `data:`/`blob:` document is permitted, and that the rest of the baseline (`default-src`, `object-src`, `form-action`, HSTS-without-preload, permissions policy, admin cache rules, CSP still report-only) is unchanged. **The CSP was not flipped to enforcing** — Batch 17 planned that as a separate phased rollout.

**Residual risk:** `allow-same-origin` with `allow-scripts` means the canvas document is not isolated from the Admin origin. That is inherent to showing a live same-origin page and to selection working at all. It is acceptable because the canvas renders our pages from our database behind an authenticated, permission-checked route — and it would **not** be acceptable if the canvas ever rendered third-party or user-submitted HTML. If that changes, this decision must be revisited.

---

## 9. Responsive viewport behaviour

Three modes applied to the iframe's **container width** — not a scaled screenshot — so the page performs a real layout at the chosen width: 1280 / 768 / 390. The active button carries `aria-pressed`, the width indicator is `aria-live`, and the container also carries `maxWidth: 100%`, so a 1280px preview inside a narrower Admin window clamps instead of forcing a horizontal page scroll.

Verified in Chromium: mobile renders at exactly 390px, the sequence never decreases, and at a 900px window a desktop preview clamps with **zero** horizontal page overflow. The Admin itself stacks to one column below `xl` and the canvas keeps its own internal scroll.

The real contract is `width = min(deviceWidth, availableColumnWidth)`. I asserted a strict ordering twice and was wrong twice — the code was right both times, because the canvas column is ~686px even at a 1900px window.

---

## 10. Draft save and refresh

```
Save Draft → saveDraftAction(pageKey, slots)   ← the existing authorized action
               ├─ ok    → saved snapshot updated, dirty=false, canvas token++ → reload
               └─ error → error flashed, canvas untouched
```

The refresh token advances only on a confirmed save, so a failed save leaves the canvas showing the last good draft and never implies a change was stored. That rule is extracted as `canvasTokenAfterSave` so **both branches are asserted** rather than inspected. Scroll position is remembered across a refresh; selection survives because ids are stable.

Draft/published isolation is unchanged, preview does not publish, and publish remains behind the existing RBAC plus an explicit confirmation. **No silent autosave was introduced**, and a test asserts the absence of any timer or autosave path.

**No undo/redo buttons were added.** The draft architecture has no undo, and a dead control is worse than none. Revision history remains the recovery path; the gap is recorded for a later stage.

### A contradiction found while writing a test

`dirty` was initialised to `false` while `selectPage` set it from `!layout || !layout.draftSections.length`. So on first load of a page with no stored layout, the top bar read *"Showing defaults — save draft to persist"* while Save Draft — disabled unless `dirty` — was greyed out. The editor instructed an action it had disabled. The initialiser now uses the same rule, pinned by two tests that check the `disabled` **attribute** rather than the substring.

---

## 11. Honest limitations

1. **The canvas shows the last saved draft, not unsaved edits.** The tree holds edits in React state; the canvas is a server-rendered document. Closing the gap needs silent autosave (forbidden without verified safety) or a second client-side renderer (forbidden outright). The panel therefore says so, in amber, whenever there are unsaved changes.
2. **The canvas DOM is not byte-identical to the public DOM** in editor mode — one extra wrapper `div` per slot. Visually equivalent in normal block flow, confirmed in the browser, but it is a deviation.
3. **No undo/redo**, by design (§10).
4. **Vitest has no DOM**, so event interaction is proven only in the browser. Adding jsdom is a dependency decision left to Stage 07.
5. **`directory-hero` and `landing-stat-pills` are not canvas-selectable.** Their properties work; the tree says exactly why.
6. **Four blocks render nothing at all** (`detail-hero`, `detail-body`, `detail-faq`, `directory-grid`). Stage 06 labels them honestly; removal is Stage 07's scope, and `directory-grid` is `required: true`, so its removal must drop that flag in the same change.
7. **No screen-reader testing** was performed, and the existing axe sweep was not extended to the Builder.
8. **Production database never inspected**, in any stage.
9. **Renderer filter/sort consolidation deliberately deferred** to Stage 07, as the stage directive prefers when the double-application proof is not cheap. No server-component conversion was attempted.

---

## 12. Tests, mutations and harnesses

194 new tests across 7 files; 8 pre-existing source-text tests converted to behavioural ones; **no test skipped, suppressed or deleted.** Browser: 20/20 in Chromium. Route harness: **37/37** in production mode, resolving Stage 05's four dev-mode 404 failures **without** adapting or loosening the harness. Mutations: **10/10 detected**, all restored byte-identical.

Mutation **M9** was not detected on the first pass and found a real coverage gap — the deduplication explanation was untested on the fully-manual branch. Three tests were added and M9 then failed as it should.

Two of my own test premises were wrong (device widths; a `not.toContain('disabled')` that matched the Tailwind class `disabled:opacity-50` and would have passed in any state), and the **Stage 03 quality gate caught me** when one source-reading assertion tainted seven legitimate DOM tests in the same file — fixed by moving the assertion to its own `[structural]` file, not by grandfathering. The baseline stays at 49 entries.

Full detail, including the gap found in the gate's own verb list, is in `STAGE_06_TEST_AND_MUTATION_REPORT.md`.

---

## 13. Pending owner decisions

**Resolved:** D-15, D-01, D-02 (Option B), D-03 (Stage 03) · D-04, D-11 (Stage 05) · D-10 as engineering.

| Priority | ID | Decision | Blocks |
|---|---|---|---|
| 1 | **D-13** | Legal content approval and indexing | Stage 09 |
| 2 | **D-07** | Revision retention policy | Stage 08 |
| 3 | **D-05** | Footer ownership | Stage 08 |
| 4 | **D-06** | Appearance controls scope | Stage 08 |
| 5 | **D-12** | Scheduler and deployment target | Stage 08 |
| 6 | **D-14** | Sitewide `Organization`/`WebSite` JSON-LD | Stage 09 |
| 7 | **D-09** | Info-page publication workflow | Stage 09 |

**None blocks Stage 07.**

**Carried, unratified:** the homepage **hero-priority** rule. Stage 06 preserved it provisionally and changed no content-selection precedence, as instructed. It remains an editorial judgement in a resolver and a one-line change if the owner prefers block position to decide.

**New, raised here:** **canvas fidelity vs. live editing** (§11.1). If the owner wants a canvas that reflects unsaved edits, that is a product decision with an architectural cost — autosave or a second renderer — and should be taken explicitly.

---

## 14. Stage 07 prerequisites

Stage 07 (Full Page Template Integration) is **unblocked**. It inherits the three-panel Builder, the canvas, the bridge, `data-slot-id` on every block, the capability declaration, the shared prop readers, 194 tests and a working browser harness.

The one hard requirement: **`lib/cms/pageCapability.ts` must be updated in the same change as any renderer addition or removal**, because its mirror is asserted against `blockRegistry` in both directions and will fail the suite otherwise. That is deliberate — a stale mirror makes the Admin lie to an operator.

Recommended order, sequencing, cautions (notably `directory-grid`'s `required: true` flag and the production-layout check before deleting any block type), and the explicit must-nots are in `STAGE_06_HANDOVER.md`.

---

## 15. Completion criteria (§17)

| Criterion | Status |
|---|---|
A functional three-panel editor exists | ✅ verified in DOM and browser |
The centre panel displays the real draft page | ✅ the existing preview route, no second renderer |
Section selection works in both directions | ✅ verified in Chromium |
The property inspector edits actual supported properties | ✅ Stage 04 `PropFieldShell` reused, plus the content-source summary |
Responsive device modes work | ✅ 1280/768/390 measured in the browser |
Draft saving and preview refresh are reliable | ✅ refresh only on confirmed save, both branches asserted |
Public/draft isolation remains intact | ✅ asserted in the browser, including a hand-added `?_canvas=1` |
Unsupported capabilities are honestly labelled | ✅ 15 page keys, six block support levels |
Unknown/retired blocks are handled safely | ✅ nothing public, bounded log, operator notice |
Security checks and behavioural tests pass | ✅ 2079/2079, 10/10 mutations, 20/20 browser |
No unexplained regression remains | ✅ zero failed, zero skipped |

**Stage 06 is COMPLETE.** Nothing was blocked.

---

## 16. Git and environment state

| Item | Value |
|---|---|
Branch | `office-sync-2026-11-08` |
HEAD | `fd4fb10` — **unchanged; no commit, push, merge, branch or checkout** |
Working tree | **31 modified, 1 deleted, 14 new untracked** (plus Stage 01–06 documentation) |
Diffstat | 32 files changed, 1460 insertions, 820 deletions |
Prisma migrations | **19 — unchanged** |
Schema | **unmodified** (`git diff` is empty) |
Databases | production never contacted; development never written to; the isolated test database written only by the existing e2e global-setup, which cleans up |
Dev/prod servers | all terminated; ports 3000 and 3100 confirmed free |
`.next` | a development-database build from the final verification run |
Docker / deployment | none |
Prior stages' work | **fully preserved** — 21 of the 31 modified files are Stage 01–05 changes |

### Scope boundaries honoured

No second renderer. No parallel content engine. No CMS rebuild. No SEO ownership change. No retired system reintroduced. Fixture exclusion untouched. No parallel article-slot resolution. No newsletter re-registration, no subscription backend, no visitor data collected. No Prisma schema change, no migration, no destructive operation, no Docker, no deployment. No credential exposed. Content-selection precedence unchanged. **Stage 07 not started.**

Git finalization remains deferred until the owner explicitly requests it.

---

## 17. Deliverables

| File | Contents |
|---|---|
`STAGE_06_COMPLETION_REPORT.md` | this document |
`STAGE_06_VISUAL_BUILDER_ARCHITECTURE.md` | the canvas chain, editor-mode gate, bridge, slot identity, capability model, security posture |
`STAGE_06_PAGE_AND_INTERACTION_MATRIX.md` | 15 page keys, 29 block types, interaction, validation, content-source and accessibility matrices |
`STAGE_06_TEST_AND_MUTATION_REPORT.md` | test inventory, actual results, browser evidence, 10 mutations, the gaps found |
`STAGE_06_HANDOVER.md` | Stage 07 sequencing, inherited assets, harness recipe, carried items, must-nots |
