# NFRGuide.com — Migration Status (Phase 1 / Batch 01)

**Updated:** 2026-10-28 · **Branch:** `batch-01-nextjs-migration`

## Applications

| App | Location | Stack | Status |
|---|---|---|---|
| Phase 0 reference | repo root | React 19 + Vite 8 + React Router 7 (SPA) | **Preserved, unchanged, buildable** |
| Phase 1 target | `apps/web/` | Next.js 16.4.3 App Router + React 19 + Tailwind v4 | **Running locally; build passes** |

The Vite app is intentionally retained until migration parity is signed off. Do
not delete it yet.

## Batch 01 Completion Criteria (§18)

| # | Criterion | Status |
|---|---|---|
| 1 | Original baseline recorded | ✅ lint/test/build captured (all pass) |
| 2 | Next.js app runs locally | ✅ `npm run dev` / `npm run start` |
| 3 | Public routes render correctly | ✅ home, 5 sections, article, discipline, category |
| 4 | Admin module routes render | ✅ 12 modules + editor (browser-verified) |
| 5 | Existing design preserved | ✅ Concept C tokens/fonts/layout reused; no redesign |
| 6 | Article editor usable as demo | ✅ 8 fields, workflow, blocks, validation render |
| 7 | Server-rendered public pages | ✅ Server Components + SSG/static |
| 8 | Per-route metadata | ✅ Metadata API (title/desc/canonical/OG/JSON-LD) |
| 9 | Redirects at HTTP level | ✅ 308 permanent for 5 legacy paths |
| 10 | Public content eligibility respected | ✅ published-only adapter; unknown/unpublished → 404 |
| 11 | Build and TypeScript checks pass | ✅ `next build` + `tsc --noEmit` exit 0 |
| 12 | Migration status + limitations documented | ✅ this file + KNOWN_LIMITATIONS.md + PHASE1_BATCH01_REPORT.md |

## Feature Parity

| Area | Phase 0 (Vite) | Batch 01 (Next) | Notes |
|---|---|---|---|
| Public pages | ✅ | ✅ | Server-rendered; design preserved |
| Legacy redirects | client `<Navigate>` | ✅ HTTP 308 | chain only for no-slash inbound (trailingSlash normalization) |
| SEO metadata | client DOM injection | ✅ server Metadata API | genuine improvement |
| Sitemap/robots | robots.txt only (sitemap 404) | ✅ generated `sitemap.xml` + `robots.txt` | new |
| Admin CMS UI (12) | ✅ | ✅ | ported, dynamic, noindex |
| Article editor | ✅ | ✅ | preserved + §14 fixes |
| Article persistence | sessionStorage (client) | sessionStorage (client, admin-only) | **not** server state; public reads static seed |
| Auth / RBAC | simulated | simulated (unchanged) | out of Batch 01 scope |
| Media upload | mock | mock (unchanged) | out of scope |
| SEO scanning | simulated | simulated (unchanged) | out of scope |

## Unmigrated / Out of Scope (by design, §17)

PostgreSQL/Prisma, production auth, server RBAC, CMS CRUD persistence, object
storage, scheduled-publishing jobs, SEO scan worker, production deployment.

## Local Commands

```bash
# Phase 0 reference app (repo root)
npm install --legacy-peer-deps
npm run dev            # Vite dev server :3000
npm run build          # vite build
npm test               # tsx tests/runner.ts

# Phase 1 Next.js app
cd apps/web
npm install
npm run dev            # next dev :3000
npm run build          # next build (also type-checks)
npm run start          # next start :3000 (needs a build first)
npm run typecheck      # tsc --noEmit
npm run test           # vitest unit suites
npm run test:routes    # HTTP route smoke (requires a running `npm run start`)
```

## Batch 02 Prerequisites

Owner sign-off on §K decisions (PHASE1_BATCH01_REPORT.md): package manager,
frozen NFR URLs, Next 16/React 19, `apps/web` layout, deployment/auth/DB choices.
Then Batch 02 replaces `lib/content.ts` reads with Prisma/PostgreSQL behind the
same function signatures.
