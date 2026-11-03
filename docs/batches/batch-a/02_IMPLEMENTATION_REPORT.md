# NFRGuide — Batch A "Truth and Test Reliability": Phase 2 Implementation Report

**Date:** 2026-11-03
**Branch:** `feature/nfr-phase2-foundation-public-fixes` (HEAD `4ad0ae4` = `origin/main`). Nothing committed, pushed or deployed.
**Runtime used for verification:** Node **22.23.4** (fnm installation, put first on PATH), npm 10.9.9. The system default `node` is 24.15.0 and was not used for verification.

**Status labels:**
- **IMPLEMENTED:** code changed.
- **VERIFIED:** an automated or HTTP check was executed and passed.
- **PARTIAL:** verified with a stated limit.
- **BLOCKED:** could not run within the safety rules.
- **OUT OF SCOPE**

---

## 1. Executive summary

All eight workstreams (A1–A8) are **implemented and verified locally** against the isolated test database (`localhost:5433/nfrguide_test`):

| Check | Result |
|---|---|
| Vitest, Node 22, `REQUIRE_DB_TESTS=1` | **323/323 passed, 0 skipped** (37 files). The new skip gate passes |
| Playwright (Chromium) | **29/29 passed, in two consecutive runs** (0 flaky). Teardown left 0 e2e rows and removed the credential file |
| Route smoke (read-only) | **37/37** against `next start` on the test DB |
| Writing-script guards | **9/9 refusals** (3 scripts × dev DB / remote-production-style / unparseable), exit 2 before any DB access |
| Rendered-HTML crawl, 53 pages | **0 purse leaks, 0 code-level claim hits** |
| Typecheck, Prisma validate, `next build` (57 static pages), `git diff --check` | All pass |

- **No** migration, schema change, database reset, production access, credential change or `.env` change.

**Not done (honest limits):**
- **CI was not executed on GitHub.** Pushing is prohibited. The workflow is validated structurally only.
- **A fresh-database run (seed → full suite) is BLOCKED**, because it would need `prisma migrate deploy` on a new database. The seed was verified on the existing isolated test DB instead.
- Automated accessibility checks found **real, pre-existing debt** (§10). It is recorded and reported, not fixed, as fixing it is outside Batch A scope.

---

## 2. Owner decisions implemented

| Decision | Implementation | Status |
|---|---|---|
| D1 Purse | Removed from the public edition model (`lib/rodeoContent.ts` `PublicEdition`, mapper) and view (`views/RodeoViews.tsx`). The admin field is kept as "Purse note (internal — never shown publicly)". Seed carries no purse | VERIFIED |
| D2 NewsArticle | `NEWS_ARTICLE_TYPES = {news, event update}` (case/whitespace-insensitive) in `lib/seo.tsx`; all other types are `Article` | VERIFIED |
| D3 Demo content | Seed rewritten: neutral reference data plus synthetic `fixture-` records, **only** in isolated test/CI DBs; create-only writes. No local or production rows deleted | VERIFIED (existing test DB) / fresh DB BLOCKED |
| D4 Versions | Node pinned to **22.23.4** (`/.nvmrc`; `engines: ">=22.23.4 <23"`; CI `node-version-file`). Production PostgreSQL major **verified = 18** (`AIVEN_CLOUD_DATABASE_VERIFICATION.md` §3 `server_version = 18.6`, matching the read-only cloud audit earlier this session), so CI uses `postgres:18` | VERIFIED (config) |
| D5 Playwright + axe | `@playwright/test@^1.64.1` and `@axe-core/playwright@^4.14.0` added as **devDependencies only** | VERIFIED |
| D6 Source picker | DB `Source` directory; server-validated `sourceId`; existing rows linked, never rewritten; no duplicates | VERIFIED |
| D7 No reset | No reset, truncate, drop or deletion of existing content. Old demo rows remain in the local dev and test DBs | Complied |
| D8 Scheduled rows | "Manual publish required" in the editor, list (badge and tab) and Overview; explains no automatic publishing; Unschedule and Publish Immediately kept | VERIFIED |

