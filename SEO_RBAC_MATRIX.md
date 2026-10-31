# SEO RBAC Matrix (Batch 06 §16)

> Audience: engineers + owner. The SEO Intelligence permission model.
> Owner-approved. Default-deny, server-enforced in `lib/cms/seoService.ts`.

## Permissions

- `seo.audit.run` — run audits (full/scoped) + recheck a finding.
- `seo.audit.view` — view the SEO dashboard and findings.
- `seo.finding.manage` — change finding status, assign, add resolution notes.
- `seo.config` — enable/disable rules and edit editorial thresholds (existing
  permission, reused).

## Matrix (owner-approved)

| Permission | Super Admin | Administrator | Editor | Author | SEO Manager |
|---|:--:|:--:|:--:|:--:|:--:|
| `seo.audit.run` | ✅ | ✅ | ✅ | — | ✅ |
| `seo.audit.view` | ✅ | ✅ | ✅ | ✅ (own) | ✅ |
| `seo.finding.manage` | ✅ | ✅ | ✅ | — | ✅ |
| `seo.config` | ✅ | ✅ | — | — | ✅ |

- **Author** sees findings for **their own articles only** — enforced in the
  service by scoping finding queries to `article.createdById = actor.id`.
  Non-article findings (technical/rodeo/route) are not shown to Authors.
- **Editor** can run content-level + full audits, view and manage findings, but
  cannot change global rule config/thresholds.
- **SEO Manager** has all SEO operations (run/view/manage/config) and no
  unrelated system administration.

## Enforcement & safety

- Every sensitive action re-checks its permission server-side (hidden UI is not
  a security boundary).
- Config validation is server-side; thresholds cannot disable publication
  privacy/security protections (they only tune editorial guidance). Disabling a
  rule never disables the CMS's own publish gate or draft-media privacy.
- The engine makes **no network requests** (no SSRF), and findings expose URLs
  and evidence strings — never unpublished article bodies — so SEO reports are
  not a path to unauthorized content.

Reconciled with the existing RBAC (`RBAC_PERMISSION_MATRIX.md`); no conflict with
the Master Requirements.
