# NFRGuide.com — System Architecture & Design System

> Specification: **NFRGuide Developer Master Requirements v2.0 Aligned**

This document outlines the architectural principles, component structure, data boundaries, and design system specifications of NFRGuide.com.

---

## 1. Architectural Philosophy: Article-First Sports Publishing

NFRGuide is architected around an **Article-First Model**. In contrast to generic event databases or real-time scoreboards, every piece of championship data, scoring breakdown, arena guide, or entertainment review is tied to an editorial dispatch with authoritative authorship, primary citations, and rich structured JSON content blocks.

### Core Architectural Axioms
1. **Editorial Integrity Over Raw Feeds**: Uncurated automated data feeds erode reader trust. Every aggregate standings breakdown and draw analysis is embedded in journalistic context with credentialed explanation.
2. **Concept C Visual Foundation**: A hybrid aesthetic merging cinematic dark western grit with clean, high-contrast, readable magazine layouts.
3. **Strict Staging Isolation**: Reader-facing routes are decoupled from unreleased draft workflows. Pre-release drafts or internal revisions can never be indexed or accessed publicly.
4. **Future-Proof Migration Contract**: Component interfaces, URL structures, and data schemas are decoupled from the runtime framework, ensuring seamless migration to Next.js App Router and PostgreSQL in Phase 1.

---

## 2. Public vs Admin Dual-Shell Architecture

The application is cleanly divided into two distinct UI shells:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Root Application                              │
│                           (src/App.tsx)                                │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
       ┌─────────────────────────┐      ┌─────────────────────────┐
       │   Public Reader Shell   │      │     Admin CMS Shell     │
       │ (SiteHeader/SiteFooter) │      │  (AdminShell/Sidebar)   │
       └────────────┬────────────┘      └────────────┬────────────┘
                    │                                │
    ┌───────────────┴───────────────┐     ┌──────────┴──────────┐
    ▼               ▼               ▼     ▼          ▼          ▼
 Homepage      Section Pages     Article Overview  Articles   Editor
 (10 Sections)  (5 Canonical)    Detail  (12 Admin Modules)   (8-field)
```

### Public Reader Shell
- **Header (`SiteHeader.tsx`)**: Slim utility strip (championship dates, weather stub, direct admin toggle) + Cinematic dark masthead (`#0F1115`) + Gold navigation bar + Quick search modal launcher.
- **Homepage (`HomePage.tsx`)**: Approved 10-section editorial hierarchy A through J:
  - *Section A*: Cinematic Editorial Hero
  - *Section B*: Latest NFR Coverage
  - *Section C*: NFR Quick Access
  - *Section D*: NFR Competition (Seven Disciplines)
  - *Section E*: Plan & Watch
  - *Section F*: Entertainment & Fan Experiences
  - *Section G*: Events & Shopping
  - *Section H*: More Rodeo
  - *Section I*: Evergreen Learning Resources
  - *Section J*: Footer
- **Primary Sections (5 Canonical Routes)**:
  - `/competition/`, `/entertainment/`, `/events-shopping/`, `/plan-watch/`, `/rodeo-events/` (with compatibility redirects for `/nfr-competition`, etc.).
- **Reading View (`ArticleDetailPage.tsx`)**: High-readability warm sand background (`#F7F3EA`), 68ch max-width reading column, left-docked interactive Table of Contents, secondary editorial deck rendered below H1, verified author credential bios, FTC disclosure notices, and related editorial dispatches.
- **Discipline Championship Guides (`/disciplines/:slug/`)**: 7 technical guides covering Bareback Riding, Steer Wrestling, Team Roping, Saddle Bronc Riding, Tie-Down Roping, Barrel Racing, and Bull Riding.
- **Footer (`SiteFooter.tsx`)**: Comprehensive sitemap, editorial independence disclaimers, and clear separation from official rodeo bodies.

### Admin CMS Shell
- **Sidebar (`AdminSidebar.tsx`)**: Deep Charcoal (`#0F1115`), gold active state accents, organized into the 12 approved modules:
  1. *Overview* (`/admin/`)
  2. *Articles* (`/admin/articles/`)
  3. *Rodeo Coverage* (`/admin/rodeo-coverage/` housing Hubs, Events, Editions, Disciplines, and Venues)
  4. *Organization & Taxonomy* (`/admin/editorial-organization/`)
  5. *Media Library* (`/admin/media/`)
  6. *Sources & References* (`/admin/sources/`)
  7. *SEO Intelligence* (`/admin/seo/`)
  8. *Website & Navigation* (`/admin/website/`)
  9. *Analytics & Search* (`/admin/analytics/`)
  10. *Monetization & Ads* (`/admin/monetization/`)
  11. *Team & Permissions* (`/admin/team/`)
  12. *System Settings* (`/admin/settings/`)
