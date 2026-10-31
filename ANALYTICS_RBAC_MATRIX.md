# Analytics & Search RBAC Matrix (Batch 07)

Owner-approved. Six new permissions, enforced **server-side** in `lib/cms/analyticsService.ts`
(default-deny) and mirrored into the DB via `roleSync`. The UI only hides controls
cosmetically. Every privileged read/mutation is audited.

## Permissions

| Permission | Grants |
|---|---|
| `analytics.view` | View editorial analytics (content performance, overview) |
| `analytics.config` | Change collection/privacy/retention settings (privacy-sensitive) |
| `analytics.export` | Export aggregate analytics |
| `search.analytics.view` | View internal-search intelligence, content gaps, SEO link |
| `search.config` | Manage search configuration |
| `analytics.provider.manage` | Manage external provider connection references + attempt sync |

## Role → permission

| Role | view | config | export | search.view | search.config | provider.manage |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **Super Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Administrator** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Editor** | ✅ | — | — | ✅ | — | — |
| **Author** | ✅¹ | — | — | — | — | — |
| **SEO Manager** | ✅ | — | ✅ | ✅ | ✅ | ✅ |

¹ **Author is own-scoped**: content performance and overview are restricted to the author's
own articles (`article.createdById = actor.id`); authors cannot see site-wide internal
search intelligence (`searches`/`clicks` are null in their overview).

## Notes

- `analytics.config` (collection toggle, retention, redaction) is **Admin/Super Admin only**
  because it governs privacy-sensitive behavior.
- Public users have **no** dashboard access — only the public `/search/` page.
- Scoping is enforced in the service, not merely in the UI (tested in
  `tests/analytics.test.ts`).
