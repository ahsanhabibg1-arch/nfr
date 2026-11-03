# Batch 15 — Internal Linking & Navigation

All links are backed by actual DB associations and use existing route helpers (`ROUTES.*`) / relative
paths with trailing slashes. No indiscriminate sitewide linking.

## Added links
- **Competitor profile** → "← All competitors" backlink; already links out to disciplines, edition
  participations, and tagged published articles (Batch 12).
- **Venue profile** → "← All venues" backlink; already links to its editions/events and related articles.
- **Annual edition** → coverage nav (Overview/Schedule/Results/Standings) + published-coverage summary
  (Batch 14); venue/articles already linked.
- **Competition coverage** (Batch 14, retained): result → competitor profile; standing → competitor
  profile; schedule shows discipline/venue; every coverage page → parent edition via breadcrumbs.
- **Footer** → "Competitors Directory" + "Venues Directory" links (improves discoverability without
  crowding the primary header).
- **Sitemap** → `/competitors/` and `/venues/` index URLs added (filtered/paged variants excluded;
  individual profiles remain gated to indexable ones).

## Safety
No links to unpublished entities (public reads are gated); breadcrumbs emit valid canonical paths;
trailing-slash + canonical conventions preserved. Filtered directory URLs are `noindex` so crawl budget
is not spent on thin permutations.
