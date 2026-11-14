# NFRGuide.com — Article Editor Final Completion

## FINAL VERDICT: `PARTIALLY COMPLETE — OWNER APPROVAL REQUIRED`

**Date:** 2026-11-14 · **Branch:** `main` · **HEAD:** `55bb310c95d73a21eefaec836fbd922ce67af419` (unchanged)
No commit, no push, no deployment, no production database access, no migration.

---

## 1. Executive summary

This workflow prioritised the two items that could **lose an author's work**, then
the owner's named editing requirements. It did not complete the full §5/§10
feature catalogue, and §20 is explicit about reporting that honestly.

### The most important finding: a data-safety contradiction I had shipped

§3 asked whether an unchanged legacy block can survive the complete server save
path. **It could not**, and my previous report was misleading about it.

The adapter carried an unknown block type through the editor untouched — but the
server schema was a discriminated union of the ten renderable types, so the save
refused it:

```
blocks.1.type -> Invalid discriminator value. Expected 'heading' | 'paragraph' | ...
```

An article containing a legacy or future block type could be **opened and edited
but never saved**. My earlier claim that such a block "survives an edit
untouched" was true of the adapter alone, not of the path that matters. Fixed,
with the narrow grandfathering rule §3 asked for, and 15 tests.

### Delivered in this workflow

| § | Item | State |
|---|---|---|
| **3** | **Legacy block compatibility through the full save path** | **Done** — narrow grandfathering, 15 tests |
| **12** | **Formatting protection in Blocks view** (owner: loss prohibited) | **Done** — 11 tests |
| **6** | **Mouse-selection formatting + floating toolbar** | **Done** — real mouse drags, 5 browser tests |
| **7** | **Internal link search** over published entities, canonical URLs | **Done** — 11 tests + browser |
| 7 | External links, edit, unlink, safe-URL rejection | Done (previously + verified again) |
| 4 | Four-area layout regrouping | **NOT done** — §11 |
| 5 | Superscript/subscript, alignment, H4, clear formatting, find/replace, fullscreen | **NOT done** |
| 8 | In-editor image insertion, galleries | **NOT done** |
| 9 | Richer table editing | **NOT done** |
| 10 | FAQ, footnotes, video embeds, checklists | **NOT done** |
| 11 | Slash commands, in-editor block management | **NOT done** |
| 15 | Public rendering for *new* element types | **NOT done** (nothing new was added, so nothing is unrendered) |

**Nothing advertised is non-functional.** No toolbar control was added that does
not work end to end — which is why the unbuilt items are absent rather than
present-but-broken.

---

## 2. Final architecture

```
ArticleBlock { articleId, sortOrder, blockType, data: Json }   ← unchanged authority
        │
        ├── lib/content/articleInline.ts            runs model, mark allowlist, URL safety,
        │                                            projection reconciliation, formatting detection
        ├── lib/content/articleBlockSchema.ts       per-type strict contract (10 types)
        ├── lib/content/articleBlockGrandfather.ts  NEW — stored-legacy escape hatch
        ├── lib/content/articleRichTextAdapter.ts   blocks ↔ ProseMirror, opaque atoms
        │
        ├── components/admin/editor/RichTextBodyEditor.tsx   Write surface + floating toolbar + link dialog
        ├── components/admin/editor/RichBlockEditor.tsx      Blocks view + formatting protection
        ├── lib/cms/internalLinkSearch.ts                    NEW — canonical link targets
        └── components/editorial/InlineText.tsx              public renderer (shared with the admin preview)
```

### The grandfathering rule (§3)

A block that fails strict validation is stored **only** when a byte-identical
payload is already stored on that same article. Therefore:

| Case | Outcome |
|---|---|
| Untouched legacy block | **kept**, byte-for-byte |
| Modified legacy block | **refused** — nothing can vouch for the new shape |
| New block of an unknown type | **refused** — nothing stored to grandfather it |
| Unknown type alongside a *different* stored legacy block | **refused** — the rule is per-payload, not per-article |
| Key reordering of a stored legacy block | **kept** — comparison is canonical JSON with sorted keys |
| `iframe` / `script` / raw-`html` block | **refused**, even beside real legacy content |
| Removing a legacy block | **allowed** — preservation must not mean imprisonment |

Validation is **not** weakened for any of the ten known types: they are always
strictly parsed and their inline projection always enforced.

