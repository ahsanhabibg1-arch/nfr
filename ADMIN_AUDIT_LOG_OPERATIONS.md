# Admin Audit Log Operations (Batch 09)

A read-only viewer over the existing `AuditLog` table, in the System Settings module.

## Access

Restricted to `system.config` (Super Admin). Ordinary administrators and other roles cannot
view it. It is **read-only**: there is no UI path to edit or delete audit history (§22).

## Interface (`listAuditLog`)

- Columns: timestamp (UTC), actor (resolved name, or "system"), action, entity type, entity id,
  safe detail.
- Filters: action (substring), actor id, date range.
- Pagination (default 25/page, max 100).

## What is logged

Every privileged mutation across the CMS writes an `AuditLog` row via `lib/cms/guard.ts`'s
`audit()` — including Batch 09 team/role/status/session/password/settings actions. Details are
short, human-readable strings (e.g. `role=editor`, `collection-disabled`). By design the app
never writes a password, raw/hashed token, or secret into an audit detail, so the viewer cannot
display one.

## Integrity

Audit rows are append-only from the application's perspective; the viewer offers no mutation.
Deleting audit history is out of scope and explicitly disallowed from the UI (§22/§31).