- **Environment & Demo Indicators**: Persistent `DEMO ENVIRONMENT` badges, simulated role indicators, and non-destructive session store resets.

---

## 3. Article Authoring Architecture (Exact 8 Fields)

The editor shell enforces the approved eight primary fields in the main authoring column:
1. **Main Headline (H1)** (Field 01)
2. **Secondary Editorial Deck** (Field 02) — stored independently from excerpt; rendered below headline
3. **Editorial Excerpt / Summary** (Field 03) — concise 1–2 sentence summary for index cards and RSS
4. **Article Body** (Field 04) — `RichBlockEditor` with 10 typed JSON content blocks
5. **SEO Title** (Field 05) — 35–65 characters
6. **Meta Description** (Field 06) — 110–165 characters
7. **Image SEO Title** (Field 07)
8. **Image ALT Text** (Field 08)

**Separate URL Slug & Route Path Inspector**:
- Positioned in the right sidebar under Article Settings / URL & Route Path.
- Auto-generates for new dispatches, but **never overwrites user-customized slugs** when the headline changes.
- Validates lowercase alphanumeric hyphenated format.

---

## 4. State Management & Storage Architecture

### Reactive Session Store (`src/data/articleStore.ts`)
In Phase 0, the reactive singleton `articleStore` maintains state in memory and `sessionStorage` (under `nfrguide_demo_articles_v1` and `nfrguide_demo_revisions_v1`):
- **Persistence**: Edits survive page navigations and refreshes within the same browser tab session.
- **Reactivity**: Any save, delete, or bulk update notifies registered React components instantaneously via observer callbacks.
- **Audit Logging**: Every save operation automatically records an immutable snapshot in `revisions` capturing the timestamp, actor, role, and delta summary.

---

## 5. Public Content Eligibility Policy & Draft Privacy

Implemented in `src/utils/contentEligibility.ts`:
- **Eligibility Rule**: An article is publicly eligible IF AND ONLY IF `article.workflowStatus === 'published'` (or `article.status === 'published'` when workflowStatus is unset).
- **Public Gating**:
  - `mockEditorialData.ts` query functions strictly filter through the eligibility policy.
  - Public reader pages (`HomePage`, `SectionLandingPage`, `CategoryArchivePage`, `DisciplineGuidePage`, `SearchModal`) consume only eligible dispatches.
  - `ArticleDetailPage.tsx` evaluates eligibility upon slug resolution. If an article exists but is in `draft`, `in_review`, `approved`, `scheduled`, or `archived`, it displays a neutral **Dispatch Unavailable** screen without leaking private metadata (author, title, internal workflow status) and without providing public links directly to the admin editor.

---

## 6. Design System Tokens (Concept C)

```
Color Palette:
├── Primary Charcoal:   #0F1115 (Masthead, headers, dark cards, admin sidebar)
├── Deep Navy:          #1E293B (Banners, callout borders, secondary pills)
├── Western Gold:       #D4A757 (Accent rules, primary buttons, active states)
├── Terrain Brown:      #8B5E3C (Subtitles, discipline tags, subtle dividers)
├── Warm Sand:          #F7F3EA (Editorial reading canvas, section backdrops)
└── Crisp White:        #FFFFFF (Card backgrounds, tables, contrast panels)

Typography:
├── Editorial Headings: Playfair Display / Georgia / serif
├── Body Text & UI:     Inter / -apple-system / sans-serif
└── Code & Data:        JetBrains Mono / Menlo / monospace
```

---

# Phase 1 / Batch 01 — Next.js App Router Architecture

> Added 2026-10-28. The sections above describe the preserved Phase 0 Vite/React
> prototype (repo root). Batch 01 introduces a parallel Next.js application at
> `apps/web/` without modifying the Phase 0 app.

## Application layout
- **`/` (repo root):** Phase 0 Vite + React Router SPA — preserved as reference.
- **`apps/web/`:** Next.js 16.4.3 App Router + React 19 + Tailwind CSS v4. Self-contained
  (`package.json`, lockfile); no monorepo tooling.

## Rendering model (server/client boundaries)
- **Server Components:** public page shells and route metadata (`generateMetadata`),
  article/section/discipline pages, `robots.ts`, `sitemap.ts`.
- **Client Components (`'use client'`):** `SearchModal`, `SiteHeader`/mobile nav,
  `PublicChrome` (search shell), homepage (`HomeView`), category archive, all
  `admin/*` CMS screens, the article editor and rich block editor.

## Key modules (`apps/web`)
- `lib/content.ts` — read-only, published-only content adapter (the single seam to
  the future database). Public pages never import `ALL_ARTICLES` directly.
- `lib/seo.tsx` — Next Metadata API builders + Article/Breadcrumb JSON-LD (one
  `SITE_URL` canonical/robots policy).