---

## 3. Workstream changes

**A1 — Structured data security and correctness**
- `lib/seo.tsx`:
  - new `serializeJsonLd()`, which escapes `<`, `>`, `&`, U+2028 and U+2029 to `\uXXXX`, so the output is still valid, equivalent JSON;
  - `JsonLd` now always uses it — this was the stored-XSS vector;
  - `isNewsArticleType()`;
  - the discipline headline is now "`{name} Guide`" (the "Official…" claim is removed).
- `components/editorial/DisciplineGuideHeader.tsx`: "Official NFR Discipline" → "NFR Discipline Guide".
- Results page metadata: "Official, source-verified" → "Source-verified".
- A static test confirms there is no other `application/ld+json` emitter outside `lib/seo.tsx`.

**A2 — Purse and truthfulness**
- The purse is removed from the public model and view.
- Edition copy no longer claims details "are verified per edition".
- Admin label and help text are reworded.
- Mobile drawer: removed the demo-article link and "Stream Live".
- Footer fallback and canonical footer navigation (`lib/cms/navCanonical.ts`) now point to routes that always exist (discipline guides, directory, search) instead of demo article slugs. Still 5 entries, so the canonical count stays 15. Existing DB nav rows are untouched (create-missing seed).

**A3 — Scheduling UI safety**
- Server: `SCHEDULED_PUBLISHING_AVAILABLE = false`. `transitionWorkflow` rejects `target === 'SCHEDULED'` **first, for every caller and role**, with exactly "Scheduled publishing is not available yet. Please publish manually."
- Exits from existing SCHEDULED rows (→ APPROVED, → PUBLISHED) are unchanged.
- UI:
  - the Schedule button is removed;
  - "scheduled" appears only as a disabled current-value option on legacy rows;
  - the embargo date input is replaced by an honest notice.
- List badge and tab and the Overview tile are relabelled.

**A4 — Mock admin pages and data**
- Deleted, with 0 importers confirmed: `views/admin/AdminOverviewPage.tsx`, `views/admin/AdminWebsitePage.tsx`, `data/mockAdminData.ts`.
- Notification drawer: an honest empty state; the permanent unread dot is removed.
- Source picker:
  - DB-backed via `listSourceDirectoryOptions()` (`lib/cms/adminQueries.ts`), passed through the new/edit pages, the shell and the panel;
  - new sources use a `new-` temporary id and status "Needs review" (previously a fake "Verified Official" with "Current Season");
  - server: `sourceId` in `ArticleInputSchema`, `resolveSources()` rejects unknown or deleted ids, `writeChildren` links existing rows without updating them, typed-in sources are create-only (`update: {}`), and duplicates are de-duplicated.
- Checklist label: "N of M checks passed" (was "% Score").

**A5 — Neutral seed**
- `prisma/seed.ts` rewritten. Reference data goes to any DB; `fixture-` content is written **only** when `decideTestDatabase()` reports an isolated local `*_test`/`*_ci` DB that isn't the cloud one.
- **All writes are create-only**; there are no deletes and no forced PUBLISHED.
- New side-effect-free `prisma/fixtures.ts`: the 7 discipline identities, 6 fixture articles (5 published, one per section, including one `News` and one `Event Update`, plus 1 draft), a hub, 2 events with no-date editions, a source and an author.
- `scripts/route-smoke.mts` now uses the fixture slugs.

**A6 — CI reliability** (`.github/workflows/ci.yml`)
- Node from `.nvmrc`; `postgres:18`.
- `REQUIRE_DB_TESTS=1`: vitest refuses to start without an isolated DB.
- A DB-target assertion step (localhost and a `_ci` name).
- Order: migrate → **seed** → typecheck → vitest (JSON report) → **skip gate** → migration replay → build → start → route smoke → Playwright → artifact upload.
- New `scripts/assert-no-skipped-tests.mjs` plus `tests/allowed-skips.json` (empty). Any non-allowlisted skip, pending or todo test, any failure, or zero executed tests fails the job.

