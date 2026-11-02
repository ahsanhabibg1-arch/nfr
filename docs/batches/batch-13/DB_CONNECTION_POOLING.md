# Batch 13 — Database Connection & Pooling Strategy (provider-neutral)

No live Aiven setting was changed. This documents how to connect the app to PostgreSQL in production
without committing to a specific paid pooling service.

## Current implementation (preserved)
- One server-only `PrismaClient` **singleton** (`lib/db.ts`), reused across hot reloads in dev. UI never
  imports Prisma. FTS uses the generated `Article.searchVector` + GIN index via `$queryRaw`.
- Runtime DB access and migration access are **conceptually separate**: the app only reads/writes rows;
  migrations run via `prisma migrate deploy` (CI or an operator), never at request time.

## Connection limits
- Aiven trial/hobby plans expose a **low max connection count**. Each long-running Node instance holds a
  small pool; each serverless instance can open its own connections → exhaustion risk at scale.

## Direct vs pooled — decision by host (choose at hosting selection)
| Host type | Guidance |
|---|---|
| **Long-running Node (VPS / container)** | Direct Aiven connection is fine; keep ONE PrismaClient per process; set a modest pool. Lowest complexity. |
| **Serverless (e.g. Vercel functions)** | Use a **pooler** — Aiven **PgBouncer connection pool** (Console → Connection pools, transaction mode) and point `DATABASE_URL` at the pooler port, or Prisma Accelerate / `?pgbouncer=true`. Prevents connection storms. |
| **Edge runtime** | Prisma over TCP is not supported on pure edge; use a pooler/HTTP data proxy, or keep DB routes on the Node runtime (this app's DB routes already declare `runtime = 'nodejs'`). Verify support before choosing. |

## What must wait for hosting selection (owner decision points)
- Whether a PgBouncer pool / Accelerate is introduced (a paid/approved service — **not enabled now**).
- Pool size + timeouts (depend on the plan's connection cap and instance count).
- Whether migrations run in CI/CD or by an operator against the cloud.

## Recommended defaults once a host is chosen
- Keep the singleton; set `connection_limit` conservatively for serverless (e.g. `?connection_limit=1`
  per function + a pooler in front). Keep `sslmode=require`. Separate runtime vs migration credentials
  (see `LEAST_PRIVILEGE_DB_ROLE.md`). Add a readiness probe check (already implemented: `/api/ready`).
