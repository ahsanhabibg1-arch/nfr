# NFRGuide — Full Project Audit

**Date:** 2026-11-11 · **Branch:** `main` · **HEAD:** `f24af32594e353319987353b184d6eb3733b7206`
**Scope:** whole project, audited as it stands including the uncommitted Stage 09 work.
**Nothing was committed, pushed or deployed.** No production database was contacted.

Every number in this document comes from a command executed during the audit. Where
something was not executed, it says so.

---

## 1. Working-tree inventory (Phase 0)

Recorded before any change, and preserved throughout.

| | |
|---|---|
| Branch / HEAD | `main` / `f24af32`, level with `origin/main` (0 ahead, 0 behind) |
| Modified at audit start | 13 files (Stage 09 continuation) |
| Untracked at audit start | 10 files (4 test files, 6 `docs/stage-09/*.md`) |
| Staged | none · **Stashes** none |
| Diff size at start | 355 insertions, 73 deletions |

Files changed by **this audit** are listed in §7. No pre-existing change was reverted,
overwritten or discarded. One binary (`docs/batches/batch-25/seo-assistant-panel.png`) is
rewritten on every Playwright run by `e2e/seo-assistant.spec.ts:45`; it was restored to the
committed version so the handover diff contains only intentional changes.

---

## 2. Architecture map (Phase 1)

### Stack
Next.js **16.4.3** (App Router, `trailingSlash: true`), React **19.2.0**, TypeScript
**7.0.2**, Prisma **6.19.3** on PostgreSQL, Tailwind **4.3.3**, Vitest **3.2.7**,
Playwright **1.64**. Node engine declared `>=22.23.4 <23` (`.nvmrc` 22.23.4); the audit ran
on Node **v24.15.0** — a mismatch, recorded in the blocker register.

### Request flow
```
middleware.ts            STAGING_NOINDEX -> X-Robots-Tag; maintenance gate
  └─ app/layout.tsx      root metadata (metadataBase, og:site_name)
     ├─ app/(public)/*   29 page routes  — public site
     ├─ app/admin/*      24 page routes  — CMS (21 dashboard modules + 3 auth)
     └─ app/api/*        health, ready, internal/revalidate, analytics, csp-report,
                         admin/media/upload, account
instrumentation.ts       startup env validation (fail-fast in production) +
                         in-process page-layout scheduler (60s interval)
```

### Responsibilities (the established ownership model, unchanged by this audit)
| Concern | Owner |
|---|---|
| Editorial facts and relationships | Structured CMS — Prisma models + `lib/cms/*Service.ts` |
| Page presentation and layout | Visual Builder — `PageLayout` (draft/published) + `lib/cms/sectionRegistry.ts` + `components/blocks/registry.tsx` → `PageRenderer` |
| Titles, descriptions, canonical, robots, JSON-LD, sitemap | SEO Intelligence — `lib/seo.tsx`, `lib/seo/*`, `ArticleSeo`, `EntitySeo` |
| Identity, sessions, permissions | `lib/auth/*` — session cookie (SHA-256 hash stored), bcrypt cost 12, role→permission RBAC |
| Media | `lib/media/storage/{local,s3}.ts` behind one adapter (`MEDIA_STORAGE_PROVIDER`) |
| Publishing / revisions / scheduling | `lib/cms/pageLayoutService.ts` + `PageLayoutRevision` + `lib/cms/scheduledPublishRunner.ts` |

### Database
83 models · 31 enums · 78 `@@index` · 36 unique constraints · 19 migrations.
`onDelete: Cascade` is explicit on 64 relations; the 18 relations without it rely on
Prisma defaults (required → `Restrict`, optional → `SetNull`), which is the correct
behaviour for `Article.author`, `Article.category` and `AuditLog.actor` — authors,
categories and audit rows survive deletion of related records.

### External dependencies
PostgreSQL (local dev + test; Aiven intended for staging/production), Cloudflare R2 via the
S3 adapter, Google Fonts (the only third-party origin in the CSP). No analytics SaaS, no
Sentry configured (`SENTRY_DSN` optional).

---

## 3. Local execution (Phase 2) — both environments verified

No Docker introduced. Dependencies already installed; `prisma generate` run after the pull.

| Instance | Command | Database | Result |
|---|---|---|---|
| Production build | `next build` + `next start -p 3100` | isolated `localhost:5433/nfrguide_test` | `/api/health/` **200**, `/api/ready/` **200** `{database: ok, environment: ok}` |
| Development | `npm run dev` (port 3000) | `localhost:5433/nfrguide_dev` (real content) | `/api/health/` **200**, `/api/ready/` **200**, **no runtime errors** |

