# Batch 19 §A — Admin Module Inventory

Evidence: `app/admin/(dashboard)/*/page.tsx`, `app/admin/*-actions.ts`, `lib/cms/*`, `views/admin/*`. All modules gated by `(dashboard)/layout.tsx` → `requireUser()` (redirect to login) and per-action `requireActor(perm)` (default-deny) + audit log.

| # | Module | Route | Server actions | Persistence/service |
|---|--------|-------|----------------|---------------------|
| 1 | Dashboard / overview | `(dashboard)/page.tsx` | — (read) | `lib/cms/adminQueries.getDashboardData` |
| 2 | Articles + editorial workflow | `articles/{,new,[id]/edit}` | `article-actions.ts` | `articleService` (save, transition, restoreRevision; optimistic `version`) |
| 3 | Taxonomy (categories/tags) + Authors | `editorial-organization` | `taxonomy-actions.ts` | `taxonomyService` (author CRUD + orphan guard) |
| 4 | Rodeo hubs/events/editions | `rodeo-coverage` | `rodeo-actions.ts` | `rodeoService` |
| 5 | Competitors + participations | `competitors` | `competitor-actions.ts` | `competitorService` |
| 6 | Venues | `venues` | `rodeo-actions.ts`/`competitor-actions.ts` | venue services |
| 7 | Competition sessions/results/standings | `competition` | `competition-actions.ts` | `competitionService` (Batch 17 concurrency) |
| 8 | Media library + uploads | `media` + `api/admin/media/upload` | `media-actions.ts` | `mediaService` (sharp, gated delivery, Batch 17 upload rate-limit) |
| 9 | Sources & references | `sources` | `source-actions.ts` | `sourceService` |
| 10 | SEO Intelligence | `seo` | `seo-actions.ts` | `lib/seo-intel` (rule registry, audit runs) |
| 11 | Landing SEO + Entity FAQ | `landing-seo` | `landing-seo-actions.ts` | `EntitySeo`/`EntityFaq` services |
| 12 | Website / navigation / homepage | `website` | `navigation-actions.ts` | `navigationService` |
| 13 | Analytics | `analytics` | `analytics-actions.ts` | analytics services + providers |
| 14 | Monetization | `monetization` | `monetization-actions.ts` | monetization services |
| 15 | Team & RBAC + invitations | `team` | `team-actions.ts`, `invite-actions.ts` | users/roles/invitations |
| 16 | Settings / system config | `settings` | `settings-actions.ts` | `SystemSetting` |
| — | Account self-service | `account` | `account-actions.ts` | password/profile |

**Total modules assessed: 16** (+ account self-service). Every module has a list/detail UI, real server actions, RBAC, and audit logging. Entertainment/events content is handled via the Articles module + section taxonomy (no separate module required).
