# Batch 04 — Test Report

> Audience: reviewers verifying Batch 04. Records what was tested, how, and the
> actual results observed on 2026-10-29 in the local dev environment
> (Windows 10, PostgreSQL 17, Next.js 16.4.3 dev server on :3000).

## 1. Summary

Final sign-off verification (2026-10-29). The dev server was stopped so a clean
production build could run; it was restarted afterwards.

| Suite | Command | Result |
|-------|---------|--------|
| Prisma schema validation | `npx prisma validate` | **PASS** — "schema is valid" |
| Prisma client generation | `npx prisma generate` | **PASS** — Client v6.19.3 (no lock) |
| Type checking | `npm run typecheck` | **PASS** (0 errors) |
| Unit + integration (all) | `DATABASE_URL=<test> npx vitest run` | **PASS** — 77/77 across 11 files, deterministic ×3 |
| Batch 04 module integration | `… vitest run tests/batch04.test.ts` | **PASS** — 27/27 |
| Production build | `npm run build` | **PASS** — compiled 10.2s, 28/28 static pages, all routes |
| Public route smoke (prod build) | `npm run test:routes` | **PASS** — 24/24 |
| Authenticated admin routes (prod build) | `tsx scripts/admin-auth-smoke.mts` | **PASS** — 6/6 |
| HTTP publish/unpublish cache (dev) | `npm run test:cache` | **PASS** — 10/10 checks |

Vitest runs against the **test** database (`TEST_DATABASE_URL`). Route smoke and
admin smoke ran against the **production** server (`npm run start`). The cache
harness ran against the **dev** server (see §3 for why). All ephemeral data is
cleaned up. No database content was deleted and no migrations were reset.

### 1.1 Fix made during sign-off — concurrency-safe role sync
Running the full Vitest suite in parallel intermittently skipped
`tests/batch04.test.ts` because two test files called
`syncRolesAndPermissions` at once and collided on the `RolePermission` unique
key (the old code did `deleteMany` then `create`). `lib/auth/roleSync.ts` was
made idempotent and concurrency-safe — find-or-create for roles/permissions,
and `createMany({ skipDuplicates })` + prune-only-unwanted for the links, which
never deletes a wanted row. The suite is now deterministic (verified green on
three consecutive full runs). This also hardens role sync for multi-instance
boots in production.

## 2. Batch 04 integration suite (`tests/batch04.test.ts`, 27 tests)

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

**Navigation canonical seed (final sign-off §A):** first-time initialization
creates all 15 canonical rows as `isSystem` · repeated execution is idempotent
(0 created, 15 skipped, no duplicates) · never overwrites an administrator's
customized label/order/visibility · never deletes an existing custom row.

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

**Why this harness runs against the dev server (honest note).** It toggles
publish state through the service layer (out of band), and asserts the public
HTTP responses flip. `next dev` renders public routes on demand, so the change
is observed immediately — a faithful test of the publish→visible→unpublish
*visibility* contract at the HTTP layer, plus the admin auth gate. In a built
server the same public pages are **ISR-cached** (article `revalidate=60`;
section pages are static with `dynamicParams=false`), so an *out-of-band* DB
write is not reflected until the TTL elapses — by design. In production the
cache is busted immediately by the publish/unpublish **Server Action's**
`revalidatePath()` calls in `app/admin/article-actions.ts` (plus the
layout-level `revalidatePath('/', 'layout')` in the Batch 04 actions). Running
this bypass-harness against a built server would therefore show expected ISR
staleness, not a defect — so it runs in dev, where it isolates the HTTP/render
contract. The production invalidation path (action → `revalidatePath`) is
code-verified, and the publish→public→unpublish contract is additionally covered
by `tests/cms.test.ts`.

## 4. Regression

- **Production** route smoke (24 checks, against `npm run start`) confirms the
  home, section, article, discipline, category, legacy redirects, robots/sitemap
  and the admin auth gate all still behave in a built server after the DB-backed
  header/footer change.
- **Production** authenticated admin smoke confirms all six Batch 04-relevant
  admin routes (`/admin/`, `/admin/articles/`, `/admin/rodeo-coverage/`,
  `/admin/editorial-organization/`, `/admin/sources/`, `/admin/website/`) render
  **200** with data for a signed-in Super Admin.
- Full Vitest suite is deterministic (77/77 on three consecutive runs) after the
  role-sync concurrency fix (§1.1).

## 5. Production build — now verified

The production build was **run and passed** during final sign-off. The dev
server was stopped first (so it no longer held `.next` / the Prisma engine),
`npm run build` completed cleanly (compiled in 10.2s, TypeScript OK, 28/28
static pages generated), and the printed route table shows the expected mix:
`/`, sections, articles and disciplines as static/SSG; all `/admin/*` routes
(including `rodeo-coverage`, `editorial-organization`, `sources`, `website`) as
dynamic/server-rendered. Route smoke and authenticated admin smoke then ran
against `npm run start` (the built server) — both green.

Remaining manual step: click-through browser QA of each admin form is still
recommended for UX, though the authenticated route smoke + 27 integration tests
cover the server behavior.

## 6. How to reproduce (exact sign-off sequence)

```bash
cd apps/web
# Non-server gate:
npx prisma validate
npx prisma generate
npm run typecheck
DATABASE_URL="$TEST_DATABASE_URL" npx vitest run          # 77/77 (quotes stripped from .env)

# Production build (ensure no dev server is holding .next first):
npm run build                                             # compiles + generates static pages

# Production server + HTTP regression:
npm run start &                                           # serves :3000
npm run test:routes                                       # 24/24
npx tsx scripts/admin-auth-smoke.mts                      # 6/6
# stop the prod server

# Publish/unpublish cache/visibility harness (dev server — see §3):
npm run dev &                                             # serves :3000
npm run test:cache                                        # 10/10
```

On Windows, stop a server holding port 3000 with `taskkill /PID <pid> /T /F`
(find it via `Get-NetTCPConnection -LocalPort 3000 -State Listen`).
