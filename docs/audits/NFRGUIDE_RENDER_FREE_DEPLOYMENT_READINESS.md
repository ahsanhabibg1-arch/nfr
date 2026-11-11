# NFRGuide — Render Free Deployment Readiness

**Date:** 2026-11-11 · **Branch:** `main` · **HEAD:** `f24af32`
**Status: READY FOR STAGING DEPLOYMENT REVIEW — OWNER DECISIONS REQUIRED.**
Engineering in scope is complete and verified on the Render-pinned runtime. What remains is
owner decisions (`NFRGUIDE_OWNER_DECISIONS_REQUIRED.md`) plus the infrastructure operation,
which the owner deliberately excluded from this execution.
**No Render, Aiven, R2 or DNS resource was created, modified or contacted. Nothing was deployed.**

`render.yaml` describes a **staging** service on Render's free plan. Per its own header and
`docs/batches/batch-23/`, production is a separately selected paid host. Treat everything
below as staging readiness.

---

## 1. Build readiness — VERIFIED

| Item | Configured | Verified |
|---|---|---|
| Build command | `npm ci && npx prisma generate && npm run build` | `next build` succeeded locally (exit 0) against an isolated database |
| Start command | `npm run start` → `next start` | Runs; binds Render's `PORT` automatically (no hardcoded port) |
| Runtime | `runtime: node` | Correct — `sharp` needs the Node runtime, not edge |
| Service root | `rootDir: apps/web` | Correct. `apps/web/package-lock.json` (v3) is present, and the root `package.json` declares **no** workspaces, so `npm ci` inside `apps/web` resolves cleanly |
| Node version | `NODE_VERSION=22.23.4` | Matches `.nvmrc` and the `engines` range. **Runtime parity achieved:** the final regression (TypeScript, 2580 Vitest tests, production build, route + cache harnesses, Playwright, migration replay) was executed on **Node 22.23.4** via fnm — the exact version Render pins. The declared `engines` range was not altered |
| Health check | `healthCheckPath: /api/health/` | **200** `{status: ok}` — no database work, no secrets, correct for a liveness probe |
| Readiness | `/api/ready/` | **200** `{database: ok, environment: ok}` — bounded read-only `SELECT 1` + isolation check, 503 when unready, failures sanitised |
| Auto deploy | `autoDeploy: false` | Correct: the owner triggers each deploy |
| Deployed branch | `branch: main` | ⚠️ see §6 blocker **DEP-01** |

---

## 2. Environment variables

### Declared in `render.yaml` (non-secret)
`NODE_VERSION=22.23.4` · `NODE_ENV=production` · `APP_ENV=production` ·
`MEDIA_STORAGE_PROVIDER=r2` · `LOG_LEVEL=info` · `STAGING_NOINDEX=true`

### Declared as secrets (`sync: false`, values set in the Render dashboard)
`NEXT_PUBLIC_SITE_URL` · `DATABASE_URL` · `MEDIA_S3_ENDPOINT` · `MEDIA_S3_BUCKET` ·
`MEDIA_S3_REGION` · `MEDIA_S3_ACCESS_KEY_ID` · `MEDIA_S3_SECRET_ACCESS_KEY` ·
**`INTERNAL_REVALIDATE_SECRET`** · optional `APP_VERSION`, `APP_COMMIT`

**`INTERNAL_REVALIDATE_SECRET` was missing and was added during this work.** The code reads
it in `app/api/internal/revalidate/route.ts` and `lib/cms/scheduledPublishRunner.ts`, and
the scheduler starts on every boot (`instrumentation.ts`). The endpoint fails **closed**, so
without this value a scheduled publish would write to the database and the public pages
would **never refresh** — a silent content failure. `docs/batches/batch-23/09_DEPLOYMENT_APPROVAL_CHECKLIST.md`
§2 has the same omission (it predates the endpoint) and should be corrected when revised.

