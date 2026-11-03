# Batch 16 — Article Editor Production Readiness

## New article (Batch 15 behavior preserved + verified in a real browser)
Loads genuinely blank: empty headline/deck/excerpt/body, no demo blocks, unselected category/subcategory/
type, **no preselected author** (real DB author list), no featured image/caption/credit, no tags, no sample
relationships, image rights **Unresolved**, no "Demo Stage" badge. Browser QA at `/admin/articles/new/`
confirmed: `headlineEmpty=true, excerptEmpty=true, hasDemoBlock=false, hasDemoStage=false`, author dropdown
= 7 options (Select… + 6 real DB authors), first option "Select author…".

## Existing article (preserved)
All fields initialize from `existingArticle` (headline, slug, deck, excerpt, body, author, taxonomy,
related entities, featured image + metadata/rights, tags, SEO title/meta, sources, publication status).
Byline resolves to its Author id or preserves the legacy string. No blank-default overwrite; tsc clean.

## Editorial workflow (reviewed; unchanged, enforced)
Draft → Review → Approval → Publication via `transitionArticleAction` + the server publication gate
(`seoValidator.validateArticle`): required fields (headline, excerpt, body, image ALT), media rights
(Unresolved blocks publication), RBAC + ownership, audit (`EditorialWorkflowHistory`/`AuditLog`),
optimistic `version` concurrency, slug uniqueness, structured data, sitemap inclusion of published only.
The gate was **not weakened**; an empty new draft cannot be published (verified by test).

## Focused bug fixes
- Mock author dropdown → real DB authors (the Batch-15 known limitation). 
- Footer directory links were masked by DB-backed navigation; now appended unconditionally (de-duplicated)
  so `/competitors/` + `/venues/` always surface (verified in browser).

## Documented (not fixed — out of "no broad redesign" scope)
- **Global minor horizontal overflow** (`scrollWidth > innerWidth` by a few px on every page, incl.
  pre-existing ones — likely the far-right topbar "QUICK ACCESS" control). Pre-existing, not a regression;
  no visible layout break in the screenshot. Recommend a targeted responsive fix in a future batch.