---

## 3. The 31-field preservation matrix

Every field in `ArticleInputSchema`, with its storage and current UI home. **No
field was removed, hidden or remapped in this workflow.** The layout regrouping
(§4 of the brief) was not performed, so every field sits where it did.

| # | Field | Storage | UI location | Validation | Save | Reload |
|---|---|---|---|---|---|---|
| 1 | `id` | `Article.id` | implicit | — | ✓ | ✓ |
| 2 | `expectedVersion` | `Article.version` | implicit | optimistic lock | ✓ | ✓ |
| 3 | `slug` | `Article.slug` | Setup → URL slug | regex, unique | ✓ | ✓ |
| 4 | `title` | `Article.title` | **Field 01** Headline | 1–300 | ✓ | ✓ |
| 5 | `deck` | `Article.deck` | **Field 02** Deck | ≤600 | ✓ | ✓ |
| 6 | `excerpt` | `Article.excerpt` | **Field 03** Excerpt | 1–1000 | ✓ | ✓ |
| 7 | **`blocks`** | `ArticleBlock[]` | **Field 04** Body — Write / Blocks | per-type + grandfather | ✓ | ✓ |
| 8 | `seoTitle` | `ArticleSeo.seoTitle` | **Field 05** | ≤300 | ✓ | ✓ |
| 9 | `metaDescription` | `ArticleSeo.metaDescription` | **Field 06** | ≤600 | ✓ | ✓ |
| 10 | `imageSeoTitle` | `Article.imageSeoTitle` | **Field 07** | ≤300 | ✓ | ✓ |
| 11 | `imageAltText` | `Article.imageAltText` | **Field 08** | ≤600 | ✓ | ✓ |
| 12 | `subcategory` | `Article.subcategory` | Setup (legacy text) | ≤120 | ✓ | ✓ |
| 13 | `subcategoryId` | `Article.subcategoryId` | Setup → Subcategory | FK, section-scoped | ✓ | ✓ |
| 14 | `articleType` | `Article.articleType` | Setup → Article Type | registry-validated | ✓ | ✓ |
| 15 | `categoryName` | `Article.categoryId` | Setup → Category | must exist | ✓ | ✓ |
| 16 | `authorName` | `Article.authorId` | Setup → Byline | resolved by slug | ✓ | ✓ |
| 17 | `authorRole` | `Author.role` | Setup → Byline | — | ✓ | ✓ |
| 18 | `reviewerName` | `Article.reviewerName` | Review & Publish | — | ✓ | ✓ |
| 19 | `heroImage` | `Article.heroImage` | SEO & Media → Featured | media-backed | ✓ | ✓ |
| 20 | `imageCredit` | `Article.imageCredit` | SEO & Media | — | ✓ | ✓ |
| 21 | `imageCaption` | `Article.imageCaption` | SEO & Media | — | ✓ | ✓ |
| 22 | `imageRightsStatus` | `Article.imageRightsStatus` | SEO & Media | enum, publish gate | ✓ | ✓ |
| 23 | `disclosure` | `Article.disclosure` | SEO & Media | — | ✓ | ✓ |
| 24 | `disclosureNote` | `Article.disclosureNote` | SEO & Media | — | ✓ | ✓ |
| 25 | `tags` | `Tag` + `ArticleTag` | Setup → Tags | resolved by slug | ✓ | ✓ |
| 26 | `takeaways` | `Article.takeaways` | Writing → Takeaways | — | ✓ | ✓ |
| 27 | `sources` | `Source` + `ArticleSource` | SEO & Media → Sources | directory-validated | ✓ | ✓ |
| 28 | `disciplineIds` | `ArticleDiscipline` | Setup → Relationships | must exist | ✓ | ✓ |
| 29 | `hubIds` | `ArticleHub` | Setup → Relationships | must exist | ✓ | ✓ |
| 30 | `eventIds` | `ArticleEvent` | Setup → Relationships | must exist | ✓ | ✓ |
| 31 | `editionIds` | `ArticleEdition` | Setup → Relationships | must exist | ✓ | ✓ |

Verified by the full suite: 146 test files exercise these paths, including the
editor render tests and the save/reload browser tests.

---

## 4. Rich-text toolbar feature matrix

