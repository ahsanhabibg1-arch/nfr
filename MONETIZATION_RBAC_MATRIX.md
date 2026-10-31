# Monetization RBAC Matrix (Batch 08)

Owner-approved. Seven permissions enforced **server-side** in
`lib/cms/monetizationService.ts` (default-deny), mirrored into the DB via `roleSync`, and
audited. The UI only hides controls cosmetically.

## Permissions

| Permission | Grants |
|---|---|
| `monetization.view` | View partners, links, placements, ad config, disclosures |
| `monetization.partner.manage` | Create/edit/verify/activate/delete partners |
| `monetization.link.manage` | Create/edit/activate/delete affiliate links |
| `monetization.placement.manage` | Activate placements; manage ad placements + rodeo associations |
| `monetization.disclosure.manage` | Manage disclosure policies + sponsored content |
| `monetization.config` | Change AdSense/click-tracking/publisher settings |
| `monetization.report.view` | View dashboard reports + commercial-compliance diagnostics |

## Role → permission

| Role | view | partner | link | placement | disclosure | config | report |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **Super Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Administrator** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Editor** | ✅ | — | — | — | — | — | ✅ |
| **Author** | ✅¹ | — | — | — | — | — | — |
| **SEO Manager** | ✅ | — | — | — | — | — | ✅ |

¹ Authors view approved commercial assets and **propose placements on their own articles via
their existing `article.edit.own` right** — not via a monetization permission. Editors
likewise assign approved links/disclosures to content through `article.edit.*`. Neither can
activate partners/links/placements or change global settings.

## Notes

- `monetization.config` (AdSense/click-tracking/publisher) is Admin/Super Admin only.
- SEO Manager sees commercial compliance diagnostics but has no financial/provider/partner/
  link configuration rights.
- Placement **activation** is always `monetization.placement.manage` even though a proposal
  can be created with article-edit rights — tested in `tests/monetization.test.ts`.
- Public users have no monetization dashboard access.
