# 11 — Hosting, Staging & Production Readiness

**Mode:** READ-ONLY. No deployment/cloud connection/DNS performed. Evidence: `next.config.mjs`, `instrumentation.ts`, `app/api/health|ready`, `.github/workflows/ci.yml`, infra docs (`AIVEN_*`, `CLOUDFLARE_R2_*`, `LOCAL_TO_CLOUD_*`, `MIGRATION_STATUS.md`).

| Area | Classification | Evidence / Note |
|------|---------------|-----------------|
| Hosting platform selection | **MISSING / undecided** | No host config (no `vercel.json`/Dockerfile/`fly.toml`/`render.yaml` found). CI is "hosting-independent" by design. Decide host (Vercel vs Node container) before launch. |
| Next.js 16 runtime compatibility | Configured but unverified | `next 16.4.3`, Node `>=22.23.4 <23` pinned (`.nvmrc`). Prod build not executed here. |
| Production build readiness | Configured but unverified | `build` script present; `tsc` clean; **`next build` NOT EXECUTED** this audit. CI runs it. |
| Environment variables | Implemented | `lib/env.ts` Zod validation + `lib/env-guard.ts` isolation; `.env.example` present; `.env` gitignored. |
| Aiven PostgreSQL SSL | Configured but unverified | Scripts use `ssl:{rejectUnauthorized:false}` (self-signed chain workaround). **Recommend proper CA verification in prod** (pin Aiven CA) rather than disabling verification. |
| Pending production migrations | **BLOCKED (verify)** | Docs claim 12 migrations deployed to Aiven; **not re-verified** (no cloud read). Run read-only `prisma migrate status` against Aiven before launch. |
| Cloudflare R2 storage | Configured but unverified | `@aws-sdk/client-s3` adapter; docs claim round-trip 7/7. Not re-verified here. |
| Media proxy behavior | Implemented | `app/api/media/[...key]` gated; private bucket; proxy path as `publicUrl`. |
| Backup & restore | Documented only | `pg_dump`/`pg_restore` tooling + migration docs. **No scheduled Aiven backup/PITR policy verified.** |
| Rollback strategy | Documented only | Additive-migration discipline noted; no formal rollback runbook for a bad deploy. |
| Health / readiness endpoints | Implemented | `app/api/health/route.ts`, `app/api/ready/route.ts`, `instrumentation.ts` startup hook. |
| Logging / monitoring | Partial | Structured redacting `lib/logger.ts`; `MONITORING` env key. No external APM/error-tracking wired. |
| CI/CD readiness | Implemented (CI) / Missing (CD) | CI full pipeline on `postgres:18`. **No CD/deploy workflow** — deployment is manual/undecided. |
| Staging isolation | **MISSING** | No staging environment/config found. Launch should have a staging tier mirroring prod. |
| DNS / TLS planning | Documented only | `NEXT_PUBLIC_SITE_URL`/`SITE_URL` default `https://nfrguide.com`; DNS/TLS not provisioned here. |
| Production secrets rotation | **BLOCKED (mandatory)** | See report 06 §8 — Admin/Aiven/R2 rotation is a P0 launch blocker. |
| Least-privilege DB credentials | **MISSING** | App likely uses an elevated Aiven role; provision a scoped app role. |
| Launch smoke tests | Implemented (local) | `scripts/route-smoke.mts` (GET). Run against staging post-deploy. |

## Readiness verdict
- **Application** is production-grade in code (SSR, auth, RBAC, health/ready, security headers, gated media).
- **Operational deployment** is the weakest track: **no chosen host, no staging, no CD workflow, no verified backup/rollback, SSL verification disabled, secrets unrotated, no least-privilege DB role.**
- These are deployment-engineering tasks (P0/P1 in report 13), not application bugs.

## Not performed (per read-only rules)
No deployment, no Aiven connection, no R2 object operations, no DNS/CDN/bucket changes, no secret rotation.
