# Batch 29 — Readiness Report

**Date**: 2026-11-07
**Status**: READY WITH CONDITIONS

## Completed Preparation

1. **Staging architecture verified** — existing `render.yaml` (Batch 23) is compatible with current app structure. Health (`/api/health/`) and readiness (`/api/ready/`) endpoints confirmed working. Environment guard enforces tier isolation at runtime.

2. **Environment template created** — `.env.staging.example` with all required variables, safe placeholders, and documentation. No secrets exposed.

3. **Prisma migration chain verified** — 15 migrations in correct chronological order. All additive (no destructive operations). Schema validates cleanly. Batch 28 migration (`20261107120000_batch28_cms_gaps`) adds SectionConfig, InfoPage tables, InfoPageStatus enum, NavigationItem.description, and SECTION entity type.

4. **Render configuration updated** — added `STAGING_NOINDEX=true` environment variable to `render.yaml` for SEO protection.

5. **Staging SEO middleware implemented** — new `middleware.ts` adds `X-Robots-Tag: noindex, nofollow` to all HTML responses when `STAGING_NOINDEX=true`. Confirmed working in local production smoke test.

6. **Security verified** — session cookies are HttpOnly/Secure/SameSite=Lax. Token hashing (SHA-256) in database. Admin routes require authentication (unauthorized → 307 to login). Durable rate limiting on auth endpoints. CSP headers in report-only mode. HSTS enabled.

7. **Local smoke test passed** — health, readiness, homepage, rodeo events, privacy page, admin login, admin auth redirect, sitemap, robots.txt all verified. X-Robots-Tag header confirmed present.

## Configuration Changes

| File | Change |
|------|--------|
| `apps/web/middleware.ts` | **NEW** — staging noindex middleware |
| `apps/web/.env.staging.example` | **NEW** — staging environment template |
| `render.yaml` | Added `STAGING_NOINDEX=true` env var |

## Test Evidence

| Check | Result |
|-------|--------|
| `tsc --noEmit` | 0 errors |
| `prisma validate` | valid |
| Vitest | 52 files, 453 tests passed |
| `next build` | success |
| Local smoke (production mode) | all endpoints verified |
| X-Robots-Tag | confirmed `noindex, nofollow` |
| Env-guard enforcement | correctly blocks production + localhost DB |

## Unresolved Blockers

- **Prisma migration not applied to dev DB** — the batch28 migration (`20261107120000_batch28_cms_gaps`) is pending on the dev database (applied to test DB only via `resolve`). This does not block staging deployment (staging will run `migrate deploy` from scratch) but should be resolved for local development consistency.

- **Disposable DB migration verification blocked** — could not create an isolated disposable database to run the full migration chain from scratch (no createdb access). The migration SQL was verified statically (no destructive operations, correct ordering). Staging deployment will be the first full-chain execution.

## Owner Actions Required

1. **Provision Aiven staging database** — separate instance/role from production
2. **Create Cloudflare R2 staging bucket** — separate from production, with scoped API token
3. **Set Render dashboard secrets** — `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `MEDIA_S3_*`
4. **Run `prisma migrate deploy`** against staging DB before first deploy
5. **Run `bootstrap-admin.ts`** to create the initial admin user on staging
6. **Review all uncommitted changes** across Batches 28-29

## Staging Readiness Verdict

**READY WITH CONDITIONS** — the application is fully prepared for staging deployment. The two conditions are: (1) owner must provision staging database and R2 bucket with separate credentials, and (2) the full migration chain has not been executed against a fresh database (verified statically only). Both are resolved during the standard deployment runbook (Step 1-3).
