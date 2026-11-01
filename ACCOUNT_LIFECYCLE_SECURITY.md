# Account Lifecycle & Security (Batch 09)

## States (reconciled with the existing `UserAccountStatus` enum)

- **INVITED** — created via an invitation; no password; cannot authenticate until accepted.
- **ACTIVE** — normal access.
- **SUSPENDED** — access denied; sessions revoked. (A "Disabled" account is modeled as
  SUSPENDED — both permanently deny access; a separate enum value was intentionally not added
  to avoid an unnecessary schema change, §5.)

## Enforcement

- `validateSessionToken` returns null for a SUSPENDED user (server-side, every request).
- `setStaffStatus(SUSPENDED)` additionally **deletes** the member's sessions in the same
  transaction, so access ends immediately.
- Role resolution is read from the DB per request (`getCurrentUser`), so grants take effect on
  the next request; privilege **removal** and role changes revoke the member's sessions.

## Super Admin protection (§9/§10)

- Only a Super Admin may grant or remove the Super Admin role.
- Administrators cannot escalate themselves; nobody can change their **own** role or status
  through team actions.
- The **last active Super Admin** cannot be suspended or demoted — checked inside a
  **SERIALIZABLE** transaction so concurrent privileged changes cannot race the invariant to
  zero.
- No hidden bypass account and no hardcoded emergency credentials exist.

## Recovery procedure (no backdoor)

If all Super Admin access is lost, recovery is performed out-of-band by someone with database
access using the existing `npm run bootstrap:admin` flow (which refuses to run while a Super
Admin exists) or a direct, audited database role assignment. There is no application backdoor.

## Passwords

- bcryptjs, cost 12 (`lib/auth/password.ts`); minimum length 12; never stored or logged in
  plaintext.
- Authenticated change requires the current password and revokes all **other** sessions.
- Reset (admin-assisted link) revokes **all** sessions.

## Tokens

Invitation (7-day) and reset (1-hour) tokens are cryptographically random, single-use, stored
only as SHA-256 hashes, and never written to logs.
