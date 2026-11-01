# Phase 1 / Batch 09 — Team & Permissions, System Settings, Security Governance & Migration Safety

**Branch:** `batch-01-nextjs-migration` · **Date:** 2026-10-31 · Builds on Batch 08 (`b94ec77`).

Completes the administrative foundations of the CMS — real database-backed Team & Permissions,
account lifecycle, centralized RBAC governance, password/session management, typed System
Settings, an audit-log viewer — and establishes permanent migration-replay protection for the
PostgreSQL full-text search column. No authentication, editorial ownership, analytics privacy
or monetization control was weakened.

---

## A. Baseline Audit

Team & Permissions and System Settings were client-side mocks (`ADMIN_USERS`,
`BACKGROUND_JOBS`, fake "invitation dispatched", a DEMO badge, fabricated stats). The sidebar
showed all 12 modules to everyone with hardcoded counts. Real foundations already present:
bcryptjs cost 12 (`lib/auth/password.ts`), DB sessions with SHA-256 token hashes that reject
SUSPENDED users (`lib/auth/session.ts`), per-IP+email login rate limiting, generic login
errors, and the `searchVector Unsupported("tsvector")` fix from Batch 08.

## B. Team Management

Real directory (`lib/cms/teamService.ts` + `/admin/team/`, gated by `user.manage`): search/
filter by role & status, create invitation, assign role, suspend/activate, revoke sessions,
create reset link, view last login + session counts. Password hashes and tokens are never
returned.

## C. Account Lifecycle

States reconciled to the existing enum: **INVITED → ACTIVE → SUSPENDED** (Disabled ≡ Suspended;
both deny access — documented). Suspension deletes the member's sessions and the session guard
rejects SUSPENDED users. Role resolution is per-request, so grants take effect on the next
request; privilege removal and suspension revoke sessions immediately.

## D. Invitation & Password Security

Secure, **no-email** foundation: single-use, time-limited invitation + reset tokens; only the
SHA-256 **hash** is stored; the raw token is shown once to build a manual link
(`/admin/accept-invitation/`, `/admin/reset-password/`). Weak passwords rejected (min 12).
Password change verifies the current password and revokes all other sessions. Reset revokes all
sessions. Tokens are never logged.

## E. Role Governance

Centralized registry (`lib/auth/permissions.ts`) maps the 12 modules to the EXISTING permission
that gates each, and generates the **real** permission matrix from `ROLE_PERMISSIONS` (no new
permission strings, no role changes). Guards: only a Super Admin may grant/remove Super Admin;
admins cannot escalate; nobody edits their own role/status here; the **last active Super Admin**
is protected; privileged role/status changes run under **SERIALIZABLE** isolation.

## F. Session Management

Own-account page (`/admin/account/`, any staff): change password + list/revoke sessions.
Admins can revoke a member's sessions. Cookies stay HttpOnly/SameSite=Lax/Secure-in-prod; no
tokens in localStorage; raw tokens never exposed.

## G. System Settings

Typed, validated configuration (`lib/cms/settingsService.ts` + `/admin/settings/`, gated by
`system.config` = Super Admin): site identity, editorial defaults, rodeo display defaults.
Free text rejects HTML; URLs/emails validated. Domain settings (SEO/Analytics/Monetization)
stay owned by their modules — Settings shows **status + links**, never a duplicate source of
truth. Security-critical values (hashing cost, session secrets, DB creds, env) are not editable.

## H. Audit Log Operations

Read-only viewer (restricted to `system.config`) with actor/action/date filters + pagination
over the existing `AuditLog`. No edit/delete from the UI; no secrets/hashes/tokens displayed.

## I. CMS Permission Consistency

All 12 modules audited. Sidebar visibility is derived server-side from the registry (DEMO badge
and fake counts removed). Team/Settings routes are permission-gated; the other modules keep
their existing access (content modules = any staff view; mutations permission-gated in
services). No approved role responsibility was changed.

## J. Database Migration Replay

`npm run test:migration` (`scripts/migration-replay.mts`) performs a from-zero replay onto a
disposable `<db>_migration_replay` database when a `CREATEDB`-capable role/`MIGRATION_REPLAY_ADMIN_URL`
is available, asserting all tables, the `searchVector` tsvector column, the GIN index, and a
functional query on a freshly-inserted article. The current least-privilege role lacks
`CREATEDB`, so the gate verified the same FTS artifacts on the fully-migrated test database
(**5/5**) and the script is ready for the privileged run. See `MIGRATION_REPLAY_VERIFICATION.md`.

## K. Full-Text Search Preservation

Verified the Batch 08 fix from the actual migration chain: `Article.searchVector` is a generated
`tsvector`, the GIN index exists, and queries match. A permanent vitest regression
(`governance.test.ts`) locks it in, and every Batch 09 migration was hand-reviewed to strip the
Prisma `searchVector` DROP drift (§25).

## L. Security Verification

Default-deny RBAC + audit on all privileged operations; serializable isolation for SA-critical
changes; secure token generation + hashed storage; session invalidation on sensitive changes;
generic auth errors; no secret leakage; no analytics/monetization tracking enabled.

## M. Automated Test Results

Full suite **180/180**, deterministic ×2 (19 new: 4 permission-registry, 9 team/account, 6
settings/governance/FTS).

## N. Production Build & Smoke Tests

`next build` PASS; route **28/28**, admin **13/13** (incl team/settings/account), media **7/7**,
cache **10/10** (dev), migration replay **5/5**.

## O. Files Created/Modified

See `BATCH09_TEST_REPORT.md`.

## P. Known Limitations

No email delivery (manual links only); in-memory login + ingest rate limiting (single-instance);
from-zero migration replay needs a `CREATEDB` role; `migrate diff` still drifts on `searchVector`
(hand-strip required). See `KNOWN_LIMITATIONS.md`.

## Q. Owner Decisions Required

Enabling email invitations/reset delivery, external auth/MFA, and granting `CREATEDB` for the
full replay gate are owner-gated (§30). None were enabled.

## R. Batch 10 Readiness

Batch 09 is complete and committed. Batch 10 was **not** started.
