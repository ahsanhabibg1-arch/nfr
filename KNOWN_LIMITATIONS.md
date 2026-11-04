# NFRGuide.com — Explicit Demonstration Boundaries & Known Limitations

> Specification: **NFRGuide Developer Master Requirements v2.0 Aligned**

This document transparently defines the technical boundaries, prototype scopes, and intentional Phase 0 limitations of NFRGuide.com.

---

## 0. Current Status — Phase 1/2 Implemented (updated Batch 17, 2026-11-04)

> **The Phase 0 boundaries in Sections 1–5 below are HISTORICAL.** They describe the
> original Vite SPA prototype and have since been **superseded** by the Phase 1/2
> implementation. They are retained for traceability, not as a description of the
> current system. Where a Phase 0 limitation has been resolved it is marked
> **[RESOLVED in Phase 1]** inline.

**What the application actually is today:**

- **Next.js 16 App Router (SSR/ISR)** — not a client-side SPA. Server Components, Server
  Actions, server-rendered metadata/canonical/JSON-LD, and HTTP 308 redirects.
- **PostgreSQL via Prisma 6** — real relational persistence (≈70 models, 12 ordered
  migrations, Batch 17 adds an additive 13th). No sessionStorage/in-memory "demo store".
- **Database-session authentication** — bcrypt (cost 12) password hashing, SHA-256
  session tokens in an HttpOnly/Secure(prod)/SameSite=Lax cookie, server-side expiry +
  suspended-user checks. No `(DEMO)` roles; RBAC is real and default-deny.
- **Default-deny RBAC** across every admin Server Action, with audit logging.
- **Server-side content eligibility** — drafts / unverified competition coverage are
  filtered in the data layer, never shipped to unauthenticated clients.
- **Gated private media delivery**, baseline security headers + CSP (report-only,
  Batch 17), durable multi-instance rate limiting on login + media upload (Batch 17),
  and optimistic-concurrency version guards on articles and competition coverage
  (Batch 17).

### Resolved since Phase 0
- Client-side-only draft isolation → **server-side query filters + auth**.
- sessionStorage persistence → **PostgreSQL**.
- `(DEMO)` client role switching → **real DB-session auth + RBAC**.
- SPA DOM-injected SEO → **server-rendered Metadata API + JSON-LD**.
- Client `<Navigate>` redirects → **server HTTP 308**.
- Competition last-write-wins editing → **optimistic concurrency (Batch 17)**.

### Current open items (engineering)
- CSP is **report-only**; enforcing (nonce-based) policy is a documented follow-up.
- Rate limiter **fails open** on limiter-storage error (availability over strictness).
- Global `overflow-x: hidden` retained as defense-in-depth alongside the per-component
  overflow fixes (Batch 17 §E).

### Deferred (post-launch)
- Public author profile pages, advanced analytics depth, external APM/observability,
  repo-root legacy Vite SPA cleanup.

### Mandatory pre-launch blockers (NOT code — owner/ops action required)
- **Rotate the previously-exposed Admin / Aiven / R2 credentials.**
- Provision a **least-privilege** Aiven application DB role; verify Aiven migration state.
- Choose host + CD + **staging**; backup/PITR + rollback; proper Aiven CA verification.
- Enter **source-verified NFR 2026 content** (never fabricated).

---

## 1. Phase 0 Prototype Scope  *(HISTORICAL)*

Phase 0 is an **Editorial Design Foundation, Responsive UI System, and Custom CMS Prototype**. It is designed to prove editorial UX, validate Concept C visual hierarchy, establish typed data contracts, and demonstrate the 12 CMS workflows prior to backend engineering.

The following systems are intentional client-side demonstration implementations:

---

## 2. Persistence & Storage Boundaries  *(HISTORICAL — RESOLVED in Phase 1: PostgreSQL via Prisma; see §0)*

