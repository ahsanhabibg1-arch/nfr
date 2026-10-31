# Monetization Disclosure Policy (Batch 08)

Reusable disclosure policies, rendered close to the relevant commercial content (not hidden
only in the footer). This documents the technical implementation; it is **not** a legal
determination of compliance in any jurisdiction — see "Owner/legal review" below.

## Model: `MonetizationDisclosure`

`key` (unique), `scope` (site / article / callout / sponsored / ad / partner), `label`,
`body`, `requiredProminent`, `enabled`, optional `partnerId` (partner-specific).

## Seeded default policies (idempotent, policy text only)

`seedMonetizationDefaults` creates (create-missing-only) generic, editorially-independent
defaults — never any partner/link/revenue:

| key | scope | purpose |
|---|---|---|
| `site-affiliate` | site | site-wide affiliate disclosure |
| `article-affiliate` | article | shown with article affiliate offers |
| `ad-label` | ad | advertisement label |
| `sponsored` | sponsored | sponsored-content disclosure |
| `non-affiliation` | site | PRCA/WPRA/NFR/LVE non-affiliation notice |

## Rendering

- **Article affiliate offers** → the `article-affiliate` body is rendered inside the "Related
  Offers" block, directly adjacent to the links (`ArticleMonetization`).
- **Sponsored content** → a prominent "Sponsored" banner with the sponsor name at the top of
  the commercial block, with `rel="sponsored …"` on paid links.
- **Ads** → each ad container is labeled "Advertisement".

## Sponsored content (`SponsoredContentRelationship`)

Separate from ordinary affiliate links. Carries `sponsorName`, `disclosureLabel`, `rel`
(default `sponsored`), sponsorship dates, review notes, active flag. An ordinary independent
article is **not** marked sponsored merely because it discusses a commercial service.

## Owner / legal review required

The system does not assert legal compliance in every jurisdiction. The owner should review:
exact disclosure wording, prominence/placement requirements (e.g. FTC), paid-link attribute
policy, and any region-specific consent requirements before relying on these defaults in
production.
