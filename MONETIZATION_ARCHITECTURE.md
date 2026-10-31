# Monetization Architecture (Batch 08)

A database-backed monetization foundation that integrates with the existing CMS without a
separate affiliate/ad platform. Commercial relationships are kept **strictly separate** from
editorial facts and source verification: an affiliate partner is not an official source, and
a paid placement is not an editorial endorsement.

## Modules

| Path | Responsibility |
|---|---|
| `lib/monetization/url.ts` | Server-side URL validation (dangerous protocols, SSRF/private hosts) — pure |
| `lib/monetization/rel.ts` | Paid-link `rel` policy mapping |
| `lib/monetization/config.ts` | `MonetizationConfiguration` (adsense/click toggles) — OFF by default |
| `lib/monetization/clicks.ts` | Outbound click recording (gated by monetization + analytics switches) |
| `lib/monetization/publicMonetization.ts` | Public read helpers: resolve link, article offers, active ad placements |
| `lib/cms/monetizationService.ts` | RBAC-gated CRUD/reads/dashboard/compliance (+ audit) |
| `lib/cms/monetizationSeed.ts` | Idempotent default disclosure-policy text (no partners/links) |

## Public surfaces

- `app/go/[id]/route.ts` — first-party affiliate redirect (DB-destination-only, 302, safe
  fallback, gated click recording).
- `components/monetization/ArticleMonetization.tsx` — server-rendered offers + disclosure +
  sponsored label on published articles.
- `components/monetization/AdPlacementSlot.tsx` — reserved, labeled ad container (no script).

## Admin

`app/admin/(dashboard)/monetization/page.tsx` (RBAC) → `views/admin/AdminMonetizationPage.tsx`
(prop-driven: Overview, Partners, Links, Ad Placements, Disclosures, Sponsored, Compliance,
Config) → `app/admin/monetization-actions.ts` (Server Actions).

## Entity model (separation of concerns)

```
AffiliatePartner ──< AffiliateProgram ──< AffiliateLink ──< AffiliatePlacement >── Article
       │                                        └──< AffiliateClickAggregate
       ├──< CommercialEntityAssociation  (rodeo hub/event/edition/discipline/category)
       ├──< SponsoredContentRelationship >── Article
       └──< MonetizationDisclosure (partner-specific, optional)
AdPlacement           (logical AdSense slots)
MonetizationConfiguration  (adsense/click/publisher settings — OFF by default)
```

## Honesty & safety invariants

- No revenue/commission/RPM/CPC/conversion/AdSense-approval is ever stored or shown.
- External ad serving and outbound click tracking are disabled by default (owner-gated).
- Only active, verified, in-effect, approved items reach the public site.
- Rodeo event-vs-edition separation is preserved; offers are never auto-copied across years.
- All mutations are server-authorized (default-deny) and audited.
