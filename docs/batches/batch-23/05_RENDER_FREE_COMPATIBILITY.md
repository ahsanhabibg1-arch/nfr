# Batch 23 §5.1/5.5 — Render Free-Tier Compatibility

**Verified against Render's official docs (render.com/docs/free), Nov 2026.** Numbers can change — re-check the live pricing/free page before deploying.

## Free Web Service — current limits
| Factor | Finding | Impact on NFRGuide |
|--------|---------|--------------------|
| Node.js runtime | Supported; version via `.nvmrc` / `NODE_VERSION`. | ✅ set `22.23.4`. sharp + Server Actions run on the Node runtime (not edge). |
| Next.js App Router | Supported as a Node web service (`next build` → `next start`). | ✅ `rootDir: apps/web`. |
| Prisma | Supported; run `prisma generate` in build. | ✅ build command. |
| **Spin-down / cold start** | Free service **spins down after 15 min idle**; ~**1 min** cold start on the next request. | ⚠️ Hosting limitation, **not a bug**. First hit after idle is slow; health checks/uptime pings can keep it warm but consume instance-hours. |
| **Instance hours** | **750 free instance-hours / month / workspace**; exhausting them suspends all free services until next month. | ⚠️ One always-on service ≈ 730 hrs/mo ⇒ fits, but a warm-ping strategy must stay within budget. |
| **Ephemeral filesystem** | Writes (uploads, local SQLite) are **lost on every redeploy/restart/spin-down**; free tier **cannot** attach a persistent disk. | ⚠️ **Media MUST use R2** (`MEDIA_STORAGE_PROVIDER=r2`). The app already does; local provider would silently lose uploads. |
| **Free PostgreSQL** | **Expires 30 days after creation**, 14-day grace, then deleted; **no backups**. | ⚠️ **Do NOT use Render free Postgres as the staging DB of record.** Use a dedicated **Aiven staging DB/role** (report 07). |
| Env variables | Dashboard-managed; `sync: false` keeps secrets out of the repo. | ✅ `render.yaml` uses `sync: false` for all secrets. |
| DB connection limits | Managed DBs cap connections; serverless/multi-instance can exhaust them. | ⚠️ Set a bounded Prisma pool (`?connection_limit=` / `&pool_timeout=`) on the staging `DATABASE_URL`. |
| Bandwidth / build minutes | Free services count against monthly outbound-bandwidth + build-pipeline allotments (exact figures not confirmed from official docs). | ℹ️ Low for staging; monitor. |
| Custom domain / HTTPS | Supported (HTTPS auto). | ✅ set `NEXT_PUBLIC_SITE_URL` to the service https URL (env guard requires https in prod). |
| Background tasks / cron | Free tier is limited; no reliable always-on workers. | ✅ NFRGuide has **no** background workers/cron (scheduled publish is manual by design). |

## Failure-mode classification (as the batch requires)
- **Application bugs:** none introduced by Render; the app is host-agnostic.
- **Hosting limitations:** cold start after 15-min idle; ephemeral FS; 750 instance-hrs; free-PG 30-day expiry + no backups.
- **Missing external config:** R2 vars, staging `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL` (owner sets in dashboard).
- **DB availability:** avoided by using Aiven staging (not Render free PG).
- **Cold-start behavior:** expected/temporary — do not change app behavior to mask it.
- **Unsupported assumptions:** none — no local-disk media, no background workers.

## Verdict
Render Free is **suitable for initial staging** of NFRGuide **provided**: media uses R2, the staging DB is a dedicated Aiven database (not Render free PG), and cold-start latency is accepted for staging. Production remains a separately-selected paid VPS (not Render).

## Sources
- [Render — Deploy for Free (docs)](https://render.com/docs/free)
- [Render — Free page](https://render.com/free)
- [DEV Community — Render free tier overview](https://dev.to/0012303/render-has-a-free-tier-static-sites-web-services-and-postgresql-with-zero-devops-4clp) (third-party; some figures stale — official docs preferred)
