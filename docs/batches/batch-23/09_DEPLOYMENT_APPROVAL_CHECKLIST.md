# Batch 23 §6 — Deployment Authorization Gate & Approval Checklist

**STOP: no Render / Aiven / R2 / DNS resource was created or modified.** Deployment requires explicit owner confirmation. Everything below is prepared; the owner executes.

## 1. Exact Render service configuration
See `render.yaml` + report 06. Web service, `runtime: node`, `rootDir: apps/web`, `plan: free`, `branch: main`, `autoDeploy: false`, build `npm ci && npx prisma generate && npm run build`, start `npm run start`, health `/api/health/`.

## 2. Required environment variable NAMES (values set in Render dashboard — never committed)
Non-secret: `NODE_VERSION=22.23.4`, `NODE_ENV=production`, `APP_ENV=production`, `MEDIA_STORAGE_PROVIDER=r2`, `LOG_LEVEL=info`.
Secret (`sync:false`): `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `MEDIA_S3_ENDPOINT`, `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY` (optional `APP_VERSION`, `APP_COMMIT`).

## 3. Database isolation plan
Dedicated **Aiven staging DB + least-privilege role** (NOT production, NOT Render free PG). See report 07.

## 4. Migration plan
`DATABASE_URL=<staging> npx prisma migrate deploy` — **owner-run, after confirming the target**, NOT in the Render build. Additive/forward-only (13 migrations). Optional staging seed + `bootstrap:admin`.

## 5. Security & credential prerequisites (P0 — do first)
- [ ] **Rotate** Admin / Aiven / R2 credentials (previously exposed).
- [ ] Provision the **least-privilege Aiven staging role** (+ separate migration role).
- [ ] Set all secrets in the Render dashboard (`sync:false`); nothing in the repo/image.
- [ ] Keep the **R2 bucket private**; `MEDIA_STORAGE_PROVIDER=r2` (ephemeral FS).
- [ ] Pin the **Aiven CA** / verified TLS for the staging connection.

## 6. Expected free-tier limitations (accept for staging)
15-min spin-down + ~1-min cold start; 750 instance-hrs/mo; ephemeral FS (→ R2 only); free-PG 30-day expiry+no-backups (→ use Aiven). See report 05.

## 7. Rollback procedure
- Bad deploy → redeploy the previous commit (Render deploy history).
- Bad migration → forward-fix (additive); Aiven backup restore as last resort (enable backups first).
- Disable the service → suspend/delete in Render (no data in the ephemeral FS to lose; media in R2, data in Aiven).

## 8. Deployment checklist (owner, in order)
1. [ ] Complete P0 security prerequisites (§5).
2. [ ] Create the Aiven **staging** DB + least-priv role (report 07).
3. [ ] `migrate deploy` to staging DB (confirm target first); optional seed + bootstrap admin.
4. [ ] Create the Render web service from `render.yaml` (Blueprint) — commit `render.yaml` first if using Blueprints.
5. [ ] Set all `sync:false` env vars in the dashboard; set `NEXT_PUBLIC_SITE_URL` to the staging https URL.
6. [ ] Trigger the first deploy; watch the build + `/api/health/`.
7. [ ] Post-deploy smoke: homepage, 5 sections, directories, article, admin login, health/ready, security headers + CSP report-only present, a media upload (→ R2), a competition edit (concurrency).
8. [ ] Test every Admin CMS module; log defects (report 10 / Batch 24).

## Owner confirmation required
Reply with explicit approval (and that the P0 security prerequisites are done) before any Render/Aiven/R2 operation. **Nothing external has been initiated.**
