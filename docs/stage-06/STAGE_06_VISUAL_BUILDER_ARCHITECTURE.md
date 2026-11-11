# Stage 06 — Visual Builder Architecture

**Stage:** 06 of 10 · **Date:** 2026-11-09 · **HEAD:** `fd4fb10` (unchanged)

---

## 1. The shape of the change

Before Stage 06 the "Builder" was a two-panel editor: a list of block names on the left, a property panel on the right. Nothing in it showed the page. The owner's Stage 04 critique was precise about this — a block list is not a visual builder — and Stage 05's handover named the fix: mount the preview route that already existed rather than build a renderer for the editor.

That is what this stage does.

```
BEFORE                                  AFTER
┌─────────────────┬──────────┐          ┌────────┬──────────────────┬──────────┐
│ Page Canvas     │Properties│          │ Page   │ Canvas           │Properties│
│ (a list of      │          │          │ Struct-│ (the REAL draft  │          │
│  block names)   │ fields   │          │ ure    │  page, in an     │ fields   │
│                 │          │          │ tree   │  iframe)         │ + source │
│ 1 Editorial Hero│          │          │        │                  │   summary│
│ 2 Latest Cover… │          │          │ badges │ 1280/768/390     │          │
└─────────────────┴──────────┘          └────────┴──────────────────┴──────────┘
         no page anywhere                    click either side to select
```

---

## 2. Where the canvas content comes from

**There is no second renderer.** The chain is the production chain:

```
Builder centre panel
  └─ <iframe src="/admin/website/preview?pageKey=…&embed=1">
       └─ app/admin/(dashboard)/website/preview/route.ts
            ├─ requireUser()                      ← existing session auth
            ├─ roleHasPermission('system.config') ← existing RBAC
            ├─ draftMode().enable()               ← existing Next.js draft mode
            └─ 302 → the real public route  (e.g. "/")
                 └─ app/(public)/page.tsx
                      └─ resolveHomepageSlots()   ← the Stage 05 resolver
                           └─ HomeView → PageRenderer → the 22 block components
```

Everything the operator sees in the canvas was produced by the same code that serves the public site. A block that renders nothing on the live page renders nothing here, which is the property that makes the canvas trustworthy.

### Why embed mode exists rather than reusing the route as-is

The preview route already returned a usable draft page, but as a **chrome wrapper**: an HTML document with a "DRAFT PREVIEW" bar and its own inner `<iframe>`. Mounting that in the centre panel would have put a preview bar inside the editor and a second frame boundary between the page and the Builder, so the bridge would have had to reach through two documents.

`embed=1` therefore takes the same route through the same auth and the same `draftMode().enable()`, and then **redirects** to the target page instead of returning the wrapper. One frame, one document, same authority.

It makes one other deliberate change. The standalone path returns **404 when no draft layout is stored**; embed mode does not. A page with no stored layout renders registry defaults — that is what the public site does and what the Builder's own tree shows — so refusing to draw the canvas would have been wrong, and in the development and test databases (which hold **zero** `PageLayout` rows) it would have meant an empty canvas on every page. There is no disclosure concern: the operator already holds `system.config`, and what they see is what a visitor sees.

---

## 3. Editor mode: one gated decision

`data-slot-id` must exist in the canvas and must **not** exist on the public site. The flag that decides this is established in exactly one place:

```
app/(public)/layout.tsx
  const editorMode = await isStaffDraftPreview();   // draft mode AND system.config
  <BuilderEditorModeProvider enabled={editorMode}>
      …every public route…
      {editorMode && <BuilderCanvasBridge />}
  </BuilderEditorModeProvider>
```

`PageRenderer` reads that context. The alternative — threading an `editorMode` prop — would have meant editing eleven public routes and five view components, and any route added later would silently lose the flag. The failure mode of a missing flag is an un-selectable block with no error, which is the precise class of defect this programme exists to remove.

**The default is `false`**, so a route that somehow renders outside the provider degrades to ordinary public output rather than leaking editor markup.

### What `PageRenderer` emits

| Mode | Output |
|---|---|
| Public (default) | **byte-identical to Stage 05** — no wrapper, no attributes |
| Editor | each slot wrapped in `<div data-nfr-slot data-slot-id data-slot-type>` |

The wrapper is a plain block-level `div` with no classes, so it inherits the flow it replaced: the `flex flex-col` homepage container and the `space-y-14` landing container space the wrappers exactly as they spaced the sections.