**The development database was two migrations behind and could not run the app.** Prisma
selects every schema column, so a missing `PageLayout."scheduledById"` would have failed
every Builder-driven page. With the owner's explicit approval the two **additive**
migrations were applied to the development database only
(`ALTER TABLE "PageLayout" ADD COLUMN "scheduledById" TEXT` and
`CREATE TABLE "PageLayoutRevision"`), behind a guard that aborts on any non-local host or
on a match with `CLOUD_DATABASE_URL`. No data was deleted or altered. Status afterwards:
*"Database schema is up to date!"* (19/19).

Verified on the development instance with real content: `/`, all five sections,
`/competitors/`, `/venues/`, `/about/`, `/sitemap.xml`, `/robots.txt` all **200** with real
headings, and `/admin/` correctly **307 → /admin/login/**.

---

## 4. Public website audit (Phase 3)

Method: every URL in the live sitemap (49) plus 19 known static, auth, gated and error
routes — **68 URLs, 62 HTML pages** — fetched and parsed for status, title, description,
canonical, robots, heading order, `alt` text, `<main>`, JSON-LD validity and internal
links. Then 11 page templates × 3 viewports in Chromium for layout, console and network.

### Status
`{200: 62, 307: 2, 308: 1, 404: 3}` — the 307s are `/admin/` and `/admin/articles/`
redirecting to login, the 308 is a trailing-slash normalisation, and the 404s are the
deliberate not-found probe plus two URLs **I** guessed wrongly (see below).

### Verified correct
- **All seven NFR disciplines exist** — `bareback-riding`, `steer-wrestling`, `team-roping`,
  `saddle-bronc-riding`, `tie-down-roping`, `barrel-racing`, `bull-riding`. My first probe
  used `/disciplines/bareback/` and `/disciplines/saddle-bronc/`, which are not the real
  slugs; the product requirement is satisfied.
- **No broken internal links** — 67 unique links checked.
- **No missing title or meta description** on any HTML page.
- **No duplicate canonical URLs**; no page canonicalises away from itself.
- **No `noindex` page appears in the sitemap** — the central indexability policy holds.
- All seven legal pages render `noindex` with a visible draft notice and are sitemap-excluded.
- **No invalid JSON-LD** anywhere; `@type` histogram `BreadcrumbList 55, Article 21, NewsArticle 2`.
- **No images without `alt`**; exactly one `<main>` landmark per page.
- **No horizontal overflow** at 1280, 768 or 390 px across 11 templates.
- Local timings (production build, cold cache): TTFB 16–83 ms, load 789–1263 ms.

### Defects found — and fixed in this audit
**A-01 · Skipped heading levels on 16 of 62 pages (P2, accessibility — WCAG 1.3.1/2.4.6).**
Every category archive and most article pages jumped a heading level, so a screen-reader
user navigating by heading was told of a level that does not exist. Four templates were
responsible, each fixed by emitting the correct level (visual size comes from the CSS
classes, so there is **no design change**):

| Component | Was | Now | Why |
|---|---|---|---|
| `components/editorial/TableOfContents.tsx` | `h3` right after the article `h1` | `h2` | sibling of the `h2` body sections it lists |
| `components/editorial/ArticleBody.tsx` (callout) | `h4` between `h2` sections | `h3` | nested under a body section |
| `views/CategoryArchiveView.tsx` | `h3` grid cards straight after `h1` | added `<h2 class="sr-only">Articles in …</h2>` | names the listing region without touching the shared grid, which is also used under an existing heading |
| `components/editorial/ContentEmptyState.tsx` | `h3` | `h2` | both call sites render it as a page-level region under the page `h1` |

The homepage form of the same defect (`EditorialHero`, `h1→h3`) was fixed earlier in the
session. **Verified after the fix: `heading jumps: none` across all 62 pages.**

**A-08 · `<img>` rendered with no `src` when an article has no hero image (P3) — FIXED.**
`heroImage` is `z.string().optional().default('')`, so an article can be published without
one. The first pass of this audit assumed 11 unguarded components and deferred the work;
re-inspection found a **single shared seam** — every card, feed, related-articles block and
coverage section renders through `components/ImageWithCredit.tsx`, which already had an
"Image unavailable" panel that was only reachable through `onError`. A browser fires no
error event for an `<img>` with no `src` at all, so the panel never ran. A blank `src` now
takes the same path as a failed load; the two raw `<img>` tags in `EditorialHero` were
guarded, and the other five raw image sites were **already** guarded. No placeholder
artwork was invented and the real alt text is preserved. Verified live: **6 broken images
→ 0**, and the responsive sweep is now completely clean.

**A-09 · The global 404 inherited the homepage title (P3) — FIXED.** `app/not-found.tsx`
had no metadata, so a missing page announced itself as "NFRGuide — Independent Rodeo
Editorial & Championship Coverage". It now has its own title, description and
`noindex, follow`. Verified live: `title=Page not found — NFRGuide`.

### Corrections to this audit's own earlier findings

Browser verification overturned two findings that plain HTTP had produced. Both came from
measuring the **pre-hydration shell**: `notFound()` and `redirect()` complete on the client
when the streamed shell has already been flushed, so the first HTML document legitimately
lacks the page body.

- **The discipline not-found page is correct.** It returns **HTTP 404** and renders
  `h1` "Arena Route Not Found" with title "Discipline Not Found — NFRGuide". The earlier
  "no `h1`" reading was wrong.
- **`/account/` delivers the visitor to `/login/`.** Final URL `/login/`, `h1` "Sign in".
  Only the first document's status is 200 rather than 3xx. No account data is exposed and
  the route is `noindex`, so this is accepted and documented (D-A4) rather than
  restructured — a clean 3xx would require moving auth into `middleware.ts`, which today
  only sets headers.
- The `h1 count != 1` rows that persist in the HTTP-level audit output for `/account/` and
  the two mistyped discipline URLs are this same measurement artifact, not defects.

### Defects found — documented, deliberately not fixed
- **SEC-01 · CSP is report-only.** Quantified this execution: the homepage alone emits
  **9 inline `<script>` tags** (23 total), all generated by Next for the RSC payload and
  hydration. Enforcing without a nonce pipeline threaded through every framework script
  would break hydration, so it cannot be done as a minimal pre-deployment change.
- **Homepage emits no structured data at all.** Correct today: a `BreadcrumbList` on a
  homepage would be wrong, and `Organization`/`WebSite` is blocked on owner decision D-14.
- `?_rsc=…` requests reported as `ERR_ABORTED` are Next.js prefetches cancelled when the
  browser context closes — **benign**, not a defect.

---

## 5. Admin & CMS audit (Phase 4) — what was actually exercised

Admin workflows were exercised by the project's own Chromium suite against the running
production build (**125 tests, all passing**), distributed as:

| Spec | Tests | Admin area covered |
|---|---|---|
| `a11y.spec.ts` | 24 | public templates + authenticated admin media/SEO/monetization/team/settings/editor, label associations |
| `stage07-templates.spec.ts` | 19 | detail + directory templates, Builder canvas selection, frame security |
| `stage08-publishing.spec.ts` | 17 | hero links, **version-conflict path**, no autosave, no undo/redo, canvas contract |
| `public.spec.ts` | 16 | public smoke, JSON-LD, legal pages |
| `stage06-visual-builder.spec.ts` | 13 | three-panel Builder, device modes, draft isolation, embed preview auth |
| `page-layout.spec.ts` / `page-builder.spec.ts` | 7 / 7 | layout save/publish, block add/remove/reorder/visibility |
| `admin.spec.ts` | 7 | login/logout, session, protected routes |
| `stage09-seo-admin.spec.ts` | 5 | article SEO preview, landing SEO canonical preview, info-pages workflow table |
| `navbar` / `analytics-collection` / `seo-assistant` / `account-menu` | 4 / 3 / 2 / 1 | navigation, analytics, SEO assistant, reader account menu |

Plus **2572 Vitest tests** (117 files), many of which are DB-backed integration tests
covering article workflow, RBAC on every InfoPage transition, publishing concurrency,
revision recovery, scheduling, cache scope, media validation and monetization.

**Not independently verified in this audit** (stated plainly rather than claimed):
manual click-through of all 21 dashboard modules; media upload against real Cloudflare R2
(local runs use the `local` provider); comment moderation UI; reader-account email flows
(no email provider is configured); and admin usability on a physical mobile device.

---

## 6. Database, security and SEO verification (Phases 5–7)

### Migrations (Phase 5)
`npm run test:migration` replayed **all 19 migrations onto a brand-new disposable
database**, asserted every expected table, the `tsvector` column, the GIN index and a live
`websearch_to_tsquery` match, then dropped the database: **8 passed, 0 failed.** So every
migration the current code needs exists and applies cleanly from scratch. No migration was
created, and no remote database was touched.

### Security (Phase 6)
| Control | Finding |
|---|---|
| SQL injection | **No unsafe raw-query variants anywhere** (`$queryRawUnsafe` / `$executeRawUnsafe` count: 0). All raw SQL uses tagged templates or `Prisma.sql`, i.e. parameterised |
| Passwords | bcrypt (`bcryptjs`) cost 12; no custom crypto |
| Sessions | `httpOnly`, `secure` in production, `sameSite=lax`, expiring; only the SHA-256 hash is stored |
| CSRF | Server Actions + `sameSite=lax` session cookie |
| Rate limiting | durable (DB-backed) for auth, plus analytics, media upload and CSP report endpoints |
| XSS | Three raw-HTML render sites, all safe: a constant stylesheet string in the Builder canvas bridge, a search highlighter that explicitly renders text only, and `views/LegalPageView.tsx`, which passes stored legal HTML through `sanitizeLegalHtml()` first. JSON-LD is escaped by `serializeJsonLd` |
| Headers (live) | `X-Frame-Options: SAMEORIGIN`, HSTS `63072000; includeSubDomains`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` camera/mic/geo/topics off |
| CSP | **Report-only**, and `script-src` permits inline script — a standing limitation, not a regression |
| Secrets | none in `render.yaml` (all `sync: false`); `apps/web/.env` git-ignored; startup log redacts `DATABASE_URL` |
| Admin/API caching | `private, no-store` on `/admin/*`, `no-store` on `/api/*` |

### SEO (Phase 7)
Verified above in §4: unique titles, descriptions present, canonical consistency, central
indexability policy with no sitemap/robots contradiction, valid JSON-LD matching page type,
`robots.txt` and `/sitemap.xml` both 200. Staging protection is enforced by
`middleware.ts` only when `STAGING_NOINDEX=true`, which `render.yaml` sets for the staging
service — so staging cannot be indexed while the production origin stays indexable.
Publisher identity in structured data remains owner decision **D-14**.

---

## 7. Files changed by this audit

| File | Change |
|---|---|
| `components/editorial/TableOfContents.tsx` | heading `h3` → `h2` (A-01) |
| `components/editorial/ArticleBody.tsx` | callout title `h4` → `h3` (A-01) |
| `components/editorial/ContentEmptyState.tsx` | heading `h3` → `h2` (A-01) |
| `views/CategoryArchiveView.tsx` | added screen-reader-only listing heading (A-01) |
| `components/ImageWithCredit.tsx` | a blank `src` now routes to the existing fallback panel (A-08) |
| `components/sections/EditorialHero.tsx` | heading `h3` → `h2` (A-02) + both raw `<img>` tags guarded (A-08) |
| `app/not-found.tsx` | own title, description and `noindex, follow` (A-09) |
| `tests/audit-heading-hierarchy.test.ts` | **new** — 8 rendered-markup regression tests |
| `tests/audit-image-fallback.test.ts` | **new** — 9 rendered-markup regression tests |
| `tests/stage08-hero-links.test.ts` | +4 heading-hierarchy tests |
| `e2e/a11y.spec.ts` | **new test** — category archive, slug read from the database |
| `e2e/stage06-visual-builder.spec.ts` | settled-width measurement, fixing the flake (D-A6) |

Earlier in the same session (Stage 09 continuation): `render.yaml` gained the missing
`INTERNAL_REVALIDATE_SECRET` declaration, plus the SEO-admin and sitemap-revalidation work
listed in `docs/stage-09/STAGE_09_FINAL_COMPLETION_REPORT.md` §G.

Earlier in the same session (Stage 09 continuation): `EditorialHero.tsx` heading fix +
4 tests in `stage08-hero-links.test.ts`, and `render.yaml` gained the missing
`INTERNAL_REVALIDATE_SECRET` declaration. Full list in
`docs/stage-09/STAGE_09_FINAL_COMPLETION_REPORT.md` §G.

---

## 8. Regression evidence (Phase 11)

**Final regression executed on Node 22.23.4** — the version `render.yaml` pins and
`engines` requires — via `fnm exec --using=22.23.4`. Earlier runs in this session used Node
24.15.0; the table below is the Node 22 run, after all fixes. (`fnm exec` cannot resolve
Windows' `npx` shim, so the package binaries are invoked through `node` directly.)

| Check | Command | Node | Result |
|---|---|---|---|
| TypeScript | `tsc --noEmit` | 22.23.4 | **PASS** (exit 0) |
| ESLint | — | — | **NOT CONFIGURED / NOT RUN.** No `.eslintrc*`/`eslint.config.*`, no `eslint` dependency, no `lint` script. A dependency was **not** added merely to claim a lint pass. |
| Vitest (unit + integration + PostgreSQL) | `vitest run` | 22.23.4 | **PASS — 118 files, 2580 tests, 0 failed, 0 skipped** |
| Production build | `next build` | 22.23.4 | **PASS** (compiled successfully) |
| Route smoke | `scripts/route-smoke.mts` | 22.23.4 | **PASS — 37/37** |
| Cache invalidation | `scripts/cache-invalidation.mts` | 22.23.4 | **PASS — 10/10** |
| Playwright / Chromium | `playwright test` | 22.23.4 | **PASS — 125/125, 0 failed, 0 flaky** |
| Accessibility | `a11y.spec.ts` (24 tests, inside the Chromium run) | 22.23.4 | **PASS** — includes the homepage heading check that used to fail and the category archive added by this audit |
| Migration replay | `scripts/migration-replay.mts` | 22.23.4 | **PASS — 8/8** on a fresh disposable database, then dropped |
| Mutation testing | 21 mutants (Stage 09 tooling) | 24.15.0 | **PASS — 21 killed, 0 survived** (not re-run on Node 22; it exercises source mutations, not runtime behaviour) |
| Public HTTP audit | 68 URLs / 62 HTML pages | 22.23.4 | heading jumps **0** · broken links **0/67** · invalid JSON-LD **0** · images without `alt` **0** |
| Responsive + console | 11 templates × 3 viewports | 22.23.4 | **no findings at all** — overflow 0, broken images 0 |
| Browser behaviour probe | not-found / account / 404 title | 22.23.4 | discipline 404 → **HTTP 404 + `h1`**; `/account/` → lands on `/login/`; global 404 title → **"Page not found — NFRGuide"** |

**No flaky test remains.** `stage06-visual-builder › device modes change the canvas viewport
width` had failed twice earlier under full-suite load; the cause was reading `boundingBox()`
mid-CSS-transition, and the test now waits in-browser until the width is unchanged for three
consecutive animation frames. It passed in the final full run. No assertion was weakened and
no test was skipped or deleted.

---

## 9. Requirements traceability (Master Requirements v2.0 §§12–13)

Public acceptance tests **WEB-01…WEB-20**: evidence exists for navigation, admin-curated
homepage, article rendering, metadata/canonical, hub/event/edition behaviour, search,
draft inaccessibility, slug redirects, sitemap/robots policy, structured data, responsive
images with `alt`, keyboard access, viewports, no admin data leakage and 404 recovery —
through `public.spec.ts`, `a11y.spec.ts`, the route harness and §4 of this audit.
WEB-17 (ads and layout shift) is **not applicable**: no third-party ad scripts load.

Admin acceptance tests **ADM-01…ADM-24**: covered by automated evidence for login/session
(ADM-01), server-side authorization (ADM-02), revision restore (ADM-04), publication
blockers (ADM-07/08/09), scheduling execution and idempotence (ADM-10/21), canonical event
URLs (ADM-12/13), slug redirects (ADM-14) and homepage reorder preview (ADM-20).
**Not verified in this audit:** ADM-11, ADM-15, ADM-16, ADM-17, ADM-19, ADM-22, ADM-23,
ADM-24 — they need manual CMS exercise or an integration that is not configured locally.

**One divergence requires owner sign-off.** ADM-03 reads *"Article create/**autosave**
persists"*, but the implementation deliberately has **no autosave**, and
`e2e/stage08-publishing.spec.ts` asserts that none was introduced ("nothing saves without
the button") — a decision carried through Stage 08 and Stage 09. Approved acceptance test
and approved implementation therefore disagree. Recorded as **D-A1** for sign-off; this
audit did not change either side.

---

## 10. Verdict

**READY FOR STAGING DEPLOYMENT REVIEW — OWNER DECISIONS REQUIRED.**

Every automated gate passes on the Render-pinned runtime (Node 22.23.4), the application
runs locally on both databases, all 19 migrations replay cleanly onto a fresh database, and
every engineering-owned defect in scope is fixed with regression coverage: heading hierarchy
across 16 pages, the missing-image fallback, the 404 title, the flaky Builder test and the
runtime mismatch.

What remains is not engineering work. Eight owner decisions are consolidated with tick-boxes
in `NFRGUIDE_OWNER_DECISIONS_REQUIRED.md`, the reconciled blocker list is in
`NFRGUIDE_FINAL_BLOCKER_REGISTER.md`, and the deployment sequence is in
`NFRGUIDE_RENDER_FREE_DEPLOYMENT_READINESS.md`. Infrastructure preparation was explicitly
excluded from this execution and none was performed. This does not authorise a deployment,
and local tests passing does not make the project production-ready.
