# 13 — Remaining Work & Roadmap

**Audited:** 2026-11-07

## Owner Actions Required Before Launch

These items require the project owner's decision or action — they cannot be resolved by engineering alone.

| # | Item | Action Required | Priority |
|---|---|---|---|
| 1 | Legal page content | Review and approve 7 legal pages in `config/legalPages.ts`; update `review` field to `'approved'` to remove noindex and draft banner | HIGH |
| 2 | Privacy/analytics decision | Decide whether to enable first-party analytics collection; toggle `collectionEnabled` in Admin → Analytics | MEDIUM |
| 3 | Email provider setup | Configure an email provider (SendGrid, SES, etc.) for email verification and password reset delivery | MEDIUM |
| 4 | AdSense publisher ID | If monetizing: enter Google AdSense publisher ID in Admin → Monetization → Config | LOW |
| 5 | Affiliate partners | If monetizing: create affiliate partners, links, and placements in Admin → Monetization | LOW |
| 6 | Domain & DNS | Final domain configuration, SSL, and CDN setup (Cloudflare/Render) | HIGH |
| 7 | Production database | Verify Aiven PostgreSQL production instance is provisioned and migrated | HIGH |

## Engineering Enhancements (Post-Launch)

These are optional improvements that do not block launch.

| # | Enhancement | Effort | Impact |
|---|---|---|---|
| 1 | CMS-editable section names/taglines | Medium | Allows owner to rename sections without code changes |
| 2 | CMS-editable quick-access links | Low | Allows owner to manage homepage shortcuts from admin |
| 3 | CMS-editable legal pages | High | Full editor for legal page content (currently hardcoded) |
| 4 | Skip-to-content link | Low | Accessibility improvement for keyboard/screen-reader users |
| 5 | `prefers-reduced-motion` support | Low | Respect user motion preferences |
| 6 | Dark mode | Medium | Theme option for user preference |
| 7 | E2E test timeout hardening | Low | Increase timeouts on heavy admin pages to reduce flakiness |
| 8 | External analytics providers | Medium | Connect GSC/GA4 (foundations already built, just need API keys) |
| 9 | Image CDN optimization | Medium | Configure Cloudflare image transforms for responsive serving |
| 10 | Full-text search tuning | Low | Adjust tsvector weights based on real usage patterns |

## What Is Ready Now

The following are fully functional and launch-ready:

- ✅ All 32 public routes render from database
- ✅ 17 admin CMS modules with full CRUD
- ✅ 6-role RBAC with defense-in-depth security
- ✅ Article editorial workflow (Draft → Published → Archived)
- ✅ Rodeo entity management (Hubs, Events, Editions, Venues, Disciplines)
- ✅ Competitor profiles with discipline/participation tracking
- ✅ Competition coverage (Sessions, Results, Standings) with dual-gate publishing
- ✅ EntitySeo + EntityFaq for all landing entities
- ✅ SEO Intelligence system with 17-rule validator and assistant panel
- ✅ First-party analytics pipeline (privacy-safe, off by default)
- ✅ Monetization infrastructure (affiliates, ads, disclosures, sponsored content)
- ✅ Reader accounts with registration, comments, moderation
- ✅ Media library with upload, rights tracking, and media picker
- ✅ Navigation management (CMS-editable)
- ✅ Full-text search with telemetry
- ✅ XML sitemap with all entity types
- ✅ Comprehensive structured data (Article, Event, Person, Place, FAQ, Breadcrumbs)
- ✅ Audit logging on all mutations
- ✅ Rate limiting on auth endpoints
- ✅ 428 unit/integration tests passing
- ✅ 54/56 e2e tests passing (2 flaky timeouts)
