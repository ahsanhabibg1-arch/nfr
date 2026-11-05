# 03 — Admin / Reader Integration & Privilege Separation

## The `reader` role

`lib/auth/rbac.ts`:

- `RoleKey` gains `'reader'`. A new `StaffRoleKey = Exclude<RoleKey, 'reader'>`
  names the CMS-capable set for places that must reject readers (e.g. team mgmt).
- `ROLE_PERMISSIONS.reader = []` — **zero** permissions.
- `ALL_ROLES` is unchanged — still the 5 **staff** roles only. Readers are never
  iterated as assignable staff, never appear in the permission matrix, and are not
  synced as a staff role for assignment UIs.
- `ROLE_LABELS.reader = 'Reader'`.
- New helper `isStaff(roles) = roleHasPermission(roles, 'cms.access')`.

## Guarantees (and where they're enforced)

| Guarantee | Mechanism |
|---|---|
| Readers cannot access the CMS | `roleHasPermission(['reader'], 'cms.access') === false`. The CMS shell layout gate `requireCmsAccess()` redirects any non-staff session off `/admin` (hardened in Batch 24 — see `07_SECURITY_AND_PRIVACY_AUDIT.md`; earlier the layout gated on authentication only). |
| Admin Dashboard link hidden from readers | `AccountMenu` shows the Admin link only when `isStaff` is true (from `/api/account/me`). |
| Registration can't mint privilege | `registerReader` hard-codes the `reader` role; no role input exists. |
| Team UI can't assign `reader` as staff | `assignable` is built from `ALL_ROLES` (staff only); assignment actions are typed `StaffRoleKey`, and `RolesInput` is a zod enum of the 5 staff roles. |

## The `StaffRoleKey` fix (important)

Adding `'reader'` to `RoleKey` widened every `RoleKey`-typed value. The team page
(`views/admin/AdminTeamPage.tsx`) fed `RoleKey` into role-assignment actions whose
zod input accepts only the 5 staff roles. `tsc` flagged this (the SWC production
build did not). Resolved by introducing `StaffRoleKey` and typing the three
assignment boundaries (`assignRolesAction` call, invite-form state, invite select)
with it. This makes "you cannot assign `reader` as a staff role" a **compile-time**
guarantee, not just a runtime zod check.

## Admin Comment Moderation module

- `lib/auth/permissions.ts` adds a CMS module `comments`
  (`label: 'Comment Moderation'`, `path: '/admin/comments/'`, `view: 'comment.view'`)
  and a matching permission-catalogue group. (With the follow-up Reader Accounts module,
  the CMS module count is 15 → **17**; both asserted in `tests/permissions-unit.test.ts`.)
- `components/admin/AdminSidebar.tsx` adds a "comments" nav item (and a "readers" one).
- New permissions: `comment.view` + `comment.moderate` (editor & admin),
  `comment.delete` (admin only); plus `reader.view` + `reader.manage` (admin only —
  see `11_READER_ADMIN.md`).
