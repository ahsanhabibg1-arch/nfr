# SEO Intelligence — Rich-Text Link Analysis

## VERDICT: `COMPLETE — VERIFIED LOCALLY`

**Date:** 2026-11-14 · **Branch:** `main` · **HEAD:** `55bb310c95d73a21eefaec836fbd922ce67af419` (unchanged)
No commit, no push, no deployment, no production access, no migration.
**No SEO threshold changed and no publication gate was touched.**

---

## 1. Executive summary

The requirement was to verify that SEO Intelligence correctly processes links
stored in `runs`, `quoteRuns` and `itemRuns`. **It did not**, and the way it
failed was worse than simply missing them.

Link analysis was fed by a generic walk over *every string value* in a block's
JSON, scanned with a regex for anything path- or URL-shaped. Measured against a
real body before any change was made:

```
body:  3 inline internal links (paragraph, list item, quote)
       1 inline external link
       1 inline mailto link
       1 sourceLink citation
       1 path MENTIONED in prose, not linked

detected : /articles/real-guide/            ✅ (incidentally)
           /categories/nfr-competition/     ✅ (incidentally)
           /disciplines/bull-riding/        ✅ (incidentally)
           https://example.com/a            ✅ (then discarded)
           https://official.example/report  ✅ (as if editorial)
           /articles/not-a-link/            ❌ FALSE POSITIVE — prose, not a link
missed   : mailto:editor@example.com        ❌ renders as a real link
anchors  : none available at all            ❌
```

and `analyzeInternalLinks` then `continue`d on every external link, so an
external destination produced **no finding whatsoever** — which in the UI reads
as "checked, nothing wrong". That is the false `Passed` the requirement
prohibits.

Links are now read from the fields that actually carry them, so the public page,
the stored content and the analysis describe the same set.

---

## 2. Existing behaviour, documented

| Piece | What it did |
|---|---|
| `orchestrator.blockStrings()` | recursively collected every string in a block's JSON |
| `extractLinkCandidates()` | regex for `https?://…` and for `/path` whose first segment is a known route family |
| `hrefsById` | `sourceLink.url` only |
| `ArticleInv.internalLinks` | a flat, **de-duplicated** `string[]` — no roles, no anchors, no provenance |
| `analyzeInternalLinks()` | per link: `external`/`non-web` → **skipped**; `unsafe`/`invalid` → `LINK_BROKEN`; internal → route index → `LINK_REDIRECTED` / `LINK_TO_UNPUBLISHED` / `LINK_BROKEN`, else counted as inbound |
| also | `LINK_ORPHAN`, `LINK_OPPORTUNITY` |

### What already worked, and is unchanged

Internal target validation is good and was left alone: paths resolve against the
route index, and a noindex or canonical-away page still counts as a valid
destination — only genuinely missing, non-public or malformed targets are
reported. `LINK_BROKEN`, `LINK_TO_UNPUBLISHED`, `LINK_REDIRECTED`,
`LINK_ORPHAN` and `LINK_OPPORTUNITY` behave exactly as before.

---

## 3. The twelve requirements

| # | Requirement | Before | Now |
|---|---|---|---|
| 1 | Detect and count internal editorial links | partly, with a false positive | **✅ read from `runs`/`quoteRuns`/`itemRuns`; counted** |
| 2 | Detect and count external editorial links | **✗** detected then discarded | **✅ counted and reported** |
| 3 | Distinguish internal / external / citations without double-counting | **✗** one flat deduplicated list | **✅ separate counts; citations never counted as editorial** |
| 4 | Validate internal targets against canonical routes and published availability | ✅ | ✅ unchanged |
| 5 | Detect malformed, unsafe or broken internal references | ✅ | ✅ unchanged (and no longer double-reported — §6) |
| 6 | Validate external HTTPS URLs and classify attributes | **✗** | **✅ classified; `rel`/`target` asserted in the browser** |
| 7 | Report `Not Verified` rather than claiming valid or broken | **✗ silent** | **✅ `LINK_EXTERNAL_NOT_VERIFIED`, naming the reason** |
| 8 | Evaluate anchor text; flag empty or unhelpful | **✗** anchors unavailable | **✅ `LINK_ANCHOR_EMPTY`, `LINK_ANCHOR_NONDESCRIPTIVE`** |
| 9 | Meaningful findings pointing at the field or block | partial | **✅ "block 2 (list), item 1"** |
| 10 | A link change updates the analysis after recalculation | ✅ (re-reads blocks) | ✅ **proven by a re-run test** |
| 11 | Preserve thresholds and publication gates | — | **✅ nothing changed; proven by test** |
| 12 | Public rendering, saved content and SEO see the same link data | **✗ both directions** | **✅ proven against `InlineText`** |

