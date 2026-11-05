# Batch 23 §5.2/5.3 — Render Deployment Configuration

A deployment manifest was prepared at the **repo root: `render.yaml`** (Blueprint). It contains **no secret values** — every secret uses `sync: false` (set in the Render dashboard). **Not committed/deployed** in this batch (approval-gated).

## Service configuration (`render.yaml`)
| Setting | Value | Why |
|---------|-------|-----|
| `type` / `runtime` | `web` / `node` | Node web service; sharp + Server Actions need the Node runtime (not edge). |
| `plan` | `free` | Staging only (production = separate paid VPS). |
| `rootDir` | `apps/web` | The Next.js app lives in the monorepo subdir. |
| `branch` | `main` | Deploy source. |
| `autoDeploy` | `false` | Owner triggers deploys (approval gate). |
| `buildCommand` | `npm ci && npx prisma generate && npm run build` | Deterministic install + client gen + production build. **No `migrate deploy` in build** (migrations are approval-gated — report 07). |
| `startCommand` | `npm run start` (`next start`) | Standard production server. |
| `healthCheckPath` | `/api/health/` | Existing endpoint → Render health checks. |

## Environment variables
**Non-secret (in manifest):** `NODE_VERSION=22.23.4` (matches `.nvmrc`), `NODE_ENV=production`, `APP_ENV=production`, `MEDIA_STORAGE_PROVIDER=r2`, `LOG_LEVEL=info`.
**Secret / per-env (`sync:false`, set in dashboard — names only):** `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `MEDIA_S3_ENDPOINT`, `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY`, `APP_VERSION`, `APP_COMMIT`.

## Runtime compatibility checklist
- **Node version:** `22.23.4` (`.nvmrc` / `NODE_VERSION`) — satisfies `engines: ">=22.23.4 <23"`.
- **Prisma client:** generated in build; the app imports `@prisma/client`.
- **Migrations:** run **manually/approval-gated** against the staging DB (not in build) — report 07.
- **Health check:** `/api/health/` returns 200 `{status:"ok"}`; `/api/ready/` also available.
- **Env validation:** `lib/env.ts` enforces https `NEXT_PUBLIC_SITE_URL` in production and **rejects a localhost `DATABASE_URL`** in prod → staging must point at the Aiven staging DB.
- **Sharp / images:** Node runtime; media via R2 (ephemeral FS safe).
- **Security headers:** emitted by `next.config.mjs` (HSTS, X-Frame, nosniff, Referrer, Permissions, CSP report-only + `report-uri`). HSTS `preload` stays off until HTTPS verified.
- **Session cookies:** `Secure` auto-enabled in production (`NODE_ENV=production`).
- **Trusted proxy / correlation:** login reads `x-forwarded-for`; `correlationIdFrom` honors a trusted `x-request-id`. Render sets `x-forwarded-*`; for strict IP trust, document that only Render's proxy is in front.
- **Logs / errors:** single-line JSON to stdout (Render captures); error boundaries show `digest`; monitoring provider not wired (approval-gated).

## Not introduced
No Docker, no external services, no framework change. The existing architecture is used as-is.

## Not performed
`render.yaml` is prepared but **not committed** and **no Render service was created**. Deployment is owner-approved (report 09).
