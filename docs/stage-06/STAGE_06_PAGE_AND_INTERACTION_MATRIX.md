# Stage 06 — Page & Interaction Matrix

**Stage:** 06 of 10 · **Date:** 2026-11-09 · **HEAD:** `fd4fb10`

Everything in this document is asserted by `tests/stage06-page-capability.test.ts` (28 tests) unless marked otherwise. The classification is derived from the real renderer registry, cross-checked in both directions, so it cannot silently drift from the code.

---

## 1. Page-family capability — all 15 Builder page keys

| # | Page key | Family | Level | Canvas click-select | What the Builder controls | What it does **not** control |
|---|---|---|---|---|---|---|
| 1 | `homepage` | homepage | **Composed** | ✅ all blocks | the entire page body, order, visibility, content selection | header, footer (Navigation / Appearance tabs) |
| 2 | `section:competition` | section-landing | **Composed** | ✅ all blocks | hero + content blocks, order, visibility | header, footer, the section's own intro heading |
| 3 | `section:entertainment` | section-landing | **Composed** | ✅ | as above | as above |
| 4 | `section:events-shopping` | section-landing | **Composed** | ✅ | as above | as above |
| 5 | `section:plan-watch` | section-landing | **Composed** | ✅ | as above | as above |
| 6 | `section:rodeo-events` | section-landing | **Composed** | ✅ | as above | as above |
| 7 | `template:article` | detail-template | **Template + appendage** | ✅ appendage blocks only | blocks appended **below** the article | title, body, metadata, byline, template order |
| 8 | `template:category` | detail-template | **Template + appendage** | ✅ appendage only | as above | the category listing itself |
| 9 | `template:discipline` | detail-template | **Template + appendage** | ✅ appendage only | as above | discipline facts and structure |
| 10 | `template:competitor` | detail-template | **Template + appendage** | ✅ appendage only | as above | competitor record and structure |
| 11 | `template:venue` | detail-template | **Template + appendage** | ✅ appendage only | as above | venue record and structure |
| 12 | `template:rodeo-hub` | detail-template | **Template + appendage** | ✅ appendage only | as above | hub record and structure |
| 13 | `template:rodeo-edition` | detail-template | **Template + appendage** | ✅ appendage only | as above | edition record, schedule, results |
| 14 | `directory:competitors` | directory | **Directory (limited)** | ⚠️ CTA block only | heading text, the CTA block | search form, filters, pagination, the list and its cards |
| 15 | `directory:venues` | directory | **Directory (limited)** | ⚠️ CTA block only | heading text, the CTA block | as above |

**6 composed · 7 template-appendage · 2 directory-limited.**

Every page key is previewable, and every one now states its level above the canvas. The previous editor presented an identical interface for all fifteen, which implied that reordering blocks on a detail template would restructure the article.

### How each family reaches the page

| Family | Route path | Renders slots via |
|---|---|---|
Homepage | `app/(public)/page.tsx` | `HomeView` → `PageRenderer` (all slots) |
Section landing | `app/(public)/[section]/page.tsx`, `app/(public)/rodeo-events/page.tsx` | `SectionLandingView` → `SectionLandingSlots` → `PageRenderer` (hero + content) |
Detail template | 7 routes + `views/ArticleView.tsx` | `ArticleAppendageSlots` → `PageRenderer` (appendages only) |
Directory | `app/(public)/competitors/page.tsx`, `.../venues/page.tsx` | `DirectoryCtaSlot` → `PageRenderer` (CTA only); **hero props read directly by the route** |

---

## 2. Block support matrix

