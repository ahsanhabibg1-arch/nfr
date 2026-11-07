# Batch 29 — Staging Deployment Runbook

## Prerequisites

- [ ] Render account with access to the nfrguide workspace
- [ ] Aiven staging PostgreSQL instance provisioned (NOT production)
- [ ] Cloudflare R2 staging bucket created with API token
- [ ] All environment variables from `02_ENVIRONMENT_CHECKLIST.md` ready

## Step 1: Provision Staging Database

1. Create a new Aiven PostgreSQL service or a separate database on an existing service
2. Create a dedicated user with full privileges on the staging database only
3. Note the connection string (must include `?sslmode=require`)
4. **Verify**: the connection string does NOT point at the production database

## Step 2: Configure Render Environment

1. Go to the Render dashboard for `nfrguide-staging`
2. Set all `sync: false` environment variables from the checklist:
   - `NEXT_PUBLIC_SITE_URL` = the Render service URL (e.g., `https://nfrguide-staging.onrender.com`)
   - `DATABASE_URL` = the Aiven staging connection string
   - `MEDIA_S3_*` variables = staging R2 bucket credentials
3. **Verify**: no production values are entered

## Step 3: Run Database Migrations

**This is a manual step — migrations are NOT in the Render build command.**

Option A — from Render shell:
```bash
cd apps/web
npx prisma migrate deploy
npx prisma migrate status   # confirm: 15 migrations applied, no pending
```

Option B — from local machine with staging DATABASE_URL:
```bash
DATABASE_URL="<staging-connection-string>" npx prisma migrate deploy
```

**NEVER run `prisma migrate reset` or `prisma db push` against staging.**

## Step 4: Deploy Application

1. In Render dashboard, trigger a manual deploy from the `main` branch
2. Wait for build to complete (~2-5 minutes)
3. Watch build logs for errors

## Step 5: Health Verification

```bash
curl https://nfrguide-staging.onrender.com/api/health/
# Expected: {"status":"ok","time":"..."}

curl https://nfrguide-staging.onrender.com/api/ready/
# Expected: {"status":"ready","checks":{"database":"ok","environment":"ok"}}
```

If `/api/ready/` returns `not-ready`, check the `checks` object for the failing component.

## Step 6: Admin Login Verification

1. Run the bootstrap script (once, after first migration):
   ```bash
   DATABASE_URL="<staging>" npx tsx prisma/bootstrap-admin.ts
   ```
2. Navigate to `https://nfrguide-staging.onrender.com/admin/login/`
3. Log in with the bootstrapped admin credentials
4. Verify the admin dashboard loads

## Step 7: Public Website Smoke Tests

- [ ] Homepage loads with content
- [ ] At least one section landing page (e.g., `/competition/`) works
- [ ] Rodeo events page loads
- [ ] Legal pages (e.g., `/privacy/`) render
- [ ] Search page is accessible

## Step 8: SEO/Privacy Safeguards

```bash
curl -I https://nfrguide-staging.onrender.com/ | grep -i x-robots
# Expected: x-robots-tag: noindex, nofollow
```

- [ ] Verify `X-Robots-Tag: noindex, nofollow` is present
- [ ] Verify sitemap uses staging URL (not production)
- [ ] Verify robots.txt Host uses staging URL

## Step 9: Rollback & Incident Response

**If staging is broken after deploy (application error):**
1. In Render dashboard, click "Rollback" to the previous deploy
2. Check build logs and runtime logs for the failure cause
3. Fix locally, push to main, redeploy

**Important**: Rolling back application code does NOT reverse database migrations. If the
new code added migrations that already ran, the rolled-back code must be compatible with
the migrated schema, or the rollback will fail at runtime.

**If staging database has issues:**
1. Identify the problem (check `/api/ready/` and server logs)
2. If a migration failed partway: inspect `_prisma_migrations` table for failed entries
3. Attempt targeted repair (fix the failed migration SQL, mark resolved)
4. If repair is not possible: **request owner approval** before any destructive action
5. Only after explicit owner approval: drop and recreate the staging database, then
   re-run `prisma migrate deploy` and `bootstrap-admin.ts`

**Never perform destructive database operations without owner approval:**
- `prisma migrate reset` — drops all tables
- `prisma db push --force-reset` — drops all tables
- `DROP DATABASE` — destroys all data
- These are **never** acceptable against production under any circumstances