**A7 — Browser and accessibility**
- `playwright.config.ts` refuses to run without an isolated DB.
- `e2e/global-setup.ts` and `global-teardown.ts` create and remove a random-password super_admin, a legacy SCHEDULED article and a redirect, in the test DB only. The credential is kept in the git-ignored `e2e/.auth/`.
- Specs: `e2e/public.spec.ts` (14), `e2e/admin.spec.ts` (6), `e2e/a11y.spec.ts` (9).
- Known-debt policy file: `e2e/a11y-known-issues.json`.

**A8 — Writing-script DB guards**
- `requireIsolatedScriptDatabase()` added to `tests/support/testDbGuard.ts`.
- Applied before any `lib/db` import in `scripts/admin-auth-smoke.mts`, `cache-invalidation.mts` and `media-http-check.mts`. Fails closed.

---

## 4. Files

These are Batch A changes, on top of the uncommitted Phase 2 work.

**Modified:**
- `.github/workflows/ci.yml`
- `apps/web/.gitignore`, `apps/web/package.json`, `apps/web/package-lock.json`
- `app/(public)/rodeo-events/[slug]/[edition]/results/page.tsx`
- `app/admin/(dashboard)/page.tsx`, `app/admin/(dashboard)/articles/{new,[id]/edit}/page.tsx`
- `components/{SiteFooter,SiteHeader}.tsx`
- `components/admin/{AdminNotificationPanel,AdminTopbar}.tsx`, `components/admin/editor/ArticleSourcesPanel.tsx`
- `components/editorial/DisciplineGuideHeader.tsx`
- `lib/{seo.tsx,rodeoContent.ts}`, `lib/cms/{adminQueries,articleService,navCanonical,relationshipTypes}.ts`
- `prisma/seed.ts`
- `scripts/{admin-auth-smoke,cache-invalidation,media-http-check,route-smoke}.mts`
- `tests/support/testDbGuard.ts`
- `views/RodeoViews.tsx`, `views/admin/{AdminArticleEditorShell,AdminArticlesPage,AdminRodeoCoveragePage}.tsx`
- `vitest.config.ts`

**Added:**
- `/.nvmrc`
- `apps/web/playwright.config.ts`
- `e2e/{support,global-setup,global-teardown}.ts`, `e2e/{public,admin,a11y}.spec.ts`, `e2e/a11y-known-issues.json`
- `prisma/fixtures.ts`
- `scripts/assert-no-skipped-tests.mjs`
- `tests/allowed-skips.json`, `tests/batchA.test.ts`

**Deleted:**
- `views/admin/AdminOverviewPage.tsx`, `views/admin/AdminWebsitePage.tsx`, `data/mockAdminData.ts`

**Overall uncommitted diff (Phase 2 + Batch A):** `55 files changed, +1277 / −2925`, plus 23 untracked paths.

---

## 5. Notable code decisions

- **Central serializer**, rather than escaping per field: it covers every current and future CMS field in every JSON-LD block.
- **Scheduling is rejected before the transition table**, so no role, path or direct Server Action call can create a SCHEDULED row. Legacy rows keep their exits. No scheduler code, timers or job tables were added.
- **Source directory integrity:** shared `Source` rows are never updated during article editing, which also fixes earlier gap D-E for sources.
- **Seed gating reuses the test-runner guard**, so the seed, Vitest, Playwright and the scripts share one definition of "isolated test database".
- **A tooling pitfall found and fixed:** ` ` escapes typed through the edit tooling became literal line separators, which broke two regex literals. The serializer now builds those patterns with `String.fromCharCode()`, and the source files were checked to contain 0 literal separators. The new skip gate caught this: the compile error made 52 DB tests silently skip, and the gate failed the run (exit 1).

---

## 6. Tests added

