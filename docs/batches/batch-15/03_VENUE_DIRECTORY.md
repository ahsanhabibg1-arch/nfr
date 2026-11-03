# Batch 15 — Venue Directory (`/venues/`)

Database-backed directory over the existing `Venue` entity (no duplicate model).

## Features
- Card grid; name search (`q`); country filter (from real distinct `Venue.country` values); bounded
  pagination (page size 24); links to existing `/venues/[slug]/` profiles; responsive; empty state.
- Cards show only verified fields present on the record: name, nickname, location (city/state/country),
  capacity (when set), and the count of event editions held there (`_count.editions`). No fabricated
  addresses/coordinates/hours; no "open now".

## Relationships
Edition count comes from the real `RodeoEventEdition.venueId` relationship. The venue **profile** page
already surfaces the editions/events and related articles; the directory links into it rather than
duplicating that detail.

## Search/filter
`listPublicVenues({ q, country, page })`: parallel `count` + paged `findMany` (public `select` +
`_count.editions`) + distinct country options. Case-insensitive name search; exact (insensitive) country
filter.

## SEO
Unique metadata + canonical `/venues/`; breadcrumbs; index indexable, filtered/paged variants `noindex`.
Sitemap lists the index URL. No misleading Event/Place schema is emitted from the directory.
