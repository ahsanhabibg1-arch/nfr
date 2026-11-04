# Batch 22 §4 — Staging & Deployment Readiness Checklist

A concrete path from locally-verified dev → staging → production. Every item is an **owner/ops** action (no secret values shown). Engineering status noted where relevant.

## A. Pre-staging (owner)
- [ ] Choose a **Node-capable host** (Next 16, Node `>=22.23.4 <23`, server runtime for sharp + Server Actions).
- [ ] Create a **staging** environment mirroring prod (separate DB + R2 bucket + env).
- [ ] Provision a **least-privilege Aiven app role** for `DATABASE_URL`; keep a separate privileged role for migrations.
- [ ] Move secrets into the host's **secret store** (not `.env` in the image).
- [ ] **Rotate** the previously-exposed Admin / Aiven / R2 credentials.
- [ ] Pin the **Aiven CA** and enable TLS verification (replace `rejectUnauthorized:false`).

## B. Database (owner, using existing tooling)
- [ ] Apply migrations to staging + Aiven with `prisma migrate deploy` (additive; includes Batch 17 `…batch17_hardening`). Verify `prisma migrate status` = up to date.
- [ ] Configure **automated backups / PITR** on Aiven; test a restore into a disposable DB.
- [ ] Write a **rollback runbook** (bad deploy → previous release; bad migration → forward-fix preferred, restore as last resort).

## C. CI/CD (engineering + owner)
- [x] CI pipeline exists (`ci.yml`): postgres:18, migrate/seed, typecheck, Vitest (+skip-guard), build, route smoke, Playwright+axe, `npm audit --omit=dev --audit-level=critical`.
- [ ] Add a **CD workflow** (deploy `main`→staging on green CI; manual promote to prod).
- [ ] Add a post-deploy **smoke** against the deployed URL (`scripts/route-smoke.mts` with `SMOKE_BASE_URL`).

## D. Runtime config (owner)
- [ ] Set `NEXT_PUBLIC_SITE_URL`, `APP_ENV=production`, `NODE_ENV=production`, `MEDIA_STORAGE_PROVIDER=r2`, `MEDIA_S3_*`, `DATABASE_URL` (scoped role), monitoring toggles.
- [ ] Confirm security headers at the edge (HSTS now; `preload` only after apex+subdomain HTTPS verified).
- [ ] DNS + TLS for the domain.

## E. Observability (engineering, approval-gated)
- [ ] Connect an error-tracking provider inside `report()` / `instrumentation.ts` (code is ready; no provider wired).
- [ ] Uptime monitoring on `/api/health` + `/api/ready`.
- [ ] Have the edge inject `x-request-id` so the app's `cid` spans the whole request chain.

## F. Content (editorial)
- [ ] Enter **source-verified** NFR 2026 content (dates, venue, broadcast, contestants, schedule, tickets) — never fabricated; use the draft→verify→publish workflow.

## G. Launch smoke (post-deploy)
- [ ] Route smoke, admin login, CSP report-only header present, health/ready 200, media proxy serves, no console/CSP breakage.

## Minimum safe launch scope
A–D + F (credentials, least-priv role, Aiven migrate, backup/rollback, host/CD/staging, verified content). E and the CSP-enforcement flip can follow launch.