- **In-Memory & Session Storage**:
  - All article creations, updates, deletions, and revision snapshots are stored in the browser's `sessionStorage` (`nfrguide_demo_articles_v1`).
  - **Limitation**: Changes persist across page navigations and refreshes within the same browser tab, but are NOT shared across different browsers, devices, or users.
  - **Reset**: Navigating to `/admin/settings/` and clicking **Reset Demo Store** (or clearing session storage) restores the baseline editorial catalog.
- **No Remote Database**:
  - There is no active PostgreSQL or Cloud SQL database running in Phase 0.
  - A production-ready Prisma schema and relational migration guide are provided in [DATA_MODELS.md](./DATA_MODELS.md) for Phase 1 implementation.

---

## 3. Authentication & Security Boundaries  *(HISTORICAL — RESOLVED in Phase 1: DB-session auth + default-deny RBAC; see §0)*

- **Simulated Editorial Roles (DEMO ONLY)**:
  - User role switching between the 5 approved roles (`Super Admin`, `Administrator`, `Editor`, `Author`, `SEO Manager`) is a client-side prototype. It allows evaluating how different roles experience the publishing interface and least-privilege rules (e.g. Authors cannot publish directly).
  - **Limitation**: There is no server-side cryptographic token verification (JWT / OAuth2). No password authentication is required to access `/admin/`.
  - **Disclaimer**: All administrative actions and roles are clearly labeled with `(DEMO)` indicators.

- **Public Content Eligibility vs Server-Side Access Control**:
  - In Phase 0, unpublished content isolation is enforced on the client via `isArticlePubliclyEligible()` in React components.
  - **Limitation**: Client-side filtering is NOT a substitute for server-side security. In a production deployment, unpublished drafts must be protected by server-side query filters and authentication middleware so draft data is never transmitted across the network to unauthenticated users.

---

## 4. Search Engine Indexing & Routing (SSR vs SPA)  *(HISTORICAL — RESOLVED in Phase 1: Next.js SSR + server 308 redirects; see §0)*

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

## Batch 06 — SEO Intelligence limitations
- **Static/DB analysis, not HTTP-verified crawling.** The SEO technical checks
  analyze CMS data + deterministic rules; they are not per-URL live crawls. Key
  routes' real HTTP behavior is verified by the route/admin/media/cache smoke
  suites. The engine makes no network requests (no SSRF surface).
- **Bounded single-pass audit.** The audit scans all content in one synchronous
  pass (fine at current scale). No background worker or scheduler exists; none is
  claimed. Batching is the documented growth path.
- **No external integrations.** Google Search Console, Analytics, AdSense,
  rankings, impressions, clicks, CTR, organic traffic and backlinks are out of
  scope and shown as "not connected" — never fabricated.
- **Advisory only.** SEO findings never block publishing; the existing
  publication gate is unchanged. Editor integration is a read-only advisory panel
  (no audit runs on page load).
- **Schema.org validity ≠ rich results.** Structural validity is reported; Google
  rich-result eligibility / rankings are never promised.

## Batch 07 — Analytics & Search

- **Collection disabled by default.** The first-party analytics pipeline is fully
  implemented but records nothing until an administrator enables it (Admin → Analytics →
  Providers & Config), pending an owner privacy/consent decision. Dashboards therefore
  show real-but-empty data until then.
- **Searchable corpus.** Only entities with a real public canonical URL are returned:
  articles (full FTS), discipline guides, and primary sections. **Rodeo hubs/events/
  editions are intentionally excluded** from search results (no public detail route yet) —
  they are used for content-gap cross-referencing only. Adding public rodeo pages is a
  future batch.
- **FTS coverage.** The `tsvector` covers title/deck/excerpt/subcategory/articleType, not
  full article block body. Body-level matching would need a trigger-maintained column or a
  separate search table.
- **In-memory rate limiting.** The ingest rate limiter + dedup are per-process
  (single-instance). On a multi-instance deployment the effective limit is
  `instances × limit`; true distributed limiting needs a shared backend (e.g. Redis). Not
  claimed as complete.
- **Observed events, not unique visitors.** Content views are first-party observed events,
  explicitly not verified unique humans; no unique-visitor count is claimed.
