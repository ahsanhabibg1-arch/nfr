# NFRGuide.com — Article Editor UX Modernization

## FINAL VERDICT: `PARTIALLY COMPLETE — APPROVAL REQUIRED`

**Date:** 2026-11-14 · **Branch:** `main` · **HEAD:** `55bb310c95d73a21eefaec836fbd922ce67af419` (unchanged)
No commit, no push, no deployment, no production database access.

---

## 1. Executive summary

Authors can now write body prose continuously, with formatting that **actually
persists** — verified by saving, reloading and reading the stored row. That was
not previously possible at all, for a reason the audit had to establish first.

### The finding that shaped everything

A body paragraph was `{ type: 'paragraph'; text: string }`, and the public
renderer emitted `{block.text}` as a React child. **There was nowhere in the
data model to put bold, italic, underline or an inline link.** Any toolbar built
over that model would have been precisely the editor the brief forbids: one that
"looks like a rich-text editor but cannot safely save its formatting".

So the work had to start with the content model, not the interface.

### What was delivered

| Area | State |
|---|---|
| Inline formatting that persists (bold, italic, underline, strike, links) | **Done** — new `runs` projection, no migration |
| Continuous writing surface (TipTap), H2/H3, lists, nested lists, quote, divider, undo/redo, shortcuts, word count, reading time | **Done** |
| Structured blocks (table, callout, image, citation, disclosure) preserved exactly | **Done** — carried as opaque atoms, round trip proven lossless |
| Server-side block validation | **Done** — replaced a schema that accepted *any* JSON |
| Rich-text bundle kept out of public pages | **Done** — proven: 0 public pages load it |
| Four-area layout regrouping (§9) | **NOT done** — §12 |
| Slash commands, in-editor media/table insertion, autosave, SEO finding→field focus | **NOT done** — §12 |

### Four real defects found and fixed

Three were **pre-existing** and would have hit production; browser UAT found
them, not code reading.

1. **Every article save bylined to a seeded author failed** with "Unexpected
   server error." `resolveAuthorId` looked the author up by a *derived id* but
   created it with a *unique slug* — so any author row that already had that
   slug under a different id made the create run and the constraint throw.
2. **The same defect in tags**, same mechanism, same consequence.
3. **Toolbar clicks lost the text selection** (my new code): `mousedown`
   blurred the editor before `click`, so Bold applied to an empty range.
4. **The editor marked an untouched article dirty on mount** (my new code), so
   the "Unsaved Changes" badge never cleared, the browser's leave-warning nagged
   on every navigation, and a successful save still looked unsaved.

---

## 2. Current editor architecture (as audited)

| Piece | File | Size |
|---|---|---|
| Editor shell (all fields, save, workflow) | `views/admin/AdminArticleEditorShell.tsx` | ~1,620 lines |
| Structured block composer | `components/admin/editor/RichBlockEditor.tsx` | 752 |
| SEO assistant panel | `components/admin/editor/SeoAssistantPanel.tsx` | 190 |
| Revision history | `components/admin/editor/RevisionHistoryModal.tsx` | 199 |
| Sources / citations | `components/admin/editor/ArticleSourcesPanel.tsx` | 314 |
| Rodeo relationships | `components/admin/editor/RodeoRelationshipsPanel.tsx` | 138 |
| Media picker | `components/admin/editor/MediaPickerModal.tsx` | 144 |
| Draft preview | `components/admin/editor/ArticleDraftPreview.tsx` | 181 |
| Search appearance | `components/admin/editor/SearchAppearancePreview.tsx` | 200 |

**Storage:** `ArticleBlock { articleId, sortOrder, blockType, data: Json }`.
Ten renderable block types: `heading, paragraph, quote, list, table, callout,
image, sourceLink, disclosure, divider`.

**Existing rich-text framework: none.** `sanitize-html` was present but used
only for legal/info pages, never for article bodies — unnecessary there, because
plain-text React children are escaped by construction.

**Every consumer of body blocks** (7 files): `articleService` (save, read time,
revisions, inline-media reconcile), `seo-intel/orchestrator` (**body word count
from `data.text`**), `mappers`, `ArticleBody` (public renderer),
`RichBlockEditor`, `RevisionHistoryModal`, and `sectionRegistry` (unrelated page
blocks).

