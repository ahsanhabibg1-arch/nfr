# 02 — Requirements → Implementation Traceability Matrix

**Mode:** READ-ONLY. Classification legend:
`VERIFIED` (implemented + evidence of runtime/test verification) · `IMPL-NOT-RTV` (implemented, not independently runtime-verified in this audit) · `PARTIAL` · `UI/MOCK` · `DOCS-ONLY` · `MISSING` · `BLOCKED` · `DEFERRED`.

> Note: In this audit, "VERIFIED" at code level means code + schema + static checks (tsc/prisma validate) confirm it. Full runtime test execution (Vitest suite, build, Playwright) was **NOT EXECUTED** (needs test DB/network) — those items are capped at `IMPL-NOT-RTV` regardless of prior reports. Prior green test reports are noted but not treated as this audit's evidence.

## A. Core platform

| Req | Status | Evidence |
|-----|--------|----------|
| Next.js 16 App Router SSR (replaces Phase 0 Vite SPA) | VERIFIED | `apps/web/app/**`, `next.config.mjs`, `package.json` next 16.4.3 |
| Typed data contracts (TS 7) | VERIFIED | `tsc --noEmit` exit 0 (this audit) |
| Prisma + PostgreSQL relational model | VERIFIED | `prisma/schema.prisma` (1,479 lines), `prisma validate` OK |
| Ordered migration history | VERIFIED | 12 migrations `20261028…init` → `20261102…batch14` |
| Full-text search (`Article.searchVector` tsvector + GIN) | VERIFIED | `migrations/…batch07…/migration.sql:155-165` |

## B. Public website (5-section IA + rodeo entities)

| Req | Status | Evidence |
|-----|--------|----------|
| 5 primary sections (Competition / Entertainment / Events-Shopping / Plan-Watch / More Rodeo) | IMPL-NOT-RTV | `config/routes.ts` PRIMARY_SECTIONS; `app/(public)/[section]/page.tsx` |
| Article detail + JSON-LD | IMPL-NOT-RTV | `app/(public)/articles/[slug]/page.tsx`; `lib/seo.tsx articleJsonLd` |
| Category archives | IMPL-NOT-RTV | `app/(public)/categories/[slug]/page.tsx` |
| Discipline guides (7 disciplines) | IMPL-NOT-RTV | `app/(public)/disciplines/[slug]/page.tsx`; `Discipline` model |
| Rodeo hubs / events / editions | IMPL-NOT-RTV | `app/(public)/rodeo-events/[slug]/[edition]/page.tsx` + models |
| Competition schedule / results / standings (edition-scoped) | IMPL-NOT-RTV | `…/[edition]/{schedule,results,standings}/page.tsx`; Batch 14 models |
| Venue directory + profiles | IMPL-NOT-RTV | `app/(public)/venues/page.tsx`, `venues/[slug]/page.tsx` |
| Competitor directory + profiles | IMPL-NOT-RTV | `app/(public)/competitors/page.tsx`, `competitors/[slug]/page.tsx` |
| Internal search (noindex) | IMPL-NOT-RTV | `app/(public)/search/page.tsx`; `search-unit.test.ts` |
| Legal pages (about/privacy/terms/editorial-policy/corrections/affiliate-disclosure/contact) | IMPL-NOT-RTV | `app/(public)/{about,privacy,terms,editorial-policy,corrections,affiliate-disclosure,contact}/page.tsx` |
| Draft/unpublished server-side isolation | IMPL-NOT-RTV | eligibility filtering in services; `tests/eligibility.test.ts`, `public-content.test.ts` |

## C. Admin CMS (16 modules)