**Why a wrapper rather than an attribute on each block:** the 22 block components take `{slot, data}` and render their own root elements. Adding the attribute inside each would have touched four component files and 22 components, and would have missed any block that renders `null`. The wrapper exists **even when the block renders nothing**, which is what makes a zero-DOM block selectable from the tree instead of invisible and unreachable.

**The honest cost:** in editor mode the canvas DOM is not byte-identical to the public DOM — it has one extra `div` per slot. A wrapper in normal block flow is visually equivalent, and the browser spec confirms the page renders correctly, but it is a deviation and is recorded as one rather than claimed away.

### Slot identity must be deterministic, which it was not

Selection maps a canvas `data-slot-id` to a tree item, so both sides must agree on the id. For a **stored** layout they trivially do — the ids come from the database. For a page with **no** stored layout they did not, and this was the worst defect the stage produced.

Registry defaults were computed twice, independently: in the browser by the Builder for its tree, and on the server by `resolveSections` for the canvas. Both called `generateBlockId()`, which mints a fresh UUID. The two sets of ids never matched, so click-to-select and highlighting silently did nothing — on **every** page, because the development and test databases hold zero `PageLayout` rows.

Every Vitest suite passed throughout. None of them compared the two sources, so none could see it; the browser run found it immediately.

The fix is that a default layout is a pure function of (family, section type), so its ids are too:

```ts
export function defaultSlotId(family: string, sectionType: string): string {
  return `default-${family}-${sectionType}`;
}
```

Unique within a family (types are deduped), stable across processes and reloads, inside the bridge's `^[A-Za-z0-9_-]{1,64}$` allow-list, and unable to collide with a stored id (a UUID or `blk_…`). The editor's local default builder uses the same function, and `stage06-builder-dom.test.ts` now asserts that the editor's rendered `tree-item-<id>` ids are exactly the ids `buildDefaultSlots` produces, for all four families — the cross-check that was missing.

---

## 4. The message bridge

Two documents, so selection crosses a frame boundary by `postMessage`. Both sides validate.

```
canvas (public page, in the iframe)        Builder (admin page, the parent)
───────────────────────────────────        ─────────────────────────────────
click on [data-slot-id]
  preventDefault + stopPropagation
  postMessage({                    ──────▶ isTrustedCanvasMessage()
    source:'nfrguide-canvas',                 origin · source · marker ·
    type:'slot-selected',                     type · pageKey · slotId
    pageKey, slotId }, origin)             └─▶ selectBlock(slotId)

isTrustedBuilderMessage()          ◀────── postMessage({
  origin · source · marker ·                 source:'nfrguide-builder',
  type · pageKey · slotId                    type:'highlight',
  └─▶ add outline class                      pageKey, slotId }, origin)
```

### The six checks, on every message, in both directions

| # | Check | Rejects |
|---|---|---|
| 1 | `event.origin === allowedOrigin` — exact, never a wildcard or prefix | another host, another scheme, `"null"`, a subdomain |
| 2 | `event.source` is the expected window | a same-origin sibling frame, an opener, anything before the iframe exists |
| 3 | `data.source` provenance marker | an unmarked payload, or one forging the *other* side's marker |
| 4 | `data.type` in a closed set | any other type |
| 5 | `data.pageKey === pageKey` | a message meant for a different page |
| 6 | `slotId` matches `^[A-Za-z0-9_-]{1,64}$` | selector breakouts, quotes, tags, `*`, whitespace, over-long ids |

**Why this much for a same-origin frame.** Same-origin proves only that *we* served the document, not that the sender is the Builder. Any frame holding a handle to the canvas window can post to it, and the canvas runs with `allow-scripts`. Check 2 is the one that actually distinguishes the Builder from a hostile same-origin frame; checks 1 and 3 are cheap and catch the common cases.

### The bridge's blast radius

The strongest security property is not a check but an absence: **the bridge has no transport.** It imports only `react`, contains no `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon`, and imports no server action. The *only* effects a message can have are a CSS class and a scroll position. So even if every check above were bypassed, a forged message could not write to the database or escalate a privilege.

That claim is asserted by tests, not just stated: `stage06-canvas-bridge.test.ts` fails if a transport or a non-React import is ever added — which is the point, because adding one would silently invalidate the reasoning above.

`slotId` is used solely as the value in `querySelector('[data-slot-id="…"]')`, after the allow-list check and through `CSS.escape`, and the matched element must already exist in the document. **Nothing from a message is ever inserted into the DOM.** The one `dangerouslySetInnerHTML` in the file is a module-level authored stylesheet constant, and a test asserts it is the only one.

