# NFRGuide — Batch B: Accessibility, Demo-Content Safety and Release Verification

**Date:** 2026-11-04
**Branch:** `feature/nfr-phase2-foundation-public-fixes`. HEAD is `4ad0ae4`, the same as `origin/main`. There is no upstream, and nothing was committed, pushed or deployed.
**Runtime:** all checks ran on Node **22.23.4** (fnm). The test database was **`localhost:5433/nfrguide_test`**, which is isolated and guard-confirmed.

**Status labels:**
- **IMPLEMENTED:** code changed.
- **VERIFIED:** an executed check passed.
- **BLOCKED:** cannot run within the safety rules.
- **NOT VERIFIED:** not exercised.

---

## 1. Summary

| Area | Status |
|---|---|
| Editor accessibility: 3 unlabelled inputs and 6 unnamed selects (plus 1 more of each associated by the same fix), required-marker contrast, target size | IMPLEMENTED + VERIFIED |
| Header search button: label in name | IMPLEMENTED + VERIFIED |
| Heading hierarchy: footer h4 → h2; article author/sources h3 → h2 | IMPLEMENTED + VERIFIED |
| Contrast on all audited public and admin pages, using new design tokens | IMPLEMENTED + VERIFIED (axe: 0 serious/critical) |
| Visible focus: dual-ring token that utilities cannot remove | IMPLEMENTED + VERIFIED |
| `e2e/a11y-known-issues.json` | **Emptied.** All 15 Batch A entries are fixed; no suppressions remain |
| Fixture exclusion from all public reads in production | IMPLEMENTED + VERIFIED (integration tests) |
| `seed-rodeo-links.mts`: dry run by default, local/non-production guard | IMPLEMENTED + VERIFIED |
| Code-level demo claims ("Thomas & Mack Standard", "Rodeo Visual Archive") | REMOVED + VERIFIED (crawl) |
| Dependency advisories (7) | Reviewed. **No safe in-range fix exists**, so they are documented and not applied |
| CI configuration (Node 22.23.4, PG 18, step order, skip gate, guards) | VERIFIED (static) / GitHub run NOT VERIFIED (no push) |
| Fresh empty-database run | **BLOCKED** (needs creating and migrating a database) |

**Test totals:**
- **Vitest 341/341** (0 skipped, skip gate passed).
- **Playwright 36/36, twice** (0 flaky).
- **Route smoke 37/37.**
- **Crawl of 52 pages:** 0 purse leaks, 0 code-level claims.
- **Script guards:** 6/6 refusals.
- tsc, `prisma validate`, build (57 pages) and `git diff --check` all pass.

---

## 2. Accessibility

**Method:**
1. A detailed axe dump for every audited page, authenticated where needed. The throwaway admin was created and removed in the test DB only.
2. Root-cause fixes.
3. Rebuild and re-dump.
4. Full Playwright run.

### Fixed

| Issue (Batch A baseline) | Root cause | Fix |
|---|---|---|
| Editor `label` (3, critical) and `select-name` (6, critical) | Visible `<label>`s not associated with their controls | `htmlFor` plus `id` for all **10** controls (Workflow State, Reviewer, Article Type, Primary Section, Subcategory, Author Byline, Disclosure, Usage Rights, Credit, Caption). Visible text is unchanged |
| Editor `target-size` | 10px "Reset to Headline" link-button | `inline-flex min-h-6 px-1` (24px target); look unchanged |
| `label-content-name-mismatch` (home, section, article, legal) | Search button `aria-label="Open search dialog"` did not contain the visible "Search" | `aria-label` removed, so the name comes from visible text. Added `sr-only` text on small screens, `aria-hidden` on the icon and the ⌘K hint, and `aria-haspopup="dialog"` |
| Heading jumps h1→h3 (article) and h2→h4 (legal and other pages) | Footer column titles were h4; article author bio and sources were h3 | Footer `h2`; `AuthorBio`/`SourceList` `h2` (same visual classes) |
| `color-contrast` (17/11/10/3/2/34 nodes; Overview 19, newly audited) | `text-stone-400/500` on white/sand; `stone-500` on charcoal/navy; light-only crumbs on the dark hero; `rose-500` required markers | New tokens in `app/globals.css` `@theme`: `--color-ink-muted` #57534D (≥6.9:1 on light), `--color-ink-inverse-muted` #A8A29E (≥5.6:1 on dark), `--color-required` #BE123C. Applied by context to the affected components (light versus dark checked per file, dark exceptions handled). `Breadcrumbs` and `ImageWithCredit` gained a `tone` prop. ⌘K hint changed to `stone-300` |
| Weak focus indicator (gold-only, about 2:1 on white; inputs used `focus:outline-none`) | — | `:focus-visible` dual ring (2px gold outline, 2px charcoal inner), `!important` so utilities cannot remove it |