| Section type | Definition | Renderer | Support | Badge | Canvas-selectable |
|---|---|---|---|---|---|
`editorial-hero` | ✅ | ✅ | canvas | Editable | ✅ |
`latest-coverage` | ✅ | ✅ | canvas | Editable | ✅ |
`plan-and-watch` | ✅ | ✅ | canvas | Editable | ✅ |
`entertainment` | ✅ | ✅ | canvas | Editable | ✅ |
`events-shopping` | ✅ | ✅ | canvas | Editable | ✅ |
`competition` | ✅ | ✅ | canvas | Editable | ✅ |
`learning` | ✅ | ✅ | canvas | Editable | ✅ |
`more-rodeo` | ✅ | ✅ | canvas | Editable | ✅ |
`quick-access` | ✅ | ✅ | canvas | Editable | ✅ |
`stats-banner` | ✅ | ✅ | canvas | Editable | ✅ |
`image-text-block` | ✅ | ✅ | canvas | Editable | ✅ |
`rich-text-block` | ✅ | ✅ | canvas | Editable | ✅ |
`cta-banner` | ✅ | ✅ | canvas | Editable | ✅ |
`faq-block` | ✅ | ✅ | canvas | Editable | ✅ |
`landing-hero` | ✅ | ✅ | canvas | Editable | ✅ |
`landing-featured` | ✅ | ✅ | canvas | Editable | ✅ |
`landing-grid` | ✅ | ✅ | canvas | Editable | ✅ |
`detail-related` | ✅ | ✅ | canvas | Editable | ✅ |
`detail-cta` | ✅ | ✅ | canvas | Editable | ✅ |
`directory-cta` | ✅ | ✅ | canvas | Editable | ✅ |
`landing-competition-disciplines` | — | ✅ | **system** | System | ✅ (not movable) |
`landing-empty` | — | ✅ | **system** | System | ✅ (not movable) |
`directory-hero` | ✅ | — | **server-composed** | Text only | ❌ — props render in route markup |
`landing-stat-pills` | ✅ | — | **resolver-flag** | Show / hide | ❌ — not a visible section |
`newsletter-signup` | ✅ | — | **retired** | Retired | ❌ — renders nothing |
`detail-hero` | ✅ | — | **unsupported** | Not rendered | ❌ |
`detail-body` | ✅ | — | **unsupported** | Not rendered | ❌ |
`detail-faq` | ✅ | — | **unsupported** | Not rendered | ❌ |
`directory-grid` | ✅ | — | **unsupported** | Not rendered | ❌ |

**22 renderers** (unchanged from Stage 05) · 20 canvas-editable · 2 system-owned · 1 server-composed · 1 resolver-flag · 1 retired · 4 unsupported.

### The two classifications that a simple four-way split would have got wrong

**`directory-hero` — "Text only".** `app/(public)/competitors/page.tsx:31-33` reads `heroTitle` and `heroDescription` out of the slot and renders them inside its own `<header>`. Editing the text **works**. But no renderer produces an element for the slot, so it has no `data-slot-id` and cannot be clicked on the canvas. Calling it "Not rendered" would be false; calling it "Editable" would also be false, because clicking it on the canvas does nothing. Hence a third category, with the help text: *"the page builds that part itself — so you cannot click this block on the canvas, and reordering it changes nothing."*

**`landing-stat-pills` — "Show / hide".** `lib/cms/sectionLandingData.ts:53` reads this slot to decide whether the landing hero shows its stat pills, then line 63 skips it when composing the render list. It is a flag, not a section. Its visibility toggle *is* the control.

### The four unsupported blocks

`detail-hero`, `detail-body`, `detail-faq` and `directory-grid` have definitions but no renderer and no consumer. Stage 05 recorded them for removal in Stage 07; until then they render nothing. Stage 06 does not delete them — removal is Stage 07's scope, and `directory-grid` is `required: true`, so removing it demands dropping that flag in the same change or a directory layout becomes unsavable.

What Stage 06 does is **stop them being invisible**: the tree badges them "Not rendered", and the canvas shows a dashed amber panel saying visitors see nothing there and the block can safely be removed.

---

## 3. Interaction matrix

| Interaction | Mechanism | Proven by |
|---|---|---|
Tree item → selected | `selectBlock(slotId)`, one shared handler | DOM: `aria-selected` · browser: keyboard + click |
Tree item → canvas highlight | parent `postMessage` → validated → outline class | **browser** (`nfr-slot-selected` class inside the iframe) |
Canvas click → tree selection | capture-phase click → `postMessage` → validated → `selectBlock` | **browser** (`aria-selected="true"` on the matching tree item) |
Canvas click → no navigation | `preventDefault` + `stopPropagation` on every canvas click | **browser** (iframe URL unchanged after clicking a link) |
Form submit in canvas | capture-phase `submit` → `preventDefault` | code + sandbox; no form in a default layout to exercise |
Selection survives refresh | stable slot ids + highlight re-pushed on `ready` | DOM (ids are the stored ids) · browser (after save) |
Zero-DOM block selectable | wrapper emitted even when the block renders `null`; marked `data-nfr-empty` | DOM |
Unknown block selectable | notice panel carries `data-slot-id` and `data-nfr-unrenderable` | DOM |
Device width change | container width 1280/768/390, iframe fills it | DOM · **browser** (measured box width) |
Save → canvas reload | `canvasRefreshToken++` on confirmed save → iframe `key` changes | DOM · **browser** |
Failed save → no reload | token bumped only in the `ok` branch | code + DOM (token in URL) |
Keyboard tree nav | Arrow/Home/End/Enter/Space, Alt+Arrow to reorder | **browser** |
Selection announced | `aria-live="polite"` region naming block and position | DOM |

"**browser**" = `e2e/stage06-visual-builder.spec.ts`, Chromium, against the isolated test database. Results are in `STAGE_06_TEST_AND_MUTATION_REPORT.md`.

---

## 4. Message validation matrix