---

## 4. What was built

### `lib/seo/articleLinkInventory.ts`

Reads the link-bearing fields deliberately and returns, per link:

```ts
{ href, anchor, role: 'editorial' | 'citation',
  blockIndex, blockType, field: 'runs'|'quoteRuns'|'itemRuns'|'url',
  itemIndex?, renderable }
```

Design decisions worth stating:

- **Not de-duplicated.** The same destination linked in two places is two links
  and two anchors to judge. Callers that want unique destinations build that
  set themselves, so "how many links" and "which destinations" stay separate
  questions. `distinctInternalTargets` is reported alongside the count.
- **Adjacent runs sharing an href are one link**, because `normalizeRuns` merges
  them and the renderer emits a single anchor. Counting two would overstate.
- **`classify` is injected**, not imported, so this module carries no route-index
  dependency and the orchestrator passes the *same* `classifyLink` the analyzer
  uses — which is what keeps counts and findings consistent.
- **Citations are a distinct role.** `sourceLink.url` is a real rendered anchor,
  but conflating it with editorial links overstates linking and understates
  sourcing.

### Four new rules — all informational, none a gate

| Code | Kind | Severity | Purpose |
|---|---|---|---|
| `LINK_INVENTORY` | OPPORTUNITY | LOW | the counts, as evidence |
| `LINK_EXTERNAL_NOT_VERIFIED` | OPPORTUNITY | LOW | says the destination was not fetched |
| `LINK_ANCHOR_EMPTY` | DEFECT | MEDIUM | a link with no readable anchor text |
| `LINK_ANCHOR_NONDESCRIPTIVE` | RECOMMENDATION | LOW | "click here", "read more", … |

**No threshold was invented and no link count is required for anything.**
`LINK_INVENTORY` reports numbers without a target. The non-descriptive list is a
deliberately tiny closed set of phrases that are unusable out of context — not a
quality score.

### The gates are provably untouched

