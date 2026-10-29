# NFRGuide.com — Phase 1 / Batch 03 Report
## Authentication, Server-Side RBAC & Secure Editorial CMS Persistence

**Date:** 2026-10-29 · **Branch:** `batch-01-nextjs-migration` · **App:** `apps/web`

> **STATUS: COMPLETE — verified end-to-end on local PostgreSQL 17.** Real login/logout,
> server-side sessions, admin route gating, five-role RBAC, DB-backed article CRUD +
> revisions + workflow + audit, and publish/unpublish cache invalidation are all
> implemented and tested. Evidence: **typecheck ✅**, **50/50 vitest (incl. 13 CMS
> security/integration + 7 RBAC + 3 auth) ✅**, **`next build` ✅ (28 routes)**,
> **24/24 route smoke ✅ (incl. admin gate)**, **browser login round-trip ✅ (0 console
> errors)**. No production deployment; scheduled-publishing worker and object storage
> remain out of scope.

## A. Baseline Verification
Batch 02 baseline re-verified (migrations applied to `nfrguide_dev`/`nfrguide_test`,
50-test suite green before Batch 03 changes). Approved stack preserved: Next.js 16.4.3,
React 19.2, TypeScript 7, PostgreSQL 17.10, Prisma 6.19.3, Tailwind v4, npm.

## B. Authentication Architecture
Decision (documented in [AUTHENTICATION_ARCHITECTURE.md](AUTHENTICATION_ARCHITECTURE.md)):
the standard **database-session pattern with vetted primitives** (`bcryptjs` hashing,
CSPRNG opaque tokens stored as SHA-256 hashes, HttpOnly/SameSite=Lax/Secure-in-prod
cookies, Next **Server Actions** for mutations). Chosen over Auth.js v5 because its Next
peer range / App-Router surface targets Next 14/15; this pattern has no framework-version
coupling and uses **no custom cryptography**. Login at `/admin/login/`; rate-limited;
generic failure messages; nothing in localStorage; passwords never logged.

## C. Session Security
Opaque 256-bit token in an HttpOnly cookie; only its SHA-256 hash is persisted
(`Session.tokenHash`). Server-side validation on every request via the gated layout and
every mutation. 7-day expiry; expired sessions rejected and purged; logout and
`invalidateAllUserSessions` revoke server-side. Suspended users are rejected at
validation. `lib/auth/session.ts`, `lib/auth/currentUser.ts` (request-cached).

## D. RBAC Implementation
Code-defined, default-deny matrix ([RBAC_PERMISSION_MATRIX.md](RBAC_PERMISSION_MATRIX.md),
`lib/auth/rbac.ts`), mirrored into DB Role/Permission/RolePermission by `roleSync`.
Enforced server-side in the service layer (`lib/cms/articleService.ts`) on every
operation plus ownership rules; the UI only hides controls cosmetically. The Phase 0
**role simulator was removed** — the editor now uses the authenticated user's real
permissions.

## E. Database Changes
Additive migration `20261029000000_batch03_auth_rbac` (offline-generated, applied via
`migrate deploy` to dev + test; existing data preserved): `User.passwordHash`,
`User.lastLoginAt`; new `Session` table; `Article.version` (optimistic concurrency);
`Article.createdById` (ownership); `ArticleRevision.actorId`,
`EditorialWorkflowHistory.actorId`. See [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md).

## F. CMS CRUD Implementation
`lib/cms/articleService.ts` (actor-passed, testable) + `app/admin/article-actions.ts`
(session→actor, revalidation). Create / update / save-draft / submit / approve / publish /
schedule / archive / delete / restore-revision — all **authenticated, RBAC-checked,
zod-validated, transactional**, with **optimistic concurrency** (stale `version` →
`conflict`) and **ownership** enforcement. The 8-field editor + structured body are
preserved; it loads from the DB (server wrapper) and saves via Server Actions. See
[CMS_PERSISTENCE_REPORT.md](CMS_PERSISTENCE_REPORT.md).

