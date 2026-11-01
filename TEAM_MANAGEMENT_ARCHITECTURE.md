# Team Management Architecture (Batch 09)

Real, database-backed staff administration over the existing identity tables (User, Role,
UserRole, Session, AuditLog). No mock data; no password hashes or tokens ever leave the server.

## Modules

| Path | Responsibility |
|---|---|
| `lib/cms/teamService.ts` | Directory, invitations, status, role assignment, sessions, password change, reset (RBAC + audit) |
| `lib/auth/invitations.ts` | Secure token generation + SHA-256 hashing + TTLs |
| `app/admin/team-actions.ts` | Admin Server Actions (create invite, assign role, status, revoke sessions, reset link) |
| `app/admin/account-actions.ts` | Own-account Server Actions (password change, revoke other sessions) |
| `app/admin/invite-actions.ts` | PUBLIC actions: accept invitation, consume reset |
| `views/admin/AdminTeamPage.tsx` | Directory + invitations + real permission matrix |
| `app/admin/(dashboard)/team/page.tsx` | Gated by `user.manage` |
| `app/admin/(dashboard)/account/page.tsx` | Any authenticated staff |

## Directory

`listStaff(actor, {q, role, status})` → sanitized rows (id, name, email, status, role label,
last login, active session count). `getStaff` adds recent sessions (no tokens) + recent audit.
Selection is explicit — `passwordHash`, `tokenHash` are never selected.

## Invitations (no email)

`createInvitation` creates an INVITED user (role pre-assigned so the directory shows it) + a
`StaffInvitation` holding only the token **hash**; it returns the raw token once so the admin
can share `/admin/accept-invitation/?token=…` manually. `acceptInvitation` validates (pending,
unexpired), sets the password (min 12), activates the account, and marks the invitation used
(single-use). Expired/duplicate/weak-password cases are rejected.

## Sessions & password

`/admin/account/` lets any staff member change their password (current-password verified; other
sessions revoked) and view/revoke their sessions. Admins can revoke a member's sessions.

See `ACCOUNT_LIFECYCLE_SECURITY.md` for lifecycle/Super-Admin rules and `RBAC_GOVERNANCE.md`
for the permission registry.
