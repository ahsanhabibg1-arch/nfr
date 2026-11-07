# Batch 29 — Environment Variable Checklist

## Required (set in Render dashboard)

| Variable | Example | Notes |
|----------|---------|-------|
| `NODE_VERSION` | `22.23.4` | Set in render.yaml |
| `NODE_ENV` | `production` | Set in render.yaml |
| `APP_ENV` | `production` | Set in render.yaml |
| `NEXT_PUBLIC_SITE_URL` | `https://nfrguide-staging.onrender.com` | **Owner must set** — HTTPS required in production mode |
| `DATABASE_URL` | `postgresql://user:pass@host:port/db?sslmode=require` | **Owner must set** — dedicated staging Aiven instance |
| `MEDIA_STORAGE_PROVIDER` | `r2` | Set in render.yaml |
| `MEDIA_S3_ENDPOINT` | `https://ACCOUNT.r2.cloudflarestorage.com` | **Owner must set** |
| `MEDIA_S3_BUCKET` | `nfrguide-staging-media` | **Owner must set** |
| `MEDIA_S3_ACCESS_KEY_ID` | (R2 API token) | **Owner must set** |
| `MEDIA_S3_SECRET_ACCESS_KEY` | (R2 API token secret) | **Owner must set** |
| `MEDIA_S3_REGION` | `auto` | **Owner must set** (always `auto` for R2) |
| `STAGING_NOINDEX` | `true` | Set in render.yaml — prevents search engine indexing |

## Optional

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | Error monitoring (disabled until configured) |
| `APP_VERSION` | Deployment version tag |
| `APP_COMMIT` | Git commit SHA |
| `LOG_LEVEL` | Server log verbosity (default: `info`) |

## Not Required for Staging

| Variable | Reason |
|----------|--------|
| `EMAIL_PROVIDER` / `SENDGRID_API_KEY` | Email not configured; tokens still work |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | AdSense disabled by default |
| `GEMINI_API_KEY` | AI features not used in staging |

## Security & Rotation

- **Never reuse production credentials** for staging
- Database: create a separate Aiven staging database with its own role/password
- R2: create a separate API token scoped to the staging bucket only
- Rotate all staging credentials if they are ever exposed
- The `.env.staging.example` template has placeholder values only

## Staging vs Production Separation

- `NEXT_PUBLIC_SITE_URL` determines canonical URLs, sitemap host, and OG metadata
- `DATABASE_URL` determines which database receives all reads/writes
- `STAGING_NOINDEX=true` is staging-only — never set on production
- The env-guard enforces: production mode cannot use localhost DB or non-HTTPS site URL
