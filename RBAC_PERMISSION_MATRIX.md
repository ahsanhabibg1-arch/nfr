# NFRGuide.com — RBAC Permission Matrix (Phase 1 / Batch 03–04)

Single source of truth: `apps/web/lib/auth/rbac.ts` (code-defined, **default-deny**),
mirrored into the DB `Role`/`Permission`/`RolePermission` tables by `roleSync`. Enforced
server-side in `lib/cms/articleService.ts` (articles) and the per-module services via
`lib/cms/guard.ts` (Batch 04) on every operation. Aligned with the Master
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
| `rodeo.manage` *(Batch 04)* | ✅ | ✅ | ✅ | — | — |
| `taxonomy.manage` *(Batch 04)* | ✅ | ✅ | ✅ | — | — |
| `author.manage` *(Batch 04)* | ✅ | ✅ | ✅ | — | — |
| `source.manage` *(Batch 04)* | ✅ | ✅ | ✅ | — | — |
| `navigation.manage` *(Batch 04)* | ✅ | ✅ | — | — | — |

### Batch 04 permission rationale (⚠ pending owner approval — see PHASE1_BATCH04_REPORT §P)
- **Content management** (`rodeo.manage`, `taxonomy.manage`, `author.manage`,
  `source.manage`) is granted to **Editor and above** — these are everyday
  editorial-desk operations over hubs/events/editions, categories/tags, author
  bylines and citations.
- **Site structure** (`navigation.manage`) is restricted to **Administrator and
  Super Admin** — it changes the public header/footer for every page.
- SEO Manager and Author receive none of the Batch 04 permissions. Enforcement
  is verified in `tests/batch04.test.ts` (e.g. Author cannot manage rodeo, SEO
  Manager cannot create sources/authors, Editor cannot manage navigation).

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
# Batch 05 media permissions (provisional; owner confirmation pending)

| Permission | Super Admin | Administrator | Editor | Author | SEO Manager |
|---|:---:|:---:|:---:|:---:|:---:|
| `media.view` | Yes | Yes | Yes | Yes | Yes |
| `media.upload` | Yes | Yes | Yes | Yes | No |
| `media.edit.own` | Yes | Yes | Yes | Yes | No |
| `media.edit.any` | Yes | Yes | Yes | No | Yes |
| `media.delete` | Yes | Yes | No | No | No |
| `media.assign` | Yes | Yes | Yes | Yes | No |
| `seo.audit.run` *(Batch 06)* | Yes | Yes | Yes | No | Yes |
| `seo.audit.view` *(Batch 06)* | Yes | Yes | Yes | Own | Yes |
| `seo.finding.manage` *(Batch 06)* | Yes | Yes | Yes | No | Yes |
| `seo.config` *(reused, Batch 06)* | Yes | Yes | No | No | Yes |

**Batch 06 SEO Intelligence** (owner-approved — see SEO_RBAC_MATRIX.md): content
modules run/view/manage findings at Editor+ (SEO Manager included); Authors view
findings for their **own articles only**; rule/threshold config stays
Admin/SEO-Manager+. Findings are advisory — they never block publishing.

All checks run server-side. `media.assign` does not replace the target domain's
permission: rodeo assignment also requires `rodeo.manage`, and article ownership/
workflow rules continue to apply. This mapping is implemented for local testing
but must be confirmed or changed before production deployment.

## Batch 07 — Analytics & Search permissions (owner-approved)

Six new permissions (see ANALYTICS_RBAC_MATRIX.md for the full grid):
`analytics.view`, `analytics.config`, `analytics.export`, `search.analytics.view`,
`search.config`, `analytics.provider.manage`.

- **Super Admin / Administrator** — all six.
- **Editor** — `analytics.view` + `search.analytics.view`.
- **Author** — `analytics.view` only, **own-scoped** (performance for own articles; no
  site-wide search intelligence).
- **SEO Manager** — `analytics.view`, `analytics.export`, `search.analytics.view`,
  `search.config`, `analytics.provider.manage` (no unrelated system administration).

`analytics.config` (privacy-sensitive collection/retention controls) is Admin/Super
Admin only. Enforced server-side in `lib/cms/analyticsService.ts`, audited, mirrored via
`roleSync`. Public users have no dashboard access (search page only).

## Batch 08 — Monetization permissions (owner-approved)

Seven permissions (full grid in MONETIZATION_RBAC_MATRIX.md): `monetization.view`,
`.partner.manage`, `.link.manage`, `.placement.manage`, `.disclosure.manage`, `.config`,
`.report.view`.

- **Super Admin / Administrator** — all seven.
- **Editor** — `monetization.view` + `monetization.report.view` (assigns approved links/
  disclosures to content via existing `article.edit.*`).
- **Author** — `monetization.view` only; proposes placements on **own** articles via
  `article.edit.own`. Cannot activate partners/links/placements or change settings.
- **SEO Manager** — `monetization.view` + `monetization.report.view` (commercial compliance
  diagnostics); no financial/provider/partner/link/config rights.

`monetization.config` (AdSense/click-tracking/publisher) is Admin/Super Admin only. Enforced
server-side in `lib/cms/monetizationService.ts`, audited, mirrored via `roleSync`. Placement
**activation** always requires `monetization.placement.manage` even when a proposal was
created with article-edit rights.

## Batch 09 — Governance (no new permissions)

Batch 09 added **no new permission strings and changed no roles**. Team & Permissions and
System Settings are gated by the EXISTING permissions, and a centralized registry
(`lib/auth/permissions.ts`) now maps the 12 CMS modules to the permission that gates each view
and drives sidebar visibility + the real (generated) permission matrix. See `RBAC_GOVERNANCE.md`.

| Module | View permission | Visible to |
|---|---|---|
| Team & Permissions | `user.manage` | Super Admin, Administrator |
| System Settings | `system.config` | **Super Admin only** |
| (all other 10 modules) | `cms.access` / `media.view` / `seo.audit.view` / `analytics.view` / `monetization.view` | per existing matrix |

Assignment boundaries (enforced in `teamService`, serializable): only a Super Admin may
grant/remove `super_admin`; no self role/status change; the last active Super Admin is
protected; `role.assign` required for role changes; all changes audited + session-revoking.
The `/admin/account/` page (own password + sessions) is available to any authenticated staff.

## Batch 11 — Landing SEO & FAQ (no new permissions)

The landing SEO/FAQ layer reuses existing permissions — **no new permission strings**:
`rodeo.manage` governs rodeo hub/event/edition **and discipline** SEO/FAQ/field edits;
`taxonomy.manage` governs **category** SEO/FAQ. Server actions only authenticate; the services
enforce the correct per-entity permission (`permForEntity`) + existence + audit — so a category
editor needs `taxonomy.manage` (not `rodeo.manage`). The `/admin/landing-seo/` manager is
reachable by holders of either permission; editing is still gated per entity.
