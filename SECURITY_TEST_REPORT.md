# NFRGuide.com — Security Test Report (Phase 1 / Batch 03)

Run: `cd apps/web` → `DATABASE_URL=<test db> npx vitest run`. Result (2026-10-29):
**50/50 passed across 10 files** (DB-gated suites run against `nfrguide_test`).

## Coverage vs Batch 03 §13 (all passing)
| # | Requirement | Test(s) |
|---|---|---|
| 1 | Login success | `cms`: password verify true; browser round-trip (login → `/admin/`) |
| 2 | Login failure | `cms`/`auth`: wrong password → false |
| 3 | Logout | `cms`: session invalidate → null |
| 4 | Expired sessions | `cms`: past-expiry session → `validateSessionToken` null |
| 5 | Unauthenticated admin access | route smoke: `/admin/`, `/admin/articles/` → redirect to login |
| 6 | Unauthenticated mutation rejection | actions return `unauthenticated` when no session (gate) |
| 7 | Unauthorized role rejection | `cms`: SEO Manager `saveArticle` → `forbidden`; `rbac` matrix |
| 8 | Author ownership restrictions | `cms`: Author B editing Author A's article → `forbidden` |
| 9 | Editor permissions | `cms`: editor create/update persists; `rbac` matrix |
| 10 | SEO Manager permissions | `rbac`: cms.access + seo.config only |
| 11 | Administrator permissions | `rbac`: delete + user.manage, not system.config |
| 12 | Super Admin restrictions | `rbac`: all incl system.config |
| 13 | Privilege escalation attempts | `cms`: Author publishing an approved article → `forbidden` |
| 14 | Article create/update persistence | `cms`: title updated in DB; version increments |
| 15 | Revision history | `cms`: ≥2 revisions after create+update |
| 16 | Workflow transition enforcement | `cms`: draft→published direct = `invalid_transition`; gate on publish |
| 17 | Draft privacy | `cms`: draft not in published repo |
| 18 | Publish-to-public visibility | `cms`: publish → `getPublishedArticleBySlug` returns it |
| 19 | Unpublish cache invalidation | `cms`: unpublish → repo returns null; action revalidates `layout` + sitemap |
| 20 | CSRF/session abuse protections | HttpOnly/SameSite cookie + Server Actions; `auth` rate-limit test |
| 21 | Audit logging | `cms`: `AuditLog` entries exist for article operations |
| 22 | Concurrent edit conflicts | `cms`: stale `expectedVersion` → `conflict` |

## Suites
- `tests/rbac.test.ts` (7) — matrix + default-deny + `buildEditorPermissions`.
- `tests/auth.test.ts` (3) — bcrypt hash/verify, password policy, rate limiter.
- `tests/cms.test.ts` (13, DB) — sessions, RBAC/ownership/escalation, delete policy,
  workflow/gate, persistence/revisions/audit, concurrency, publish/unpublish visibility.
- Plus Batch 01/02 suites (content, eligibility, seo, seoValidator, url, redirects,
  editor-fields) — all still green.

## Non-tautological
Tests exercise the real `articleService`, `session`, `password`, `rbac` and `content`
modules against a live database, with per-role actors and real state transitions — not
constants redefined in the test file.

## Regression (also run)
`tsc --noEmit` ✅ · `prisma validate` ✅ · migrations applied (dev+test) ✅ ·
`next build` 28 routes ✅ · route smoke 24/24 ✅ · browser QA (login, DB list, editor,
0 console errors) ✅.