- **`tests/batchA.test.ts`:** 37 tests (unit, static and DB integration). Covers:
  - JSON-LD types for all 18 article types, missing fields, and 8 hostile payloads (`</script>` in mixed case, `<!--`, HTML, quotes and backslashes, Unicode and emoji, U+2028/2029, newlines, JSON specials): exact round-trip, no `<>&`, and a single script element in the rendered markup;
  - the single-emitter rule; no "Official" claims; the purse absent from the public model and view;
  - Schedule UI absent; "manual publish" labels; mock views, data, notifications and the unread dot gone; the source picker;
  - the checklist label;
  - the seed: no mock imports, no claim strings, `update: {}` only, no deletes, fixture naming and gating; route-smoke slugs; navigation and drawer without demo links;
  - CI pins and step order; skip-gate classification (passed / skipped / pending / todo / failed / empty / allowlisted); the empty allowlist;
  - script guard refusals and acceptance, and guard-before-import ordering in all 3 scripts.
  - **DB integration:**
    - SCHEDULED is rejected for super_admin, editor and author with the exact message and no change;
    - legacy SCHEDULED rows can still be unscheduled and manually published;
    - a directory source is linked without a duplicate or edit, even with a tampered title or URL; unknown `sourceId` is rejected; a typed-in source never overwrites; the same source twice is linked once;
    - an edition with a stored purse has no purse in the public object;
    - **the real seed run twice against the test DB:** fixtures created once; CMS edits (title, DRAFT status, discipline summary) are **not** reverted; row counts are unchanged.
- **Playwright:** 29 tests (§9).

---

## 7. Commands executed

All in `apps/web`, with Node 22.23.4 first on PATH unless stated.

1. `git fetch`, `rev-parse`, `status`, `diff` (baseline and final).
2. `npm install --save-dev @playwright/test @axe-core/playwright`; `npm install --package-lock-only --ignore-scripts` (engines sync); `npx playwright install chromium` (to the user cache, not the repo); `npm audit --json` (read-only).
3. `DATABASE_URL=<isolated test DB> npx prisma db seed`. Guard-confirmed target: `localhost:5433/nfrguide_test`. Create-only.
4. `REQUIRE_DB_TESTS=1 npx vitest run --reporter=default --reporter=json --outputFile=<scratchpad>`, then `node scripts/assert-no-skipped-tests.mjs <report> tests/allowed-skips.json`.
5. `npx tsx scripts/{admin-auth-smoke,cache-invalidation,media-http-check}.mts`, with `TEST_DATABASE_URL` set to the dev DB, a remote URL, or garbage (refusal checks only).
6. `DATABASE_URL=<test DB> APP_ENV=test npx next build`.
7. `npx playwright test`, run twice. Its `webServer` runs `next start -p 3100` on the test DB.
8. `next start -p 3100` (test DB, `APP_ENV=test`), then `SMOKE_BASE_URL=http://localhost:3100 npm run test:routes`, plus a curl crawl of 53 URLs.
9. `npx tsc --noEmit --incremental false`; `npx prisma validate`; `git diff --check`; a read-only YAML parse of `ci.yml`; a read-only leftover-row check on the test DB.

---

## 8. Test results

| Suite | Passed | Failed | Skipped | Notes |
|---|---:|---:|---:|---|
| Vitest (37 files) | **323** | 0 | **0** | isolated DB `localhost:5433/nfrguide_test`; skip gate exit 0 |
| Playwright run 1 | **29** | 0 | 0 | 67 s |
| Playwright run 2 | **29** | 0 | 0 | 67 s (reproducible) |
| Route smoke | **37** | 0 | — | read-only GETs |
| Script guard refusals | **9/9** | — | — | exit 2, no DB access |
| `tsc` / `prisma validate` / `next build` / `git diff --check` | pass | — | — | build: 57 static pages |

**Intermediate failures, all fixed and recorded:**
- 4 suites failed on the literal-separator compile error (§5).
- 1 Batch A test regex wrongly matched the comment "no real secrets.".
- 2 Playwright test bugs: the mobile drawer matched hidden desktop links; a mock-title assertion was invalid because the test DB legitimately contains old seeded `Source` rows.
- 6 axe audits and 2 heading checks failed on real, pre-existing accessibility debt (§10).

---

## 9. Browser test results (29/29)

