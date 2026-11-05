# 08 — Test Results

All results below were **actually executed** this session unless explicitly marked
BLOCKED. Commands were run from `apps/web`.

## Executed & green

| Command | Result |
|---|---|
| `npx prisma validate` | ✅ "The schema … is valid" |
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run test` (Vitest) | ✅ **423 passed / 423**, 50 files (incl. the Batch 24 DB suite **14/14**) |
| `npm run build` (`next build`) | ✅ compiled — dev DB 51 pages; test DB 61 pages (`/admin/readers` + `/admin/comments`), exit 0 |
| `npm run test:migration` | ✅ 5/5 (FTS fallback — see note) |
| `npx playwright test` (full e2e + axe) | ✅ **49 passed** |

> **Correction to an earlier draft:** the DB + Playwright suites are **not** blocked.
> `TEST_DATABASE_URL` is present in `apps/web/.env`, so `npm run test` runs the DB suites
> directly (the Batch 24 suite executed and passed 14/14), and `npx playwright test` runs
> the full browser suite after a test-DB build. The earlier "blocked" note came from
> grepping only `^DATABASE_URL` and missing the `TEST_DATABASE_URL` line.

### Migration-replay note

The connecting role lacks `CREATEDB`, so a clean from-zero replay could not create
a disposable database. The script's documented fallback then verified the FTS
artifacts (tsvector column, generated column, GIN index, `websearch_to_tsquery`
match, all expected tables) on the already-migrated database — **5/5 passed**. CI,
with a CREATEDB role, runs the full from-zero replay (which includes the additive
Batch 24 migration).

## New / updated test files

- `tests/batch24-reader-comments.test.ts` *(new, DB integration)* — **14 tests, all
  passing.** Reader/comment core (9): registration + reader-role-only + dedupe;
  `validateRegistration` rules; comment PENDING + public isolation + published-only;
  approve/reject/hide; reader-cannot-moderate + moderator-cannot-approve-own;
  body-stored-verbatim (XSS); anti-spam 6th rate-limited; email-verification
  single-use/expiry; password-reset no-enumeration/single-use. Reader admin (5):
  `listReaders` excludes staff + counts comments; admin-only (editor/reader forbidden);
  suspend sets SUSPENDED + revokes sessions; staff accounts cannot be touched;
  delete cascades comments.
- `tests/permissions-unit.test.ts` *(updated)* — CMS module count 15 → **17**,
  asserts `comments` + `readers` modules present and that `readers` is Admin-only
  (editors/authors don't see it; readers see no modules). ✅ in the 423.
- `tests/batchB.test.ts` *(updated)* — static header a11y: asserts the `Search`
  label, `aria-expanded`, `role="search"`, `aria-label="Search NFRGuide"`,
  `motion-reduce:transition-none`, and the **absence** of `<kbd`, "Independent
  Publication", "Quick Access". ✅ in the 423.
- `tests/batch23-auth.test.ts` *(new, from Batch 23)* — login concurrency ceiling. ✅.

## Real-browser verification (headless Chromium, dev-DB `next start`)

Driven with the `browser-automation` tool; axe-core injected into the page.

- **axe, 0 serious/critical** on `/articles/.../`, `/login/`, `/register/`,
  `/forgot-password/` (WCAG 2a/2aa/21a/21aa/22aa).
- **Navbar search:** trigger named "Search", `aria-expanded` false→true on open,
  input focused on open, `Escape` returns focus to trigger, `Enter` submits to
  `/search/?q=bull%20riding` with no page reload.
- **No horizontal overflow** at 320/360/390/414/768/1024/1280/1440/1920 px.
- **Mobile drawer:** account menu (Sign in / Create account) + Close render; the
  search launcher no longer shows `⌘K`.
- Screenshots (desktop article, mobile drawer) captured and inspected.

## Full Playwright + axe e2e (executed, green)

Built against the test DB (`DATABASE_URL=<TEST_DATABASE_URL> APP_ENV=test npx next build`,
61 pages), then `npx playwright test` — webServer `next start -p 3100` on `nfrguide_test`.

- **49 passed** (2.8 min), 0 failed.
- Includes `admin.spec` **"every sidebar module loads (no mock or dead admin routes)"**,
  which signs in as the fixture admin and loads **every** sidebar module — exercising the
  new **`/admin/readers/`** and **`/admin/comments/`** pages, both of which render cleanly.
- Includes the header animated-search a11y test, the navbar-refinement suite (search
  submit + no-overflow), and axe audits of every public and authenticated-admin page
  (no unknown serious/critical).
- The only log noise is report-only CSP `connect-src` warnings for the Google Fonts
  stylesheet (`disposition: report`) — pre-existing, not a failure.

## How to re-run

- `npm run test` — full Vitest incl. DB suites (`TEST_DATABASE_URL` is read from `.env`).
- `DATABASE_URL=<TEST_DATABASE_URL> APP_ENV=test npx next build` then `npx playwright test`
  — full e2e. See report 09.
