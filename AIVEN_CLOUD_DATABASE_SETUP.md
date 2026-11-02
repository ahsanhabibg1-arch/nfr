# NFRGuide.com — Aiven Cloud PostgreSQL Setup

**Scope:** infrastructure configuration for the FUTURE production database. **Not Batch 13.**
**Baseline:** commit `105bb74` (Phase 1 / Batch 12). **Written for:** the project owner.

Three isolated environments are maintained; the local development database is **never** changed:

| Environment | Database | Env var | Purpose |
|---|---|---|---|
| Office dev | local PostgreSQL | `DATABASE_URL` | normal dev/debug/test (unchanged) |
| Home dev | separate local PostgreSQL | `DATABASE_URL` (that machine's) | independent local data, same repo/migrations |
| Cloud production | Aiven for PostgreSQL | `CLOUD_DATABASE_URL` | future deployed site only; no auto-sync of local data |

---

## 1. Aiven service configuration
- Provider: **Aiven for PostgreSQL**, service `pg-255de366`, PostgreSQL **18.6**, TLS/SSL **required**, trial plan.
- Connection details live in the Aiven Console; the URI is pasted into the **local** `.env` only.

## 2. Local vs cloud environment separation
- Local `DATABASE_URL` and `TEST_DATABASE_URL` are **untouched**. The Prisma schema keeps its single
  `datasource db { url = env("DATABASE_URL") }`.
- The cloud DB is targeted **only** by overriding `DATABASE_URL=$CLOUD_DATABASE_URL` for a single
  `prisma migrate deploy` child process — never by editing `.env`'s `DATABASE_URL`. This is handled by
  `apps/web/scripts/cloud-db.mts`, which refuses to run if the target host is not an `aivencloud.com`
  host (and is not the local dev/test host).

## 3. Secure credential setup
- `CLOUD_DATABASE_URL` is added to the **git-ignored** `apps/web/.env` by the owner, locally. `.env*`
  is gitignored (only `.env.example`, which carries a placeholder, is committed).
- The real URI/password is **never** committed, printed, or shared in chat. Scripts redact the host and
  never log the URI or password.
- **Owner action:** paste the Aiven URI into `apps/web/.env` as:
  `CLOUD_DATABASE_URL="postgres://avnadmin:<password>@pg-255de366-….aivencloud.com:20376/defaultdb?sslmode=require"`

## 4. Connection verification — **PENDING** (needs `CLOUD_DATABASE_URL` in local `.env`)
Run (read-only): `npx tsx scripts/cloud-db.mts audit` → reports redacted identity, server version, TLS
status, connected role + privileges, existing objects, and `_prisma_migrations` state.

## 5. PostgreSQL compatibility — **AUDITED (repo-side): COMPATIBLE**
Full chain Batch 02→12 reviewed for PostgreSQL 18 / Prisma 6.19.3:
- **No `CREATE EXTENSION`** anywhere → no dependency on Aiven's extension allowlist (UUIDs are
  Prisma-generated app-side; `tsvector` is built-in).
- **No destructive DDL** (`DROP TABLE/COLUMN/INDEX` appears only inside explanatory comments).
- FTS: `Article.searchVector` is `tsvector GENERATED ALWAYS AS (…) STORED` using
  `to_tsvector('english'::regconfig, …)` (IMMUTABLE) + a GIN index — standard, supported on PG12→18.
- `ALTER TYPE … ADD VALUE` (batch06 ×5, batch12 ×2) — new values are never used in the same migration,
  so they are safe on PG18.
- **Residual risk:** PG18 is newer than Prisma 6.19.3's officially published test matrix. The SQL is
  standard and version-neutral, but this is only *confirmed* once the live connection + `migrate deploy`
  succeed (Steps 6–7). No PG18-specific incompatibility exists in our migration SQL.

## 6. Migration safety assessment — **READY (apply PENDING approval)**
- Deploy uses the **committed** migrations via `prisma migrate deploy` (no `db push`, no `migrate reset`,
  no destructive commands). Historical migrations are **not** modified.
- `cloud-db.mts deploy` requires `--confirm` and aborts if the target is not the Aiven host.
- Pre-flight to be shown before the first schema change: redacted target identity, server version,
  current migration status, migration list, safety assessment, exact command (secrets redacted).
- **Guard:** do not apply if the cloud DB already contains unexpected application data (the audit checks
  this; a non-empty DB stops the process for owner review).

## 7. Cloud migration status — **PENDING**
After approval: `npx tsx scripts/cloud-db.mts deploy --confirm` (runs `prisma migrate deploy` against
cloud). Expected: all 11 migrations applied; `_prisma_migrations` populated; no failed/rolled-back rows.

## 8. FTS verification status — **PENDING**
After deploy (read-only): `npx tsx scripts/cloud-db.mts verify` → asserts all expected tables (incl.
Venue/Competitor/EntitySeo/EntityFaq), `searchVector` tsvector + GENERATED, GIN index,
`websearch_to_tsquery` behavior, `LandingEntityType` has VENUE+COMPETITOR, FKs present, migrations clean.

## 9. Production deployment readiness
- **Env vars for hosting** (set in the host's secret manager, server-side only — never `NEXT_PUBLIC_*`):
  `DATABASE_URL` = the Aiven URI (the deployed app's primary DB), `NEXT_PUBLIC_SITE_URL` = the public
  origin, plus media vars when R2 is configured later. (In local dev, the Aiven URI stays in
  `CLOUD_DATABASE_URL`; in the deployed environment it becomes that environment's `DATABASE_URL`.)
- **TLS:** `?sslmode=require` is mandatory; Prisma/pg use TLS to Aiven.
- **Connection pooling:** Aiven trial has a low connection cap. Serverless/edge hosts should use Aiven's
  **PgBouncer connection pool** (Aiven Console → Connection pools) or Prisma Accelerate/`pgbouncer=true`,
  and keep a single PrismaClient instance per server (already the case via `lib/db.ts`).
- **Prisma connection management:** `lib/db.ts` owns one server-only PrismaClient (singleton). UI never
  imports Prisma; all DB access is server-side. RBAC/auth architecture is preserved.
- **Backups/restore:** Aiven provides automated backups + PITR (Console → Backups). Manual snapshot:
  `pg_dump -Fc` (as done for local dev). Restore with `pg_restore`.
- **Production access restrictions:** keep the Aiven service's **IP allowlist** narrow (the host's egress
  IPs); do not expose PostgreSQL publicly beyond that; use least-privilege app credentials (avnadmin is
  broad — consider a dedicated app role for runtime vs a migration role when moving off trial).
- **Secret rotation:** rotate the Aiven password via the Console → update `CLOUD_DATABASE_URL` locally and
  the host's `DATABASE_URL` secret; no code change needed.
- **Trial/billing:** trial has $50 credit / 30 days + connection/storage caps; do not enable public
  deployment or move to a paid plan without owner approval.

## 10. Remaining owner actions
1. Paste the Aiven URI into `apps/web/.env` as `CLOUD_DATABASE_URL` (local only — see §3).
2. Approve the migration plan after the read-only `audit` output is presented (§6).
3. Decide on connection pooling + IP allowlist before public deployment (§9).
4. (Later) Cloudflare R2 for media — not configured now.

---
*Cloud-dependent sections (4, 7, 8, and the verified half of 5) are filled in after the owner adds
`CLOUD_DATABASE_URL` and approval is given. No cloud object has been created or modified yet.*