| Module | Status | Evidence (route + action) |
|--------|--------|---------------------------|
| Dashboard | IMPL-NOT-RTV | `app/admin/(dashboard)/page.tsx` |
| Articles (create/edit + workflow) | IMPL-NOT-RTV | `articles/{new,[id]/edit,}/page.tsx`; `article-actions.ts` |
| Author bylines (DB-backed) | IMPL-NOT-RTV | `taxonomy-actions.ts` author CRUD; `Author` model; `batch16.test.ts` |
| Taxonomy (categories/tags) | IMPL-NOT-RTV | `editorial-organization/page.tsx`; `taxonomy-actions.ts` |
| Rodeo coverage (hub/event/edition) | IMPL-NOT-RTV | `rodeo-coverage/page.tsx`; `rodeo-actions.ts` |
| Competitors | IMPL-NOT-RTV | `competitors/page.tsx`; `competitor-actions.ts` |
| Venues | IMPL-NOT-RTV | `venues/page.tsx` (admin); `rodeo-actions.ts`/`competitor-actions.ts` |
| Competition sessions/results/standings | PARTIAL | `competition/page.tsx`; `competition-actions.ts` — **no optimistic concurrency** (see report 05) |
| Media Library | IMPL-NOT-RTV | `media/page.tsx`; `media-actions.ts`; `api/admin/media/upload` |
| Sources & references | IMPL-NOT-RTV | `sources/page.tsx`; `source-actions.ts` |
| SEO Intelligence | IMPL-NOT-RTV | `seo/page.tsx`; `seo-actions.ts`; `lib/seo-intel` |
| Landing SEO + Entity FAQ | IMPL-NOT-RTV | `landing-seo/page.tsx`; `landing-seo-actions.ts`; `EntitySeo`/`EntityFaq` models |
| Navigation + homepage (website) | IMPL-NOT-RTV | `website/page.tsx`; `navigation-actions.ts` |
| Analytics | IMPL-NOT-RTV | `analytics/page.tsx`; `analytics-actions.ts` |
| Monetization | IMPL-NOT-RTV | `monetization/page.tsx`; `monetization-actions.ts` |
| Team & RBAC + Settings | IMPL-NOT-RTV | `team/page.tsx`, `settings/page.tsx`; `team-actions.ts`, `settings-actions.ts` |

## D. Security / infra

| Req | Status | Evidence |
|-----|--------|----------|
| DB-session auth (SHA-256 token, HttpOnly cookie) | IMPL-NOT-RTV | `lib/auth/session.ts` |
| bcrypt password hashing (cost 12) | IMPL-NOT-RTV | `lib/auth/password.ts` |
| Default-deny RBAC (roles/permissions) | IMPL-NOT-RTV | `guard.ts requireActor`; `RBAC_PERMISSION_MATRIX.md`; `permissions-unit.test.ts` |
| Audit logging | IMPL-NOT-RTV | `guard.ts audit()`; `AuditLog` model |
| Env validation + isolation guard | IMPL-NOT-RTV | `lib/env.ts`, `lib/env-guard.ts` |
| Security headers | PARTIAL | `next.config.mjs` (HSTS/X-Frame/nosniff/referrer/permissions) — **no CSP** |
| Health/readiness endpoints | IMPL-NOT-RTV | `app/api/health`, `app/api/ready` |
| Gated media delivery (private bucket) | IMPL-NOT-RTV | `app/api/media/[...key]/route.ts` |
| Aiven production DB deploy | BLOCKED (verify) | docs claim deployed; **not re-verified** (no cloud connection in audit) |
| Cloudflare R2 activation | BLOCKED (verify) | docs claim active; **not re-verified** |

## E. Content / editorial readiness

| Req | Status | Evidence |
|-----|--------|----------|
| NFR 2026 verified editorial content | MISSING / BLOCKED | No `NFR 2026`/`nfr-2026` content found in `prisma/`, `app/`, `lib/` (grep empty). Infra ready, content absent. |
| Credential rotation (Admin/Aiven/R2) | MISSING (mandatory pre-launch) | Previously-exposed secrets; rotation deferred by owner — **launch blocker** |

## F. Documentation-vs-code mismatches
- `KNOWN_LIMITATIONS.md` §1–4 still describes **Phase 0** (Vite SPA, sessionStorage, DEMO roles, no DB). The implemented app is Next.js SSR with real DB auth. The document's opening sections are **stale** relative to current code. (Later sections may be updated; opening preamble is misleading.)
- Requirements source present: `NFR_REQUIRMENT/` directory at repo root (original master requirements) — confirmed present, not missing.
