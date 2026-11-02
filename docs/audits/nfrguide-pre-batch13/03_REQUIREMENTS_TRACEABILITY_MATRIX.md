# 03 — Requirements Traceability Matrix

Status: **V** verified · **I~** implemented-not-fully-verified · **P** partial · **N** not implemented.
Priority: **P0** launch blocker · **P1** launch critical · **P2** important · **P3** enhancement.
"Verification" names how the claim was checked (test / route / read-only query / inspection).

| ID | Requirement | Evidence | Status | Verify | Missing | Pri | Next action |
|---|---|---|---|---|---|---|---|
| R-01 | Custom editorial CMS | 16 admin modules, services, actions | V | tests+routes | — | — | — |
| R-02 | 8-field article model | `articleService`, `editor-fields.test.ts` | V | test | — | — | — |
| R-03 | Editorial workflow lifecycle | workflow history + gate, `cms.test.ts` | V | test | preview UX thin | P2 | add preview |
| R-04 | Server-side RBAC (5 roles) | `rbac.ts` (43 perms), `rbac.test.ts` | V | test | — | — | — |
| R-05 | DB-session auth + hashing | sessions, bcrypt 12, cookie HttpOnly/Lax | V | `auth.test.ts` | prod `secure` cookie confirm on deploy | P1 | verify on host |
| R-06 | Login rate limiting | `lib/auth/rateLimit.ts` | V | test | tune thresholds | P2 | review |
| R-07 | Audit logging | `AuditLog`, `guard.ts` audit() | V | tests | — | — | — |
| R-08 | Published-only public reads | `lib/content.ts` WHERE PUBLISHED | V | `content.test.ts` | — | — | — |
| R-09 | Taxonomy (categories/tags) | taxonomy module/service | V | tests | subcategory UX | P2 | — |
| R-10 | Rodeo hubs/events/editions | `rodeoService`, public pages | V | `rodeo-public.test.ts` | — | — | — |
| R-11 | Disciplines (7) + guide | discipline pages, landing SEO | V | route | — | — | — |
| R-12 | Venues (CMS + public) | `venues/`, `batch12Content` | V | `batch12.test.ts` | no index page | P2 | add `/venues/` |
| R-13 | Competitors (CMS + public) | `competitors/`, junctions | V | `batch12.test.ts` | no index page; no qualification data | P1 | add index + data model |
| R-14 | Polymorphic Landing SEO/FAQ | `entitySeoService`, `faqService` | V | `landing.test.ts` | — | — | — |
| R-15 | PostgreSQL FTS + GIN | generated tsvector, `search.test.ts` | V | test + cloud verify | — | — | — |
| R-16 | Media Library (local+R2) | adapters, `media.test.ts`, `r2-storage` | V | test+live 7/7 | no CDN offload | P2 | custom domain |
| R-17 | Gated media delivery | `/api/media/[...key]` proxy | V | test | — | — | — |
| R-18 | Technical SEO (meta/canonical/sitemap/JSON-LD) | `lib/seo.tsx`, sitemap/robots | V | `seo.test.ts` | outcomes need deployed site | P1(verify) | post-deploy |
| R-19 | SEO Intelligence (rules/scans) | `seoService`, 55 rules seeded | I~ | partial | scheduled scans/worker | P2 | — |
| R-20 | Analytics (first-party, OFF default) | `analyticsService`, event API | V | `analytics.test.ts` | dashboards depth | P2 | — |
| R-21 | Monetization (affiliate/ads/disclosure, OFF) | `monetizationService` | V | `monetization.test.ts` | not a launch dep | P2 | — |
| R-22 | Cloud DB (Aiven) provisioned | migration + verify reports | V | read-only verify | pooling/IP allowlist | P1 | configure |
| R-23 | Local→cloud data migrated | `LOCAL_TO_CLOUD_MIGRATION_REPORT.md` | V | parity check | content is seed/demo | P1 | real content |
| R-24 | Credential hygiene | .env gitignored; redacting scripts | P | inspection | **rotate exposed admin/DB/R2** | **P0** | rotate |
| R-25 | Environment isolation guard | provider/DB separate by convention | P | inspection | no code guard vs mixing | P1 | add guard (next batch) |
| R-26 | NFR-2026 schedules | — | N | schema grep (0) | Schedule model + admin + public | P1 | new batch |
| R-27 | NFR-2026 results/standings | — | N | schema grep (0) | Result/Standing models | P1 | new batch |
| R-28 | Broadcast/streaming guide | — | N | grep (0) | model or editorial-only approach | P1 | decide |
| R-29 | Tickets / trusted purchase links | affiliate links exist; no ticket entity | P | inspection | ticketing surface | P2 | via affiliate |
| R-30 | NFR-2026 landing hub page | — | N | route inventory | dedicated landing | P1 | new batch |
| R-31 | Real verified editorial content | seed only | N | DB counts | research + authoring | P1 | editorial |
| R-32 | Deployment config (CI/env/health/monitoring) | only `next.config.mjs` | N | file inventory | CI/CD, env validation, health, Sentry | P1 | deploy batch |
| R-33 | Backup/recovery procedures | pg_dump used; documented | P | inspection | automated/PITR policy | P1 | document+config |
| R-34 | Accessibility | semantic markup, `<details>` FAQ | I~ | inspection | no automated a11y audit | P2 | add checks |
| R-35 | Core Web Vitals / perf | SSR/ISR present | I~ | inspection | needs deployed-site data | P2 | post-deploy |

**Note:** R-18/R-35 SEO/performance *outcomes* cannot be verified without a deployed site + search-engine
data; only the *controls* are verified here. Content (R-31) and official NFR data (R-26..R-30) must be
researched and human-verified — **never fabricated**.
