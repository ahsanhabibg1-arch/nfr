# Batch 29 — Staging Architecture

## Topology

```
Browser → Render (free web service) → Next.js 16 (Node 22)
                                      ├── PostgreSQL (Aiven staging instance)
                                      └── Cloudflare R2 (staging bucket)
```

## Render Configuration

**File**: `render.yaml` (repo root)

- **Runtime**: Node.js 22.23.4
- **Root directory**: `apps/web`
- **Build**: `npm ci && npx prisma generate && npm run build`
- **Start**: `npm run start` (next start)
- **Health check**: `/api/health/`
- **Auto-deploy**: disabled (owner-triggered)
- **Migrations**: NOT in build command — run manually via `prisma migrate deploy`

## Database Isolation

- Staging uses a dedicated Aiven PostgreSQL instance with its own credentials
- The env-guard (`lib/env-guard.ts`) enforces tier consistency at runtime:
  - Production mode + localhost DB = hard fail
  - Cloud DB + local storage = hard fail
  - Test mode + cloud storage = hard fail
- The readiness endpoint (`/api/ready/`) reports consistency status

## R2 Integration

- Render free tier has ephemeral filesystem — `MEDIA_STORAGE_PROVIDER=r2` is required
- S3-compatible adapter loads AWS SDK lazily (`lib/media/storage/s3.ts`)
- Requires: `MEDIA_S3_BUCKET`, `MEDIA_S3_ENDPOINT`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY`

## Migration Procedure

1. Set `DATABASE_URL` to the staging database
2. Run `npx prisma migrate deploy` — applies all 15 migrations in order
3. Verify with `npx prisma migrate status`
4. All migrations are additive (no DROP TABLE/COLUMN/TYPE)

## SEO Protection

- `STAGING_NOINDEX=true` activates Next.js middleware that adds `X-Robots-Tag: noindex, nofollow` to all HTML responses
- This is set in `render.yaml` and cannot be accidentally removed without a code change

## Known Constraints

- Render free tier: 15-min idle spin-down, ~1 min cold start
- Render free PostgreSQL expires after 30 days — use Aiven instead
- No email provider configured — registration/reset tokens are minted but not delivered
- `NEXT_PUBLIC_SITE_URL` is baked at build time; changing it requires a rebuild