### Editor-selection mode suppresses navigation

Inside the canvas a click **selects**; it does not navigate. The handler is capture-phase and calls `preventDefault()` for every click, not only on links, because a block may carry a button, a form or a router push. `submit` is suppressed the same way.

Normal browsing stays available through the toolbar's **"Open page ↗"**, which opens the draft in a new tab outside the canvas.

This is why canvas mode needs its own flag (`_canvas=1`) rather than inferring intent from draft mode: the standalone "Preview Draft" window is also in draft mode, and suppressing its links would make it useless. `readCanvasContext()` requires the flag, a page key **and** a parent frame, and is tested for inertness in the standalone preview.

---

## 5. Responsive preview

Three modes applied to the iframe's **container width**, not by scaling a screenshot:

| Mode | Width |
|---|---|
| Desktop | 1280px |
| Tablet | 768px |
| Mobile | 390px |

The iframe fills that container, so the page inside performs a genuine layout at the chosen width — media queries fire, the mobile nav appears, the grid collapses. The width indicator is `aria-live="polite"`, and the active button carries `aria-pressed` so the state is not colour-only. The container also carries `maxWidth: '100%'`, so a 1280px preview inside a narrower Admin window shrinks rather than forcing a horizontal page scroll.

The Admin itself stacks to one column below `xl`, and the canvas keeps its own internal scroll.

---

## 6. Save, refresh and one piece of honesty

```
Save Draft ──▶ saveDraftAction(pageKey, slots)   ← the existing authorized action
                 ├─ ok    → savedRef updated, dirty=false,
                 │          canvasRefreshToken++  → iframe key changes → reload
                 └─ error → flash(error), canvas untouched
```

The canvas refresh token is bumped **only on a confirmed save**, so a failed save leaves the canvas showing the last good draft and the panel never implies a change was stored when it was not.

**The canvas shows the last SAVED draft, not unsaved edits.** The tree and inspector hold edits in React state; the canvas is a separate document rendered by the server from the database. It therefore *cannot* show an unsaved change. Rather than let an operator assume otherwise, the panel says so: a neutral line when clean, and an amber "Canvas shows the last saved draft — save to see your latest edits here" when dirty.

That is a real limitation of this architecture, not a polish item. Live-updating the canvas without a save would need the draft posted to the server on every keystroke (silent autosave, which the stage forbids without verified safety) or a second client-side renderer fed from editor state (a parallel renderer, which the programme forbids outright). Showing the saved draft and labelling it is the honest option available.

Scroll position is remembered across a refresh (`contentWindow.scrollY`, read before the reload and restored on load, inside `try/catch` because a redirect chain can briefly deny access). Selection survives because slot ids are stable and the highlight is re-pushed once the canvas signals ready.

**No undo/redo buttons were added.** The draft architecture has no undo, and the stage is explicit that a non-functional button is worse than none. The gap is recorded for a later stage; revision history remains the recovery path.

---

## 7. Capability honesty

`lib/cms/pageCapability.ts` is the single declaration of what the Builder can actually change, consumed by the Admin and asserted by tests.

### Page level

| Level | Pages | What it means |
|---|---|---|
`composed` | `homepage` + 5 `section:*` | the whole body comes from Builder blocks, in Builder order |
`template-appendage` | 7 `template:*` | a structured template owns the page; blocks append **below** it |
`directory-limited` | 2 `directory:*` | a generated listing; the Builder controls the heading text and one CTA |

Each carries a one-sentence summary and a list of parts the Builder cannot change, shown above the canvas. The previous editor offered an identical interface for all 15 keys, which implied that reordering blocks on a detail template would restructure the article — it does not.

### Block level

The four-way distinction the stage asked for, plus two the code actually required:

| Support | Badge | Meaning |
|---|---|---|
`canvas` | Editable | definition + renderer: editable and clickable on the canvas |
`server-composed` | Text only | props read by the **route** into fixed markup — `directory-hero`. Its text works; it is not canvas-selectable |
`resolver-flag` | Show / hide | not a visible block — `landing-stat-pills`, which the landing resolver reads to toggle the hero's stat pills |
`system` | System | injected by a resolver, no definition — `landing-competition-disciplines`, `landing-empty`. Cannot be added, reordered or removed |
`retired` | Retired | `newsletter-signup`. Renders nothing, stays saveable |
`unsupported` | Not rendered | definition but no renderer and no consumer — `detail-hero`, `detail-body`, `detail-faq`, `directory-grid` |