| Group | Control | State |
|---|---|---|
| Text | Bold, Italic, Underline, Strikethrough | ✅ persisted |
| Text | Body paragraph, H2, H3 | ✅ persisted |
| Text | H4, superscript, subscript, clear formatting | ❌ not built |
| Structure | Bulleted, numbered, **nested** lists (Tab / Shift+Tab, ⇥ ⇤) | ✅ |
| Structure | Blockquote, divider | ✅ |
| Structure | Alignment, justify, checklist, indent/outdent of paragraphs | ❌ not built |
| Links | Insert, edit, remove; **internal search**; external HTTPS; safe-URL rejection | ✅ |
| Links | Open link, dedicated internal/external modes | ❌ (one dialog does both) |
| Insert | Quote, divider | ✅ |
| Insert | Image, gallery, table, comparison table, takeaway, callout, citation, footnote, FAQ, disclosure, video | ❌ in Write — available in **Blocks** for the existing types |
| Utilities | Undo, redo, word count, reading time | ✅ |
| Utilities | Find, replace, fullscreen, slash commands, insert-block menu | ❌ not built |
| **Selection** | **Floating toolbar: B / I / U / S / Link** | ✅ |

No control is present that does not work.

---

## 5. Mouse selection and linking — browser verified

The owner's sequence, tested as written:

| Step | Verified |
|---|---|
| Write a sentence | ✅ |
| Select a word **with the mouse** inside that sentence | ✅ real `mouse.down/move/up` |
| Click Bold on the floating toolbar | ✅ |
| Formatting applies **only** to the selection | ✅ asserted the surrounding words are *not* bold |
| Save | ✅ |
| Reload | ✅ |
| Formatting preserved | ✅ `<strong>` present after reload |

The floating toolbar appears on selection, hides when the selection collapses,
and every button carries the `onMouseDown` guard — the selection-loss bug does
not recur, and a browser test would catch it if it did.

> **A test-authoring error worth recording.** The first drag helper located the
> word with `getByText`, which resolves to the *paragraph* — so the drag
> selected the whole line and the "only the selection" assertion failed for the
> right reason. The helper now measures the word's own pixel bounds from a DOM
> Range and drags between them: still a real mouse selection, but the one the
> test means.

---

## 6. Internal link search

| Property | How it is guaranteed |
|---|---|
| URLs are canonical | every `url` comes from `config/routes.ts` applied to the stored slug — nothing concatenates a path |
| Unpublished content is never offered | articles use the project's own `publicArticleWhere()`; other entities use `ACTIVE_ONLY` + `publicSlugWhere()` |
| Thin targets warn rather than hide | a category with 0 published articles is offered **with** a warning |
| Gated | refused without `article.create` / `article.edit.own` / `article.edit.any`; the server action re-checks |
| Searchable kinds | articles, the five canonical sections, categories, disciplines, hubs, events, editions |
| Ranking | exact prefix first, then alphabetical |
| Stale responses | debounced 250 ms, in-flight results discarded if the term changed |

> **A defect this surfaced in my own first draft:** I hand-wrote
> `{ workflowStatus: 'PUBLISHED', archivedAt: null }` — but `Article` has **no
> `archivedAt` column**, so every article query threw. Reusing
> `publicArticleWhere()` fixed it and means this search and the public pages
> cannot disagree about what is linkable.

---

## 7. Formatting protection in the Blocks view (§12)

The owner's decision — formatting loss is prohibited — is implemented and
tested.

| Block | Behaviour in Blocks view |
|---|---|
| Carries `runs` / `quoteRuns` / `itemRuns` with marks or a link | **read-only**, rendered through the *public* renderer, with an **Edit in Write** button and an explanation |
| Unformatted | unchanged — fully editable, as before |
| Structured (table, callout, image, citation, disclosure) | unchanged — dedicated controls |
| Any block | reorder, duplicate, delete still work — preservation is not imprisonment |

The tests also demonstrate the loss that is now prevented: the exact write the
old field performed (`{ ...block, text: newValue }`) drops the runs on
reconciliation.

---

## 8. Legacy content, SEO, workflow and security

**SEO Intelligence:** unchanged. No threshold, gate or policy touched. Body word
count still reads `data.text`, which the projection invariant keeps equal to the
full plain text.

