# Batch 23 §3 — Requirements Traceability

Source: `NFR_REQUIRMENT/`, root architecture/requirements docs, and the implemented code. Status: **IMPL&TESTED** · **IMPL-not-fully-verified** · **PARTIAL** · **MISSING** · **DEFERRED** (prior owner decision) · **EXT-INFRA** (needs external infrastructure). No requirements invented.

| Requirement | Status | Evidence |
|-------------|:------:|----------|
| NFR editorial IA (5 primary sections) | IMPL&TESTED | `config/routes.ts` PRIMARY_SECTIONS; `app/(public)/[section]`; e2e "header links all five sections" |
| Permanent rodeo hubs | IMPL-not-fully-verified | `RodeoHub` + `/rodeo-events/[slug]`; `rodeo-public.test.ts` |
| Rodeo events + annual editions | IMPL&TESTED | `RodeoEvent`/`RodeoEventEdition`; `/rodeo-events/[slug]/[edition]`; `batch14.test.ts` |
| Competitor profiles + event associations | IMPL&TESTED | `Competitor`/`CompetitorParticipation`/`ArticleCompetitor`; `/competitors/[slug]`; `batch12.test.ts` |
| Venues | IMPL&TESTED | `Venue` + `/venues/[slug]`; `batch12.test.ts` |
| Schedules / results / standings | IMPL&TESTED | `Competition{Session,Result,Standing}`; `.../[edition]/{schedule,results,standings}`; `batch14.test.ts`, `batch17-concurrency.test.ts` |
| Articles + editorial workflow | IMPL&TESTED | `Article` + workflow/revisions; `cms.test.ts`, `batch16.test.ts` |
| Categories & taxonomy | IMPL&TESTED | `Category`/`Tag`/`Author`; `taxonomy` services; `cms.test.ts` |
| SEO metadata + structured data | IMPL&TESTED | `lib/seo.tsx` (Article/NewsArticle/Event/Place/Person/Breadcrumb/FAQ); `seo*.test.ts`; e2e JSON-LD checks |
| Landing-page SEO + FAQs | IMPL&TESTED | `EntitySeo`/`EntityFaq`; `/admin/landing-seo`; `landing*.test.ts` |
| Search + navigation | IMPL&TESTED | FTS `searchVector`+GIN; `/search` filters; nav + mobile drawer; `search*.test.ts`, e2e |
| Media management (DAM) | IMPL&TESTED | `MediaAsset`, gated proxy, upload (RBAC+rate-limit+signature); `media*.test.ts` |
| Monetization + affiliate | IMPL-not-fully-verified | `Affiliate*`/`AdPlacement`/`MonetizationDisclosure`; `monetization*.test.ts` |
| Admin dashboard + operational modules | IMPL&TESTED | 16 modules; DB-backed dashboard; e2e "every sidebar module loads" |
| Auth + permissions + audit logging | IMPL&TESTED | DB sessions, default-deny RBAC, `AuditLog`; `auth/rbac/governance/team` tests |
| Public loading/error + admin loading/error states | IMPL&TESTED | Batch 18/19 boundaries; `batch18-ui`/`batch19-admin-ui` tests |
| Rate limiting (login + upload) | IMPL&TESTED | durable limiter, atomic gate (Batch 23), fail-closed; `batch21/22/23` tests |
| Health / readiness endpoints | IMPL&TESTED | `/api/health`, `/api/ready` → 200 |
| CSP report-only + first-party receiver | IMPL&TESTED | `next.config.mjs`; `/api/csp-report`; verified live |
| **NFR 2026 verified editorial content** | MISSING (content-blocked) | infra ready; requires source-verified human entry (never fabricated) |
| Credential rotation / least-priv DB role / Aiven CA | EXT-INFRA | owner/ops (reports 04, 09) |
| Host / CD / staging / backup-PITR / rollback | EXT-INFRA | owner/ops (reports 04–07, 09) |
| Scheduled auto-publish | DEFERRED | manual-publish by prior owner decision (Batch A/D8) |
| External analytics (GA4/GSC) data | DEFERRED | models/connections present; no fabricated metrics until approved integration |
| External error monitoring (APM) | DEFERRED | `report()` ready; no provider wired (approval-gated) |

## Coverage summary
- **Application requirements: implemented** (editorial IA, rodeo entities, competition coverage, CMS, SEO, search, media, auth/RBAC, UX states, rate-limiting). 409 Vitest + 45 Playwright/axe green; build 57/57.
- **Outstanding is non-code:** NFR 2026 verified content (editorial), credential rotation + least-priv role + Aiven CA + host/CD/staging/backup (owner/ops), and a few DEFERRED-by-decision items.
- No unrelated features were built in this batch.