**Coverage added to `e2e/a11y.spec.ts`:**
- pages: discipline, rodeo-event and edition pages, plus the authenticated admin Overview;
- every one of the 10 editor controls must be found by its visible label;
- a focused editor input shows the ring (solid 2px outline plus shadow);
- the search button's accessible name contains "Search" and it has no `aria-label`;
- the mobile drawer opens and closes using only the keyboard.

**Result:**
- axe reports **0 serious/critical violations** on 8 public pages and 2 authenticated admin pages.
- **No heading jumps; exactly one h1; no `<img>` without alt; one `<main>`; Tab focus visible.**
- `a11y-known-issues.json` is now `[]`. A static test fails if a fixed rule is ever re-added.

### Remaining / not verified (no conformance claim)

- **Not audited:** other admin modules (Media, SEO, Monetization, Team, Settings, Competitors, Landing SEO). They still contain `text-stone-400` on light surfaces, as found by grep (for example `AdminMonetizationPage.tsx:149,237`, `AdminLandingSeoPage.tsx:51`, `AdminCompetitorsPage.tsx:82`), and probably have contrast debt.
- **Manual checks still needed:**
  - screen readers (NVDA, VoiceOver);
  - full keyboard journeys, including modals and focus trapping;
  - 200%/400% zoom and reflow;
  - text over images;
  - reduced-motion styles (none exist; only rendering was checked);
  - a skip link (none exists).

---

## 3. Demo-content safety (no database changes)

- **`lib/fixturePolicy.ts` (new):**
  - `excludeFixturesFromPublic()` is true when `APP_ENV=production`.
  - Helpers: `publicArticleWhere()`, `publicSlugWhere()` and `isHiddenFixtureSlug()`.
- **Applied to every public read:**
  - all 16 article filters in `lib/content.ts`, covering feeds, slug pages, sitemap slugs, hero, evergreen and the redirect-target check;
  - hub, event and edition lists and by-slug lookups, the resolver, and SSG/sitemap slugs in `lib/rodeoContent.ts`, including linked-article and hub/event cross-lists;
  - article SQL and the rodeo lists in `lib/search/publicSearch.ts`.

  In test/CI, fixtures remain visible so the smoke and e2e tests can run.
- **`scripts/seed-rodeo-links.mts`:**
  - still functional;
  - **dry run by default** (`--apply` to write);
  - guarded by the new `requireLocalNonProductionDatabase()`, which refuses remote/cloud hosts and `APP_ENV`/`NODE_ENV=production`;
  - only creates missing hub↔event links between existing rows, and never writes demo text.
  - Verified: a dry run on the test DB reported "would ensure 3 link(s)" with no writes; the cloud-host and production runs exit 2.
- **`data/mockEditorialData.ts`:** clearly marked as Phase 0 demo data. A test asserts that its **only** importer is `scripts/seed-rodeo-links.mts`.
- **Admin article list:** a **FIXTURE** badge on `fixture-` rows.
- **Hard-coded claims removed:** "Thomas & Mack Standard" from the discipline header on every discipline page, and "Rodeo Visual Archive" from the broken-image placeholder.
- **Not changed (per the brief):** no database records were deleted, unpublished or edited. Seed and import behaviour is unchanged; the seed is still create-only and fixture-gated.

**Tests (`tests/batchB.test.ts`, 18):**
- static checks for the accessibility fixes, the import guard, policy usage, and the script's dry-run/guard order;
- guard unit tests;
- script refusal subprocesses;
- **DB integration:** in test mode fixtures are visible; with `APP_ENV=production` (toggled per test, then restored) fixtures are absent from every article read, rodeo list and lookup, SSG slug list, search (articles and rodeo) and redirect resolution, while legitimate content still appears.

---

## 4. Dependency advisories (read-only `npm audit`)