`server-composed` and `resolver-flag` exist because the simple four-way split would have lied in two places: calling `directory-hero` "not rendered" is false (its text appears), and calling it "editable" is also false (it cannot be clicked). Each entry in `NON_RENDERER_CONSUMERS` names the file that consumes it so the claim is checkable, and a test enforces that.

### The mirror that cannot drift

`pageCapability.ts` lists the 22 rendered types rather than importing `blockRegistry`, so the module stays server-safe and does not pull 22 block components into the Admin bundle. A stale mirror would make the Admin confidently label a block "Editable" when nothing renders it — so `stage06-page-capability.test.ts` asserts the mirror equals `Object.keys(blockRegistry)` **in both directions**. Adding or removing a renderer without updating the classification fails the suite instead of misleading an operator.

---

## 8. Unknown and retired block diagnostics

`PageRenderer` previously skipped an unknown type in complete silence. That satisfied "do not crash" and violated the Blueprint's invariant R1 ("skipped **and** logged") — and Stage 05 made it a live problem, because a retired block is exactly this case, so an operator with a legacy newsletter slot saw it vanish with no explanation anywhere.

| Audience | Now |
|---|---|
| Public visitor | still nothing — no markup, no internal detail, no layout shift |
| Console | `console.warn` naming the type, **once per type per page load** |
| Operator in the canvas | a dashed amber panel: *"This block does not render on the live site… you can safely remove it"*, with a `data-slot-id` so it is selectable |
| Operator in the tree | the `Retired` or `Not rendered` badge and its explanation |

Logging is bounded by a module-scoped `Set`: a homepage holds many slots and re-renders on navigation, so per-occurrence logging would flood the console and bury the signal. `__resetUnrenderableLogForTests()` exists so a suite can assert the bound rather than infer it.

### What was deliberately not done

The stage permits moving visibility filtering and order sorting into `PageRenderer` **only on proof it would not double-apply** the resolvers' rules, and prefers deferral if the risk is non-trivial.

**Deferred to Stage 07.** `resolveSections` sorts and filters before the four resolvers compose their `data`, so a second pass in the renderer would become the authority for some callers and not others, and the proof is not cheap. Stage 07 can do it together with the server-component conversion in one reviewed change rather than entangled with the canvas. `stage06-renderer-slots.test.ts` asserts the *current* contract — the renderer does not filter a hidden slot — and says in a comment that a later stage moving it should make that test fail deliberately.

No simultaneous server-component conversion was attempted.

---

## 9. One shared implementation, not two

The Content Source panel describes what a slot will do: *"showing the 6 newest articles"*, *"your 2 pins then 4 automatic"*. Those numbers must match what the page renders.

`numProp` and `idListProp` lived in `slotUtils.ts`, which carries `import 'server-only'` because the rest of it queries the database — so the browser could not import them. Copying them into the Admin would have created a second interpretation of the same stored props, letting the inspector claim one thing while the page rendered another: the exact divergence Stages 04 and 05 were spent removing.

So the three pure readers moved to `lib/cms/slotProps.ts` (no `server-only`), and `slotUtils.ts` re-exports them. Every existing importer is unaffected, and there is **one** implementation used by both the resolvers and the inspector.

```
lib/cms/slotProps.ts   numProp · limitList · idListProp   (pure, client-safe)
   ├── lib/cms/slotUtils.ts        re-exports + pickedThenAuto (server-only)
   └── lib/cms/contentSourceSummary.ts   describeContentSource (client-safe)
```

`describeContentSource` reports `automatic` / `manual` / `mixed` / `empty` / `none`, the **clamped** count rather than the raw stored value, and the deduplication caveat Stage 05 identified as a likely false bug report: *"An article already shown by another section on this page is skipped here, so fewer items can appear than the count asks for. That is deliberate."*

It describes **only** the Stage 05 contract. A test asserts that no headline or note ever mentions `fallbackPolicy`, `emptyBehavior`, tag/author/date filters, sort order, randomisation, trending or personalisation — none of which exist. Advertising a control that does not exist would be the same defect as a property that does not render.

---

## 10. Security posture

| Preserved | How |
|---|---|
Database-session authentication | the canvas enters through `requireUser()` on the existing route |
RBAC | `roleHasPermission('system.config')` on that route, unchanged |
Draft/public isolation | `isStaffDraftPreview()` requires draft mode **and** the permission; the bridge and `data-slot-id` are gated on it |
Draft content never public | editor mode is permission-gated, not URL-gated — a visitor adding `?_canvas=1` by hand gets nothing, asserted in the browser |
CSRF / origin protections | untouched; the bridge adds no endpoint |
Environment isolation guard | untouched and not bypassed |
Central SEO and robots | untouched; the preview route still sends `X-Robots-Tag: noindex` |