**Public (14):**
- the homepage links all 5 sections; each section returns 200 with an h1;
- click-through navigation works; the 390 px mobile drawer shows all 5 sections;
- the fixture article has one H1 and exactly one `Article` JSON-LD object; the `News` fixture emits `NewsArticle`;
- no `<` in any JSON-LD body (home, article, discipline);
- 7 legal pages show the draft notice and `noindex`;
- an unknown article returns 404; the draft fixture returns 404 and its title is absent;
- a renamed slug goes through 308 to the live article;
- the fixture edition and the legacy Calgary 2026 edition show no "Purse" or purse values; the fixture edition shows "Dates to be confirmed".

**Admin (6):**
- the login form has labelled fields; unauthenticated `/admin/articles/` redirects to login;
- an authorized admin reaches the editor: no Schedule button or option, the "checks passed" label, and every source-picker entry exists in the DB `Source` table;
- a legacy SCHEDULED article shows "Manual publish required" with Unschedule and Publish Immediately, and the list badge is relabelled;
- the notification drawer shows its empty state and none of the former fake texts;
- all sidebar modules (≥12) return 200 with no "Phase 0 Mock".

**Accessibility (9):** see §10.

---

## 10. Accessibility findings

Automated axe (WCAG 2.0–2.2 A/AA tags) plus direct checks. **This is not a WCAG 2.2 AA conformance claim.**

**Passing everywhere tested:**
- one `<main>` landmark;
- no `<img>` without `alt`;
- exactly one h1;
- Tab moves focus to an element with a visible focus indicator;
- the reduced-motion context renders;
- the login form has labels.

**Known serious or critical debt** (recorded in `e2e/a11y-known-issues.json` with reasons; the suite fails on anything new):

| Page | Rule | Impact | Nodes |
|---|---|---|---|
| home / section / article / legal / login | `color-contrast` | serious | 17 / 11 / 10 / 3 / 2 |
| home / section / article / legal | `label-content-name-mismatch` (header control `.hover:bg-white/10`) | serious | 1 each |
| admin editor | `color-contrast` | serious | 34 |
| admin editor | **`label`** (text inputs without labels) | **critical** | 3 |
| admin editor | **`select-name`** (selects without accessible names) | **critical** | 6 |
| admin editor | `target-size` | serious | 1 |
| article | heading jump h1→h3 | — | — |
| legal (any page ending with h2) | heading jump h2→h4 (footer titles are h4) | — | — |

**Manual checks still needed:**
- screen-reader walkthroughs (NVDA, VoiceOver);
- full keyboard flows, including the editor, modals and focus trapping;
- 200%/400% zoom and reflow;
- reduced-motion behaviour (no reduced-motion stylesheet exists);
- skip link (none exists);
- contrast of text over images;
- touch-target audit on mobile;
- language and reading order.

---

## 11. CI workflow changes

See A6.

- Validated by a YAML parse: 18 steps, in order migrate (6) < seed (7) < vitest (9) < gate (10) < build (12) < start (13) < routes (14) < playwright (16).
- Uses `postgres:18`, `node-version-file: .nvmrc` (22.23.4), `REQUIRE_DB_TESTS=1`, and the DB `localhost:5432/nfrguide_ci`.
- No secrets, cloud URL or production host.
- **NOT executed on GitHub (BLOCKED: no push allowed).** The first CI run after the owner pushes is the real verification.

**Note:** `npm install --package-lock-only` under npm 10.9.9 also added optional `@tailwindcss/oxide-wasm32-wasi/*` lock entries (additions only, 0 lines removed). Harmless to `npm ci`.

---

## 12. Seed safety verification

| Check | Result |
|---|---|
| Fixture gating | Fixtures are seeded only when `decideTestDatabase()` is isolated. Verified on `nfrguide_test` ("fixtures: seeded into localhost:5433/nfrguide_test"). For a dev/non-disposable URL the guard returns `refused` (unit-tested), so only neutral reference data would be written. **The seed was not run against the dev DB or production** |
| Idempotent and create-only | Verified by the integration test that runs the real seed twice: edits survive, nothing is republished, counts unchanged. Static test: every `update:` is `{}` and there are no deletes |
| No demo data | No `data/mock*` imports; no claim strings; real organisation and venue names are absent from the seed and fixtures |
| Fresh empty database | **BLOCKED.** It would require `migrate deploy` on a new DB (restriction 4) |