**Workflow / RBAC:** unchanged. No new permission or publishing path. The
publication gates remain server-side and authoritative — browser UAT confirms a
published article is still refused with *"Publication blocked by unresolved
editorial/compliance checks."*, which is why the persistence tests use an
isolated draft.

**Security:**

| Protection | Where |
|---|---|
| Closed four-mark vocabulary | model, schema, adapter |
| URL safety by **parsing** (rejects `javascript:`, `data:`, encoded and newline variants, and plain `http:`) | editor extension, adapter, schema, renderer — four boundaries |
| No raw markup for article content | runs render as React elements; no unrestricted HTML injection anywhere in the body |
| Unknown block types | refused unless byte-identical to stored content |
| `iframe` / `script` / `html` blocks | refused, including beside real legacy content |
| Payload caps | per-field and per-block limits |

---

## 9. Verification

| Gate | Result |
|---|---|
| **Full Vitest** | **146 files · 3,367 passed · 0 skipped** (baseline 143 / 3,330) |
| New: `article-legacy-block-compat.test.ts` | 15 |
| New: `article-formatting-protection.test.ts` | 11 |
| New: `internal-link-search.test.ts` | 11 |
| **Full Playwright** | **175 passed · 0 failed · 1 skipped** (baseline 170) |
| New browser tests | 5 (mouse selection, floating toolbar, internal link, link edit/unlink) |
| `tsc --noEmit` | clean |
| Production build | succeeded — `BUILD_ID = YLGYvnPBq-QU7f8W7IFyE` |
| `prisma validate` / drift | valid / **"No difference detected."** |
| `git diff --check` | clean |
| Secret scan · encoding scan | clean · clean |
| Accessibility (axe, admin editor) | 0 serious/critical |
| Viewports exercised | 390 px (editor + public), 320 px (public), existing navbar sweep 320/375/768/1024/1280/1440, Rodeo Coverage desktop/tablet/phone |

### The one skipped test, honestly

`article-editor-richtext.spec.ts › a structured block appears as a locked card`
self-skips when the fixture body contains no structured block. It is a
conditional skip by design — the alternative would be asserting on content the
database may not have. The behaviour it covers is exercised by the Vitest
adapter tests, which construct structured blocks directly.

**No test was weakened.** Where a test failed, the cause was diagnosed and
either the product or the test's own premise was fixed, with the reason recorded
in the test.

### Database state after the run

`nfrguide_dev`: 10 articles (10 published), 35 blocks, 5 categories, 7
disciplines, 2 classifications, 23 article types. No production access.

---

## 10. Public article presentation (§15) — partially addressed

**Existing** elements render correctly, and inline formatting now renders where
it previously could not: headings, paragraphs, inline bold/italic/underline/
strike, internal and external links (external gets `target="_blank"` and
`rel="noopener noreferrer nofollow"`, internal deliberately does not), lists,
quotes, attributed quotes, tables, callouts, takeaways, images with captions and
credits, citations, disclosures, dividers.

**Not done:** the broader editorial redesign §15 asks for — refreshed
typography scale, table overflow treatment, gallery and video containers,
footnote and FAQ presentation. Those are tied to element types that were not
added, plus a visual pass that was not started.

**Nothing is unrendered:** because no new block type was introduced, there is no
element the public page cannot draw. That was the constraint §10 of the brief
set, and it was honoured.

---

## 11. What was NOT done, and why

| § | Item | Reason |
|---|---|---|
| **4** | **Four-area layout regrouping** | A structural rebuild of a ~1,660-line component holding all 31 fields plus validation and workflow wiring. The field matrix in §3 is the checklist it needs. Prioritised below the two data-loss fixes; not started rather than half-done |
| 5 | H4, superscript, subscript, clear formatting, alignment, justify, checklist | Each needs mark/attribute support in the model, adapter, schema **and** public renderer before the button can exist. §5 forbids enabling a control before that path is complete |
| 5 | Find, replace, fullscreen | Editor utilities with no storage impact, but real UI work |
| 8 | In-editor image insertion, galleries | Alt/caption/credit are rights-gated metadata the publish gate checks; wiring that into a node view is a self-contained piece. Galleries need a new block type end to end |
| 9 | Richer table editing | The stored shape is fixed `headers`/`rows`; a cell-grid editor must not be able to save anything that shape cannot hold |
| 10 | FAQ, footnotes, video embeds, checklists | Each is a **new block type**: storage + validation + adapter + editor + preview + public rendering + revision path. Video additionally needs a provider allowlist |
| 11 | Slash commands, in-editor block management | Needs a suggestion plugin with a keystroke policy that cannot interfere with typing, and keyboard-accessible controls on the opaque cards |
| 14 | Revision-restoration browser test | Not added. Existing suites cover restore; a UAT scenario specifically restoring into the rich-text surface is still missing |
| 17 | Tablet (768 px) editor verification | Only 390 px and desktop were exercised for the editor |

