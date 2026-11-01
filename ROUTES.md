# NFRGuide.com — Complete Route Inventory & Navigation Map

> Specification: **NFRGuide Developer Master Requirements v2.0 Aligned**

This document catalogs all registered public reader routes and administrative CMS routes in NFRGuide.com, detailing access parameters, route guards, and compatibility handling.

---

## 1. Public Reader Routes

All public routes are defined in `src/config/routes.ts` and mounted in `src/App.tsx`. All canonical URLs enforce the **trailing slash** standard (`/.../`).

| Route Path | Component | Purpose | Eligibility / Guard |
|---|---|---|---|
| `/` | `HomePage` | Concept C 10-section homepage (Sections A through J). | Public |
| `/competition/` | `SectionLandingPage` | Competition department landing: roughstock, timed events, scoring physics. | Public |
| `/entertainment/` | `SectionLandingPage` | Entertainment department landing: concerts, buckle presentations, galas. | Public |
| `/events-shopping/` | `SectionLandingPage` | Events & shopping landing: Cowboy Christmas, trade shows, artisan craftsmanship. | Public |
| `/plan-watch/` | `SectionLandingPage` | Logistics landing: ticket buying guides, arena transport, broadcast rights. | Public |
| `/rodeo-events/` | `SectionLandingPage` | North American circuit coverage: Calgary Stampede, Cheyenne Frontier Days. | Public |
| `/articles/:slug/` | `ArticleDetailPage` | Long-form reading view with secondary deck below H1, TOC, and author bio. | Guarded: Shows neutral unavailable page if `workflowStatus !== 'published'` |
| `/disciplines/:slug/` | `DisciplineGuidePage` | Technical championship guide for one of 7 official rodeo disciplines. | Public (7 routes) |
| `/categories/:slug/` | `CategoryArchivePage` | Faceted editorial article directory with pagination and article-type filters. | Public |

### Legacy & Alternate Route Compatibility Handling
In `src/App.tsx`, client-side compatibility redirects are mounted via `<Navigate to="..." replace />`:
- `/nfr-competition/` &rarr; `/competition/`
- `/nfr-entertainment/` &rarr; `/entertainment/`
- `/nfr-events-and-shopping/` &rarr; `/events-shopping/`
- `/nfr-plan-and-watch/` &rarr; `/plan-watch/`
- `/more-rodeo/` &rarr; `/rodeo-events/`

> **Note on Client-Side vs Production Redirects**:  
> In this Vite + React SPA prototype, redirection is executed on the client via React Router. This is NOT equivalent to an HTTP 301/308 server-level permanent redirect. When migrating to Next.js App Router in Phase 1, these mappings will be configured in `next.config.mjs` redirects to preserve search engine link equity without client round-trips.

### Registered Discipline Championship Guide Routes (`/disciplines/:slug/`)
1. `/disciplines/bareback-riding/` — Bareback Riding Championship Guide
2. `/disciplines/steer-wrestling/` — Steer Wrestling ("Bulldogging") Guide
3. `/disciplines/team-roping/` — Team Roping (Header & Heeler) Mechanics
4. `/disciplines/saddle-bronc-riding/` — Saddle Bronc Riding Classical Form Guide
5. `/disciplines/tie-down-roping/` — Tie-Down Roping Technique & Rules
6. `/disciplines/barrel-racing/` — WPRA Barrel Racing Ground Physics & Turf Analysis
7. `/disciplines/bull-riding/` — Bull Riding Extreme Roughstock Analysis

---

## 2. Administrative CMS Routes (12 Modules)

All admin routes are prefixed with `/admin/` and wrapped inside `AdminShell` (`src/components/admin/AdminShell.tsx`).

| Module # | Route Path | Component | Operational Purpose | Demo Label |
|---|---|---|---|---|
| **01** | `/admin/` | `AdminOverviewPage` | Publishing pulse, recent alerts, draft queue, quick action shortcuts. | Active Demo |
| **02** | `/admin/articles/` | `AdminArticlesPage` | Master article table with workflow tabs, search, filters, and bulk status updates. | Active Demo |
| — | `/admin/articles/new/` | `AdminArticleEditorShell` | Exact 8-field editorial authoring interface for composing new dispatches. | Active Demo |
| — | `/admin/articles/:id/edit/` | `AdminArticleEditorShell` | Full editor for modifying existing articles, blocks, SEO, and taxonomy. | Active Demo |
| **03** | `/admin/rodeo-coverage/` | `AdminRodeoCoveragePage` | Unified coverage module housing Hubs, Events, Editions, Disciplines, and Venues. | Active Demo |
| **04** | `/admin/editorial-organization/` | `AdminEditorialOrgPage` | Taxonomy tags, editorial categories, search keywords, and synonyms. | Active Demo |
| **05** | `/admin/media/` | `AdminMediaPage` | Media asset library with licensing clearance and ALT text tracking. | Active Demo |
| **06** | `/admin/sources/` | `AdminSourcesPage` | Primary source directory (PRCA rulebooks, WPRA records, judicial manuals). | Active Demo |
| **07** | `/admin/seo/` | `AdminSEOPage` | 12 SEO rule groups audit dashboard, SERP simulator, and site health metrics. | Active Demo |
| **08** | `/admin/website/` | `AdminWebsitePage` | Homepage section builder, hero article pin selection, menu management. | Active Demo |
| **09** | `/admin/analytics/` | `AdminAnalyticsPage` | Editorial readership performance, scroll depth, session duration metrics. | Active Demo |
| **10** | `/admin/monetization/` | `AdminMonetizationPage` | Commercial disclosure tracking, affiliate partner links, and FTC compliance. | Active Demo |
| **11** | `/admin/team/` | `AdminTeamPage` | 5-role permission model (Super Admin, Admin, Editor, Author, SEO Manager). | Active Demo |
| **12** | `/admin/settings/` | `AdminSettingsPage` | Canonical domain config, RSS feeds, robots.txt, and demo store reset. | Active Demo |