## G. Editorial Workflow & Revisions
Server-validated transition map (Draft→In Review→Approved→Scheduled/Published→Archived)
with per-transition permissions; the publication gate (`validateArticle`) blocks going
live on unresolved editorial/compliance findings. Each mutation writes an
`ArticleRevision` and (for transitions) an `EditorialWorkflowHistory` row with the acting
user. Scheduled state is retained but **not auto-executed** (no worker this batch) —
documented; scheduled content stays non-public.

## H. Public Publishing Integration
CMS and public site share PostgreSQL. Publishing sets `publishedAt`, flips
`workflowStatus=PUBLISHED`, and the action calls `revalidatePath('/', 'layout')` +
the article path + `/sitemap.xml`, so published content appears and **unpublished content
is removed from cache immediately** (not reliant on the ISR interval). Integration tests
assert a draft is private, publish makes it public, and unpublish removes it.

## I. Security Test Results
See [SECURITY_TEST_REPORT.md](SECURITY_TEST_REPORT.md). 13 CMS integration + 7 RBAC + 3
auth tests cover login success/failure, session validate/invalidate/expired, unauthorized
role rejection, author ownership, privilege-escalation block, delete policy, invalid
transition, publication gate, create/update persistence, revisions, audit logging,
concurrent-edit conflict, and draft-privacy / publish / unpublish visibility. All pass.

## J. Regression Test Results
`tsc --noEmit` ✅ · `prisma validate` ✅ · migrations applied (dev+test) ✅ ·
`npx vitest run` **50/50** ✅ · `next build` **28 routes** ✅ · route smoke **24/24** ✅
(public pages, metadata, sitemap, redirects intact + admin gate) · browser QA ✅
(login round-trip, DB list 11 rows, editor renders, 0 console errors).

## K. Files Created and Modified
See the commit. Highlights — created: `lib/auth/*` (password, session, currentUser, rbac,
rateLimit, roleSync), `lib/cms/articleService.ts`, `lib/cms/adminQueries.ts`,
`app/admin/auth-actions.ts`, `app/admin/article-actions.ts`, `app/admin/login/*`,
`app/admin/(dashboard)/layout.tsx`, `prisma/bootstrap-admin.ts`, the migration, and the 5
docs + tests (`rbac`, `auth`, `cms`). Modified: admin route group restructure, editor &
list rewired to DB/actions, `AdminLayout/Topbar/Sidebar` (real user + logout), schema,
`package.json`. Removed: `data/articleStore.ts` (sessionStorage prototype).

## L. Known Limitations
See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). Admin modules 3–12 (Rodeo Coverage,
Media, Sources, SEO, Website, Analytics, Monetization, Team, Settings) + Overview remain
**UI-only / mock** (§10 permits; documented) — only Articles + Editor + workflow are
DB-backed. No scheduled-publish worker (scheduled state is manual-publish only). Login
rate limiter is in-memory (per-instance). No media object storage, no SEO scanner, no
production deployment.

## M. Batch 04 Readiness
Auth + RBAC + audit foundation is in place for Batch 04 (e.g., Team/Settings DB wiring,
scheduled-publish worker, media storage). The service layer + identity tables are the
seams.

## N. Decisions Requiring Owner Approval
1. **Run the bootstrap** to create your first Super Admin: `cd apps/web; npm run bootstrap:admin`
   (prompts for email/name/password; password never printed). No admin account was created
   for you (a temporary one used for verification was deleted).
2. **Auth approach** (vetted-primitive DB sessions vs Auth.js) — confirm acceptable.
3. **Admin modules 3–12 remaining UI-only** this batch — confirm the scope boundary.
4. **Scheduled publishing** has no worker yet (manual publish only) — confirm deferral.

**Batch 04 was not started. No unrelated changes were made.**
