# Batch 14 — NFR 2026 Landing Experience Spec

The NFR-2026 landing experience is the **existing annual-edition page** enhanced with reusable coverage
components — NOT a separate hardcoded NFR site. To stand up NFR 2026, create a RodeoEvent "NFR" + a 2026
`RodeoEventEdition` and manage its coverage; the same system serves every event/edition.

## Structure (reusable)
- **Overview** (`/rodeo-events/[slug]/[edition]/`): event title/overview, verified dates + venue,
  disciplines, related articles, FAQs, affiliate associations (TV/streaming/tickets via existing systems),
  SEO (EntitySeo/EntityFaq), editorial update info — all already present — plus a **coverage nav** and a
  published-coverage summary (added this batch) linking to schedule/results/standings.
- **Schedule / Results / Standings** (nested routes): the Batch 14 coverage pages.

## Content dependencies (editorial — never fabricate)
Verified NFR-2026 dates, venue, daily schedule, contestant qualification list, round results, standings/
payouts, broadcast rights, ticket availability. Until human-verified from official sources, sections show
**empty states** (not placeholders presented as fact). No official NFR branding/assets are added; the site
does not imply it is an official broadcaster/organizer/ticketing partner.

## TV / streaming & tickets
Handled with the **existing article + affiliate systems** (no Broadcast/Streaming/Ticket DB models in this
batch, per scope). Affiliate/ticket links carry the existing disclosure/labeling; verify legitimacy before
publishing.

## SEO & navigation
Per-page metadata + breadcrumb JSON-LD; Event JSON-LD on the edition page only when dates are verified;
FAQPage from visible FAQs. Thin/empty coverage pages are `noindex` and excluded from the sitemap; trailing
slash + canonical preserved. Internal links: edition ↔ schedule/results/standings; results/standings ↔
competitor profiles; breadcrumbs throughout.

## To launch NFR 2026 (owner/editorial)
1. Create the NFR event + 2026 edition (verified dates/venue). 2. Add participations (eligible contestants
when officially announced). 3. Enter schedule/results/standings from official sources → verify → publish.
4. Author TV/tickets/travel articles + FAQs. 5. Confirm SEO + submit sitemap post-deploy.
