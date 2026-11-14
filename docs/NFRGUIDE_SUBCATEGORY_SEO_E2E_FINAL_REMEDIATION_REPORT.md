# NFRGuide — Subcategory, SEO, Routing & E2E Remediation

## VERDICT: `PARTIAL — 11 of 12 E2E failures resolved; Phases 4, 6 and 7 incomplete`

**Date:** 2026-11-14 · **Branch:** `main` · **HEAD:** `98d29ab` (unchanged — nothing committed)
Nothing was deployed. The owner directed the Aiven production migration and the push to
`main` after this report's first draft; both were carried out and the results are recorded
in §D.

---

## 1. Executive summary

**The headline finding is that none of the 12 reported E2E failures came from the
Subcategory work, and none came from the article-editor CSS fix either.** All 12 were
already present in the code exactly as it was pulled from GitHub.

That was not assumed. The same 8 spec files were run against three states of the
repository, and the failure set was byte-identical in all three:

| Run | State | Result |
|---|---|---|
| **A** | Working tree (Subcategory work applied) | 12 failed · 76 passed |
| **B** | `main` @ `98d29ab`, Subcategory work stashed | **12 failed · 76 passed — same 12** |
| **C** | Editor file reverted to `38f0d46` (pre-`98d29ab`) | **12 failed · 76 passed — same 12** |

Run C matters because `98d29ab` was an earlier change of mine to the article-editor
toolbar; reverting it changed nothing, so that commit is cleared as well.

**Two root causes explain 10 of the 12 failures**, and neither is a Subcategory issue:

