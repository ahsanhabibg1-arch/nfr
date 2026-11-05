# 07 — Security & Privacy Audit

## ⚠️ Finding & fix: reader session could reach the admin shell (FIXED)

**Severity: high. Found via the running app, fixed and regression-tested.**

The CMS shell layout (`app/admin/(dashboard)/layout.tsx`) gated on
`requireUser()` — **authentication only**, not authorization. Before Batch 24 this
was safe because the *only* way to obtain a session was staff invitation / admin
login, so every session belonged to staff. Batch 24 introduced **public reader
login on the shared session system**, so a logged-in reader (no `cms.access`) whose
session passed `requireUser()` could open `/admin/` and see the dashboard shell
(the sidebar was empty, but the Editorial Overview rendered).

**Fix:** new guard `requireCmsAccess()` in `lib/auth/currentUser.ts` — requires an
authenticated user **holding `cms.access`** and redirects any non-staff session to
the public site (`/`). Applied as the single choke point in the `(dashboard)` layout,
plus defense-in-depth on the two authentication-only pages (overview `/admin/` and
staff `account`). Every other admin page already required a specific CMS permission a
reader lacks.

**Regression test:** `e2e/admin.spec.ts` → *"an authenticated reader is bounced OFF
the admin shell (never into it)"* — registers a real reader, then asserts `/admin/`,
`/admin/readers/` and `/admin/comments/` all redirect to the public site. Verified in
a real browser and in the full Playwright run (50/50).

## Privilege & registration

- **Readers get zero permissions.** `ROLE_PERMISSIONS.reader = []`;
  `roleHasPermission(['reader'], 'cms.access') === false`. Verified by unit test.
- **Public registration cannot create privileged users.** The role is hard-coded
  to `reader`; there is no role parameter anywhere in the registration path.
  `StaffRoleKey` makes assigning `reader` as staff a compile-time error.
- **Admin Dashboard link never shows for readers** — gated on `isStaff` from
  `/api/account/me`.

## Rate limiting (unchanged / not weakened)

- Public login reuses the Batch 23 atomic, **fail-closed**, enumeration-safe dual-key
  limiter unchanged.
- Registration: `register:<ip>` 5/hour, fail-closed.
- Password-reset request: `pwreset:<ip>:<email>` 5/hour; limited *or* errored both
  return the **same generic** notice (no signal).
- Comment anti-spam: `comment:<userId>` 5 / 5 min, fail-closed.

## Enumeration resistance

- Login: one generic "Invalid email or password" for all failures.
- Forgot-password: always "If an account exists… a reset link will be sent once
  email delivery is configured" — identical for known, unknown, and suspended
  emails. `createPasswordResetToken` returns `null` for unknown/SUSPENDED.

## Secrets & token handling

- **No raw tokens are logged.** Only SHA-256 hashes are stored; reset/verification
  links are **not** emitted to logs. `requestPasswordResetAction` logs nothing
  about the token.
- Verification is **not** silently bypassed in production: with no email provider,
  delivery is disabled and documented; the token lifecycle is minted + unit-tested
  but inert until a provider is wired.

## Privacy — no email leakage on public surfaces

- `listApprovedForArticle` returns author **display name** + body only.
- `/api/account/me` returns `{ name, initials, isStaff }` — **no email, no raw roles**.
- Comment rendering never includes the author's email.

## XSS / injection

- Comment bodies are plain text, stored verbatim, rendered as **escaped React
  children**. There is no `dangerouslySetInnerHTML`. Payloads like
  `<script>…</script>` are stored literally and displayed as text (unit-tested).

## Sessions

- Password change invalidates **all** sessions (then re-establishes the current
  device) — a changed password logs out other devices.
- Logout invalidates the server-side session token, not just the cookie.

## Accessibility (a security-adjacent quality gate)

- Real-browser axe on article + login + register + forgot-password:
  **0 serious/critical** (WCAG 2a/2aa/21a/21aa/22aa).
- Fixed low-contrast muted text in `CommentSection` (`text-stone-400`/`-500` on the
  cream background → the accessible `text-ink-muted` token, ≈ 6.9:1).

## Outstanding (owner-owned, NOT marked complete)

- **Secret rotation** of any credentials exposed in earlier batches (Aiven / R2 /
  admin) must be done by the owner before launch. Batch 24 introduced no new
  committed secrets and did not touch `.env`.
- Email provider configuration to activate verification + reset delivery.
