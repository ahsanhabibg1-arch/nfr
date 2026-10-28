# NFRGuide.com — Phase 1 / Batch 01 Report
## Local Development Foundation, Next.js Migration & Architecture Stabilization

**Date:** 2026-10-28
**Branch:** `batch-01-nextjs-migration`
**Scope:** Migrate the Phase 0 Vite/React-Router SPA to a working Next.js App Router
foundation in `apps/web`, preserving the approved design, CMS UI, and prototype
data behavior. **No production backend was built** (per Batch 01 scope limits §17).

---

## A. Baseline Verification Results

The original Vite/React app was committed as the reference baseline before any
migration (`git` branch `batch-01-nextjs-migration`, baseline commit first).
Dependencies were installed and the real baseline commands were executed:

| Command | Result | Notes |
|---|---|---|
| `npm install` (root) | ✅ after `--legacy-peer-deps` | Bun is the lockfile manager but is not installed; npm's strict peer check rejected the project's `esbuild@^0.25.0` vs Vite 8's peer range. `--legacy-peer-deps` relaxes the check only — no versions were upgraded. |
| `npm run lint` (`tsc --noEmit`) | ✅ exit 0 | Clean. |
| `npm test` (`tsx tests/runner.ts`) | ✅ 56/56 passed, exit 0 | The Phase 0 suite (see audit: ~half are tautological static assertions). |
| `npm run build` (`vite build`) | ✅ exit 0 | 97 modules, `dist` ≈ 720 KB JS (182 KB gz). Warnings: one chunk > 500 KB; a benign `__dirname` config-loader notice. |

The root Vite app remains fully intact and buildable; it was not modified by the migration.

Toolchain detected: Node `v22.16.0`, npm `10.9.2`, Bun **not** on PATH. Registry
versions confirmed real (forward-dated environment): Vite 8.3.5, TypeScript 7.0.2,
React 19, React Router 7.18.5, **Next.js 16.4.3** (latest).

---

## B. Migration Architecture Decision

**Chosen:** a dedicated, self-contained Next.js 16 App Router app at **`apps/web/`**,
leaving the Phase 0 Vite app at the repo root untouched as the reference
implementation. This is the Batch 01 §4 recommended layout and is maximally
reversible (delete `apps/web` to revert). No monorepo tooling (workspaces/turbo)
was added; `apps/web` has its own `package.json` and lockfile.

- **Framework:** Next.js 16.4.3 (App Router, Turbopack), React 19.2, TypeScript 7.
- **Styling:** Tailwind CSS v4 via `@tailwindcss/postcss`; Phase 0 `@theme` tokens
  and Concept C colors/fonts preserved verbatim in `app/globals.css`.
- **Rendering split (Batch 01 §10):** public pages are Server Components that
  fetch via a read-only content adapter and emit metadata server-side; the
  interactive homepage, category archive, search, and the entire admin CMS are
  Client Components.
- **Canonical URLs:** `trailingSlash: true` enforces one slashed path per entity.
- **Package manager:** npm (Bun unavailable). Documented as a decision to confirm (§K).

---

## C. Files Created and Modified

**New app (`apps/web/`), selected structure:**
```
apps/web/
├─ package.json, tsconfig.json, next.config.mjs, postcss.config.mjs, vitest.config.ts
├─ app/
│  ├─ layout.tsx, globals.css, not-found.tsx, robots.ts, sitemap.ts
│  ├─ (public)/ layout.tsx, page.tsx, [section]/page.tsx,
│  │            articles/[slug]/page.tsx, disciplines/[slug]/page.tsx, categories/[slug]/page.tsx
│  └─ admin/ layout.tsx, page.tsx, + 11 module pages, articles/new, articles/[id]/edit
├─ lib/ content.ts (adapter), seo.tsx (Metadata+JSON-LD), url.ts (protocol allowlist)
├─ components/ … (ported from src/components, React Router → next)
│  └─ PublicChrome.tsx (new: header/footer/search shell)
├─ views/ HomeView, ArticleView, SectionLandingView, DisciplineGuideView,
│          CategoryArchiveView, NotFoundView, admin/* (ported page bodies)
├─ data/ types/ utils/ config/  (reused verbatim; image paths rewritten)
├─ public/assets/images/ (4 editorial photos)
├─ tests/ (7 vitest suites) + scripts/route-smoke.mts
```
- Root (reference Vite app): **unchanged** except an additive `package-lock.json`
  created by the baseline `npm install`.