1. **The article editor became a tab set** in the pulled commit `38f0d46` ("Article Editor
   UX Modernization"). Six specs predate it and reach for controls that are now mounted
   but `hidden` on another tab. The controls work; the specs never open the tab.
2. **One unwrapped flex row** in `CompetitionSection.tsx` pushed every page using it wider
   than a 320px viewport. That single row accounted for four separate failures across
   three spec files.

**11 of 12 are now fixed and verified.** The twelfth is a real product behaviour change
with a precisely identified cause, left open because fixing it is a layout decision (§F).

---

## A. E2E failure matrix

Status key: `FIXED` verified passing · `OPEN` root-caused, not fixed.
Origin key: `PRE-EXISTING` present at `38f0d46` as pulled · all 12 are pre-existing.

| # | Test | Original failure | Root cause | Origin | Fix | Status |
|---|---|---|---|---|---|---|
| 1 | `a11y.spec.ts:160` admin editor (authenticated) | 2 serious/critical axe violations | (a) `aria-controls="rt-find-panel"` pointed at an element only mounted while the panel is open — a dangling reference, `aria-valid-attr-value` (critical). (b) 4 toolbar buttons whose glyph is absent from their `aria-label` (`x²`/"Superscript", `x₂`/"Subscript", `Tx`/"Clear formatting…", `☑ List`/"Checklist") — `label-content-name-mismatch` (serious), a WCAG 2.5.3 failure | PRE-EXISTING | (a) `aria-controls` emitted only while open. (b) New `accessibleName()` composes `glyph — description` **only** when the glyph is not already contained in the description, so common buttons still announce as "Bold" and a future mismatched glyph is corrected structurally | **FIXED** |
| 2 | `a11y.spec.ts:209` every editor input reachable by label | `outline: none`, expected `solid` | The Subcategory `<select>` is on the **Setup** tab. It stayed attached (so the `toBeAttached` loop passed) but was inside a `display:none` ancestor, so `.focus()` silently left focus on `<body>` and the ring was measured on an element that was never focused | PRE-EXISTING | Test opens the Setup tab first via a new shared `openEditorArea()` helper | **FIXED** |
| 3 | `admin.spec.ts:71` admin reaches editor; source picker | `Sources` heading not visible | "Sources" is on the **SEO** tab; the readiness summary it also asserts is on **Review** | PRE-EXISTING | Each assertion opens the tab that owns it. `toHaveCount(0)` assertions left alone — a hidden control is still in the DOM, so counting zero still means absent | **FIXED** |
| 4 | `admin.spec.ts:96` legacy SCHEDULED article | "will not publish automatically" hidden | Publishing controls are on the **Review** tab | PRE-EXISTING | Test opens Review | **FIXED** |
| 5 | `article-editor-structured.spec.ts:151` INSERT MENU | strict-mode violation: `/Image/` matched 2 elements | The Image **gallery** block was added in `38f0d46`; the spec's substring regex became ambiguous. Anchoring would not help — each item's accessible name is its label followed by its hint sentence | PRE-EXISTING | Assert by block key (`rt-insert-<key>`), which is what the editor dispatches on, **plus** a `toContainText` check on the visible label so a renamed item still fails. Gallery added to the list; both controls preserved | **FIXED** |
| 6 | `discipline-classifications.spec.ts:157` overflow @320 | document 101px wider than viewport | `CompetitionSection.tsx` filter row was `flex items-center gap-2` with no wrap. Three data-driven labels do not fit 320px | PRE-EXISTING | `flex-wrap` on the row and its header. All three filters stay visible with full hit area — no horizontal scroller, no `overflow-x: hidden` | **FIXED** |
| 7 | same @390 | 31px wider | same | PRE-EXISTING | same | **FIXED** |
| 8 | `navbar.spec.ts:41` overflow @320–1440 | 46px wider at 375 | same single row | PRE-EXISTING | same | **FIXED** |
| 9 | `seo-assistant.spec.ts:32` grouped findings | `seo-assistant` panel hidden | Panel is on the **SEO** tab | PRE-EXISTING | Test opens SEO | **FIXED** |
| 10 | `seo-assistant.spec.ts:65` inspector scrolls independently | inspector top `-157`, expected 60–110 | **Product behaviour.** On the SEO tab the inspector is the tallest item in its own grid: container `804px`, inspector `804px`. `position: sticky` and `top: 80px` are applied correctly, but a sticky element cannot move inside a container the same height as itself, so it scrolls away. The page's remaining scroll comes from content outside that grid | PRE-EXISTING | **Not fixed** — see §F | **OPEN** |
| 11 | `stage08-publishing.spec.ts:168` hero at phone 390 | overflow | same single row | PRE-EXISTING | same | **FIXED** |
| 12 | `stage09-seo-admin.spec.ts:55` stored robots directive | `seo-indexing-status` hidden | On the **SEO** tab | PRE-EXISTING | Test opens SEO | **FIXED** |

### Test-contract changes, and why each is a correction rather than a weakening

Five assertions changed. None reduces coverage; each replaces a premise that the product
had legitimately moved past.

| Changed | Was | Now | Why it is a correction |
|---|---|---|---|
| `openEditorArea()` in 4 specs | Assumed every editor control is visible at once | Opens the owning tab first | The editor is a tab set. The old premise described a layout that no longer exists; the assertions themselves are unchanged |
| `article-editor-structured:140` toolbar names | `'Superscript'` | `'x² — Superscript'` (4 names) | The accessible names legitimately changed to satisfy WCAG 2.5.3. The test now pins the new contract, including the glyph |
| `article-editor-structured:151` insert menu | `/Image/` substring | block key + visible-label check | Removes an ambiguity, adds the gallery, and checks more than before |
| `issue04b-subcategory:(4)` | "same slug allowed in a different category" | "same slug REFUSED, naming the owner" + new `(4b)` for the name case | Inverted by the owner's flat-route decision; the old assertion is now wrong by design |
| `issue04b-subcategory:(19b)` | "sitemap gains no subcategory URLs" | "a THIN archive stays out" + new `(19c)` for the threshold case | The old assertion had started passing for the wrong reason |

---

## B. SEO verification

| Area | Result | Evidence |
|---|---|---|
| **Canonical article URL** | One URL per article. With a subcategory → `/<sub>/<slug>/`; without → `/articles/<slug>/` | Browser-verified: `/chute-craft/inside-the-chutes-nfr-roughstock-intensity/` |
| **Old-URL redirect** | `/articles/<slug>/` **308** → nested URL. Verified end to end in Chromium | `FINAL URL: /chute-craft/inside-the-chutes-…` |
| **First segment verified, not trusted** | `/anything/<slug>/` redirects to the article's real URL rather than serving it. Without this, one article would have unlimited indexable URLs | `[section]/[article]/page.tsx` |
| **Redirect on subcategory change** | Assigning, changing or clearing a subcategory moves the article, so `syncUrlRedirect` now compares whole paths, not slugs. Previously only a slug rename wrote a redirect | `articleService.ts` |
| **Sitemap — canonical only** | Articles listed at the URL they serve, never the redirecting one | `sitemapEntries.ts` |
| **Sitemap — thin archives excluded** | Archive listed only when active **and** ≥ `SUBCATEGORY_INDEX_THRESHOLD` (3) published articles — the same rule the page's robots directive uses, so the two cannot disagree | tests `(19b)`, `(19c)` |
| **Metadata** | Title, description, canonical, robots, OG image, breadcrumb JSON-LD, FAQ JSON-LD all wired; `EntitySeo(SUBCATEGORY)` overrides merge on top | `[section]/page.tsx` |
| **Breadcrumb structured data** | Trail is Home → Section → Subcategory → Article. The section is in the markup even though the flat URL omits it | `ArticlePageBody.tsx` |
| **Internal links** | All 23 `ROUTES.ARTICLE` call sites moved to the canonical layer; a new `articleUrl(article)` helper takes the whole article so a subcategory **name** can never be passed where its **slug** belongs | 18 files |
| **Reserved slugs** | 30+ depth-1 names refused at write time. Without this a subcategory slugged `search` would be permanently unreachable with no error | `RESERVED_SUBCATEGORY_SLUGS` |
| **Not-found behaviour** | `/no-such-subcategory/` returns 200 with `noindex` in dev — **identical to `/articles/nope/`, `/disciplines/nope/`, `/venues/nope/`**, i.e. the project's existing documented policy, not a regression. Production-build behaviour not separately measured | measured, all four routes |

### Indexability policy — unchanged, by instruction

The remediation brief asked whether the "< 3 published articles ⇒ `noindex`" rule should be
replaced by a content-completeness signal. **It has been left exactly as it was.** The brief
also says a material editorial policy change must wait for owner approval, and this is one.
The rule is recorded in `subcategoryContent.ts` with its reasoning and is covered by two
tests. A content-completeness variant would need the owner to choose the inputs and
thresholds; it is not something to infer.

---

## C. CMS integration

| Area | Status |
|---|---|
| **Landing SEO administration** | **Done.** `LandingEntityType.SUBCATEGORY` added; a Subcategories group lists every row with its parent section in the label (the flat URL no longer shows it) and links to the live archive. Permission is `taxonomy.manage`, matching the CRUD |
| **FAQ administration** | **Done.** Same enum, so FAQs and FAQ JSON-LD work on a subcategory archive as on a discipline |
| **Editorial Organization** | **Done.** `summary`, hero `image`, `imageCredit` and `guide` fields added. The slug help text was corrected — it claimed "no public subcategory pages exist yet", which is now false, and now shows the live URL shape and the redirect consequence |
| **Public archive rendering** | **Done.** Hero, kicker, summary, article count, guide paragraphs, coverage grid, `EntityIntro`, FAQ accordion, `ViewBeacon` |
| **Visual Builder (`template:subcategory`)** | **NOT DONE** — §F |
| **Media Library picker for the hero** | **NOT DONE** — §F. Hero image is a URL field today; existing values are unaffected |

---

## D. Database

| Check | Result |
|---|---|
| Prisma schema matches migrations | Yes — `migrate status` clean on dev and test |
| Dev database | **25 applied**, up to date |
| Test database | **25 applied**, up to date |
| **Aiven production** | **25 applied — up to date.** Applied on owner instruction, 2026-11-14 |
| Production data preserved | Row counts identical before and after: 14 subcategories, 12 articles, 5 redirects |
| Collision precondition | **0 cross-section slug collisions** confirmed before applying — the one condition that could have failed the migration |
| Post-migration verification | `Subcategory_categoryId_slug_key` dropped, `Subcategory_slug_key` created; `summary`, `image`, `imageCredit`, `guide` present; `LandingEntityType.SUBCATEGORY` and `AnalyticsEntityType.SUBCATEGORY` present |
| Backup verified | **NO.** BKP-01 remains unproven — WAL archiving is on, but no restore has ever been rehearsed and no retention window is confirmed. The owner was told this and chose to proceed |

**The migration was applied with `prisma migrate deploy`.** `migrate reset` was never used and
no destructive statement ran. Dev, test and production now all report 25 applied.

The migration is backward-compatible with the code already running in production: four
nullable columns and two unused enum values change nothing for a client built from the
previous schema, so there is no window in which the running app and its database disagree.

The migration is additive apart from one constraint widening, and that statement checks
itself: it raises a named exception listing the offending slugs instead of letting
PostgreSQL report a bare duplicate-index error.

---

## E. Final test results

| Suite | Result |
|---|---|
| **TypeScript** (`tsc --noEmit`) | **PASS**, 0 errors |
| **Vitest** | **3490 / 3490 passed**, 152 files |
| **Next.js production build** | **PASS** — `/[section]` and `/[section]/[article]` both compile; no route conflict |
| **Prisma** | schema valid; dev + test up to date; drift check clean |
| **Playwright — targeted subset** (8 specs that held all 12 failures) | 12 failed → **1 failed, 87 passed** |
| **Playwright — full suite** | see §F; final figure to be recorded from the completing run |
| **Responsive** | 320 / 375 / 390 / 768 / 1024 / 1280 / 1440 — overflow assertions pass at every width |
| **Accessibility** | axe serious/critical violations on the admin editor: 2 → **0** |

---

## F. Remaining issues

### Resolved (11)

Failures 1–9, 11 and 12 in §A, each verified by running the affected spec.

### Verified pre-existing, now fixed

All 12 were pre-existing. The three-state comparison in §1 is the evidence.

### Newly discovered

**One, found and fixed during this work.** Updating the toolbar's accessible names broke
`article-editor-structured:140`, which pinned the old exact names. The names changed for a
correct reason (WCAG 2.5.3), so the test was updated to the new contract rather than the
fix being reverted.

### Open — root-caused, not fixed

**`seo-assistant.spec.ts:65` — the SEO Assistant does not stay in view while scrolling.**

Measured cause: on the SEO tab the inspector column is the tallest item in its own grid.
Container `804px`, inspector `804px`. `position: sticky` and `top: 80px` apply correctly,
but a sticky element has no range inside a container its own height, so it scrolls away
while the page keeps scrolling on content outside that grid.

Not fixed because every available fix is a layout decision — making the left column
stretch, moving the inspector out of that grid, or giving the grid a minimum height — and
each changes how the SEO tab looks. The assertion was deliberately **not** weakened. This
needs a design call.

### Genuine blockers

**Aiven migration is blocked on BKP-01** (§D). Not a code problem; a restore rehearsal.

### Deferred — approved scope not completed

Stated plainly: these were in the brief and are **not done**.

1. **Phase 4.1 — Visual Builder `template:subcategory`.** The archive cannot be composed in
   the Builder. Every other page family can.
2. **Phase 4.2 — Media Library picker for the subcategory hero.** Hero image is still a
   pasted URL. No ALT/credit/rights workflow, no responsive derivative selection.
3. **Phase 6 — full regression breadth.** Vitest, TypeScript, build, Prisma and the
   targeted Playwright subset were all run. The 12 named user journeys were not each
   walked end to end; the Subcategory journey (create → attach → section card → archive →
   article → redirect) was browser-verified, the rest were not.
4. **Phase 7 — final quality review** was not performed as its own pass.

---

## Acceptance

`COMPLETE — VERIFIED LOCALLY` is **not** claimed.

Against the eight criteria: 1 is met for 11 of 12 (the twelfth is explained but unresolved);
2, 3, 4 and 7 are met; 5 is partially met (SEO, FAQ and Editorial Organization done; Visual
Builder and Media Library not); 6 is partially met; 8 is met for critical defects, with the
sticky inspector open as a non-critical one.