- **External providers not connected.** GSC/GA4 are an honest foundation only — no network
  calls, no stored credentials, no fabricated metrics. Connecting them is owner-gated.
- **`test:cache` is a dev-mode test.** It creates a brand-new article after build and
  expects it immediately reachable, which relies on Next dev's always-dynamic rendering;
  run it against `npm run dev` (prod `next start` negative-caches a not-yet-generated path).

## Batch 08 — Monetization

- **Disabled by default.** External ad serving (AdSense) and outbound click tracking are OFF
  by default and owner-gated. No AdSense script is injected in this batch even when a
  placement is enabled (space is only reserved + labeled). No publisher/ad-unit id is invented.
- **No fabricated commercials.** No partner, revenue, commission, RPM, CPC, conversion,
  availability, ticket price, streaming right or AdSense approval is stored or shown. The
  dashboard shows "Not configured"/"Not tracked"/"Disabled" honestly.
- **Rodeo entities have no public routes.** Commercial relationships for hubs/events/editions
  are DB + CMS only (no broken public links). Public rodeo pages are a future batch.
- **Event-vs-edition.** Edition-specific offers are never auto-copied to later years; each
  edition is configured independently.
- **In-memory click rate limiting.** Outbound-click dedup/rate limiting is per-process
  (single-instance); true distributed limiting needs a shared backend. Click tracking also
  requires analytics collection to be enabled (also off by default).
- **No external link fetching.** Affiliate URLs are validated statically; the server never
  fetches untrusted commercial URLs (no SSRF). Optional link-health checking is not
  implemented in this batch.
- **FTS column drift in `migrate diff`.** `Article.searchVector` is a DB-managed generated
  tsvector declared `Unsupported("tsvector")`. `migrate diff` still emits index/`DROP DEFAULT`
  noise for it; every offline migration must be hand-reviewed to strip any `searchVector`
  DROP/ALTER before applying (see MIGRATION_STATUS.md). Declaring it Unsupported prevents a
  silent data-losing `DROP COLUMN`.
- **Legal/consent review.** Disclosure defaults are generic and do not assert legal compliance
  in any jurisdiction; wording/prominence and consent requirements need owner/legal review.

## Batch 09 — Team, Settings & Governance

- **No email delivery.** Invitations and password resets produce a single-use, time-limited
  link that an administrator shares **manually** — the app sends no email. Enabling
  transactional email / external auth / MFA is owner-gated.
- **In-memory login rate limiting.** `lib/auth/rateLimit.ts` is per-process (single-instance);
  a multi-instance production deployment needs a shared backend (Redis/DB) for distributed
  rate limiting. Not claimed as distributed.
- **Account states.** "Disabled" is modeled as `SUSPENDED` (both deny access); a distinct enum
  value was intentionally not added. Suspension and privilege removal revoke sessions; role
  grants take effect on the next request (per-request role resolution).
- **Last Super Admin protection** uses a SERIALIZABLE transaction; under extreme concurrency a
  conflicting transaction fails and must retry (by design) rather than breaching the invariant.
- **Migration replay needs CREATEDB.** The from-zero clean replay requires a `CREATEDB`-capable
  role (`MIGRATION_REPLAY_ADMIN_URL`); the least-privilege dev/test roles lack it, so the gate
  falls back to verifying the FTS artifacts on the fully-migrated test database. A Vitest FTS
  regression runs in every suite regardless.
- **`migrate diff` FTS drift persists.** Because Prisma cannot model the generated `tsvector`
  column + GIN index, every future offline migration must be hand-reviewed to strip any
  `searchVector` DROP/ALTER (see MIGRATION_STATUS.md / MIGRATION_REPLAY_VERIFICATION.md).
- **System Settings scope.** Site identity / editorial / rodeo defaults persist and validate,
  but are not yet deeply wired into public metadata rendering (future enhancement); they are a
  typed source of truth ready for that wiring. Security-critical config stays code/env-only.

## Batch 10 — Public rodeo entity pages

