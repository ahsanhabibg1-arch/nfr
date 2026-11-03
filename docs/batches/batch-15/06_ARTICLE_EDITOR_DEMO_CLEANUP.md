# Batch 15 — Article Editor Phase-0 Demo Cleanup (launch-critical)

`views/admin/AdminArticleEditorShell.tsx` initialized NEW articles with hardcoded Phase-0 demo content.
That risked an editor accidentally publishing fake data. Removed for new articles; existing articles are
fully preserved.

## Removed demo defaults (new article now starts blank)
- Body: 3 demo blocks (incl. "The Anatomy of the 8-Second Whistle") → **empty** (`structuredBody || []`).
- Category "NFR Competition", Subcategory "Roughstock", Article Type "Event Guide" → **unselected**
  (empty, with "Select…" placeholder options; types widened to `… | ''`).
- Author slug `clayton` (Clayton Vance) → **unselected** ("Select author…"); for an existing article the
  saved byline name is matched back to its key.
- Reviewer "Elena Morales" → empty.
- Featured image `/assets/images/hero_bull_riding_1793166440262.jpg`, caption "Championship action…",
  credit "Editorial Staff Archives / NFRGuide" → empty (image slot shows a "choose image" placeholder).
- Image SEO title "… — Featured Action Photography" → empty.
- Tags `['NFR 2026','Roughstock','Judicial Scoring']` → `[]`.
- Demo relationship ids (`las-vegas-nfr`, `nfr-championship`, `nfr-2026`) → empty arrays.
- Image rights default `Staff Photo` → **`Unresolved`** (never claim ownership by default; this also keeps
  the publication gate honest).
- `slug` fallbacks (`new-editorial-dispatch`) → empty (slug auto-derives from the title as typed).
- **"Demo Stage" badge** removed from `AdminTopbar` (no invented replacement status).

## Placeholder hints (not persisted)
Inputs use `placeholder=` hints only (headline, excerpt, deck, SEO, image fields, "Select…" options). The
save payload (`buildInput()`) sends the raw state values, so placeholders are never saved; the preview
snapshot's display fallbacks (e.g. "Untitled…") are preview-only and not persisted.

## Existing article preservation
When `existingArticle` is provided, every field initializes from it (`existingArticle?.X || ''`): headline,
body, category/subcategory/type, byline, featured image + caption/credit, tags, SEO, rights, publication
state, relationships, sources — unchanged. tsc clean; no hydration/init regression.

## Publication validation intact
A genuinely empty new draft still **cannot be published** — `validateArticle` reports Category A/B blockers
(headline, excerpt, body, ALT text, resolved image rights). No auto-generated content fills required fields.

## Known limitation (Batch 16)
The author dropdown still uses the Phase-0 mock `AUTHORS` map (4 names). Replacing it with DB-backed
`Author` records is out of this batch's "don't broadly redesign" scope — recommended for Batch 16.

## Tests
`tests/batch15-editor.test.ts` (source-guard + logic; the editor is a client component with no render
harness here): new body has no demo blocks; no preselected category/subcategory/type; no fake author/
reviewer; no sample image/caption/credit/image-SEO-title; no sample tags / demo relationship ids; rights
default Unresolved; Demo-Stage badge absent; placeholders present; and an empty new draft fails the
publication gate.