---

## 3. Field inventory

**31 fields** in the storage contract (`ArticleInputSchema`), unchanged:

`id, expectedVersion, slug, title, deck, excerpt, blocks, seoTitle,
metaDescription, imageSeoTitle, imageAltText, subcategory, subcategoryId,
articleType, categoryName, authorName, authorRole, reviewerName, heroImage,
imageCredit, imageCaption, imageRightsStatus, disclosure, disclosureNote, tags,
takeaways, sources, disciplineIds, hubIds, eventIds, editionIds`

The numbered editorial sequence is intact and in order:

| # | Field | Storage | UI location | Changed? |
|---|---|---|---|---|
| 01 | Main Headline (H1) | `Article.title` | unchanged | no |
| 02 | Secondary Editorial Deck | `Article.deck` | unchanged | no |
| 03 | Editorial Excerpt / Summary | `Article.excerpt` | unchanged | no |
| 04 | **Article Body** | `ArticleBlock[]` | **Write / Blocks toggle** | **view only** |
| 05 | SEO Title | `ArticleSeo.seoTitle` | unchanged | no |
| 06 | Meta Description | `ArticleSeo.metaDescription` | unchanged | no |
| 07 | Image SEO Title | `Article.imageSeoTitle` | unchanged | no |
| 08 | Image ALT Text | `Article.imageAltText` | unchanged | no |

**No field was moved, renamed, hidden or removed.** Validation rules, save
behaviour, preview behaviour and public-rendering dependencies are untouched.
The only change to Field 04 is that it now offers two *views* of the same
`ContentBlock[]` state.

---

## 4. Selected framework: TipTap 3.34.0

