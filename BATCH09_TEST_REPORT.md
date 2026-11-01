# Batch 09 — Test & Verification Report

**Date:** 2026-10-31 · **Branch:** `batch-01-nextjs-migration`

## Verification gates

| Gate | Command | Result |
|---|---|---|
| Prisma validate | `prisma validate` | ✅ valid |
| Prisma generate | `prisma generate` | ✅ client types current (governance models present)¹ |
| TypeScript | `tsc --noEmit` | ✅ 0 errors |
| Unit + integration | `vitest run` | ✅ **180/180** (deterministic ×2) |
| Migration replay / FTS | `tsx scripts/migration-replay.mts` | ✅ **5/5** (fallback on test DB; see below) |
| Production build | `next build` | ✅ PASS (team/settings/account/accept-invitation/reset-password) |
| Public route smoke | `tsx scripts/route-smoke.mts` | ✅ **28/28** (prod :3400) |
| Authenticated admin smoke | `tsx scripts/admin-auth-smoke.mts` | ✅ **13/13** (incl team/settings/account) |
| Media upload/delivery | `tsx scripts/media-http-check.mts` | ✅ **7/7** |
| Publish/unpublish cache | `tsx scripts/cache-invalidation.mts` | ✅ **10/10** (dev :3000, new code) |
| SEO / Analytics / Monetization / Media regression | within the 180 | ✅ |

¹ Windows emits a harmless EPERM renaming the query-engine DLL while a server holds it; client
types regenerate and the engine binary is version-stable.

## New test suites (19 tests)

- `tests/permissions-unit.test.ts` — **4** (no DB): every module view permission is real;
  exactly 12 modules; sidebar visibility matches enforced permissions per role (SA sees
  team+settings; admin sees team not settings; editor/author/seo see neither); the matrix is
  generated from `ROLE_PERMISSIONS`.
- `tests/team.test.ts` — **9** (DB): invitation hash/expiry/single-use + weak-password reject;
  activation; suspension revokes sessions + suspended session rejected; role-assignment auth +
  self-protection + SA-only grant; last active Super Admin protection; password change with
  verification + other-session revocation; reset token hashed/single-use/session-revoking;
  `listStaff` leaks no hashes/tokens.
- `tests/governance.test.ts` — **6** (DB): settings RBAC (Super Admin only); validation +
  persistence (HTML/bad-URL rejected); editorial defaults persistence; safe operational status
  (no secrets, analytics/ads off); audit viewer authorization + filtering; FTS preservation
  (searchVector tsvector + generated, GIN index, functional query on a fresh article).

## §27 coverage map (highlights)

Account creation/invite expiry/single-use/hashing (1–4) · activation (5) · suspension + session
revocation + suspended-login rejection (6–8) · role-assignment auth + self-escalation reject +
last-SA protection + concurrency/serializable (9–12) · password change + reset-token security +
session revocation (13–15) · login rate limiting (existing, documented single-instance, 16) ·
permission-registry + sidebar + server-action/API authorization (17–20) · author ownership /
SEO-Manager scope / monetization boundaries (21–23, within existing suites) · settings
validation + site-identity persistence + editorial defaults + security-critical protection
(24–27) · audit authorization + filtering (28–29) · migration replay + searchVector + FTS
regression (30–32) · SEO/analytics/monetization/media/publishing regressions (33–37, within the
180 + smokes).

## Migration replay note

The least-privilege dev/test roles lack `CREATEDB`, so the full from-zero replay could not
create a disposable database in this environment. The gate ran its fallback — verifying the
`searchVector` tsvector column, GIN index, FTS functionality and all expected tables on the
fully-migrated test database (**5/5**) — and the script performs the complete clean replay when
given a `CREATEDB`-capable `MIGRATION_REPLAY_ADMIN_URL`. A permanent Vitest FTS regression also
runs in every suite. See `MIGRATION_REPLAY_VERIFICATION.md`.

## Files created / modified

**Created:** `lib/auth/permissions.ts`, `lib/auth/invitations.ts`,
`lib/cms/teamService.ts`, `lib/cms/settingsService.ts`,
`app/admin/{team,account,invite,settings}-actions.ts`,
`app/admin/(dashboard)/{team,settings,account}/page.tsx`,
`app/admin/{accept-invitation,reset-password}/page.tsx`,
`components/admin/{TokenSetupForm,AccountSecurity}.tsx`,
`scripts/migration-replay.mts`, migration `20261031300000_batch09_admin_governance/`,
`tests/{permissions-unit,team,governance}.test.ts`, 8 docs.

**Modified:** `prisma/schema.prisma` (StaffInvitation, PasswordResetToken, SystemSetting +
User back-relation), `views/admin/{AdminTeamPage,AdminSettingsPage}.tsx` (full rewrites),
`components/admin/{AdminSidebar,AdminLayout}.tsx` (permission-gated visibility, removed DEMO/
fake badges), `app/admin/(dashboard)/layout.tsx`, `scripts/admin-auth-smoke.mts`,
`package.json` (test:migration), 6 docs.
