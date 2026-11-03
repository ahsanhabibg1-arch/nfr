# Batch 16 — SEO & Internal Linking

Existing SEO architecture preserved (SEO Intelligence, EntitySeo/EntityFaq, `buildMetadata`, canonical +
trailing-slash policy, sitemap, robots, structured data, FTS). No duplicate or empty indexable pages added.

## Author change — SEO impact
Bylines now resolve to real `Author` records (stable ids), improving article attribution consistency.
Article JSON-LD already emits the author Person from the saved byline name (unchanged shape).

## Directories (Batch 15, retained + verified)
`/competitors/` and `/venues/` carry unique metadata + canonical; **filtered/paged variants are `noindex`**
(no thin duplicate filter pages); both index URLs are in the sitemap; footer links now always surface them;
profile pages carry "← All …" backlinks.

## NFR 2026 SEO targets — PREPARED (not published; content blocked)
The edition/schedule/results/standings pages already generate unique titles, descriptions, canonical,
breadcrumbs, and conditional structured data (Event JSON-LD only when dates are verified; FAQPage from
visible FAQs). Thin/empty coverage pages are `noindex` and excluded from the sitemap by construction.
Because no verified NFR 2026 content exists yet, these pages correctly remain thin/`noindex` until an
editor publishes verified data — **no misleading dates/status or keyword-stuffed pages were created.**

## Independence
The footer's prominent "Independent Publication Notice" (not affiliated with PRCA/WPRA/NFR/Las Vegas
Events) is intact; no false official affiliation is implied anywhere.