| Package | Severity | Direct? | Installed | Advisory | Affected | Fix |
|---|---|---|---|---|---|---|
| vitest | critical | direct, **dev** | 3.2.7 | via @vitest/mocker, tinypool | 0.0.95–4.1.10 | vitest 5.1.0 (**major**) |
| tinypool | critical | transitive, dev | 1.1.1 | GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr (prototype pollution → RCE) | ≤2.1.1 | via vitest 5 |
| @vitest/mocker | moderate | transitive, dev | 3.2.7 | GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8 | ≤4.1.11 | via vitest 5 |
| prisma | high | direct, dev CLI | 6.19.3 | via @prisma/config | 6.13–7.10.0 | prisma 7.10.1 (**major**; datasource-config change) |
| @prisma/config | high | transitive | 6.19.3 | via deepmerge-ts | — | via prisma 7 |
| deepmerge-ts | high | transitive | 7.1.5 | GHSA-ggr8-5vv4-36mx (stack exhaustion) | <8.0.0 | via prisma 7 |
| **sharp** | high | **direct, runtime** | 0.33.5 | GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w (libvips, libheif and librsvg CVEs) | <0.35.5 | sharp 0.35.5 (0.x minor = breaking) |

- **No remediation applied.**
  - Every fix is a semver-major or out-of-range change.
  - `overrides` would force `tinypool@2` under `vitest@3` and `deepmerge-ts@8` under `@prisma/config@6`, which the brief rules out.
  - The lockfile is unchanged in Batch B.
- **Risk notes:**
  - The vitest and tinypool issues affect dev/CI tooling only, and are exploitable only by code that is already being executed.
  - The Prisma advisory is in CLI config merging, not `@prisma/client` 6.19.3.
  - **sharp is the real production exposure**, because it decodes uploaded images. Uploads are authenticated, magic-byte checked and limited to JPEG/PNG/WebP, which reduces but doesn't remove the risk.
- **Recommendation:** dedicated upgrade batches: sharp 0.35.x first (rerun the media tests), then vitest 5, then Prisma 7 (it needs a config migration).

---

## 5. CI configuration (verified statically; no push)

- Parsed `.github/workflows/ci.yml`: 18 steps.
- `node-version-file: .nvmrc` resolves to **22.23.4**; `engines` is `>=22.23.4 <23`.
- `postgres:18` matches production (18.6, from `AIVEN_CLOUD_DATABASE_VERIFICATION.md`).
- Order: DB-target assertion → generate → validate → **migrate (6) → seed (7) → vitest (9) → skip gate (10)** → replay → **build (12) → start (13) → route smoke (14) → Playwright (16)**.
- `REQUIRE_DB_TESTS=1`: vitest refuses to start without an isolated DB.
- The skip gate fails on any skipped, pending or todo test, any failure, or zero executed tests.
- The guards refuse dev and production targets: unit tests plus 6 executed refusals (§6).
- **GitHub Actions has never run this workflow version** (no push): NOT VERIFIED.
- **Fresh empty-database verification: BLOCKED.** The only NFRGuide databases are `nfrguide_dev` and `nfrguide_test`, both holding data (read-only `pg_database` listing). Creating or migrating a new one is prohibited. No reset, drop or truncate was used to force it.

---

## 6. Commands and results

All run from `apps/web`, with Node 22.23.4 first on PATH.

| # | Command | Result |
|---|---|---|
| 1 | Scratchpad axe diagnostics (`axe_diag.cjs`) against `next start :3100` on the test DB; throwaway admin created and deleted in the test DB (`diag_admin.cjs`) | Before: violations listed in §2; after: 0 serious/critical on all audited pages |
| 2 | `npx tsc --noEmit --incremental false` | pass (exit 0) |
| 3 | `npx prisma validate` | valid |
| 4 | Lint | **not configured** (no `lint` script) |
| 5 | `REQUIRE_DB_TESTS=1 npx vitest run --reporter=default --reporter=json --outputFile=…` | **38 files, 341 passed, 0 failed, 0 skipped** |
| 6 | `node scripts/assert-no-skipped-tests.mjs … tests/allowed-skips.json` | "341 passed, 0 failed, 0 intentionally skipped, 0 unexpectedly not run"; exit 0 |
| 7 | `DATABASE_URL=<test> APP_ENV=test npx next build` | pass, 57 static pages |
| 8 | `npx playwright test`, two runs | **36/36 and 36/36**, 0 skipped, 0 flaky; teardown left 0 e2e users, articles or redirects and no credential file |
| 9 | `SMOKE_BASE_URL=http://localhost:3100 npm run test:routes` | **37 passed, 0 failed** |
| 10 | curl crawl of sitemap plus fixed URLs (52) | 0 purse leaks; 0 code-level claim hits |
| 11 | `npx tsx scripts/seed-rodeo-links.mts` on the test DB (dry run) | exit 0, "would ensure 3 link(s)", no writes |
| 12 | `seed-rodeo-links` with a cloud host or `APP_ENV=production` | exit 2 (refused) ×2 |
| 13 | `admin-auth-smoke` / `cache-invalidation` / `media-http-check` with `TEST_DATABASE_URL` = dev DB | exit 2 (refused) ×3 |
| 14 | `npm audit --json`, `npm ls …` (read-only) | §4 |
| 15 | `psql -tAc "SELECT datname FROM pg_database …"` (read-only) | §5 |
| 16 | `check_ci.cjs` (YAML parse) | §5 |
| 17 | `git diff --check` | Clean after removing one trailing space that came from the original line in `SourceList.tsx` |

