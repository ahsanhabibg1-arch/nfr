# NFRGuide.com — Aiven Cloud PostgreSQL Verification

**Type:** read-only cloud verification. **Baseline:** commit `105bb74` (Batch 12). **Date:** 2026-11-02.
**Written for:** the project owner. No schema-changing or data-changing operation was performed.

> **Headline (updated 2026-11-02, after owner approval):** the Aiven database was **empty** at
> verification time; with the owner's explicit approval, the **11 committed migrations were then
> deployed** via `prisma migrate deploy` and **read-only verification PASSED** — all tables, FTS and
> enums present on **PostgreSQL 18.6**. Sections 4–6 and 9 below reflect the post-deploy state. No data
> was imported, no content seeded, no admin created.

## 1. Connection status — ✅ OK
- Connected to Aiven over **TLS 1.3** (`ssl=true`), `sslmode=require`.
- Target (redacted): user `avnadmin`, host `pg-255de366-…aivencloud.com`, port `20376`, db `defaultdb`.

## 2. Environment isolation — ✅ OK
- `DATABASE_URL` → **localhost** (local dev, unchanged).
- `TEST_DATABASE_URL` → **localhost** (separate).
- `CLOUD_DATABASE_URL` → Aiven host (local ≠ cloud confirmed).
- Local development does **not** use Aiven (schema datasource reads `DATABASE_URL`; Aiven is only ever
  targeted by an explicit, guarded `DATABASE_URL` override for a single `migrate deploy` command).
- `apps/web/.env` is **not** git-tracked; no real connection string is committed (only the `.env.example`
  placeholder + scripts referencing the variable name).

## 3. PostgreSQL version — ✅ 18.6
- `server_version = 18.6`. Repo-side migration audit (Batch 02→12) found **no PG18 incompatibility**:
  no `CREATE EXTENSION`, no destructive DDL, FTS uses standard `GENERATED … tsvector` + GIN, and
  `ALTER TYPE … ADD VALUE` never uses the new value in the same migration. Final confirmation comes when
  `migrate deploy` succeeds on 18.6.

## 4. Migration status — ✅ 11/11 APPLIED (none rolled back)
- `_prisma_migrations`: **11 rows, 0 rolled back, 0 failed** — `20261028000000_init` …
  `20261101200000_batch12_venue_competitor` all applied cleanly on PG 18.6.
- Deployed with `prisma migrate deploy` (committed migrations only — no `db push`, no reset, no
  destructive SQL), after explicit owner approval. This also **confirms PG18 compatibility** end-to-end.

## 5. Schema verification — ✅ ALL PRESENT
Verified present via `scripts/cloud-db.mts verify`: Article, ArticleSeo, Category, Author, MediaAsset,
User, Role, Session, AuditLog, EntitySeo, EntityFaq, **Venue**, **Competitor**, CompetitorParticipation,
CompetitorDiscipline, ArticleCompetitor, CompetitorMedia. `LandingEntityType` has all 7 values incl.
**VENUE + COMPETITOR**. **70 foreign keys** present. (All object counts read-only.)

## 6. Full-text search verification — ✅ PASSED
`Article.searchVector` exists as **`tsvector`**, is **GENERATED ALWAYS**, has its **GIN index**, and
**`websearch_to_tsquery` + ts-match works** on PG 18.6 — FTS is fully functional with no extension needed.

## 7. Security review
- **TLS:** ✅ TLS 1.3 enforced via `sslmode=require`.
- **Connected role:** `avnadmin` — `superuser=false`, **`createdb=true`**, full CREATE/USAGE on `public`.
  Broad (expected for the Aiven admin user). **Recommendation:** for runtime, create a **least-privilege
  application role** (DML on the app schema, no DDL/createdb) and keep `avnadmin` only for migrations;
  keep migration vs runtime credentials separate when off the trial plan.
- **Network access:** Aiven exposes a public endpoint by default. **Recommendation:** restrict the
  service's **IP allowlist** to the hosting platform's egress IPs before public deployment (cannot be
  inspected via SQL — set in Aiven Console → Service settings).
- **Connection pooling:** trial has a low connection cap; serverless/edge hosting should use Aiven's
  **PgBouncer connection pool** (Console → Connection pools) or `pgbouncer=true`/Prisma Accelerate. The
  app already uses a single server-only PrismaClient singleton (`lib/db.ts`); UI never imports Prisma.
- **Env isolation / secrets:** ✅ real URI only in git-ignored local `.env`; scripts redact host and
  never print the URI/password.
- ⚠️ **The database password was pasted into chat during setup — ROTATE it in the Aiven Console**
  (Service settings → reset password), then update `CLOUD_DATABASE_URL` locally and the host secret.

## 8. Backup findings
- Backups are **Aiven-managed**, not inspectable via SQL from the client, so they are **not asserted
  here**. **Recommendation:** confirm in Aiven Console → **Backups** (availability, retention/PITR window).
  Trial/hobbyist plans typically have **shorter retention and no/limited PITR** than paid plans — verify
  before relying on it for production. Manual snapshots remain possible with `pg_dump -Fc` (as used for
  local dev); no restore was executed.

## 9. Production deployment readiness — ✅ SCHEMA READY (app deploy pending owner)
- Cloud schema is deployed + verified on PG 18.6. The deployed app sets its `DATABASE_URL` secret to the
  Aiven URI (server-side only), with TLS, pooling and IP allowlist per §7.
- Still open before go-live (by design / rule): website not deployed; **no admin account on cloud yet**
  (bootstrap a Super Admin against the cloud DB when ready — `BOOTSTRAP_ADMIN_*` + DATABASE_URL=cloud);
  no local data imported; no demo content seeded; analytics/AdSense/affiliate/external providers disabled.

## 10. Remaining action items
1. ✅ ~~Apply migrations to Aiven~~ — **DONE** (11/11 applied, verified).
2. **Rotate the Aiven password** (it was pasted in chat during setup) → Aiven Console → reset →
   update local `CLOUD_DATABASE_URL` + the host's `DATABASE_URL` secret. **Highest priority.**
3. **Harden** before public deploy: narrow IP allowlist to host egress IPs; least-privilege runtime app
   role (keep `avnadmin` for migrations only); connection pool for serverless.
4. Confirm **backup/PITR** policy in the Aiven Console (trial retention is limited).
5. When ready to go live: bootstrap a **cloud Super Admin** (`DATABASE_URL=<cloud> npm run bootstrap:admin`).
6. (Later) Cloudflare R2 for media — not configured now.

---
*Tooling: `apps/web/scripts/cloud-db.mts` (`audit` / `verify` read-only; `deploy --confirm` guarded).
No cloud object was created or modified during this verification.*
