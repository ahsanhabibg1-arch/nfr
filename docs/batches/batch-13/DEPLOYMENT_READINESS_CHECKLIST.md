# Batch 13 — Deployment Readiness Checklist (hosting-independent)

Do not deploy from this document. It is the pre-flight list for whenever a host is chosen. Items marked
**[owner]** need a decision/action; **[code ✓]** is implemented by Batch 13.

## Hosting & domain
- [ ] **[owner]** Select host (long-running Node / serverless / container) — see `DB_CONNECTION_POOLING.md`.
- [ ] **[owner]** Register/confirm domain + DNS; set `NEXT_PUBLIC_SITE_URL` to the https origin.
- [ ] **[owner]** TLS/HTTPS termination at the host/CDN (HSTS header already sent — `[code ✓]`).

## Environment variables (server-side only; never in client bundles)
- [ ] `APP_ENV=production`, `NODE_ENV=production`.
- [ ] `DATABASE_URL` = Aiven runtime role (TLS, `sslmode=require`) — least-privilege role preferred.
- [ ] `NEXT_PUBLIC_SITE_URL` = https production origin.
- [ ] `MEDIA_STORAGE_PROVIDER=r2` + `MEDIA_S3_BUCKET/ENDPOINT/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY`.
- [ ] Optional: `SENTRY_DSN` (monitoring) — **[owner]** if used.
- [ ] `[code ✓]` Boot-time validation (`lib/env.ts`) fails fast if required production vars are missing/invalid.
- [ ] `[code ✓]` Isolation guard (`lib/env-guard.ts`) blocks local-DB+cloud-storage (and vice-versa).

## Database
- [ ] **[owner]** Provision least-privilege runtime role (`LEAST_PRIVILEGE_DB_ROLE.md`) — approval required.
- [ ] **[owner]** Choose direct vs pooled connection; configure pool if serverless.
- [ ] Run `prisma migrate deploy` against Aiven from CI/operator (not at request time).
- [ ] `scripts/cloud-db.mts verify` → ALL PASSED (tables, FTS, GIN, FKs, migrations).
- [ ] Confirm Aiven backups/PITR policy (`BACKUP_RECOVERY_RUNBOOK.md`).

## Media / R2
- [ ] R2 bucket `nfr` **private**; Public Development URL **disabled**.
- [ ] Token **bucket-scoped** (Object R/W on `nfr`).
- [ ] `scripts/r2-verify.mts` round-trip green (temp object only).
- [ ] `[code ✓]` Delivery via gated `/api/media/<key>` proxy (no direct bucket URLs for private originals).
- [ ] **[owner]** (optional) Public CDN domain for **published derivatives only** — separate approval.

## App verification (post-deploy, before public traffic)
- [ ] `/api/health` → 200; `/api/ready` → 200 (DB + env checks).  `[code ✓]`
- [ ] Admin login works on cloud; change the admin password at `/admin/account/`.
- [ ] Create → publish an article; confirm it renders publicly and FTS finds it.
- [ ] Upload media; confirm gated delivery (published served, draft 404 to anon).
- [ ] Sitemap/robots correct; `/admin` disallowed; private pages `no-store` (`[code ✓]`).
- [ ] Analytics + monetization remain **disabled by default**.

## Operations
- [ ] CI green (`.github/workflows/ci.yml`) — typecheck, tests, FTS/migration gate, build.
- [ ] **[owner]** Monitoring/alerting wired (or accept log-only).
- [ ] Rollback plan understood (app redeploy = normal rollback; never reset prod DB).
- [ ] **[owner]** Search Console verification + sitemap submission after launch.

## BLOCKER before public launch
- [ ] **See `PRE_LAUNCH_SECURITY_CHECKLIST.md` — rotate the previously-exposed Admin / Aiven / R2
      credentials. Deferred by owner; MUST be done before public deployment.**
