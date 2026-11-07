# 01 — Repository & Architecture

**Audited:** 2026-11-07 · **Branch:** main · **HEAD:** 7112a90

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.4.3 |
| UI | React | 19.2 |
| Language | TypeScript | strict |
| Styling | Tailwind CSS | v4 |
| ORM | Prisma | 6.19.3 |
| Database | PostgreSQL | (Aiven production / local dev) |
| Object Storage | Cloudflare R2 | (media) |
| Testing (unit) | Vitest | 50 files, 428 tests |
| Testing (e2e) | Playwright + axe | 56 tests |
| Deployment | Render.com | (render.yaml) |

## Repository Structure

```
apps/web/
├── app/                    # Next.js App Router
│   ├── (public)/           # 32 public routes
│   ├── admin/              # 17 CMS modules + auth/actions
│   ├── api/                # 8 API routes
│   └── go/                 # Affiliate redirect
├── components/             # Shared React components
├── config/                 # Route config, legal pages, quick-access
├── data/                   # Mock editorial seed data
├── lib/                    # Core business logic
│   ├── auth/               # RBAC, session, permissions
│   ├── cms/                # 25 service modules
│   ├── analytics/          # First-party analytics pipeline
│   ├── monetization/       # Commercial/affiliate logic
│   ├── search/             # Full-text search engine
│   └── seo-intel/          # SEO analysis rules + analyzers
├── prisma/                 # Schema, migrations, fixtures, bootstrap
├── views/                  # Page-level view components
├── tests/                  # 50 Vitest test files
├── e2e/                    # 9 Playwright spec files
└── docs/                   # Batch documentation
```

## Database Schema Summary

- **50+ models** covering: articles, editorial workflow, SEO, rodeo entities (hubs, events, editions, disciplines), competitors, venues, competition coverage (sessions, results, standings), media assets, analytics, monetization, navigation, readers/comments, authentication, RBAC
- **Full-text search** via PostgreSQL tsvector (weighted: title A, deck/excerpt B, subcategory/type C)
- **Audit logging** on all admin mutations
- **Rate limiting** via durable `RateLimitHit` table

## Authentication & Authorization

- **Database-backed sessions** (SHA-256 hashed tokens)
- **6-role RBAC:** super_admin, administrator, editor, author, seo_manager, reader
- **Default-deny:** reader role has zero admin permissions
- **`requireCmsAccess()`** gate on admin layout — readers cannot reach admin shell
- **`requireActor(perm)`** guard on every server action
- **bcrypt** password hashing (≥12 character minimum)
- **Rate limiting:** 5 registrations/hour, login rate limiting

## Key Architectural Decisions

1. `trailingSlash: true` globally (308 redirect for slashless URLs)
2. `overflow-x: clip` on body (not hidden — preserves position:sticky)
3. Analytics collection disabled by default (privacy gate)
4. External providers (GSC, GA4) are honest `not_connected` foundations
5. No fabricated data anywhere — empty states show honest messages