---

## 12. Remaining limitations and risks

| # | Item | Severity |
|---|---|---|
| 1 | §11's unbuilt items, above all the four-area layout | **The reason approval is required** |
| 2 | A **modified** legacy block is refused on save. Correct and deliberate, but an author editing such an article sees a validation error they cannot resolve from the UI | **Medium — needs an owner decision: migrate those blocks, or add an admin path to convert one** |
| 3 | No legacy block types exist in the current databases (dev/test/production all hold only the ten known types), so risk 2 is latent, not active | Low |
| 4 | The author/tag upsert fix affects **every** article save; covered by 3,367 unit and 175 browser tests | Medium |
| 5 | Admin bundle carries one ~521 KB rich-text chunk on two editor routes; **0 public pages load it** (measured) | Low |
| 6 | 3 pre-existing **high** dependency advisories (`prisma` → `deepmerge-ts`); CI gate still passes (critical-only) | Low |
| 7 | Tablet editor layout and revision-restoration UAT unverified | Low |

---

## 13. Files changed

### New

| File | Purpose |
|---|---|
| `lib/content/articleBlockGrandfather.ts` | the §3 legacy-block rule, canonical JSON comparison |
| `lib/cms/internalLinkSearch.ts` | canonical internal link targets, gated, published-only |
| `app/admin/internal-link-actions.ts` | read-only server action for the link dialog |
| `tests/article-legacy-block-compat.test.ts` | 15 tests |
| `tests/article-formatting-protection.test.ts` | 11 tests |
| `tests/internal-link-search.test.ts` | 11 tests |

### Modified

| File | Change |
|---|---|
| `lib/cms/articleService.ts` | block validation moved to save time with grandfathering; reads stored blocks before the rebuild |
| `lib/content/articleInline.ts` | `blockHasInlineFormatting` for the Blocks-view guard |
| `components/admin/editor/RichTextBodyEditor.tsx` | floating selection toolbar, internal link search, `applyLinkTo` |
| `components/admin/editor/RichBlockEditor.tsx` | formatting protection, shared public-renderer preview, `onEditInWrite` |
| `views/admin/AdminArticleEditorShell.tsx` | wires `onEditInWrite` to the view toggle |
| `e2e/article-editor-richtext.spec.ts` | 5 new browser tests, precise mouse-drag helper |

Carried forward unchanged from the previous workflow: `articleInline.ts` (model),
`articleBlockSchema.ts`, `articleRichTextAdapter.ts`, `InlineText.tsx`,
`ArticleBody.tsx`, `types/index.ts`.

**Database/schema impact: none.** No migration created or applied.

---

## 14. Production compatibility

| | |
|---|---|
| Migration required | **No** — `prisma migrate diff`: "No difference detected." |
| Production writes | **None** |
| Breaking change | **No** — stored shapes, public URLs and structured data unchanged |
| Deploy-order hazard | **None from this work.** The three managed-taxonomy migrations were already applied to production in an earlier workflow, so the schema is ahead of the deployed code, which is the safe direction |
| Visible change for readers | Inline formatting renders where it previously could not. Nothing else |
| Visible change for editors | Floating selection toolbar, internal link search, and formatted blocks protected in the Blocks view |

---

## 15. The owner decisions needed

1. **Approve or re-scope §11.** Above all, whether the four-area layout
   regrouping should be its own piece of work, with §3's field matrix as the
   checklist that nothing disappears.
2. **Decide what happens to a modified legacy block** (risk 2): leave it
   refused, add a conversion path in the admin, or migrate such blocks if any
   ever appear.
3. **Confirm the feature order** for the remaining §5/§10 items, since each new
   block type is a full vertical slice (storage → validation → adapter → editor →
   preview → public rendering → revision → tests).

**Stopping here for owner review.** Nothing was committed, pushed or deployed,
and no production data was touched.
