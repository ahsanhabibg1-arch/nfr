# 02 — Reader Authentication Implementation

## Files

- `lib/auth/reader.ts` — reader domain logic (role, registration, token lifecycles).
- `app/(public)/account/actions.ts` — server actions (register/login/logout/profile/
  password change/forgot/reset/comment submit).
- `components/account/forms.tsx` — client forms (`useActionState`).
- `components/account/AccountMenu.tsx` — nav account menu (hydrated via `/api/account/me`).
- `app/api/account/me/route.ts` — minimal identity endpoint (keeps public pages static).
- Pages: `app/(public)/{login,register,forgot-password,reset-password,account,account/comments}/page.tsx`.

## Registration (`registerReader` + `registerAction`)

- `validateRegistration()` checks name, a valid email, password **≥ 12 chars**,
  confirm match, and accepted Terms. Returns a user-facing message or `null`.
- `registerReader()` creates a `User` (status `ACTIVE`) and assigns **only** the
  `reader` role (via `ensureReaderRole()` upsert). A duplicate email throws
  `ReaderError('conflict')` (Prisma `P2002`), surfaced as "account already exists".
- `registerAction` adds an IP rate limit (`register:<ip>`, 5/hour, fail-closed),
  auto-logs-in on success, and redirects to the **home page** (`/`) — the signed-in
  reader lands on the site with the account menu reflecting their session.
- **Public registration cannot create a privileged user:** the role is hard-coded
  to `reader`; there is no role parameter in the registration path.

## Login (`loginAction`) — shared readers + staff

- Reuses the Batch 23 atomic, fail-closed, enumeration-safe limiter with **two**
  keys: `login:<ip>:<email>` (5 / 15 min) and `login-acct:<email>` (50 / hour),
  checked together; storage error ⇒ generic "service unavailable".
- Generic "Invalid email or password" for every failure; `SUSPENDED` users rejected.
- On success: creates a session, sets the cookie, stamps `lastLoginAt`, writes an
  `auth.login` audit row, redirects to the **home page** (`/`). Staff logging in here
  can then reach `/admin/` via the account menu's Admin Dashboard link (same session).
- **The existing limiter was not weakened** — same functions, same thresholds.

## Logout / Profile / Password change

- `logoutAction` invalidates the session token, clears the cookie, redirects `/`.
- `updateProfileAction` updates the own display name only (≤ 80 chars).
- `changePasswordAction` re-authenticates with the current password, enforces
  ≥ 12 chars, invalidates **all** sessions, then re-establishes the current device.

## Email verification & password reset (token lifecycle, delivery gated)

- `createEmailVerificationToken` / `consumeEmailVerificationToken` — SHA-256 hash
  stored, 24 h TTL, single-use, sets `User.emailVerifiedAt`.
- `createPasswordResetToken(email)` — returns a token or `null`; **no enumeration**
  (unknown/SUSPENDED emails return `null`, callers always respond generically),
  1 h TTL. `consumePasswordResetToken(token, newPassword)` — validates ≥ 12 chars,
  single-use, invalidates all sessions.
- **No email is sent** because no provider is configured. `requestPasswordResetAction`
  always returns the same generic notice and never logs the token or link. Tokens
  are minted and the full lifecycle is unit-tested, so wiring a provider later is
  the only remaining step. Verification is **not** silently bypassed in production.

## Keeping public pages static

The account menu and comment composer need to know "am I logged in?" without making
every public page dynamic. They hydrate on the client from `GET /api/account/me/`
(`force-dynamic`, `no-store`, note the trailing slash), which returns only
`{ name, initials, isStaff }` — **never** the email or raw roles.

### Account-menu state sync (must revalidate on navigation)

`AccountMenu` lives in the **persistent** public layout (`PublicChrome` →
`app/(public)/layout.tsx`), so a soft-navigation redirect does **not** remount it. A
mount-once fetch would therefore leave the menu **stale** after sign-in / sign-up /
logout (all redirect to `/`) and on Back/Forward — the classic symptom being "Sign in /
Create account" still showing while actually logged in, until a manual refresh. The menu
avoids this by revalidating `/api/account/me/`:

- on every `usePathname()` change (covers login/register/logout redirects + Back/Forward),
- on `pageshow` (bfcache restore) and `focus`,
- and by clearing optimistically on logout (covers logging out while already on `/`).

Covered by `e2e/account-menu.spec.ts`. Stable hooks: `data-testid` `account-signedin`,
`account-signedout`, `account-avatar`.
