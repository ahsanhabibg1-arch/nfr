# Batch 20 §4 — Performance & Streaming Audit

**Method:** inspected rendering directives, `generateStaticParams`, service query patterns, and the production build output. **No change made** — the configuration is already appropriate and no regression was measured (the batch says implement only measured, low-risk improvements).

## Rendering strategy (already well-tuned)
| Page group | Directive | Notes |
|------------|-----------|-------|
| Legal (`about`, `privacy`, `terms`, `editorial-policy`, `corrections`, `affiliate-disclosure`, `contact`) | `dynamic = 'force-static'` | static, no DB at request time |
| Homepage | `revalidate = 60` (ISR) | feeds re-render ≤1/min |
| Article detail, category archive | `revalidate = 60` + `generateStaticParams` | SSG + ISR |
| Competitor/venue/discipline/rodeo | `revalidate = 300` + `generateStaticParams` + `dynamicParams` | SSG for known slugs, on-demand for new |
| Public layout (search index/nav) | `revalidate = 300` | periodic refresh of chrome data |
| Schedule/results/standings, search | dynamic (`ƒ`) | always-fresh coverage/search |
| Admin / API | dynamic + `no-store` | never cached |

Build output: **57/57 static pages** generated; dynamic routes render on demand. Static/dynamic split matches content-freshness needs.

## Query patterns
- No N+1 found: `grep` for `for … await prisma` / `map(async …)` across `lib/cms` + `lib/content.ts` → none. Relations are loaded via Prisma `include`/`select` in single queries (e.g. `getPublicResults` includes discipline+competitor).
- Directory listings use bounded pagination (`batch12Content`).
- FTS uses the generated `searchVector` + GIN index (single indexed query).

## Caching vs editorial correctness
- ISR windows never surface unpublished content: public services filter to published/verified at query time, so a revalidated page only ever contains eligible content.
- Admin + API are `no-store` (security headers), so no stale authenticated data.

## Core Web Vitals risks (observational)
- Google Fonts preconnect + `display=swap` in the root layout (good for CLS/LCP).
- The new loading skeletons (Batch 18/19) improve perceived performance and enable future Suspense streaming on heavy pages.
- Images: `ImageWithCredit` renders managed media; a formal `next/image` optimization pass is a future enhancement (not a measured regression now).

## Decision
No performance code change in Batch 20 — nothing met the "measured, low-risk improvement" bar. Streaming/`next/image` tuning recommended for a later batch (the loading boundaries now in place make streaming a natural next step).