**Counts:**
- **Passed:** Vitest 341; Playwright 72 (36 × 2); route smoke 37; refusals 6.
- **Failed / skipped:** 0.
- **Blocked:** 2 (GitHub CI run; fresh empty database).

---

## 7. Files (Batch B, on top of the uncommitted Phase 2 and Batch A work)

**Modified:**
- `app/globals.css`
- `app/admin/(dashboard)/page.tsx`, `app/admin/login/{page,LoginForm}.tsx`
- `components/{SiteHeader,SiteFooter,ImageWithCredit}.tsx`
- `components/editorial/{Breadcrumbs,SectionLandingHero,AuthorByline,ArticleHeader,SourceList,AuthorBio,DisciplineGuideHeader,TableOfContents}.tsx`
- `components/sections/{HomeArticleFeed,LatestCoverage,CompetitionSection}.tsx`
- `components/monetization/ArticleMonetization.tsx`
- `components/admin/{AdminSidebar,AdminLayout}.tsx`, `components/admin/editor/{RichBlockEditor,RodeoRelationshipsPanel,ArticleSourcesPanel,SearchAppearancePreview}.tsx`
- `views/{ArticleView,SectionLandingView,LegalPageView,CategoryArchiveView,DisciplineGuideView,RodeoViews}.tsx`
- `views/admin/{AdminArticleEditorShell,ArticleSeoPanel,AdminArticlesPage}.tsx`
- `lib/{content,rodeoContent}.ts`, `lib/search/publicSearch.ts`
- `scripts/seed-rodeo-links.mts`, `data/mockEditorialData.ts` (header only)
- `tests/support/testDbGuard.ts`
- `e2e/a11y.spec.ts`, `e2e/a11y-known-issues.json`

**Added:**
- `lib/fixturePolicy.ts`
- `tests/batchB.test.ts`

**Deleted:** none.

**Working tree overall (Phase 2 + A + B):** 78 tracked files changed (+1595 / −3169) and 25 untracked paths.
- `package-lock.json`: unchanged in Batch B.
- Schema and migrations: unchanged.
- No `.env` is tracked; `apps/web/.env` was last modified in the original setup session.

---

## 8. Safety confirmation

- **Production:** no connection, query or change.
- **Databases:** no reset, drop, truncate, migration or `db push`.
- **Local dev DB:** not written; scripts were only run in refusal mode against it.
- **Test DB:** test rows only, all cleaned up (6 seeded fixtures remain by design).
- **Other:** no credential rotation, `.env` edit, Docker, commit, push or deploy.
- **Note:** the local `.next` build was made against the **test** DB. Rebuild before running `next start` against another database.

---

## 9. Remaining launch blockers

1. **Production data:** the demo corpus and its claims are still stored in production (Aiven) and in the local dev DB. They need an owner-approved clean-up with a dry-run report. The fixture policy prevents test fixtures, not legacy demo articles, from appearing.
2. **`sharp` runtime advisories:** a dedicated upgrade batch is needed. Also: the vitest 5 and Prisma 7 major upgrades.
3. **First real CI run:** the owner needs to push the branch, and environment differences need fixing if any appear.
4. **Fresh-database verification:** run it on CI's disposable database, or approve creating a local disposable database.
5. **Accessibility outside the audited pages:** the other admin modules, manual assistive-technology checks, a skip link and reduced-motion styles.
6. **From earlier audits, unchanged:**
   - no durable job runner (scheduled publishing stays disabled);
   - hard delete instead of soft-archive;
   - no MFA or CSP; in-memory rate limiting;
   - no staging, hosting, monitoring or restore rehearsal;
   - legal-page wording awaiting owner/legal approval;
   - credential rotation.
