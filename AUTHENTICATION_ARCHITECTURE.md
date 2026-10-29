# NFRGuide.com — Authentication Architecture (Phase 1 / Batch 03)

## Decision & rationale
A maintained, Next.js-compatible, server-validated auth solution was required.
**Auth.js v5 was evaluated and not adopted**: its Next peer range and App-Router API
surface target Next 14/15, and this project runs forward-dated Next 16.4.3. We implement
the **database-session pattern using only vetted primitives** — the same pattern Auth.js
and Lucia implement internally — which has no framework-version coupling:

- **Password hashing:** `bcryptjs` (pure-JS, cost 12). No custom cryptography.
- **Session tokens:** 256-bit CSPRNG (`crypto.randomBytes`) opaque tokens; only the
  **SHA-256 hash** is stored (`Session.tokenHash`). A DB leak yields no usable tokens.
- **Cookie:** `HttpOnly`, `SameSite=Lax`, `Secure` in production, `path=/`, 7-day expiry.
  Nothing is stored in `localStorage`/`sessionStorage`; no JWTs.
- **Mutations:** Next **Server Actions** (POST-only, same-origin enforced by Next),
  which combined with `SameSite=Lax` provides the CSRF protection appropriate to this model.

## Components
| File | Responsibility |
|---|---|
| `lib/auth/password.ts` | `hashPassword` / `verifyPassword` (bcrypt) |
| `lib/auth/session.ts` | create / validate / invalidate sessions; cookie set/clear; token hashing |
| `lib/auth/currentUser.ts` | `getCurrentUser` (request-cached), `requireUser`, `requirePermissionPage` |
| `lib/auth/rbac.ts` | permission matrix + `roleHasPermission` + `buildEditorPermissions` |
| `lib/auth/rateLimit.ts` | in-memory fixed-window login limiter |
| `app/admin/auth-actions.ts` | `loginAction` (rate-limited, generic errors, audit), `logoutAction` |
| `app/admin/login/*` | `/admin/login/` page + client form (`useActionState`) |
| `app/admin/layout.tsx` | minimal root layout (noindex, dynamic) — no gate |
| `app/admin/(dashboard)/layout.tsx` | **auth gate** (`requireUser`) + CMS shell |

## Request flow
1. `/admin/login/` posts credentials to `loginAction` (Server Action).
2. Rate-limit by IP+email → look up user → `verifyPassword` → on success create a session
   row, set the HttpOnly cookie, record `lastLoginAt` + an `auth.login` audit entry, redirect.
3. Any `/admin/(dashboard)/*` request runs `requireUser()` in the layout → validates the
   session server-side → redirects unauthenticated users to `/admin/login/`.
4. Every mutation Server Action independently resolves the user and re-checks permission —
   the gate is never the sole protection.
5. Logout invalidates the server-side session and clears the cookie.

## Initial administrator bootstrap (`prisma/bootstrap-admin.ts`)
`npm run bootstrap:admin`. No hardcoded password, no public registration, no automatic
account. Reads email/name/password from a TTY prompt (password echo muted) or
`BOOTSTRAP_ADMIN_EMAIL`/`_NAME`/`_PASSWORD`. Refuses if a Super Admin already exists.
Syncs roles/permissions, creates an ACTIVE Super Admin (bcrypt), writes an audit entry.
The password is never printed. Requires `DATABASE_URL` (loaded from `.env`).

## Not in scope (documented)
Password reset/recovery, MFA, and a shared-store rate limiter are future work (the Master
Requirements list them for operational hardening). The in-memory limiter is per-instance.
