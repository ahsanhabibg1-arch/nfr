# NFRGuide.com — Independent Rodeo Editorial Publication

> **Phase 0 — Design Foundation & Editorial CMS Architecture**  
> Brand: **NFRGuide** | Domain: **nfrguide.com** | Visual Concept: **Concept C (Hybrid Premium Sports Publication)**  
> Specification: **NFRGuide Developer Master Requirements v2.0 Aligned**

NFRGuide is an independent, NFR-first digital editorial publication providing in-depth journalism, technical scoring breakdowns, aggregate analyses, visitor logistics, and heritage storytelling covering the **National Finals Rodeo (NFR)** in Las Vegas, Nevada, alongside premier North American ProRodeo tour stops.

---

## Editorial Disclosure & Independence Notice

**NFRGuide is an independent editorial publication.**  
NFRGuide is NOT an official property of, nor affiliated with, the Professional Rodeo Cowboys Association (PRCA), the Women’s Professional Rodeo Association (WPRA), the National Finals Rodeo (NFR), Las Vegas Events (LVE), official broadcast rights holders, or commercial ticketing organizations. All editorial reporting, scoring physics analyses, and spectator guides are produced independently for sports fans and travelers.

---

## Key Highlights & Architectural Scope

1. **Concept C Design System**:
   - Palette: Primary Charcoal (`#0F1115`), Deep Navy (`#1E293B`), Western Gold (`#D4A757`), Terrain Brown (`#8B5E3C`), Warm Sand (`#F7F3EA`), and White (`#FFFFFF`).
   - Typography: Playfair Display for editorial headlines, serif long-form body copy, and Inter for precision data and administrative controls.
   - Restrained, authentic western sports atmosphere without kitsch, live scoreboard clutter, or generic clichés.

2. **Public Reader Experience & Approved 10-Section Homepage**:
   - **Section A**: Cinematic Editorial Hero (Lead roughstock investigation + secondary dispatches).
   - **Section B**: Latest NFR Coverage (Championship round analysis, arena updates).
   - **Section C**: NFR Quick Access (Interactive departmental deep-links).
   - **Section D**: NFR Competition (Seven Championship Disciplines primer).
   - **Section E**: Plan & Watch (Logistics, broadcast guides, ticket verification).
   - **Section F**: Entertainment & Fan Experiences (Buckle ceremonies, concert residencies).
   - **Section G**: Events & Shopping (Cowboy Christmas, trade expos, artisan craft).
   - **Section H**: More Rodeo (North American tour stops, Calgary, Cheyenne).
   - **Section I**: Evergreen Learning Resources (Scoring breakdown, arena glossary).
   - **Section J**: Footer (Comprehensive sitemap and independence disclosures).

3. **Five Canonical Primary Section Landing Pages**:
   - `/competition/` — Competition & Seven Championship Disciplines
   - `/entertainment/` — Entertainment, Nightlife & Ceremonies
   - `/events-shopping/` — Events, Cowboy Christmas & Trade Expos
   - `/plan-watch/` — Spectator Planning, Travel & Broadcast Intelligence
   - `/rodeo-events/` — More Rodeo & North American Tour Stops
   - *Compatibility redirects implemented for alternate/legacy URLs (`/nfr-competition`, `/nfr-entertainment`, `/nfr-events-and-shopping`, `/nfr-plan-and-watch`, `/more-rodeo`).*

4. **Dedicated Article Reading Experience & Seven Discipline Guides**:
   - `/articles/:slug/` — Long-form reading template with secondary editorial deck below H1, interactive Table of Contents, verified author credentials, pull quotes, drop caps, comparison tables, and primary source citations.
   - `/disciplines/:slug/` — 7 dedicated championship guides: Bareback Riding, Steer Wrestling, Team Roping, Saddle Bronc Riding, Tie-Down Roping, Barrel Racing, and Bull Riding.
   - `/categories/:slug/` — Faceted article directory with pagination.