---

## 3. Client-Side Routing Architecture & Boundaries

- **Engine**: React Router 7 (`react-router-dom`) with HTML5 history API.
- **Scroll Restoration**: Automatic scroll-to-top on route change implemented in `src/App.tsx`.
- **404 Handling**: Wildcard route (`*`) redirects unmapped paths to a dedicated editorial 404 page with breadcrumb navigation back to `/`.
- **Trailing Slash Normalization**: Route helper functions in `src/config/routes.ts` enforce consistent trailing slashes across all internal navigation anchors.

---

# Phase 1 / Batch 01 — Next.js App Router Route Map

> Added 2026-10-28. Routes below are implemented in `apps/web/app` using file-based
> App Router. Canonical trailing slash enforced via `trailingSlash: true`.

## Public routes
| Path | File | Rendering |
|---|---|---|
| `/` | `app/(public)/page.tsx` | Static shell + server metadata |
| `/competition/`, `/entertainment/`, `/events-shopping/`, `/plan-watch/`, `/rodeo-events/` | `app/(public)/[section]/page.tsx` | SSG (`generateStaticParams`, `dynamicParams=false`) |
| `/articles/[slug]/` | `app/(public)/articles/[slug]/page.tsx` | SSG (published only); unknown/unpublished → 404 |
| `/disciplines/[slug]/` | `app/(public)/disciplines/[slug]/page.tsx` | SSG (7) |
| `/categories/[slug]/` | `app/(public)/categories/[slug]/page.tsx` | Dynamic + server metadata |
| `/robots.txt` | `app/robots.ts` | Generated |
| `/sitemap.xml` | `app/sitemap.ts` | Generated (published URLs only; admin excluded) |
| `*` | `app/not-found.tsx` | 404 |

## Server-level permanent redirects (HTTP 308) — `next.config.mjs`
- `/nfr-competition/` → `/competition/`
- `/nfr-entertainment/` → `/entertainment/`
- `/nfr-events-and-shopping/` → `/events-shopping/`
- `/nfr-plan-and-watch/` → `/plan-watch/`
- `/more-rodeo/` → `/rodeo-events/`

(Each also has a `/:path*` wildcard variant.) These replace the Phase 0 client-side
`<Navigate>` redirects with true HTTP permanent redirects. The trailing-slash form is
a single hop; the no-slash form passes through Next's trailing-slash normalization
first (inherent to `trailingSlash: true`).

## Admin routes
All under `app/admin/` (dynamic, `noindex`, disallowed in robots): `/admin/`,
`/admin/articles/`, `/admin/articles/new/`, `/admin/articles/[id]/edit/`,
`/admin/rodeo-coverage/`, `/admin/editorial-organization/`, `/admin/media/`,
`/admin/sources/`, `/admin/seo/`, `/admin/website/`, `/admin/analytics/`,
`/admin/monetization/`, `/admin/team/`, `/admin/settings/`.

---

# Phase 1 / Batch 10 — Public Rodeo Entity Routes (2026-11-01)

Nested under the `/rodeo-events/` section (trailing-slash, indexable). Hubs and recurring
events share the depth-1 namespace; cross-table slug uniqueness is enforced on write.

| Path | File | Rendering |
|---|---|---|
| `/rodeo-events/` | `app/(public)/rodeo-events/page.tsx` | Static section landing + DB hub/event directory (the `[section]` route excludes `rodeo-events`) |
| `/rodeo-events/<slug>/` | `app/(public)/rodeo-events/[slug]/page.tsx` | Resolves a **hub or recurring event** (event precedence); 404 if neither; `noindex` when content-less |
| `/rodeo-events/<event>/<edition>/` | `app/(public)/rodeo-events/[slug]/[edition]/page.tsx` | Annual edition; enforces the edition belongs to the parent event; `Event` JSON-LD only when dates are verified |

Admin additions (Batch 09, outside the sidebar modules): `/admin/account/` (any staff);
public, unauthenticated setup links `/admin/accept-invitation/` and `/admin/reset-password/`.
First-party affiliate redirect (Batch 08): `/go/[id]/`.

Rodeo hubs/events/editions are included in the public search page (`/search/`, type filter
`rodeo`) and the XML sitemap. Disciplines keep their canonical `/disciplines/<slug>/` — no
discipline-in-edition URLs (avoids duplicate canonicals).
