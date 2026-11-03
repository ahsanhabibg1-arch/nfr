# Batch 15 — Architecture Review

Baseline `4f41120` (Batch 14), branch `batch-01-nextjs-migration`, clean tree. No schema change; reused
existing entities and services throughout. No Aiven/R2 write; no deploy; no credential change.

## Reused (no duplication)
- **Competitor / Venue** entities + detail pages (`/competitors/[slug]/`, `/venues/[slug]/`, `lib/batch12Content.ts`).
- **Competition coverage** service + actions (Batch 14 `competitionService`, `competition-actions`) — the
  admin UX additions call existing `updateSession/updateResult/updateStanding/correctResult` (no new domain).
- **SEO** (`buildMetadata`, breadcrumb JSON-LD), **sitemap**, **RBAC** (`rodeo.manage`), **audit**, admin
  design system (`AdminPageHeader`, shared input classes), footer/nav.
- Article editor + `seoValidator` publication gate (unchanged logic).

## New (additive, no schema)
- Public directories `/competitors/` + `/venues/` backed by new read-only query helpers
  (`listPublicCompetitors`, `listPublicVenues`) in `lib/batch12Content.ts` (bounded pagination, validated
  search/filter params, public-only field selection).
- Competition admin: optional filters on the three `list*Admin` functions; inline edit + result-correction
  UI in `AdminCompetitionPage`.
- Article editor: Phase-0 demo defaults removed for NEW articles (existing articles unchanged).
- Internal links: directory backlinks on profiles; directory links in the footer; sitemap index URLs.

## Schema impact
**None.** No migration created or applied. `Article.searchVector` + GIN + FTS untouched.