---

## 13. Database safety verification

- **Production (Aiven):** not connected, queried or modified during Batch A.
- **Local dev DB (`nfrguide_dev`):** not written. The only interactions were zero: the script refusals exit before connecting, and the build and e2e used the test DB.
- **Local test DB (`nfrguide_test`):** received the create-only seed plus test rows. After the runs: 0 e2e users, 0 e2e articles, 0 e2e redirects, 0 `bata-` rows; 6 `fixture-` articles remain by design. Legacy demo rows were left in place (D7).
- **No** reset, drop, truncate, migration or `db push`. Schema and migrations are unchanged against HEAD.
- **Side effect to note:** the local `.next` production build was last built against the **test** DB. Rebuild before using `next start` against another database. `next dev` is unaffected.

---

## 14. Git status

- Branch `feature/nfr-phase2-foundation-public-fixes`, HEAD `4ad0ae4`; no upstream; not pushed.
- `git diff --check` is clean. No `.env` is tracked. `apps/web/.env` was last modified at 21:12, in the original setup session before Phase 2.
- Lockfile: changed (dev dependencies, engines and optional wasm entries; additions only).
- Schema and migrations: unchanged.

---

## 15. Remaining gaps

- **Accessibility debt** (§10); the critical editor `label` and `select-name` issues come first.
- **DB-level demo content** still exists in the local dev and test DBs, and is assumed to exist in production. It is visible on every page through the search-index payload. Clean-up needs owner approval.
- `data/mockEditorialData.ts` is kept, because `scripts/seed-rodeo-links.mts` still imports it. It isn't rendered or seeded.
- `components/DisciplineModal.tsx` (unused, never rendered) still contains "Official" wording. Not checked in depth: sample block templates in `components/admin/editor/RichBlockEditor.tsx` mention "PRCA Official Rule Book".
- `npm audit`: 7 advisories in **pre-existing** packages (`prisma`/`@prisma/config`/`deepmerge-ts`, `sharp`, `vitest`/`@vitest/mocker`/`tinypool`). None come from Playwright or axe. Not upgraded (out of scope).
- Scheduled publishing remains unavailable by design until the job runner decision is made.

---

## 16. Blocked tasks

1. A GitHub Actions run (no push).
2. A fresh-DB migrate → seed → full suite (needs a migration on a new DB).
3. Any production verification.

---

## 17. Known risks

- The first real CI run may surface environment differences (Ubuntu, `postgres:18` image, `playwright install --with-deps`) that weren't observable locally.
- `NODE_ENV=test` during `next build` in CI is pre-existing and yields a Next.js warning.
- Playwright reuses an existing server on port 3100 if one is running. Locally, make sure it points at the test DB.
- Production still contains the demo corpus and three edition purse values in the DB. They are no longer rendered, but would reappear if any future code exposed the field.

---

## 18. Production safety confirmation

Production was **not** accessed, queried, migrated, seeded, cleaned or deployed to during Batch A. No credentials were rotated or changed. No hosting or provider settings were touched.

---

## 19. Recommendation for Batch B

1. **Accessibility fixes:**
   - critical editor `label` and `select-name`;
   - the header `label-content-name-mismatch`;
   - heading structure (footer h4 → h2/h3; article h3);
   - contrast tokens (needs design sign-off);
   - skip link and reduced-motion styles.

   Then shrink `a11y-known-issues.json` toward empty.
2. **Owner-approved demo-content clean-up plan:** a dry-run report for local dev, then production, then an HTML re-crawl. Also exclude `fixture-` rows from `cloud-data-import.mts`.
3. **Push the branch to get the first real CI run** (owner action), and fix anything environment-specific.
4. **Dependency security review** for the 7 audit advisories, as separate, tested upgrades.
5. **Then** the earlier roadmap items: soft-archive instead of hard delete, the canonical-origin fix, and the remaining editorial-integrity items.