`assertPublishable()` runs `validateArticle()` and never reads SEO findings —
the code already says so (*"Routine SEO findings are warnings and never reach
here"*). A test asserts it on the source rather than trusting the comment, so
adding SEO rules cannot block a publish.

---

## 5. Defects found and fixed along the way

Three were in code written earlier in this programme, found by these tests.

| Defect | Consequence | Fix |
|---|---|---|
| **Double-reported unsafe link.** My new loop emitted `LINK_BROKEN` for an unrenderable href that the legacy path already reported | two findings for one unsafe citation — caught by the existing `seo-audit-routes` test | the new loop skips it; the count still records `unrenderable` |
| **Stale toolbar state.** TipTap 3 no longer re-renders React on every transaction, so `aria-pressed` and Unlink's `disabled` kept old values | selecting a linked word left **Unlink disabled**, and a screen reader was told the wrong state | `shouldRerenderOnTransaction: true` |
| **`Article.archivedAt` does not exist.** An earlier hand-written filter assumed it | every article query in the internal-link search threw | reuse the project's own `publicArticleWhere()` |

### Three test-authoring errors, recorded because each would have misled

1. **Wrong premise:** a test asserted two *adjacent* same-target runs count as
   two links. They are one — and that is what renders. The test was corrected,
   not the code.
2. **Wrong scope:** "no `/competition/` link exists anywhere" failed in a full
   run because every test in the file edits the *same* draft and earlier tests
   legitimately leave their own links. Now scoped to the word under test.
3. **Wrong interaction:** clicking an anchor did not put the caret where
   ProseMirror reports `isActive('link')`; the linked text is now selected,
   which is the state the control depends on.

---

## 6. Test evidence

### New unit tests — `tests/seo-link-analysis.test.ts` (20)

Detection in all three inline locations; **prose path is not a link**; the
`mailto` the old scan missed; provenance; anchor text; separate counts;
citations never counted as editorial; adjacency; unsafe inline href stripped;
unsafe citation flagged `unrenderable`; hostile shapes; empty and
non-descriptive anchors; the four rules registered; the gate does not read SEO
findings; no required count; empty body produces nothing; **every
inventory-renderable link is one `InlineText` renders**; a prose path renders as
text.

### New audit tests — `tests/seo-link-analysis-audit.test.ts` (6)

Through the real `runAudit` against the isolated database:

- `LINK_INVENTORY` reports `3 internal, 1 external, 0 citation(s)` and
  `2 distinct internal target(s)`;
- `LINK_EXTERNAL_NOT_VERIFIED` names `partner.example` and the reason;
- `LINK_ANCHOR_NONDESCRIPTIVE` flags "click here" and points at
  **"block 2 (list), item 1"**;
- a valid internal link is **not** reported broken;
- after editing the body and re-running, counts become `1 internal, 0 external`
  and the removed links are no longer OPEN findings;
- a link to a **draft** is reported as `LINK_TO_UNPUBLISHED`.

### New browser tests — in `e2e/article-editor-richtext.spec.ts` (4)

Each asserts against the **stored block**, because a UI assertion alone would
not prove the analysis can see the link — which was the whole defect:

- an internal link inserted in the editor is stored in `runs[].href`;
- an external link is stored **and** carries `rel="noopener…"` in the DOM;
- removing a link leaves the words and removes the href;
- a link inside a list item is stored in `itemRuns`, where the analyzer looks.

Mouse-selection coverage from the same file still applies: a link applied to a
mouse-dragged selection persists through save and reload.

### Quality gates

| Gate | Result |
|---|---|
| Full Vitest | **148 files · 3,393 passed · 0 skipped** (baseline 146 / 3,367) |
| Full Playwright | **179 passed · 0 failed · 1 skipped** (baseline 175) |
| `tsc --noEmit` | clean |
| Production build | succeeded — `BUILD_ID = B1TuWGxql3cXHeM7sqrMD` |
| `prisma validate` / drift | valid / **"No difference detected."** |
| `git diff --check` · secrets · encoding | clean · clean · clean |

---

## 7. Limitations, stated plainly

| # | Limitation | Why |
|---|---|---|
| 1 | **External destinations are never fetched.** The audit makes no network requests, so an external link is reported `Not Verified` — never "valid" or "broken" | Deliberate: the audit must be deterministic and must not make the site a crawler. This is requirement 7 honoured, not a gap left open |
| 2 | The **legacy string scan is still used** alongside the deliberate inventory, for links written into non-inline block fields the inventory does not model | Removing it could lose coverage this work did not measure. The counts and anchor findings come only from the deliberate inventory, so the scan's false positives no longer affect them — but it can still contribute a prose path to the reachability check |
| 3 | **No "click a finding to focus the block"** in the editor | The findings now carry block and item indices, so the data exists; the editor affordance is not built |
| 4 | Anchor judgement is a **closed phrase list**, not readability analysis | Inventing a scoring model would be inventing a threshold |
| 5 | The SEO panel in the editor is **client-side continuous validation**, separate from this engine. These findings surface on the `/admin/seo/` screens after an audit run | Pre-existing architecture; unifying the two was not in scope |

---

## 8. Files changed

### New

| File | Purpose |
|---|---|
| `lib/seo/articleLinkInventory.ts` | the canonical link inventory, counts, anchor helpers |
| `tests/seo-link-analysis.test.ts` | 20 unit tests |
| `tests/seo-link-analysis-audit.test.ts` | 6 real-audit tests |

### Modified

| File | Change |
|---|---|
| `lib/seo-intel/orchestrator.ts` | builds the deliberate inventory per article; adds inline hrefs to the reachability set; computes counts with the analyzer's own `classifyLink` |
| `lib/seo-intel/analyzers.ts` | `bodyLinks` / `linkCounts` on `ArticleInv` (optional, so existing constructors still compile); inventory, not-verified and anchor findings; skips the already-reported unrenderable case |
| `lib/seo-intel/rules.ts` | four new informational rules |
| `components/admin/editor/RichTextBodyEditor.tsx` | `shouldRerenderOnTransaction: true` so toolbar state is truthful |
| `e2e/article-editor-richtext.spec.ts` | 4 new browser tests; selection helper hoisted; two test corrections |

**Database/schema impact: none.**

---

## 9. Production compatibility

| | |
|---|---|
| Migration | **none** |
| Production writes | **none** |
| SEO thresholds / publication gates | **unchanged** — proven by test |
| Existing findings | `LINK_BROKEN`, `LINK_TO_UNPUBLISHED`, `LINK_REDIRECTED`, `LINK_ORPHAN`, `LINK_OPPORTUNITY` behave as before |
| New findings on existing content | `LINK_INVENTORY` will appear for any article with body links; `LINK_ANCHOR_*` only where an anchor is genuinely empty or context-free. All informational |
| Reader-visible change | **none** |

**Stopping here for owner review.** Nothing was committed, pushed or deployed.
