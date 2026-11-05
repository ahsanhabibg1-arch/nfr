# 11 — Reader Account Administration (follow-up)

Added after the initial Batch 24 pass, in response to "admin panel theke reader der
end-to-end control chai." Gives admins a dedicated **Reader Accounts** module.

## What it does

Admin → **Reader Accounts** (`/admin/readers/`):

- **List** every registered reader with name, email, email-verified flag, joined date,
  last login, comment count, and active session count.
- **Search** by name/email; **filter** by status (All / Active / Suspended) with counts.
- **Suspend** a reader → sets status `SUSPENDED` **and force-revokes their sessions**
  (they are logged out immediately and `loginAction` already blocks SUSPENDED sign-in).
- **Activate** a suspended reader.
- **Force-logout** (revoke sessions) without suspending.
- **Delete** a reader account (confirm dialog) → cascades to their comments, tokens and
  sessions; their audit rows' `actorId` is set null (optional FK).

## Files

- `lib/cms/readerAdminService.ts` — service (RBAC + audit + scope guard).
- `app/admin/reader-actions.ts` — server actions.
- `app/admin/(dashboard)/readers/page.tsx` — guarded page.
- `views/admin/AdminReadersPage.tsx` — table UI.
- `components/admin/AdminSidebar.tsx` — new "Reader Accounts" nav item.
- `lib/auth/rbac.ts` — `reader.view` + `reader.manage` (Admin/Super Admin only).
- `lib/auth/permissions.ts` — `readers` CMS module + catalogue group (module count 16 → **17**).
- `config/routes.ts` — `ADMIN_READERS`.

## Security properties

- **Admin-only.** `reader.view` / `reader.manage` are granted to `administrator` +
  `super_admin` only — **not** editor/author/seo_manager. (Editors moderate comments
  but cannot administer reader accounts.)
- **No backdoor to disabling staff.** Every operation is scoped by `READER_ONLY_WHERE`
  (has the `reader` role AND no staff role). `assertManageableReader` refuses any staff
  account with `forbidden` — you cannot suspend or delete an administrator from here.
- **Audited.** `reader.status.set`, `reader.sessions.revoke`, `reader.delete`.
- Email is shown here because this is the RBAC-gated admin surface (public pages never
  expose reader email — see report 07).

## Tests (DB integration, in `tests/batch24-reader-comments.test.ts`)

Added 5 tests (suite now 14, all passing):

- `listReaders` returns readers with comment counts and **never** staff accounts.
- Reader administration is Admin-only: editor and reader actors get `forbidden`.
- Suspending a reader sets `SUSPENDED` and force-revokes sessions; reactivation works.
- The readers module **cannot** suspend or delete a staff account (`forbidden`).
- Deleting a reader removes the account and cascades their comments.

`tests/permissions-unit.test.ts` updated: 17 modules, `readers` admin-only visibility.

## Verification

`tsc` 0 errors; Vitest **423/423** (incl. these 14 DB tests); `next build` compiles
`/admin/readers`; Playwright **49/49** including "every sidebar module loads" — which
loads `/admin/readers/` as an authenticated admin and renders it cleanly.
