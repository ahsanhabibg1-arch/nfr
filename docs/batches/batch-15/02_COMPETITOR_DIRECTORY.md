# Batch 15 — Competitor Directory (`/competitors/`)

Database-backed directory over the existing `Competitor` entity (no duplicate model).

## Features
- Card grid; name search (`q`, trimmed, max 80 chars); discipline filter (validated against real
  `CompetitorDiscipline` relationships); bounded pagination (`page` clamped 1..10000, fixed page size 24);
  links to existing `/competitors/[slug]/` profiles; responsive; empty state.
- Each card shows only public fields: fullName, knownAs, hometown (city/state/country), disciplines, status.

## Query/filter design (efficient, no N+1)
`listPublicCompetitors({ q, disciplineSlug, page })` runs three parallel queries: `count` (total),
`findMany` (one page, `select` of public fields + a light `disciplines.discipline.name` include), and the
discipline options. `skip/take` paginate; `contains … mode:'insensitive'` searches name; discipline filter
is a relational `some`.

## Public visibility
No draft/private exposure: competitors have no workflow (they exist or not); only public columns are
selected (no `createdById`, internal notes, or unverified competition data). Unverified competition
results are never surfaced here (results live behind their own PUBLISHED+VERIFIED gate).

## SEO
Unique metadata + canonical `/competitors/`; breadcrumbs; the index is indexable, but **filtered/paged
variants are `noindex`** (prevents thousands of thin duplicate filter pages). Sitemap lists the index URL;
individual indexable profiles remain listed (Batch 12 logic). No fabricated data.