- Repo: `git init` + baseline commit + migration branch created.

---

## D. Public Route Migration Matrix

| Phase 0 route | Next.js file | Rendering | Status |
|---|---|---|---|
| `/` | `app/(public)/page.tsx` → `HomeView` (client) | Static shell + server metadata | ✅ |
| `/competition/` … `/rodeo-events/` (5) | `app/(public)/[section]/page.tsx` | SSG (`generateStaticParams`, `dynamicParams=false`) | ✅ |
| `/articles/[slug]/` | `app/(public)/articles/[slug]/page.tsx` (server) | SSG for 11 published; 404 otherwise | ✅ |
| `/disciplines/[slug]/` | `app/(public)/disciplines/[slug]/page.tsx` (server) | SSG for 7 | ✅ |
| `/categories/[slug]/` | `app/(public)/categories/[slug]/page.tsx` → `CategoryArchiveView` (client) | Dynamic + server metadata | ✅ |
| `/nfr-competition` → `/competition/` (+4) | `next.config.mjs` `redirects()` | **HTTP 308 permanent** | ✅ |
| 404 | `app/not-found.tsx` | Static | ✅ |

Legacy redirects verified at HTTP level (308) and that the full chain resolves to
the canonical path (route smoke). Trailing-slash policy enforced globally.

---

## E. CMS Route Migration Matrix

All 12 modules + editor routes ported under `app/admin/` (dynamic, `noindex`,
`robots: /admin` disallowed). The admin layout is `force-dynamic`.

| Module | Route | View |
|---|---|---|
| Overview | `/admin/` | `AdminOverviewPage` |
| Articles | `/admin/articles/` | `AdminArticlesPage` (Suspense-wrapped for `useSearchParams`) |
| Editor | `/admin/articles/new/`, `/admin/articles/[id]/edit/` | `AdminArticleEditorShell` |
| Rodeo Coverage | `/admin/rodeo-coverage/` | `AdminRodeoCoveragePage` |
| Editorial Organization | `/admin/editorial-organization/` | `AdminEditorialOrgPage` |
| Media Library | `/admin/media/` | `AdminMediaPage` |
| Sources & References | `/admin/sources/` | `AdminSourcesPage` |
| SEO Intelligence | `/admin/seo/` | `AdminSEOPage` |
| Website & Navigation | `/admin/website/` | `AdminWebsitePage` |
| Analytics & Search | `/admin/analytics/` | `AdminAnalyticsPage` |
| Monetization | `/admin/monetization/` | `AdminMonetizationPage` |
| Team & Permissions | `/admin/team/` | `AdminTeamPage` |
| System Settings | `/admin/settings/` | `AdminSettingsPage` |

The exact 8-field editor, workflow state machine, SEO validation gate, rich block
editor, revision/preview/media-picker UIs are preserved (verified by test + browser).

---

## F. Reused Components and Utilities

Reused with only routing adaptation (`react-router-dom` → `next/link` +
`next/navigation`, `to=`→`href=`): all 9 homepage sections, all `editorial/*`
components, all `admin/*` shell + `admin/editor/*` components, `SearchModal`,
`types/*`, `utils/seoValidator.ts`, `utils/contentEligibility.ts`, `config/routes.ts`,
`data/*`. Zero `react-router-dom` references remain in `apps/web`.

New glue: `lib/content.ts` (read-only published-only adapter, §11), `lib/seo.tsx`
(Metadata API + JSON-LD), `lib/url.ts` (protocol allowlist), `PublicChrome.tsx`.

---

## G. SEO Implementation Results

Genuine Next-native SEO (replacing Phase 0 client DOM injection):
- **Per-route metadata** via `generateMetadata` / static `metadata` (title,
  description, canonical, Open Graph, Twitter) — server-rendered; verified in HTML.
