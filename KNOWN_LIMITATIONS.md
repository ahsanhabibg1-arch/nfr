# NFRGuide.com — Explicit Demonstration Boundaries & Known Limitations

> Specification: **NFRGuide Developer Master Requirements v2.0 Aligned**

This document transparently defines the technical boundaries, prototype scopes, and intentional Phase 0 limitations of NFRGuide.com.

---

## 1. Phase 0 Prototype Scope

Phase 0 is an **Editorial Design Foundation, Responsive UI System, and Custom CMS Prototype**. It is designed to prove editorial UX, validate Concept C visual hierarchy, establish typed data contracts, and demonstrate the 12 CMS workflows prior to backend engineering.

The following systems are intentional client-side demonstration implementations:

---

## 2. Persistence & Storage Boundaries

- **In-Memory & Session Storage**:
  - All article creations, updates, deletions, and revision snapshots are stored in the browser's `sessionStorage` (`nfrguide_demo_articles_v1`).
  - **Limitation**: Changes persist across page navigations and refreshes within the same browser tab, but are NOT shared across different browsers, devices, or users.
  - **Reset**: Navigating to `/admin/settings/` and clicking **Reset Demo Store** (or clearing session storage) restores the baseline editorial catalog.
- **No Remote Database**:
  - There is no active PostgreSQL or Cloud SQL database running in Phase 0.
  - A production-ready Prisma schema and relational migration guide are provided in [DATA_MODELS.md](./DATA_MODELS.md) for Phase 1 implementation.

---

## 3. Authentication & Security Boundaries

- **Simulated Editorial Roles (DEMO ONLY)**:
  - User role switching between the 5 approved roles (`Super Admin`, `Administrator`, `Editor`, `Author`, `SEO Manager`) is a client-side prototype. It allows evaluating how different roles experience the publishing interface and least-privilege rules (e.g. Authors cannot publish directly).
  - **Limitation**: There is no server-side cryptographic token verification (JWT / OAuth2). No password authentication is required to access `/admin/`.
  - **Disclaimer**: All administrative actions and roles are clearly labeled with `(DEMO)` indicators.

- **Public Content Eligibility vs Server-Side Access Control**:
  - In Phase 0, unpublished content isolation is enforced on the client via `isArticlePubliclyEligible()` in React components.
  - **Limitation**: Client-side filtering is NOT a substitute for server-side security. In a production deployment, unpublished drafts must be protected by server-side query filters and authentication middleware so draft data is never transmitted across the network to unauthenticated users.

---

## 4. Search Engine Indexing & Routing (SSR vs SPA)

- **Client-Side Rendering (SPA)**:
  - NFRGuide currently operates as a Vite + React 19 Single Page Application.
  - Metadata, canonical links, and Schema.org JSON-LD are dynamically injected via DOM manipulation (`src/utils/seo.ts`).
  - **Limitation**: While modern Googlebot renders JavaScript, optimal search crawler indexation and social card preview bots (Twitter, Facebook, iMessage) require pre-rendered HTML.
  - **Remediation**: The architecture is decoupled to transition directly into Next.js App Router (SSR/ISR) as outlined in [MIGRATION_PLAN.md](./MIGRATION_PLAN.md).

- **Client-Side Navigation vs HTTP 301/308 Redirects**:
  - Compatibility routes (e.g. `/nfr-competition` &rarr; `/competition/`) are handled on the client using React Router's `<Navigate to="..." replace />`.
  - **Limitation**: Client-side navigation does not return an HTTP 301 or 308 response code to search engine crawlers. In Phase 1, these redirects will be handled at the server level via Next.js configuration.

---

## 5. External API Integrations

- **Weather & Live Ticker Stubs**:
  - The Thomas & Mack Center temperature widget and live scoring alerts in the header ticker use realistic mock data reflecting typical December Las Vegas climate and competition scores.
  - Real-time weather APIs and live PRCA scoring webhooks will be connected via server-side proxies in Phase 1.
