# 03 — Admin Module Inventory

**Audited:** 2026-11-07

## 17 Admin CMS Modules

| # | Module | Path | View Permission | Service Layer | Server Actions | CRUD Verified |
|---|---|---|---|---|---|---|
| 1 | Overview | `/admin/` | cms.access | adminQueries.ts | — | ✅ Dashboard |
| 2 | Articles | `/admin/articles/` | cms.access | articleService.ts | article-actions.ts | ✅ Full workflow |
| 3 | Rodeo Coverage | `/admin/rodeo-coverage/` | cms.access | rodeoService.ts | rodeo-actions.ts | ✅ Hubs/Events/Editions/Venues/Disciplines |
| 4 | Venues | `/admin/venues/` | cms.access | rodeoService.ts | rodeo-actions.ts | ✅ (shared with Rodeo Coverage) |
| 5 | Competitors | `/admin/competitors/` | cms.access | competitorService.ts | competitor-actions.ts | ✅ Create/Edit/Delete/Disciplines/Participation |
| 6 | Competition Coverage | `/admin/competition/` | cms.access | competitionService.ts | competition-actions.ts | ✅ Sessions/Results/Standings/Verify/Publish |
| 7 | Organization & Taxonomy | `/admin/editorial-organization/` | cms.access | taxonomyService.ts | taxonomy-actions.ts | ✅ Categories/Tags/Authors |
| 8 | Comment Moderation | `/admin/comments/` | comment.view | commentService.ts | comment-actions.ts | ✅ View/Approve/Reject/Hide/Delete |
| 9 | Reader Accounts | `/admin/readers/` | reader.view | readerAdminService.ts | reader-actions.ts | ✅ List/Suspend/Activate/Force-logout/Delete |
| 10 | Media Library | `/admin/media/` | media.view | mediaService.ts | media-actions.ts | ✅ Upload/Edit/Delete/Rights |
| 11 | Sources & References | `/admin/sources/` | cms.access | sourceService.ts | source-actions.ts | ✅ Create/Edit/Delete/Verify |
| 12 | SEO Intelligence | `/admin/seo/` | seo.audit.view | seoService.ts | seo-actions.ts | ✅ Audit/Findings/Config |
| 13 | Landing SEO & FAQ | `/admin/landing-seo/` | cms.access | entitySeoService.ts, faqService.ts, landingAdminService.ts | landing-seo-actions.ts | ✅ SEO overrides + FAQ CRUD for all entity types |
| 14 | Analytics & Search | `/admin/analytics/` | analytics.view | analyticsService.ts | analytics-actions.ts | ✅ Dashboard/Config/Providers |
| 15 | Monetization & Ads | `/admin/monetization/` | monetization.view | monetizationService.ts | monetization-actions.ts | ✅ Partners/Links/Placements/Disclosures/Ads/Config |
| 16 | Team & Permissions | `/admin/team/` | user.manage | teamService.ts | team-actions.ts, invite-actions.ts | ✅ Invite/Roles/Status/Password Reset |
| 17 | System Settings | `/admin/settings/` | system.config | settingsService.ts | settings-actions.ts | ✅ Site config |

## Key Observations

1. **Every module has a dedicated service layer** (in `lib/cms/`) with Zod validation, permission checks via `requireActor()`, and audit logging.
2. **Every module has corresponding server actions** (in `app/admin/`) with `revalidatePath` to update both admin and public pages.
3. **Permission enforcement is server-side** — the UI hides controls for read-only users, but the security boundary is in the service/action layer.
4. **No mock data or decorative buttons found** — all admin controls are wired to real server actions.
5. **Audit logging** is present on all mutating operations.
6. **Optimistic-concurrency control** is implemented in Competition Coverage (version field + conflict detection).
7. **Unsaved-change warnings** are implemented in the article editor and competition coverage.

## RBAC Coverage

| Role | Modules Accessible |
|---|---|
| Super Admin | All 17 |
| Administrator | All except System Settings |
| Editor | Overview, Articles, Rodeo Coverage, Venues, Competitors, Competition, Organization, Media, Sources, SEO (view+manage), Analytics (view), Monetization (view), Comments (view+moderate) |
| Author | Overview, Articles (own), Media (own+browse), SEO (own findings), Analytics (own), Monetization (view) |
| SEO Manager | Overview, Media (view+edit SEO), SEO (full), Analytics (full), Monetization (view+reports) |
| Reader | **NONE** (redirected to public site by `requireCmsAccess()`) |