- **Rodeo entities now have public pages** (`/rodeo-events/<hub-or-event>/` and
  `/rodeo-events/<event>/<edition>/`), resolving the prior "no public route / excluded from
  search" limitation. They are included in search and the sitemap.
- **Cross-table slug uniqueness** (hub vs event) is enforced at write time in `rodeoService`
  (Postgres cannot express a cross-table unique constraint); the `/rodeo-events/<slug>/`
  resolver uses event-precedence as a deterministic safety net, and
  `scripts/seed-rodeo-links.mts` seeds hub↔event links.
- **Discipline-in-edition URLs omitted** by design — disciplines keep `/disciplines/<slug>/` to
  avoid duplicate canonicals; editions link to discipline guides instead.
- **Content-less rodeo entities are `noindex`** until they have real content.
- **Edition dates** render as verified or explicitly "to be confirmed"; schema.org `Event`
  JSON-LD is emitted only when dates are verified (never fabricated).
- **Full fresh-from-zero migration replay still deferred** (owner chose the local
  `nfrguide_test` FTS gate, **no Docker**). It runs on local PostgreSQL via
  `npm run test:migration` once a one-time CREATEDB-capable `MIGRATION_REPLAY_ADMIN_URL` is
  provided — no production privileges, nothing existing reset.

## Batch 11 — Landing SEO & FAQ

- **Dev admin accounts need re-bootstrapping.** A prior session reset the development database;
  data content was restored via the idempotent seed, but user accounts were not — run
  `cd apps/web && npm run bootstrap:admin` to recreate your Super Admin login. (The test DB was
  never reset.)
- **SEO overrides are additive/safe.** Empty fields fall back to derived metadata; editor
  `noindex` can only add restriction (cannot force-index a thin/unpublished page); canonical
  overrides are same-site-only.
- **FAQ rich results are not guaranteed.** `FAQPage` JSON-LD is emitted only from visible,
  enabled FAQs (accurate, no hidden content); whether Google shows a rich result is at its
  discretion.
- **Polymorphic integrity is service-enforced** (no DB FK on `EntitySeo`/`EntityFaq`); orphan
  rows are cleaned on the owning entity's delete, and every mutation checks entity existence +
  per-entity authorization.
- **Hero-image picker + block-based editorial content** for landing entities are future work
  (`ogImage` URL + plain-text intro cover this batch). Venue public pages + a Competitor entity
  remain future batches.
- **`prisma db seed` server-only fix:** `analyticsSeed` no longer imports the `server-only`
  providers module (inlined), so the full seed runs under plain `tsx`.

## Batch 12 — Venues & Competitors
- **Venue & Competitor entities now exist** (public pages at `/venues/<slug>/` and
  `/competitors/<slug>/`, dedicated CMS at `/admin/venues/` and `/admin/competitors/`), superseding
  the Batch 11 note that they were future work.
- **No seeded venue/competitor data.** Per owner decision D6, the CMS and model ship but no
  fabricated profiles/results/rankings/prize money are created — empty states by design. Entities
  with no real content are non-indexable (page emits `noindex`, excluded from the sitemap).
- **View analytics do not yet track venues/competitors.** `AnalyticsEntityType` was intentionally
  not extended (out of Batch 12 scope), so these pages omit the `ViewBeacon`. First-party view
  counts for them are future work; all other analytics are unchanged.
- **Competitor↔media and venue↔media** assignment reuses the Media Library's `assignRodeoMedia`
  (`kind: 'competitor' | 'venue'`); a dedicated in-page media picker for these entities is future UX
  (the public competitor page renders a `heroImage` URL today).
- **Participation is edition-level only** (owner decision D2) and never auto-transfers between annual
  editions; recurring events carry no participation or venue.
- **Dev server restart required after this batch:** a long-running `next dev` started before the
  Batch 12 Prisma client regeneration holds a stale client and will 500 on venue/competitor pages
  until restarted (the Windows `prisma generate` engine-DLL EPERM is cosmetic — the on-disk client
  is current, as the production build and a fresh process confirm).