- **Commercial Affiliates & Ticketing**:
  - Hotel booking and Cowboy Christmas merchandise links include sample tracking parameters to illustrate FTC-compliant disclosure notices. No real affiliate transactions are processed.

---

## 6. Media Asset Hosting

- **Local & Sample Photography**:
  - Images are bundled as local static assets or curated editorial action photography.
  - There is no cloud blob storage (GCS / S3) upload pipeline in Phase 0. The Media Picker operates against the curated demonstration catalog.

---

# Phase 1 / Batch 01 — Updated Limitations (Next.js migration)

> Added 2026-10-28. Applies to the new `apps/web/` Next.js application. The Phase 0
> boundaries above still describe the preserved root Vite app.

## Persistence (unchanged intent, clarified)
- The admin CMS still writes only to the browser's **`sessionStorage`** via
  `data/articleStore.ts`. This is a **client-only prototype** and is explicitly
  **not** server state: it is not shared across users/devices and does **not** drive
  server-rendered public pages.
- Server-rendered public pages read **static published seed data** through the
  read-only adapter `lib/content.ts`. Creating/editing an article in the admin does
  not change public SSR output in Batch 01. Real persistence (PostgreSQL/Prisma)
  arrives in a later batch behind the same adapter signatures.

## Authentication & authorization (unchanged)
- No real auth. `/admin/*` is a prototype: `force-dynamic`, `robots noindex`, and
  disallowed in `robots.txt`. It must **not** be exposed on any public deployment
  until server-side authentication and RBAC are implemented. Role switching remains
  a UI simulation.

## Rendering / SEO
- Homepage and Category archive are Client Components (interactive); they are
  server-side rendered to HTML but could be refined into finer-grained Server
  Components later. Article, section, and discipline pages are Server Components.
- Unknown or unpublished `/articles/[slug]/` return HTTP 404 + `noindex` (no draft
  leakage). There are no unpublished seed articles, so the draft-specific path is
  covered only indirectly by the unknown-slug 404.
- Site-wide SEO scanning is still simulated (out of Batch 01 scope); the
  `seoValidator` utilities are retained for future backend integration.

