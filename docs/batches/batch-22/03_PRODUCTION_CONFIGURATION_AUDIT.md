# Batch 22 §4 — Production Configuration Audit

Inspected without connecting to production. Legend: ✅ ready · 🟡 configured-but-verify · ⛔ owner/ops action.

| Area | Status | Finding |
|------|:------:|---------|
| Environment validation | ✅ | `lib/env.ts` (Zod) + `lib/env-guard.ts` isolation guard; `.env.example` present; `.env` gitignored. |
| PostgreSQL SSL (Aiven) | 🟡 | scripts use `ssl:{rejectUnauthorized:false}` (self-signed workaround). **Owner:** pin the Aiven CA and enable verification in prod. |
| Prisma migration strategy | ✅ | 13 ordered migrations; additive discipline; `migrate deploy` (never `db push`/`reset`) in prod. Batch 17 migration applied to dev; **Aiven pending (owner)**. |
| Least-privilege DB access | ⛔ | app currently likely uses an elevated Aiven role. **Owner:** provision a scoped app role for `DATABASE_URL`; keep a separate privileged role for migrations. |
| Session cookie security | ✅ | HttpOnly + `Secure` in prod + SameSite=Lax + expiry + suspended-user check (`lib/auth/session.ts`). |
| Cloudflare R2 | 🟡 | `@aws-sdk/client-s3` adapter; gated `/api/media/[...key]` proxy (private bucket). **Owner:** confirm prod bucket + keys (rotation below). |
| Health / readiness | ✅ | `/api/health`, `/api/ready` → 200 (verified). |
| Hosting compatibility | ⛔ | Next 16 + Node `>=22.23.4 <23` (`.nvmrc`); `serverExternalPackages:['@aws-sdk/client-s3']`; sharp needs the Node runtime (not edge). **Owner:** choose a Node-capable host. No `vercel.json`/Dockerfile yet. |
| CI/CD | 🟡 | CI (`ci.yml`) full: postgres:18, migrate/seed, typecheck, Vitest+skip-guard, build, route smoke, Playwright+axe, dependency-audit gate. **No CD/deploy workflow** — owner adds. |
| Backup / restore | ⛔ | local `pg_dump`/`pg_restore` verified; **no scheduled Aiven backup/PITR** — owner configures. |
| Rollback | ⛔ | additive-migration discipline; **no written rollback runbook for a bad deploy** — owner adds. |
| Secret management | 🟡 | redacting logger; env-validated; `.env` gitignored. **Owner:** move prod secrets to the host's secret store; rotate the previously-exposed Admin/Aiven/R2 secrets. |
| Deployment documentation | 🟡 | AIVEN/R2/MIGRATION docs exist; **host/CD/staging/rollback docs pending**. |

## Summary
Application code is production-grade. The gaps are **operational** (host, CD, staging, backup/PITR, rollback, least-priv role, Aiven CA, secret rotation) — all owner/ops actions, enumerated in `09_OWNER_ACTION_CHECKLIST.md`. No production connection was made; no config modified.
