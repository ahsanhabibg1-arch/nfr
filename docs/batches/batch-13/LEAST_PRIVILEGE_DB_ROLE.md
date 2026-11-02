# Batch 13 — Least-Privilege Database Role Proposal (NOT executed)

**No role/grant/revoke was executed against Aiven.** This is a reviewed proposal + runbook. Cloud
permission changes require separate owner approval (Batch 13 §11).

## Why
The app currently connects as Aiven `avnadmin` (broad: `CREATEDB`, owner of objects). Production runtime
should use a **least-privilege application role** that can only read/write application data, while schema
**migrations** use a separate, more-privileged role.

## Two roles
### 1) Runtime application role (`nfrguide_app`)
- CONNECT to the database; USAGE on schema `public`.
- SELECT/INSERT/UPDATE/DELETE on application tables.
- USAGE/SELECT/UPDATE on sequences (for any sequence-backed columns).
- **No** DDL, **no** CREATEDB, **no** table ownership, **no** migration ability.
- Default privileges so it keeps access to tables **future migrations** create.

### 2) Migration/maintenance role
- The existing `avnadmin` (or a dedicated `nfrguide_migrator`) runs `prisma migrate deploy`.
- Used only by CI/an operator, never by the running app.

## Proposed SQL (run by an admin, AFTER owner approval — choose a real password privately)
```sql
-- Runtime role: least privilege, data-only.
CREATE ROLE nfrguide_app LOGIN PASSWORD '***';           -- set a real password locally, not in chat
GRANT CONNECT ON DATABASE defaultdb TO nfrguide_app;
GRANT USAGE ON SCHEMA public TO nfrguide_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nfrguide_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO nfrguide_app;
-- Keep access to objects created by FUTURE migrations (run as the migration role/owner):
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nfrguide_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO nfrguide_app;
-- Explicitly ensure NO schema-change ability (no CREATE on schema):
REVOKE CREATE ON SCHEMA public FROM nfrguide_app;
```
- The generated `Article.searchVector` column needs no special grant (it is maintained by Postgres);
  SELECT on `Article` is sufficient to query FTS. The GIN index is used automatically.

## Runbook
1. Owner approves. 2. An admin runs the SQL above on Aiven (real password set locally). 3. Set the
production app's `DATABASE_URL` to `nfrguide_app`'s connection (TLS). 4. Keep `avnadmin`/migrator only for
`migrate deploy`. 5. Verify with `scripts/cloud-db.mts verify` (read-only) + an app smoke that CRUD works
and DDL is denied. 6. Document in the deployment checklist.

## Verification that it is least-privilege (expected)
- `nfrguide_app` can SELECT/INSERT/UPDATE/DELETE app rows. ✓
- `nfrguide_app` CANNOT `CREATE TABLE` / `DROP` / `ALTER` / `CREATE DATABASE`. ✗ (denied) — good.