5. **Custom Editorial Admin CMS (12 Approved Modules)**:
   - Module 01: **Overview** (`/admin/`) — Publishing pulse, active alerts, quick actions.
   - Module 02: **Articles** (`/admin/articles/`) — Master directory, workflow tabs, validation-gated bulk publishing.
   - Module 03: **Rodeo Coverage** (`/admin/rodeo-coverage/`) — Hubs, Events, Editions, Disciplines, and Venues management.
   - Module 04: **Organization & Taxonomy** (`/admin/editorial-organization/`) — Disciplines, tags, categories.
   - Module 05: **Media Library** (`/admin/media/`) — Photography assets, rights statuses, accessibility ALT text.
   - Module 06: **Sources & References** (`/admin/sources/`) — Authoritative PRCA rulebooks and scoring archives.
   - Module 07: **SEO Intelligence** (`/admin/seo/`) — 12-group SEO engine, SERP simulator, site health metrics.
   - Module 08: **Website & Navigation** (`/admin/website/`) — Homepage featured pins, section ordering, breaking ticker.
   - Module 09: **Analytics & Search** (`/admin/analytics/`) — Editorial read depth, engagement by department.
   - Module 10: **Monetization & Ads** (`/admin/monetization/`) — FTC disclosures, sponsor transparency.
   - Module 11: **Team & Permissions** (`/admin/team/`) — 5-role permission model with simulated RBAC.
   - Module 12: **System Settings** (`/admin/settings/`) — Canonical domain, RSS feeds, demo catalog reset.

6. **Exact 8-Field Article Authoring Sequence**:
   - Field 01: **Main Headline (H1)**
   - Field 02: **Secondary Editorial Deck** (stored independently from excerpt; rendered below headline)
   - Field 03: **Editorial Excerpt / Summary** (1–2 sentences for index cards and RSS)
   - Field 04: **Article Body** (`RichBlockEditor.tsx` supporting 10 typed JSON content blocks)
   - Field 05: **SEO Title** (35–65 characters)
   - Field 06: **Meta Description** (110–165 characters)
   - Field 07: **Image SEO Title**
   - Field 08: **Image ALT Text** (accessibility compliance)
   - *URL Slug is managed in a dedicated Article Settings / URL & Route Path inspector with custom-edit lock.*

7. **Approved 5-Role Model & Least-Privilege Governance (DEMO ONLY)**:
   - `Super Admin`, `Administrator`, `Editor`, `Author`, `SEO Manager`.
   - Authors cannot publish directly without editorial review.
   - SEO Managers configure search metadata without user-management privileges.
   - *All administrative actions are simulated in this client-side prototype.*

8. **12 SEO Rule Groups & Publishing Gatekeeper**:
   - Groups: `On-page`, `Search Appearance`, `Technical`, `Content & Topic`, `External Links`, `Internal Links`, `Image SEO`, `Structured Data`, `AI Search Readiness`, `Freshness`, `Event SEO`, `Redirects`.
   - Category A (Editorial Blockers) and Category B (Rights & Compliance) strictly block single and bulk publishing.

9. **Public Content Eligibility & Staging Boundary**:
   - Non-published dispatches (`draft`, `in_review`, `approved`, `scheduled`, `archived`) are strictly filtered from public reader surfaces.
   - Direct requests to unpublished URLs on `/articles/:slug/` render a neutral unavailable experience without revealing private metadata or providing public links directly to the admin editor.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React 19 (SPA) on Vite 8.3 |
| **Language** | TypeScript 5.8+ (Strict Mode) |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/vite`, `@import "tailwindcss";`) |
| **Routing** | React Router 7 (`react-router-dom`) with HTML5 History API |
| **Icons** | Lucide React |
| **Motion** | Motion (`motion/react`) |
| **State & Store** | In-Memory & Session Storage Reactive Store (`articleStore`) |
| **Testing** | Standalone Automated Verification Runner (`tsx tests/runner.ts`) |

---

## Quick Start & Local Development

### Prerequisites
- **Node.js**: `v18.0.0` or higher (`v20+` or `v22+` recommended)
- **npm**: `v9.0.0` or higher

### Installation & Execution
```bash
# 1. Install dependencies
npm install

# 2. Run local development server (starts on http://localhost:3000)
npm run dev

# 3. Run automated verification regression suite (56 tests)
npm test

# 4. Check TypeScript types
npm run lint

# 5. Build production bundle
npm run build

# 6. Preview production build
npm run preview
```

---

## Documentation Index

- [DEVELOPMENT.md](./DEVELOPMENT.md) — Local workflow, conventions, scripts, and testing.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System boundaries, state model, and Concept C design tokens.
- [ROUTES.md](./ROUTES.md) — Complete inventory of canonical public routes and 12 admin modules.
- [DATA_MODELS.md](./DATA_MODELS.md) — TypeScript contracts and future PostgreSQL / Prisma DDL.
- [CMS_MODULES.md](./CMS_MODULES.md) — Complete guide to all 12 custom CMS modules.
- [SEO_ARCHITECTURE.md](./SEO_ARCHITECTURE.md) — 12 SEO rule groups, structured data, and SSR guidelines.
- [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) — Step-by-step Next.js App Router migration blueprint.
- [QA_REPORT.md](./QA_REPORT.md) — Responsive breakpoint audits, security analysis, and test results.
- [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) — Phase 0 demonstration boundaries and future work.