## Tooling
- **Bun is the lockfile manager but is not installed**; npm was used. The root
  baseline install required `--legacy-peer-deps` (npm's strict peer resolution vs
  the project's `esbuild`/Vite 8 ranges — no versions were upgraded). Confirm the
  package manager going forward.

## Phase 0 documentation inaccuracies corrected in Batch 01
These claims from Phase 0 docs were found inaccurate during the audit and are now
addressed in `apps/web`:
1. **"Reset Demo Store"** (KNOWN_LIMITATIONS Phase 0 §2) was never implemented in
   the Phase 0 code. It remains unimplemented; do not rely on it.
2. **"Link protocol sanitization"** (QA_REPORT §3.1) did not exist in Phase 0 code.
   It is now real in `apps/web` via `lib/url.ts` (allowlist), wired into article
   source links.
3. **"10 block types supported in editor"**: Phase 0's editor could author only 9
   (no Disclosure) and its "Heading 3" button produced an H2. Both are fixed in
   `apps/web` (Disclosure is authorable; H3 creates a real H3).

---

# Phase 1 / Batch 02 — Updated Limitations (database)

> Added 2026-10-28.

- **Verified on local PostgreSQL 17 (2026-10-29).** Dedicated least-privilege roles
  and `nfrguide_dev`/`nfrguide_test` databases were created; migrations applied, seed
  idempotent, 27/27 vitest (incl. 11 DB integration), `next build` (28 routes) and
  20/20 route smoke all pass. Credentials live only in git-ignored `apps/web/.env`.
  Production connection pooling/deployment remain open (not needed locally).
- **Admin CMS is still a client-only prototype.** It writes to browser
  `sessionStorage` only; **no database writes are activated** and there are no
  public create/update/delete endpoints. Database-backed public content and the
  admin prototype are intentionally separate; CMS persistence is **not** complete.
- **No authentication or RBAC.** Identity tables (User/Role/Permission/UserRole/
  AuditLog) are inert foundation for Batch 03; no secure authorization exists yet.
- **Documented static boundary (§9).** Non-article decorative modules (entertainment
  features, shopping events, plan & watch guide cards, rodeo hub & event cards,
  learning resources, quick-access) remain Phase 0 static content and are not yet in
  the content database. All true article surfaces are DB-backed.
- **Prisma 6, not 7.** Prisma 7 removes `url` from the schema datasource and requires
  a `prisma.config.ts` + driver adapter; stable 6.19.3 was used deliberately.
- **No media object storage / SEO scanner / scheduled-publish worker** (all out of
  Batch 02 scope).

---

# Phase 1 / Batch 03 — Updated Limitations (auth / RBAC / CMS)

> Added 2026-10-29.

- **Real authentication + RBAC now exist.** The `/admin` CMS requires login; the Phase 0
  role simulator and `sessionStorage` article store are removed. Articles, the editor and
  the workflow are database-backed with server-side authorization, ownership, optimistic
  concurrency, revisions and audit logging.
- **First login requires bootstrap:** `cd apps/web; npm run bootstrap:admin`. No admin
  account ships; no hardcoded credentials; no public registration.
- **No scheduled-publishing worker:** the `scheduled` state is retained but not
  auto-executed; publishing is manual. Scheduled content is never publicly exposed.
- **Login rate limiter is in-memory (per-instance);** a multi-instance deployment needs a
  shared store. Password reset/recovery and MFA are future work.
- No media object storage, no SEO scanning engine, no production deployment.

## Batch 04 — editorial module limitations
- **Now DB-backed:** Overview dashboard, Articles (server search/filter/sort/
  pagination), Rodeo Coverage, Editorial Organization, Sources & References, and
  Website & Navigation. **Still UI-only / mock:** Media Library, SEO Intelligence,
  Analytics, Monetization, Team, Settings (future batches).
- **Dashboard analytics are honest-empty:** traffic/search-console metrics show a
  "not connected" notice rather than fabricated numbers — no analytics provider is
  integrated.
- **Navigation is single-level** (no nested dropdown submenus) and covers the
  header + two footer columns; the policy/legal footer links remain in-component
  modals. Canonical links are now auto-created by the Prisma seed
  (`seedCanonicalNavigation`, idempotent & non-overwriting); the admin "restore
  canonical links" action and the static fallback both remain available.
- **Rodeo purse/schedule fields are free-text and unverified by design** — the UI
  warns against entering unconfirmed figures; nothing is auto-populated.
- **Production build verified at Batch 04 sign-off** (`next build` passes; prod
  route + admin smoke green). The publish/unpublish cache harness runs against
  the dev server by design — in production, ISR invalidation on publish/unpublish
  is carried by the Server Actions' `revalidatePath()` (code-verified); see
  BATCH04_TEST_REPORT §3.
## Phase 1 / Batch 05 — media limitations

- The local filesystem adapter is verified for development/test only. It is not
  multi-instance production storage. Cloudflare R2 is recommended but no cloud
  resource, CDN, credential or production delivery path has been configured.
- The optional S3-compatible adapter requires `@aws-sdk/client-s3` when activated;
  local development does not install or require it.
- JPEG, PNG and WebP are accepted. SVG is intentionally rejected until an owner-
  approved sanitization policy exists.
- Responsive derivatives are generated, but the current public renderer uses the
  stable original URL rather than selecting `md/lg` through `srcset`.
- Rodeo media assignment is implemented in authorized services/actions and tested;
  a dedicated entity-side gallery picker is not part of the preserved Batch 04 UI.
- Media RBAC is a tested provisional mapping pending owner confirmation before
  production. No production deployment has been performed.