### Two framing headers had to change — and only to same-origin

This is the one security relaxation in the stage, and it is stated plainly.

| Setting | Before | After |
|---|---|---|
`X-Frame-Options` | `DENY` | **`SAMEORIGIN`** |
CSP `frame-ancestors` | `'none'` | **`'self'`** |
CSP `frame-src` | `'none'` | **`'self'`** |

`X-Frame-Options: DENY` was the header that actually blocked the canvas: it is enforcing, applied to `/:path*`, so the public pages refused to render inside the admin's own iframe. The CSP is shipped **report-only**, so its `frame-ancestors 'none'` merely logged violations — which is why the server log filled with `csp.violation` reports while the canvas stayed blank.

**What the relaxation does not do:** `SAMEORIGIN` and `'self'` still refuse every cross-origin framing attempt, which is the entire clickjacking threat these headers address — an attacker's page cannot frame ours either way. The only behaviour added is our origin framing itself.

Before this stage **no test asserted any of the three values**, so they could have drifted in either direction unnoticed. `tests/stage06-frame-headers.test.ts` now pins all three, asserts no wildcard, external scheme or `data:`/`blob:` is permitted, and asserts the rest of the baseline (`default-src`, `object-src`, `form-action`, HSTS-without-preload, the permissions policy, admin cache rules, and that the CSP is still report-only) is unchanged. A relaxation nothing pins is how `SAMEORIGIN` becomes a wildcard two stages later with a plausible commit message.

**The CSP was not flipped to enforcing.** Batch 17 planned that as a phased rollout once the report stream is clean, and doing it here would have mixed an unrelated, higher-risk change into the canvas work.

### The iframe sandbox

`sandbox="allow-same-origin allow-scripts allow-forms"`.

- `allow-same-origin` is **required**: the bridge must read its own document and talk to its opener, and the document is ours.
- `allow-scripts` is required because the public site is a React application.
- `allow-forms` keeps form controls interactive for layout fidelity; submission is suppressed by the bridge's capture-phase `submit` handler.
- **Not granted:** `allow-popups`, `allow-top-navigation`, `allow-downloads`. The canvas has no business leaving the frame, and a test asserts their absence.

### Residual risk, stated plainly

`allow-same-origin` plus `allow-scripts` means the canvas document is not isolated from the Admin origin — a script running in the canvas could reach the parent. That is inherent to showing a live same-origin page and to selection working at all. It is acceptable because the canvas renders **our** pages from **our** database behind an authenticated, permission-checked route; it would not be acceptable if the canvas ever rendered third-party or user-submitted HTML. Should that change, this decision must be revisited.

---

## 11. Files

### New

| File | Role |
|---|---|
`components/blocks/BuilderEditorMode.tsx` | editor-mode context, default `false` |
`components/builder/BuilderCanvasBridge.tsx` | in-canvas bridge: click-to-select, highlight, validation |
`views/admin/BuilderCanvas.tsx` | centre panel: iframe, device modes, parent-side validation |
`lib/cms/pageCapability.ts` | page and block capability declaration + renderer mirror |
`lib/cms/contentSourceSummary.ts` | plain-language selection summary |
`lib/cms/slotProps.ts` | the three pure readers, shared by resolvers and Admin |

### Modified

| File | Change |
|---|---|
`components/blocks/PageRenderer.tsx` | `editorMode`, slot containers, bounded unknown-type diagnostics |
`app/(public)/layout.tsx` | establishes editor mode once; renders the bridge when gated |
`app/admin/(dashboard)/website/preview/route.ts` | `embed=1` redirect mode, tolerant of a missing draft |
`app/admin/(dashboard)/website/page.tsx` | passes `retired` through to the editor |
`views/admin/AdminPageLayoutEditor.tsx` | three panels, tree semantics + keyboard, badges, capability notice, content-source summary, retired filter, `dirty` initialiser fix |
`lib/cms/slotUtils.ts` | re-exports the moved readers |
`lib/cms/sectionRegistry.ts` | `defaultSlotId()` — deterministic default-layout ids |
`next.config.mjs` | `X-Frame-Options: SAMEORIGIN`; CSP `frame-ancestors`/`frame-src` → `'self'` |
`e2e/page-builder.spec.ts` | updated for the panel rename; now asserts three panel headings |
