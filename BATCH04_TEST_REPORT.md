# Batch 04 — Test Report

> Audience: reviewers verifying Batch 04. Records what was tested, how, and the
> actual results observed on 2026-10-29 in the local dev environment
> (Windows 10, PostgreSQL 17, Next.js 16.4.3 dev server on :3000).

## 1. Summary

| Suite | Command | Result |
|-------|---------|--------|
| Type checking | `npm run typecheck` | **PASS** (0 errors) |
| Unit + integration (all) | `DATABASE_URL=<test> npx vitest run` | **PASS** — 73/73 across 11 files |
| Batch 04 module integration | `… vitest run tests/batch04.test.ts` | **PASS** — 23/23 |
| HTTP publish/unpublish cache | `npm run test:cache` | **PASS** — 10/10 checks |
| Public route smoke | `npm run test:routes` | **PASS** — 24/24 |
| Authenticated admin routes | `tsx scripts/admin-auth-smoke.mts` | **PASS** — 6/6 |

Tests run against the **test** database (`TEST_DATABASE_URL`). HTTP checks run
against the running dev server (dev DB); all ephemeral data is cleaned up.

## 2. Batch 04 integration suite (`tests/batch04.test.ts`, 23 tests)

DB-gated (self-skips without a reachable DB). Exercises the real services
against PostgreSQL. All rows it creates use a `b04`/`B04` prefix and are removed
in teardown.

**Sources (§10):** editor create + SEO-Manager forbidden · unsafe-URL rejection
· VERIFIED records a real verification date · cited-source delete refusal then
success after detaching.

**Taxonomy (§8/§9):** category create + duplicate rejection · protected `cat-*`
primary-section delete refusal · tag create/delete · `author.manage` enforcement.

**Rodeo Coverage (§6/§7):** `rodeo.manage` enforcement (Author forbidden) ·
event→edition creation (event vs edition) · edition-slug uniqueness per event ·
event-with-editions delete refusal · edition-referenced-by-article delete
refusal · hub-referenced delete refusal · venue-used-by-edition delete refusal.

**Navigation (§F):** `navigation.manage` enforcement (Editor forbidden, Admin
allowed) · URL validation (internal/external) · static fallback when empty ·
`restoreCanonicalNav` materializes 15 protected rows the public read uses ·
system-row delete refusal · system-row update keeps url + location.

**Dashboard + article list:** status counts + own-scope flag · status filter +
pagination shape · free-text search.

## 3. HTTP publish/unpublish cache-invalidation (`scripts/cache-invalidation.mts`)

Mints an ephemeral administrator + DB session, creates a throwaway draft,
promotes it through the editorial workflow and GETs the public URLs around each
transition. The eight observable points (all **PASS**):

1. Draft article is **not** public — `GET /articles/<slug>/` → **404**.
2. `/admin/` without a session → redirected to `/admin/login`.
3. `/admin/` **with** a valid session cookie → **200** (session honored over HTTP).
4. After publish — `GET /articles/<slug>/` → **200**.
5. Published HTML contains the article title.
6. Section listing `/competition/` shows the published article.
7. After unpublish — `GET /articles/<slug>/` → **404** again.
8. Section listing no longer shows the article.

Plus two workflow assertions: the PUBLISHED transition reports `becamePublic`,
the DRAFT transition reports `becamePrivate`.

**Caching scope (honest note).** In `next dev` public routes render on demand,
so this proves the end-to-end *visibility* contract at the HTTP layer. In a
production (built) server the public pages are ISR-cached; the cache is busted
by the publish/unpublish Server Action's `revalidatePath()` calls in
`app/admin/article-actions.ts` (and the layout-level `revalidatePath('/', 'layout')`
in the Batch 04 actions), which carry the same observable effect. The
service-level publish→public→unpublish contract is additionally covered by
`tests/cms.test.ts`.

## 4. Regression

- Public route smoke (24 checks) confirms the home, section, article,
  discipline, category, legacy redirects, robots/sitemap and the admin auth
  gate all still behave after the DB-backed header/footer change.
- Authenticated admin smoke confirms all six Batch 04-relevant admin routes
  (`/admin/`, `/admin/articles/`, `/admin/rodeo-coverage/`,
  `/admin/editorial-organization/`, `/admin/sources/`, `/admin/website/`) render
  **200** with data for a signed-in Super Admin.

## 5. Not run in this environment

- **`npm run build` (production build).** Not executed here to avoid disrupting
  the active `next dev` server, which holds the `.next` working directory and
  the Prisma query-engine binary on Windows. Type checking is clean and every
  route renders under dev + smoke. Run `npm run build` in a clean checkout
  (no dev server running) as the final pre-deploy gate.
- Manual click-through browser QA of each form is recommended but the
  authenticated route smoke + integration tests cover the server behavior.

## 6. How to reproduce

```bash
cd apps/web
npm run typecheck
# Unit + integration against the TEST database:
DATABASE_URL="$TEST_DATABASE_URL" npx vitest run       # (quotes stripped from .env)
# Start the app, then the HTTP suites:
npm run dev            # or: npm run build && npm run start
npm run test:routes
npm run test:cache
npx tsx scripts/admin-auth-smoke.mts
```
