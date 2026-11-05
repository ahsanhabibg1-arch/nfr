# 01 — Existing Identity Architecture (pre-Batch-24 audit)

Batch 24 *extended* the identity system already in place; it did not replace it.
This is what existed and how the new reader identity fits.

## Authentication primitives (unchanged)

- **Sessions:** DB-backed. A random token is issued, its SHA-256 hash stored in
  `Session`, and the raw token set in the `nfrguide_session` cookie
  (`HttpOnly`, `Secure` in prod, `SameSite=Lax`, 7-day TTL). See `lib/auth/session.ts`.
- **Passwords:** bcrypt cost 12. `isAcceptablePassword` requires length **≥ 12**
  and ≤ 200. See `lib/auth/password.ts`.
- **Current user:** `getCurrentUser()` reads the cookie, hashes, looks up the
  session, returns the `User` with roles. See `lib/auth/currentUser.ts`.

## Authorization (default-deny RBAC) — `lib/auth/rbac.ts`

- `RoleKey` union, `Permission` union, `ROLE_PERMISSIONS` map, `roleHasPermission()`.
- **Enforcement is code-based.** The DB `Role`/`Permission` rows are a *reflected
  view* synced by `syncRolesAndPermissions()`; they are never the source of truth.
- Staff roles before Batch 24: `super_admin`, `administrator`, `editor`, `author`,
  `seo_manager`. All hold `cms.access`.

## Rate limiting (unchanged, not weakened)

- Durable Postgres limiter (`RateLimitHit` table) with atomic check-and-increment,
  **fail-closed** on storage error. `checkDurableRateLimit`, `peekDurableRateLimit`,
  `recordDurableRateLimitFailure`. See `lib/auth/durableRateLimit.ts`.
- The admin login gate (Batch 22/23) uses a dual-key atomic limiter. Batch 24's
  public login reuses the **same** mechanism (see report 02) — it was not altered.

## Why a shared `User` + `reader` role (the key decision)

Options considered:
1. **Separate `Reader` table / separate auth** — most isolation, but duplicates
   sessions, password hashing, rate limiting, and the login surface; two codepaths
   to keep secure.
2. **Shared `User` + a zero-permission `reader` role** *(chosen)* — one audited
   auth/session/limiter codepath; privilege separation enforced by the existing
   default-deny RBAC. `roleHasPermission(['reader'], 'cms.access') === false`, so
   every admin route and the Admin Dashboard link remain closed to readers.

   **Caveat found & fixed:** the shared session meant the CMS shell's
   authentication-only gate (`requireUser()`) was no longer sufficient — a reader
   session passed it. The entry gate was hardened to `requireCmsAccess()` (require
   `cms.access`, else bounce to the public site). See `07_SECURITY_AND_PRIVACY_AUDIT.md`.

The safety of option 2 rests on `reader` having an **empty** permission set, on
registration assigning **only** that role, and on the CMS entry gate checking
`cms.access` (not just authentication) — all enforced in code
and covered by tests (see reports 03 and 08).
