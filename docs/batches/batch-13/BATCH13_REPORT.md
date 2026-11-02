# Batch 13 — Production Hardening & Deployment Readiness: Implementation Report

**Mode:** implementation (hosting-independent). **Baseline:** audit commit `4be01e3`.
**No deploy, no schema change, no cloud write, no credential rotation.** Local dev workflow preserved.

## 1. What was implemented (code)
| Area | File(s) | Behavior |
|---|---|---|
| Env validation (§4) | `lib/env.ts` | Zod, mode-aware (`APP_ENV`), fails fast in production, redacts secrets, non-secret summary |
| Isolation guard (§5) | `lib/env-guard.ts` | classifies DB + storage by destination; blocks local-DB+cloud-storage, cloud-DB+local-media, prod+local-DB, test+cloud-storage; explicit auditable `APP_MAINTENANCE=1` escape; tested valid/invalid combos |
| Startup hook | `instrumentation.ts` | runs validation + guard once at server start; **throws in production runtime**, warns in dev/test/build; nodejs-only; no secrets |
| Health/readiness (§7) | `app/api/health/route.ts`, `app/api/ready/route.ts` | liveness (no DB); readiness (bounded read-only `SELECT 1` + env check); `no-store`; sanitized failures; 200/503 |
| Safe logging/monitoring (§8) | `lib/logger.ts` | structured JSON logs; recursive redaction of passwords/tokens/cookies/connection strings; `report()` with categories + correlation id; monitoring-off safe; no DSN invented, no new dependency |
| Security headers (§12) | `next.config.mjs` | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS; `/admin/*` + `/api/*` `no-store` |
| CI (§9) | `.github/workflows/ci.yml` | disposable Postgres service; `npm ci` → prisma generate/validate → migrate deploy → tsc → vitest → **FTS/migration replay gate** → next build; no Aiven/prod R2; local storage forced |
| Config docs | `apps/web/.env.example` | `APP_ENV`, `LOG_LEVEL`, `APP_MAINTENANCE` documented (placeholders only) |

## 2. What was documented (no execution)
`docs/batches/batch-13/`: `DB_CONNECTION_POOLING.md` (provider-neutral), `LEAST_PRIVILEGE_DB_ROLE.md`
(reviewed SQL proposal — **not run**), `BACKUP_RECOVERY_RUNBOOK.md`, `DEPLOYMENT_READINESS_CHECKLIST.md`,
`PRE_LAUNCH_SECURITY_CHECKLIST.md` (rotation **deferred, not marked complete**), this report.

## 3. Tests executed (actual, isolated)
- `npx prisma validate` → valid. `npx tsc --noEmit` → clean (exit 0).
- `MEDIA_STORAGE_PROVIDER=local npx vitest run` → **28 files, 225 tests, all passed** (212 prior + 13 new
  in `tests/batch13-infra.test.ts`: env validation, isolation guard valid/invalid/maintenance, redaction,
  health liveness). Isolation: `TEST_DATABASE_URL` disposable DB; storage forced local; no mutation of
  dev/Aiven data.
- `npx next build` → success; `/api/health` + `/api/ready` present; instrumentation did not break build.
- (CI will additionally run the from-zero migration/FTS replay gate on its disposable Postgres.)

## 4. Database & storage safety verification
- No schema/migration change; no DB write to Aiven; no R2 object created/changed. Guard + validation are
  read-only classification. FTS `searchVector`/GIN untouched (no migration). Local + Aiven data intact.

## 5. Environment isolation behavior (verified by tests)
- Blocks: local DB + R2, cloud DB + local media, `APP_ENV=production` + local DB, `APP_ENV=test` + cloud
  storage. Allows: matched tiers, and a deliberate `APP_MAINTENANCE=1` maintenance process. Maintenance
  scripts (`cloud-db`, `cloud-data-import`, `r2-verify`) are unaffected (they don't load instrumentation
  and keep their own `--confirm`/aiven-host guards).

## 6. CI / monitoring status
- CI workflow added (GitHub Actions) — runs on push/PR against disposable infra; **not yet validated by a
  real Actions run** (needs the repo pushed to GitHub). Monitoring: safe log-only foundation; no vendor/DSN
  activated (deferred to owner).

## 7. Hosting-dependent decisions remaining (owner)
- Host type (long-running Node / serverless / edge) → pooling choice (`DB_CONNECTION_POOLING.md`).
- Domain/DNS/TLS; production env values; monitoring vendor; whether to introduce a pooler/Accelerate.
- Approve + create the least-privilege runtime DB role on Aiven.

## 8. Pending pre-launch security (BLOCKERS, deferred by owner)
- Rotate **Admin password**, **Aiven DB password**, **R2 token** before public deploy
  (`PRE_LAUNCH_SECURITY_CHECKLIST.md`). Not done this batch, per owner decision — not a license to deploy
  with exposed credentials.

## 9. Incomplete / blockers
- None blocking Batch 13 scope. CI needs a live GitHub run to confirm end-to-end (environment-dependent).
- Not production-ready yet: credential rotation + hosting selection + least-privilege role + real content
  remain (tracked in the audit's gap analysis and the checklists here).

## 10. Preserved (regression-checked)
All 16 admin modules, public routes, publishing lifecycle, RBAC/ownership, SEO Intelligence, Entity
SEO/FAQ, rodeo hubs/events/editions, Venue/Competitor, Media Library + R2 adapter + gated delivery, FTS +
generated searchVector + GIN, analytics/monetization default-off, and the local→cloud migration tools —
all still function (225/225 tests). No editorial content model change; no fabricated NFR data.

## 11. Recommended next step
**Batch 14 planning** — NFR-2026 core coverage data models (Schedule/Result/Standing) + landing hub, per
`docs/audits/nfrguide-pre-batch13/07_RECOMMENDED_BATCH_ROADMAP.md`. Do not start without approval.

> Passing this batch's gates does **not** make the application production-ready; see §7–§9.