- `lib/url.ts` — outbound URL protocol allowlist (http/https/mailto/tel/relative).
- `next.config.mjs` — `trailingSlash: true`, 5 legacy → canonical HTTP 308 redirects,
  `turbopack.root` pinned to `apps/web`.
- `views/*` — Phase 0 page bodies ported to props-driven views; `components/*` reused
  with `react-router-dom` replaced by `next/link` + `next/navigation`.

## Data flow (Batch 01)
Public (server) → `lib/content.ts` → static published seed (`data/mockEditorialData`).
Admin (client) → `data/articleStore.ts` → browser `sessionStorage` (prototype only;
NOT shared, NOT server state, does not drive public SSR). See KNOWN_LIMITATIONS.md.

---

# Phase 1 / Batch 02 — Database-Backed Content (addendum)

> Added 2026-10-28. Builds on the Batch 01 Next.js architecture above.

- **Database:** PostgreSQL via **Prisma 6.19.3**. Schema:
  `apps/web/prisma/schema.prisma` (34 tables / 33 FKs / 8 enums). See
  `DATABASE_ARCHITECTURE.md`, `DATABASE_SETUP.md`, `DATA_MIGRATION_REPORT.md`.
- **Server-only data layer:** `apps/web/lib/db.ts` (Prisma singleton, `server-only`)
  → `apps/web/lib/content.ts` (published-only repository) → `apps/web/lib/mappers.ts`
  (DB rows → existing `Article`/`Discipline` shapes). UI never imports Prisma.
- **Public read path:** all public **article** surfaces (home feeds, 5 sections,
  article detail, category archive, discipline guide + listings, related, search,
  sitemap) are server-rendered from the repository with `workflowStatus = PUBLISHED`
  enforced in-query. ISR `revalidate` added per route.
- **Boundary:** non-article decorative modules (entertainment/shopping/plan-watch
  cards, rodeo hub/event cards, learning, quick-access) remain Phase 0 static content;
  the admin editor remains a client-only `sessionStorage` prototype (no DB writes).
- **Status:** code complete; live-DB apply/seed/build pending a provided `DATABASE_URL`.

---

# Phase 1 / Batch 03 — Authentication, RBAC & CMS Persistence (addendum)

> Added 2026-10-29.

- **Auth:** database-session pattern (bcryptjs, CSPRNG opaque tokens stored as SHA-256
  hashes, HttpOnly/SameSite cookies, Server Actions). See AUTHENTICATION_ARCHITECTURE.md.
  `/admin/login/` is public; everything under `app/admin/(dashboard)/` is gated by
  `requireUser()` in its layout; every mutation re-checks server-side.
- **RBAC:** code-defined default-deny matrix (`lib/auth/rbac.ts`) mirrored to DB; enforced
  in `lib/cms/articleService.ts`. See RBAC_PERMISSION_MATRIX.md. The role simulator is gone.
- **CMS persistence:** authenticated, transactional, optimistic-concurrency article CRUD +
  workflow + revisions + audit via `articleService` + `app/admin/article-actions.ts`
  (`sessionStorage` store removed). See CMS_PERSISTENCE_REPORT.md.
- **Publishing:** publish/unpublish revalidate the public cache (`revalidatePath('/','layout')`
  + article path + sitemap) so editorial privacy is immediate.
- **Admin route group:** `app/admin/(dashboard)/*` (gated shell) vs `app/admin/login/`
  (no shell). URLs unchanged.
- **Boundary (Batch 03):** Articles + Editor + workflow DB-backed.

## Batch 04 — editorial management modules
- **DB-backed now:** Overview dashboard (real metrics + audit feed), Advanced
  Article Management (server search/filter/sort/pagination), Rodeo Coverage,
  Editorial Organization (categories/tags/authors), Sources & References, and
  Website & Navigation. **Still UI/mock:** Media, SEO, Analytics, Monetization,
  Team, Settings.
- **Pattern:** Server Component route → Client view → `'use server'` action →
  `'server-only'` service, with a shared guard (`lib/cms/guard.ts`) as the
  default-deny enforcement + audit point. See EDITORIAL_CMS_ARCHITECTURE.md.
- **Navigation:** new `NavigationItem` table drives the public header/footer via
  `app/(public)/layout.tsx` → `PublicChrome` → `SiteHeader`/`SiteFooter`, with a
  built-in static fallback and canonical-route protection. See NAVIGATION_MANAGEMENT.md.
- **Integrity:** restrict-on-delete for anything referenced by published content;
  URL-scheme validation on source/navigation URLs; five new RBAC permissions.
- **HTTP cache test:** `npm run test:cache` verifies publish/unpublish visibility
  over HTTP (8 points). See BATCH04_TEST_REPORT.md and PHASE1_BATCH04_REPORT.md.