- **Canonical/robots/sitemap from one policy** (`lib/seo.ts` `SITE_URL`).
- **`app/robots.ts`** — allows `/`, disallows `/admin/`, points to sitemap.
- **`app/sitemap.ts`** — real generator; lists home, 5 sections, 5 category
  archives, 7 disciplines, and **only published** articles; excludes admin/drafts.
- **Article/NewsArticle + BreadcrumbList JSON-LD** emitted server-side from
  verified content fields only (no fabricated SportsEvent/event data).
- **HTTP 308 redirects** for the 5 legacy paths.
- Unpublished/unknown article URLs return **404 + noindex** (no draft leakage).
- `AdminSEOPage`'s validator utilities retained for future backend; **no**
  site-wide scanning implemented (out of scope §12).

---

## H. Tests Executed and Results

| Suite | Command | Result |
|---|---|---|
| Phase 0 baseline | `npm test` (root) | ✅ 56/56 |
| TypeScript (app) | `npm run typecheck` | ✅ exit 0 |
| Production build (app) | `npm run build` | ✅ 28 routes generated |
| Unit (vitest) | `npx vitest run` | ✅ **21/21** across 7 suites |
| Route smoke (HTTP, `next start`) | `npm run test:routes` | ✅ **20/20** |
| Browser render QA (headless) | browser-automation | ✅ **0 console errors**; home/section/article/editor render |

New unit tests exercise **real functions** (content adapter, eligibility,
seoValidator gate, URL allowlist, SEO metadata builders, `next.config` redirects,
and the real editor source) — not constants redefined inside the test (§15).
Route smoke asserts status codes, server-rendered `<title>`/canonical/JSON-LD,
the 308 redirect + final landing, robots/sitemap contents, and the published-only
404 boundary. Browser QA confirmed no hydration errors and that the H3 + Disclosure
editor buttons and all 8 fields render.

---

## I. Remaining Bugs & Limitations

Confirmed §14 bug fixes applied: H3 button creates a real H3 block; the Disclosure
block is now authorable (add-menu + toolbar + editor); Phase 0 route banner removed
from article pages; homepage title-string navigation replaced with real slugs (or
section fallback); URL-protocol allowlist (`lib/url.ts`) added and wired into
`ArticleBody` source links (QA report's old sanitization claim is now true).

Limitations carried forward (see KNOWN_LIMITATIONS.md):
- Admin edits still persist only to **browser `sessionStorage`** (client prototype);
  this does **not** drive server-rendered public content. Public pages read the
  static published seed data via the adapter. No server state, no DB.
- No real authentication/authorization — admin is a prototype, `noindex`, and must
  stay off any public deployment until auth lands.
- Media upload, SEO scanning, scheduled publishing remain mock/simulated.
- Homepage and Category archive are Client Components (interactive) — they SSR but
  are candidates for finer RSC conversion later.
- npm used instead of Bun (Bun not installed).

---

## J. Next Batch Readiness

Batch 01 exit criteria (§18) are met (see MIGRATION_STATUS.md). The foundation is
ready for Batch 02 (backend): the content adapter (`lib/content.ts`) is the single
seam to swap static data for PostgreSQL/Prisma; `seoValidator`/`contentEligibility`
are server-usable; route + metadata structure is in place.

---

## K. Decisions Requiring Owner Approval

1. **Package manager:** Bun is the lockfile manager but is not installed; npm was
   used (root install needed `--legacy-peer-deps`). Confirm npm going forward, or
   provision Bun.
2. **Frozen NFR section URLs:** `/competition/`, `/entertainment/`, `/events-shopping/`,
   `/plan-watch/`, `/rodeo-events/` were implemented per Batch 01 §7. Master
   Requirements §14.3 lists final NFR section paths as a sign-off item — please
   confirm these are frozen.
3. **Next.js 16 / React 19:** MIGRATION_PLAN.md said "15+"; latest stable 16.4.3 was
   used. Confirm acceptable.
4. **`apps/web` location** for the Next app (vs converting root in place). Confirm.
5. **Unused Phase 0 deps** (`express`, `@google/genai`) were left in the root app;
   confirm whether Gemini/server-side API is in future scope or should be dropped.
6. Deployment target, auth library, DB/storage/queue remain open (Master Reqs §14.3).

**Batch 02 was not started. No unrelated changes were made.**