Each row is a distinct rejection test, in **both** directions (canvas→Builder and Builder→canvas).

| Attack / malformation | Rejected by |
|---|---|
Different host origin | origin check |
Same host, different scheme | origin check |
`"null"` origin (sandboxed / `data:` frame) | origin check |
Subdomain of the allowed origin | origin check |
Origin with the allowed origin as a **prefix** | exact comparison |
Same-origin sibling frame | source check |
Message when no parent/iframe exists | source check (null guard) |
Missing provenance marker | marker check |
Marker forged as the *other* side's | marker check |
Unknown message type | type allow-list |
String / `null` / `undefined` payload | shape check |
Message for a different `pageKey` | context check |
Missing `pageKey` | context check |
Slot id with a quote or `]` (selector breakout) | id allow-list |
Slot id containing an HTML tag | id allow-list |
Slot id `*` (wildcard selector) | id allow-list |
Slot id with whitespace, empty, or > 64 chars | id allow-list |
Non-string slot id | id allow-list |

Plus four capability assertions on the bridge itself: no network transport, no imports but `react`, no wildcard `postMessage` target, and no path by which message data reaches the DOM as HTML.

---

## 5. Content source inspector matrix

| Configuration | Mode | Headline |
|---|---|---|
No `featuredIds`, no `articleCount` | `none` | *"This block has no article feed to configure."* |
`articleCount: 0` | `empty` | *"Nothing will appear here — the article count is set to 0."* |
`articleCount: 6`, no pins | `automatic` | *"On automatic — showing the 6 newest articles from the newest published articles."* |
`articleCount: 4`, 2 pins | `mixed` | *"Mixed — your 2 pinned articles first, then 2 more chosen automatically from the Plan & Watch section."* |
`articleCount: 2`, 2 pins | `manual` | *"Fully manual — showing 2 pinned articles, in your order."* |
`articleCount: 2`, 4 pins | `manual` + warning | *"You have pinned 4 articles but the count is 2, so only the first 2 will appear. Raise the count to show the rest."* |
`articleCount: 99` (max 12) | `automatic` | describes **12** — the clamped value, never 99 |
Hero, no pin | `automatic` | *"On automatic — showing the article marked as lead hero, otherwise the newest article."* |
Hero, 1 pin | `manual` | *"Showing the article you picked."* |
Hero, 3 pins | `manual` | *"…in the order listed — the first is the lead."* |

### Notes attached per configuration

| Note | When |
|---|---|
Deduplication shortfall — *"An article already shown by another section on this page is skipped here, so fewer items can appear than the count asks for. That is deliberate."* | every configured feed |
*"A pick that is unpublished, scheduled or deleted is skipped automatically."* | only when pins exist |
*"Set a count above zero, or hide the block instead…"* | `articleCount: 0` |

The deduplication note is the one that matters most: Stage 05 established that a slot may legitimately render fewer items than its count, and predicted an operator would read that as a bug. This is that prediction's fix.

### What the inspector never says

A test asserts that no headline or note contains: `fallbackPolicy`, `emptyBehavior`, `upcoming`, tag filter, author filter, date range, sort order, randomisation, trending, most-read, or personalisation. **None of these controls exist.** Headlines also never contain a raw property key, and always end as a sentence.

---

## 6. Accessibility matrix

| Requirement | Implementation | Proven by |
|---|---|---|
Keyboard tree selection | `role="tree"` / `role="treeitem"`; Arrow, Home, End, Enter, Space; Alt+Arrow reorders | DOM + browser |
Single tab stop | exactly one `tabindex="0"` in the tree | DOM (counted) |
Visible focus | `focus-visible:ring-2` inset ring on each tree item | DOM |
Accessible property labels | `PropFieldShell` — `htmlFor` + `aria-describedby`, unchanged from Stage 04 | Stage 04 suite |
Selection announcement | `aria-live="polite"` naming the block and its position | DOM |
Iframe title | `title="Draft preview canvas for <pageKey>"` | DOM + browser |
Device state not colour-only | `aria-pressed` on each device button; `aria-live` width | DOM |
Reorder/visibility buttons named | `aria-label="Move <block> up"`, `"Hide <block>"` — not bare arrows | DOM |
Loading state | `role="status"` — *"Loading the draft page…"* | DOM |
Empty states | tree: *"No blocks…"*; inspector: *"Select a section…"* | DOM |
Responsive panels | one column below `xl`; canvas scrolls internally; no horizontal page scroll | DOM |
Dangerous actions confirmed | `window.confirm` on remove, publish, reset, restore defaults, schedule — unchanged | existing suites |

**Not claimed:** no screen-reader testing was performed, and the existing `e2e/a11y.spec.ts` axe sweep was not extended to the Builder in this stage. Both are recorded in the handover.