### Enforced at startup — verified by reading `lib/env.ts`
In production the process **fails fast** unless: `DATABASE_URL` is set and is **not**
localhost; `NEXT_PUBLIC_SITE_URL` is a valid **https** URL; and, because the provider is
`r2`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY` and
`MEDIA_S3_ENDPOINT` are all present. Secret **values** are never logged — the startup line
prints `DATABASE_URL: "[redacted]"`, confirmed in the local run.

### Not required by the blueprint
No separate session/JWT secret exists to configure: sessions are random tokens stored as
SHA-256 hashes in PostgreSQL, so session security depends on the database, not an env var.

---

## 3. Database requirements

| Item | Requirement |
|---|---|
| Target | A **dedicated Aiven staging** database with a least-privilege role — never the production database, never Render's free PostgreSQL (it expires 30 days after creation and has no backups) |
| SSL | Aiven requires TLS; include `?sslmode=require` in `DATABASE_URL` and pin the Aiven CA per `docs/batches/batch-23/04_AIVEN_AND_R2_SECURITY.md` |
| Migrations | **19** migrations, additive/forward-only. Run **`DATABASE_URL=<staging> npx prisma migrate deploy`**, owner-executed, target confirmed first. Migrations are deliberately **not** part of the Render build |
| Replay proof | All 19 replay cleanly onto a brand-new database: `npm run test:migration` → **8/8 passed**, including the `tsvector` column, the GIN index and a live full-text query, then the throwaway database was dropped |
| Separate migration role | Recommended in report 07: a role with DDL rights for `migrate deploy`, distinct from the least-privilege runtime role |
| Connection limits | Aiven free/hobby tiers allow few connections. Prisma opens a pool per instance; one free Render instance is fine, but set a conservative `connection_limit` in the URL if Aiven's cap is low |
| Backups | Enable Aiven backups **before** the first migration — the rollback plan's last resort depends on it |
| Seeding | Optional `npm run db:seed` + `npm run bootstrap:admin` for a usable staging CMS |

**Order matters:** apply migrations **before** the new code serves traffic. The code selects
columns such as `PageLayout."scheduledById"` and the `PageLayoutRevision` table; against an
un-migrated database every Page Builder page fails. This was observed for real on the local
development database during this audit.

---

## 4. Media / storage requirements

- Render Free has an **ephemeral filesystem**: anything written locally is lost on redeploy,
  restart and spin-down. `MEDIA_STORAGE_PROVIDER=r2` is therefore mandatory, and the
  blueprint sets it. `local` would silently lose every upload.
- Keep the **R2 bucket private**; delivery is gated through the app's own route.
- Required: `MEDIA_S3_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`),
  `MEDIA_S3_BUCKET`, `MEDIA_S3_REGION=auto`, and a rotated bucket-scoped key pair.
- **Not verified in this audit:** a real upload round-trip to R2. The local runs used the
  `local` provider, so R2 delivery must be smoke-tested after the first deploy (checklist
  step 7 covers it).

---

## 5. Render Free limitations that affect this product

| Limitation | Consequence here |
|---|---|
| Instance sleeps after ~15 min idle; ~1 min cold start | First visitor after idle waits for the cold start. Acceptable for staging |
| 750 free instance-hours / month / workspace | One always-on service would exceed a month; sleeping keeps it within budget |
| Ephemeral filesystem | R2 is mandatory (§4) |
| **In-process scheduler** | `instrumentation.ts` starts a 60-second interval scheduler inside the web process. **While the instance is asleep, no scheduled publish can run**, and nothing catches up except the next request waking it. Scheduled publishing therefore **cannot be promised as reliable on Render Free** — this is owner decision **D-12** (scheduler host), still unapproved. A real schedule needs an external cron hitting the service, or a paid always-on instance |
| Free PostgreSQL expires in 30 days, no backups | Use Aiven, not Render PG (§3) |
| Single instance, limited CPU/RAM | Fine for staging. Local timings for reference: TTFB 16–83 ms, load 789–1263 ms on a production build |

---

## 6. Deployment blockers

| ID | Blocker | Why it blocks | Owner action |
|---|---|---|---|
| **DEP-01** | **All current work is uncommitted.** `origin/main` is still `f24af32`; the blueprint deploys `branch: main` | A deploy today would ship **none** of the Stage 09 continuation or this audit's fixes | Approve a commit + push to `main` (the programme's no-commit rule was lifted only for the earlier `bce3b1c` push) |
| **DEP-02** | Staging database does not exist, and migrations are owner-run | Without `migrate deploy` the Builder, publishing, revisions and scheduling fail at runtime | Create the Aiven staging DB + least-privilege role, then `migrate deploy` with the target confirmed |
| **DEP-03** | **P0 credential rotation outstanding** — Batch 23 §5 records previously exposed Admin / Aiven / R2 credentials | Deploying before rotation would carry a known credential exposure into a live environment | Rotate all three, then set them in the Render dashboard |
| **DEP-04** | No Render / Aiven / R2 resource exists; deployment is owner-executed per the approval checklist | I hold no credentials for these services and must not create them | Execute checklist steps 1–8 |
| **DEP-05** | **D-13 privacy contradiction on a publicly reachable URL** — the Privacy Policy states readers are not asked to create accounts while `/register/` is live | `STAGING_NOINDEX` keeps it out of search, but the page is reachable by anyone with the URL. Publishing a false privacy statement is a privacy risk, which the deployment rules say must stop a deploy | Decide: accept for a noindex staging URL, resolve D-13 first, or gate the reader-account routes (a product change needing approval) |

Nothing in this list is engineering work that remains undone.

---

## 7. Deployment procedure — owner-executed

Mirrors `docs/batches/batch-23/09_DEPLOYMENT_APPROVAL_CHECKLIST.md`, with this audit's
additions marked **NEW**.

1. [ ] Complete P0 security prerequisites: rotate Admin / Aiven / R2 credentials (DEP-03).
2. [ ] **NEW** — authorise the commit + push of the Stage 09 and audit work to `main` (DEP-01).
3. [ ] Create the Aiven **staging** database and a least-privilege runtime role (plus a separate DDL role for migrations).
4. [ ] Enable Aiven backups **before** migrating.
5. [ ] `DATABASE_URL=<staging> npx prisma migrate deploy` — confirm the target first; expect **19** migrations. Optionally seed and `bootstrap:admin`.
6. [ ] Create the Render web service from `render.yaml` (Blueprint; `render.yaml` must be committed).
7. [ ] Set every `sync: false` variable in the dashboard, **including `INTERNAL_REVALIDATE_SECRET`** (**NEW**), and point `NEXT_PUBLIC_SITE_URL` at the staging https URL.
8. [ ] Trigger the first deploy manually (`autoDeploy: false`); watch the build log and `/api/health/`.
9. [ ] Post-deploy smoke: homepage, five sections, both directories, an article, admin login, `/api/health/` + `/api/ready/`, security headers present, **a media upload round-trip to R2** (**NEW** — unverified locally), and a concurrent-edit conflict.
10. [ ] Confirm `X-Robots-Tag: noindex, nofollow` is present on staging HTML responses before sharing the URL.
11. [ ] Test each Admin CMS module and log defects.

### Rollback
Bad deploy → redeploy the previous commit from Render's deploy history. Bad migration →
forward-fix (migrations are additive); Aiven backup restore as the last resort, which is
why step 4 comes before step 5. To take staging down, suspend or delete the Render service:
no data lives on the instance (media in R2, data in Aiven).

---

## 8. Readiness summary

| Area | Status |
|---|---|
| Production build | **READY** — verified locally |
| Start command, port, health, readiness | **READY** — verified against a running production build |
| Render configuration (`render.yaml`) | **READY** — one missing secret declaration added during this work |
| Environment requirements | **READY** — documented; values are the owner's to set |
| Database schema / migrations | **READY to apply** — 19 migrations replay cleanly onto a fresh database; the staging target does not exist yet |
| Media / R2 | **CONFIGURED, UNVERIFIED** — no live R2 round-trip was performed |
| Security configuration | **READY**, with CSP report-only as a standing limitation |
| SEO / staging indexing protection | **READY** — `STAGING_NOINDEX` enforced in middleware; no sitemap/robots contradictions |
| Scheduled publishing on Free | **NOT RELIABLE by design** — owner decision D-12 / OD-7 |
| Runtime parity with Render | **VERIFIED** — full regression executed on Node 22.23.4 |
| Deploy authorisation | **BLOCKED** — DEP-01 … DEP-05 |

**Verdict: READY FOR STAGING DEPLOYMENT REVIEW — OWNER DECISIONS REQUIRED.**
This does **not** authorise a deployment. Infrastructure preparation (Aiven, R2, Render,
DNS, credential rotation, remote migrations) was **explicitly excluded** from this execution
by the owner, and none of it was performed or contacted.
