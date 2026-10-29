# NFRGuide.com — RBAC Permission Matrix (Phase 1 / Batch 03)

Single source of truth: `apps/web/lib/auth/rbac.ts` (code-defined, **default-deny**),
mirrored into the DB `Role`/`Permission`/`RolePermission` tables by `roleSync`. Enforced
server-side in `lib/cms/articleService.ts` on every operation. Aligned with the Master
Requirements §5.1/§6/§10 and the approved `PERMISSION_MATRIX` (Team module).

| Permission | Super Admin | Administrator | Editor | Author | SEO Manager |
|---|:--:|:--:|:--:|:--:|:--:|
| `cms.access` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `article.create` | ✅ | ✅ | ✅ | ✅ | — |
| `article.edit.own` | ✅ | ✅ | ✅ | ✅ | — |
| `article.edit.any` | ✅ | ✅ | ✅ | — | — |
| `article.submit` (→ In Review) | ✅ | ✅ | ✅ | ✅ | — |
| `article.review` (request changes) | ✅ | ✅ | ✅ | — | — |
| `article.approve` | ✅ | ✅ | ✅ | — | — |
| `article.publish` (publish/unpublish/archive) | ✅ | ✅ | ✅ | — | — |
| `article.schedule` | ✅ | ✅ | ✅ | — | — |
| `article.delete` | ✅ | ✅ | — | — | — |
| `seo.config` (SEO Intelligence module) | ✅ | ✅ | — | — | ✅ |
| `user.manage` | ✅ | ✅ | — | — | — |
| `role.assign` | ✅ | ✅ | — | — | — |
| `system.config` | ✅ | — | — | — | — |

## Ownership rules
- **Author** may edit/submit only **their own** articles (`createdById === user.id`) and
  only while in `draft`/`in_review` (not published/archived).
- **Editor/Admin/Super Admin** (`article.edit.any`) may edit any article in any state.
- An Author attempting to publish, approve, delete, or edit another author's article is
  rejected server-side (`forbidden`). Verified by the security tests.

## Workflow transition → required permission
| From → To | Permission |
|---|---|
| Draft → In Review | `article.submit` (own, unless reviewer) |
| In Review → Approved | `article.approve` |
| In Review → Draft (request changes) | `article.review` |
| Approved → Scheduled | `article.schedule` |
| Approved → Published | `article.publish` (+ publication gate) |
| Approved → Draft | `article.review` |
| Scheduled → Published | `article.publish` (+ gate) |
| Scheduled → Approved (unschedule) | `article.schedule` |
| Published → Draft (unpublish) | `article.publish` |
| Published → Archived | `article.publish` |
| Archived → Draft (restore) | `article.edit.any` |

Any transition not in this table is rejected (`invalid_transition`). Going to Published
additionally runs the Category A/B publication gate (`validateArticle`); failures return
`validation` and the article stays unpublished.