| | |
|---|---|
| Packages | `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-link` — all `3.34.0`, 51 transitive |
| Why | There was no existing editor framework to reuse, and the brief rules out a surface that cannot safely persist formatting. Selection, undo history, paste normalisation and list nesting are where hand-rolled `contenteditable` editors fail; ProseMirror (TipTap's engine) solves them |
| React 19 | supported |
| CI dependency gate | **still passes** — `npm audit --omit=dev --audit-level=critical` reports 3 **high** advisories, all pre-existing (`prisma` → `@prisma/config` → `deepmerge-ts`), 0 critical. TipTap introduced none |
| Public bundle impact | **none** — §9 |

---

## 5. Content model and adapter

### `runs`: a projection, not a replacement

```ts
type InlineMark = 'bold' | 'italic' | 'underline' | 'strike';
interface InlineRun { text: string; marks?: InlineMark[]; href?: string }
```

Text-bearing blocks gain an optional array: `runs` (paragraph, heading,
callout), `quoteRuns` (quote), `itemRuns` (list — positional and sparse, so a
list where one item is formatted does not store runs for all of them).

**The invariant:** `text` is the authoritative plain-text projection and always
equals the concatenation of the runs. That is what makes the change additive:

- `seo-intel/orchestrator` keeps counting body words from `data.text`;
- `articleService` keeps computing read time from `.text`;
- a block with no `runs` renders exactly as before;
- `ArticleBlock.data` is already `Json`, so **no migration** — `prisma migrate
  diff` reports *"No difference detected."*

When runs disagree with the text, the **runs are discarded and the text kept** —
losing formatting rather than corrupting the words, and never leaving a block
whose projection lies to the word count.

### Why runs and not an HTML string

The old model was XSS-safe *by construction* because React escapes text
children. Runs keep that property: the renderer maps each run to a React element
(`<strong>`, `<em>`, `<u>`, `<s>`, `<a>`), so the article body never injects
markup and there is no sanitizer whose allowlist could be wrong. The mark
vocabulary is a closed four-value list — an unrecognised mark cannot be
represented, let alone rendered.

### The adapter

`lib/content/articleRichTextAdapter.ts` — pure functions, no React, no editor
imports, so it is testable without mounting anything.

**Prose round-trips** through the rich-text document: paragraph, heading (2/3),
list, bare blockquote, divider.

**Everything else travels as an opaque atom** holding the original block object,
returned byte-for-byte. This is what makes the round trip lossless for block
types the adapter has never heard of. Blocks deliberately excluded from prose
because they carry fields a rich-text node cannot hold:

| Block | Why it stays structured |
|---|---|
| table, callout, image, sourceLink, disclosure | required editorial metadata (alt, credit, publisher, variant) that the SEO and rights gates check |
| **drop-cap paragraph** | `isDropCap` has no rich-text equivalent; losing it changes the published opening |
| **attributed quote** | the cite line cannot live in a blockquote node and would vanish on save |
| heading at an unsupported level | would otherwise be silently coerced to `h2` |

> One defect this surfaced in my own code: `isProseBlock` and the converter had
> the conditions duplicated and they drifted — the predicate called an
> attributed quote prose while the converter correctly carried it opaquely. A
> caller trusting the predicate would have been misled. There is now one
> authoritative predicate, and a test pins it.

---

## 6. Structured block compatibility

All ten types verified. Every one of the **95 blocks stored across the
development and test databases** validates against the new schema, and every
stored article survives an editor round trip unchanged.

Observed stored shapes (no unknown keys, no unmodelled types):

```
callout     keys: text, title, type, variant
disclosure  keys: text, type, variant
heading     keys: id, level, text, type
paragraph   keys: isDropCap, text, type
quote       keys: attribution, quote, role, type
table       keys: caption, headers, rows, type
```

---

## 7. Rich-text feature matrix

| Capability | State |
|---|---|
| Continuous paragraphs, Enter | ✅ |
| Shift+Enter line break | ✅ browser-verified (one `<p>` with a `<br>`) |
| Text selection, Bold / Italic / Underline / Strikethrough | ✅ persisted |
| H2, H3; back to body paragraph | ✅ persisted |
| Bulleted, numbered, **nested** lists (Tab / Shift+Tab, toolbar ⇥ ⇤) | ✅ |
| Blockquote, horizontal divider | ✅ |
| Internal and external links, URL validation | ✅ |
| Undo / redo + Ctrl/Cmd+B, I, U, Z, Shift+Z | ✅ |
| Paste: plain and safe rich text | ✅ via ProseMirror's allowlisted schema — an unsupported node or mark has no representation, so it cannot arrive |
| Word count, reading-time estimate | ✅ |
| **No H1 in the body** | ✅ heading levels restricted to 2 and 3 |
| Slash commands (`/heading`, `/image`…) | ❌ §12 |
| In-editor block reorder / duplicate / insert-before | ❌ §12 — available in the Blocks view |

---

## 8. Media, links and citations

**Links.** A dialog applies, edits and removes links on the selection. Targets
are validated by **parsing**, not pattern-matching, because `java\nscript:`,
`JaVaScRiPt:` and percent-encoded variants all defeat a regex. Allowed:
site-relative paths, `#fragment`, `https:`, `mailto:`. Refused: everything else,
including plain `http:` (the site is HTTPS-only). External links get
`target="_blank"` and `rel="noopener noreferrer nofollow"`; internal links
deliberately do not, so in-site navigation still works.

Validation is enforced at **four** boundaries: the editor extension, the
adapter, the server schema, and the renderer. The renderer re-checks because
storage is not the only way data reaches a database — an unsafe href renders as
plain text, so the words survive and the target does not.

**Citations stay distinct.** `sourceLink` remains its own block type with its
own panel; it is held to the same URL safety rule but is never collapsed into an
ordinary hyperlink, which would lose the distinction the sources panel and
structured data depend on.

**Media.** Insertion still goes through the existing Media Library picker in the
Blocks view. No second media system was created, and existing image references,
alt text, captions and credits are preserved. In-editor image insertion is
**not** implemented — §12.

---

## 9. Layout, responsive behaviour and bundle

**Field 04 now offers two views of one model:**

- **Write** (default) — continuous rich-text surface, ~46 rem measure, sticky
  grouped toolbar (Text style │ Headings │ Lists │ Insert │ History │ Links),
  status bar with word count and reading time.
- **Blocks** — the existing structured composer, unchanged.

Switching performs no conversion beyond the adapter round trip, which the tests
prove lossless. Structured blocks appear in Write as non-editable dashed cards
labelled by type, `contenteditable="false"` and `atom: true`, so no keystroke
can reach their payload.

**Mobile verified at 390 px:** editor and toolbar visible, document-level
horizontal overflow ≤ 1 px, formatting buttons still ≥ 20 px tall. The public
homepage was re-checked at 320 px and 390 px.

**The rich-text framework does not ship to readers.** Measured, not assumed:
exactly one 521 KB chunk contains ProseMirror/TipTap; it is referenced by **0
prerendered public pages** and only by the two admin article-editor routes.

---

## 10. SEO Intelligence, workflow and RBAC

**No threshold, gate or policy was changed.** The SEO engine reads body words
from `data.text`, which the projection invariant guarantees is still the full
plain text — so its analysis operates on the real saved content.

Browser UAT confirmed the publication gates are still authoritative and
**server-side**: attempting to save the *published* fixture article was refused
with "Publication blocked by unresolved editorial/compliance checks." That is
correct behaviour, and it is why the persistence tests use an isolated **draft**
— the state authors actually format in.

Workflow and RBAC are untouched: no new permission, no new server action, no new
publishing path. The editor remains a view over `saveArticleAction`.

---

## 11. Security, tests and verification

### Server boundary, replaced

```
before:  z.object({ type: z.string() }).passthrough()      // any JSON, stored verbatim
after:   a discriminated union of the 10 renderable types
```

Blocks keep `.passthrough()` **per type** so unknown keys on stored articles
survive — stripping them would be silent data loss. An unknown block *type* is
refused. Runs are strict: they are new, so no stored run can carry an unknown
key.

### Results

| Gate | Result |
|---|---|
| Full Vitest | **143 files · 3,330 passed · 0 skipped** (baseline 141 / 3,281) |
| New: `article-inline-content.test.ts` | 30 tests |
| New: `article-richtext-adapter.test.ts` | 19 tests |
| Full Playwright | **170 passed · 0 failed · 1 skipped** (baseline 159) |
| New: `article-editor-richtext.spec.ts` | 11 tests (1 self-skips without a structured block) |
| `tsc --noEmit` | clean |
| Production build | succeeded — `BUILD_ID = hNM1fJUmNG9p5IKq8W6xk` |
| `prisma validate` / drift | valid / **"No difference detected."** |
| `git diff --check` · secret scan · encoding scan | clean · clean · clean |
| Accessibility (axe, admin editor) | **0 serious/critical** after the fix below |

Mutation-style checks on the data-loss protections: an unsafe href is dropped
while the text survives; disagreeing runs are discarded while the text survives;
an unknown block type round-trips untouched; a trailing empty paragraph is not
persisted.

### Three test-authoring errors worth recording

Each would have reported success falsely:

1. `/saved|Draft saved/i` **matches "You have unsaved changes"** — the assertion
   passed with nothing saved. Now waits on the dirty badge clearing, a durable
   signal; the success toast hides itself after 3.5 s and cannot be relied on.
2. `name: /Save Draft|Save/` with `.first()` clicked whichever "Save" button
   came first in the DOM.
3. `getByRole('alert')` and `/\d+ words/` each matched two elements (Next's
   route announcer; the SEO panel's own word count).

### The accessibility defect my toolbar introduced

Axe reported `label-content-name-mismatch` (serious, 5 nodes): buttons showing
`H2`, `# List`, `Quote`, `Unlink` with accessible names that did not contain the
visible text — a WCAG 2.5.3 failure, because a speech-input user saying the
visible label cannot activate the control. Pure symbols (`¶ ― ↶ ↷ ⇥ ⇤`) are now
`aria-hidden` with the description as the name; word labels were aligned with
their names (`H2 section heading`, `Quote block`, `Unlink: remove the link…`).
Re-audited: **0 serious/critical**.

---

## 12. What was NOT done, and why

Everything here is genuinely absent, not partially working. **This is why the
verdict is `PARTIALLY COMPLETE`.**

| § | Item | Reason |
|---|---|---|
| 9 | **Four-area layout regrouping** (Writing / Setup / SEO & Media / Review & Publish) | A structural rebuild of a ~1,620-line component holding all 31 fields, their validation and workflow wiring. Done carelessly it is exactly how a field goes missing. Not started rather than half-done |
| 5, 6 | Slash commands (`/heading`, `/image`…) | Needs a suggestion plugin and a keystroke policy that must not interfere with ordinary typing |
| 6 | In-editor block reorder / duplicate / insert-before-or-after | Available in the Blocks view; adding keyboard-accessible controls to the opaque cards is a further increment |
| 6 | Richer table editing | Unchanged. The brief forbids controls that save unsupported data, and the stored table shape is fixed `headers`/`rows` |
| 7 | Image insertion from inside the writing surface | Media picker still lives in the Blocks view. Alt/caption/credit are rights-gated metadata; wiring that into a node view is a self-contained piece of work |
| 12 | **Autosave** | Deliberately not implemented. §12 permits retaining explicit Save Draft when the guarantees cannot all be met, and they cannot yet: the editor has no draft-vs-published distinction for silent writes, and the save path re-runs publication gates (§10). Explicit Save Draft and the unsaved-changes warning are retained and now correct |
| 13 | Selecting an SEO finding to focus the offending field/block | The panel is integrated and authoritative; the focus affordance is not built |
| 15 | A dedicated revision-restoration browser test | Existing suites cover restore; a UAT scenario specifically for restoring into the rich-text surface is not added |
| 11 | Tablet-specific layout | Only desktop and 390 px mobile were verified |

---

## 13. Files changed

### New

| File | Purpose |
|---|---|
| `lib/content/articleInline.ts` | the `runs` model, mark allowlist, URL safety, normalisation, projection reconciliation |
| `lib/content/articleBlockSchema.ts` | the per-type server contract replacing `passthrough()` |
| `lib/content/articleRichTextAdapter.ts` | blocks ↔ ProseMirror document, with the opaque-atom guarantee |
| `components/editorial/InlineText.tsx` | public renderer for runs, as React elements |
| `components/admin/editor/RichTextBodyEditor.tsx` | the TipTap writing surface, toolbar, link dialog, stats |
| `tests/article-inline-content.test.ts` | 30 tests |
| `tests/article-richtext-adapter.test.ts` | 19 tests |
| `e2e/article-editor-richtext.spec.ts` | 11 browser tests |

### Modified

| File | Change |
|---|---|
| `types/index.ts` | optional `runs` / `quoteRuns` / `itemRuns` on text-bearing blocks |
| `components/editorial/ArticleBody.tsx` | renders runs for heading, paragraph, quote, list items, callout |
| `lib/cms/articleService.ts` | strict block schema + projection enforcement; **`resolveAuthorId` and the tag upsert fixed** |
| `views/admin/AdminArticleEditorShell.tsx` | Write/Blocks toggle, `bodyMode` state, testable dirty badge |
| `package.json` / `package-lock.json` | TipTap dependencies |

**Database/schema impact: none.** No migration was created or applied; the
schema is unchanged and drift-free.

---

## 14. Remaining limitations and risks

| # | Item | Severity |
|---|---|---|
| 1 | §12's unbuilt items — most visibly the four-area layout regrouping | **The reason approval is required** |
| 2 | Formatting is editable only in the **Write** view; the Blocks view edits plain text and will drop that block's runs if its text is edited there (the projection reconciler discards runs that no longer match) | **Medium — needs an owner decision: either disable plain-text editing of formatted blocks, or accept it** |
| 3 | Admin bundle grew by one 521 KB chunk on two editor routes | Low — public pages unaffected, proven |
| 4 | The author/tag upsert fix changes behaviour on **every** article save; covered by 3,330 unit tests and 170 browser tests, but it is the highest-blast-radius change here | Medium |
| 5 | Tablet layout and revision-restoration UAT not verified | Low |
| 6 | 3 pre-existing **high** dependency advisories (`prisma` → `deepmerge-ts`); the fix is a Prisma 7 major upgrade | Low — unchanged by this work, CI gate still passes |

---

## 15. The owner decisions needed

1. **Approve or re-scope the unbuilt items in §12** — above all whether the
   four-area layout regrouping should be done as its own piece of work, with the
   field inventory in §3 as the checklist that nothing disappears.
2. **Decide the Blocks-view behaviour for formatted text** (risk 2): forbid
   plain-text editing of a block that carries runs, warn, or accept the loss.
3. **Confirm autosave stays out** for the reasons in §12, or specify what it may
   write and when.

**Stopping here for owner review.** Nothing was committed, pushed or deployed,
and no production data was touched.
