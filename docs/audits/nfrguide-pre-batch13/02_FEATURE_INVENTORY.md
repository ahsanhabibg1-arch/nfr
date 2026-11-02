# 02 — Feature Inventory (evidence-based)

Read-only. Evidence = file paths / routes / models / tests. Status key: **V** verified,
**I~** implemented-not-fully-verified, **P** partial, **N** not implemented.

## Public routes (`app/(public)/`)
| Route | File | Data source | Status |
|---|---|---|---|
| Home | `(public)/page.tsx` | `lib/content.ts` feeds (published-only) | V |
| Section landing ×5 | `(public)/[section]/page.tsx` | `PRIMARY_SECTIONS` + published articles | V |
| Article detail | `(public)/articles/[slug]/page.tsx` | `getPublishedArticleBySlug` | V |
| Category | `(public)/categories/[slug]/page.tsx` | `getCategoryBySlug` + articles | V |
| Discipline | `(public)/disciplines/[slug]/page.tsx` | `getDisciplineBySlug` + SEO/FAQ | V |
| Rodeo hub/event | `(public)/rodeo-events/[slug]/page.tsx` | `rodeoContent.ts` resolver | V |
| Event edition | `(public)/rodeo-events/[slug]/[edition]/page.tsx` | `getPublicEditionBySlug` | V |
| Rodeo index | `(public)/rodeo-events/page.tsx` | hubs+events list | V |
| Venue detail | `(public)/venues/[slug]/page.tsx` | `batch12Content.ts` | V |
| Competitor detail | `(public)/competitors/[slug]/page.tsx` | `batch12Content.ts` | V |
| Search | `(public)/search/page.tsx` | FTS `$queryRaw` | V |
| Sitemap / robots | `app/sitemap.ts`, `app/robots.ts` | published-only | V |
| **Competitor index** `/competitors/` | — | — | **N** (only `[slug]`) |
| **Venue index** `/venues/` | — | — | **N** (only `[slug]`) |
| **NFR-2026 landing hub** | — | — | **N** |

## Admin CMS modules (`app/admin/(dashboard)/`)
| Module | Page | Service / actions | Status |
|---|---|---|---|
| Dashboard/overview | `page.tsx` | permission registry | V |
| Articles (list/new/edit) | `articles/*` | `articleService` + `article-actions` | V (8-field editor, workflow) |
| Rodeo coverage | `rodeo-coverage/` | `rodeoService` + `rodeo-actions` | V |
| Venues | `venues/` | `rodeoService` + `rodeo-actions` | V (Batch 12) |
| Competitors | `competitors/` | `competitorService` + `competitor-actions` | V (Batch 12) |
| Editorial org / taxonomy | `editorial-organization/` | `taxonomyService` | V |
| Media Library | `media/` | `mediaService` + `media-actions` | V |
| Landing SEO & FAQ | `landing-seo/` | `landingAdminService` | V (7 entity types) |
| SEO Intelligence | `seo/` | `seoService` | I~ (rules seeded; scans manual) |
| Analytics & Search | `analytics/` | `analyticsService` | V (collection OFF by default) |
| Monetization & Ads | `monetization/` | `monetizationService` | V (disabled by default) |
| Website & Navigation | `website/` | `navigation-actions` | V |
| Team & Permissions | `team/` | `teamService` + `team-actions` | V |
| System Settings | `settings/` | `settings-actions` | V (Super Admin only) |
| Sources & References | `sources/` | `source-actions` | V |
| Account (self) | `account/` | `account-actions` | V |

## API routes
- `api/media/[...key]/route.ts` — gated media delivery proxy (V).
- `api/admin/media/upload/route.ts` — authenticated upload (V).
- `api/analytics/event/route.ts` — first-party event ingest (collection OFF by default) (V).

## Core capabilities (evidence)
- **Auth/RBAC:** DB sessions, bcrypt cost 12, `nfrguide_session` HttpOnly+SameSite=Lax cookie, login
  rate-limit (`lib/auth/rateLimit.ts`), default-deny RBAC (`lib/auth/rbac.ts`, 5 roles / 43 perms),
  audit logging (`AuditLog`). Tests: `auth.test.ts`, `rbac.test.ts`, `team.test.ts`, `permissions-unit`.
- **Editorial:** 8 approved article fields, workflow Draft→Review→Approved→Scheduled→Published→Archived,
  revisions + optimistic `version`, publication gate. Tests: `cms.test.ts`, `editor-fields.test.ts`,
  `eligibility.test.ts`.
- **SEO:** `buildMetadata`, canonical/robots, Article/Discipline/Event/Place/Person/FAQPage/Breadcrumb
  JSON-LD, sitemap (published + indexable only). Tests: `seo.test.ts`, `seoValidator.test.ts`, `seo-intel`.
- **FTS:** generated `Article.searchVector` tsvector + GIN, `websearch_to_tsquery`. Tests: `search.test.ts`.
- **Media:** local + R2 adapters, magic-byte/MIME/size validation, Sharp derivatives, SHA-256 dedup,
  rights gate, gated delivery. Tests: `media.test.ts`, `r2-storage.test.ts`.
- **Monetization:** affiliate partners/links/placements, ad placements, disclosures, sponsored labeling —
  all disabled by default. Tests: `monetization.test.ts`, `monetization-unit.test.ts`.
- **Analytics:** first-party events + daily rollups + provider foundation; collection OFF by default.
  Tests: `analytics.test.ts`, `search.test.ts`.

## Not implemented / missing (requirement-relevant)
- NFR-2026 data: **Schedule, Result, Standing/Ranking, Broadcast, Ticket, Stream** models (0 in schema).
- Public **index pages** for competitors and venues; a dedicated **NFR-2026 landing hub**.
- **Deployment**: CI/CD, env-var validation, health endpoint, error monitoring, host/deploy config.
