# Batch 23 §5.4 — Staging Database Isolation

**Principle: staging must never touch the production database.** Migrations/seeds against any cloud DB are **approval-gated** with an explicit confirmation step.

## Database targets (keep strictly separate)
| Environment | Database | Notes |
|-------------|----------|-------|
| Local dev | `nfrguide_dev` (localhost) | developer machine; Batch 17 migration applied. |
| Local test | `nfrguide_test` (localhost) | disposable; all automated writes. |
| **Staging (Render)** | **a dedicated Aiven staging DB** (new) | NOT the production DB, NOT Render free PG (expires 30 days, no backups). |
| Production (future VPS) | the production Aiven DB | untouched until launch. |

## Recommended staging DB (owner action)
Create one of the following on Aiven (in order of preference):
1. **A separate Aiven database** (own service or a second DB in the service) with its **own least-privilege app role** — cleanest isolation.
2. If a separate service isn't feasible, a **separate schema + role** in the existing service, with the role scoped to that schema. Prisma's `?schema=` supports this; the app's queries are schema-relative.

> **Do NOT reuse the production database or production role for staging.** The existing Aiven DB is **not disposable**.

## Isolation enforced by the app
- `lib/env-guard.ts` classifies the real `DATABASE_URL`; `lib/env.ts` **rejects a localhost DB in production** and requires https site URL. This prevents a staging/prod build from silently using a dev DB.
- Tests are hard-guarded to `*_test`/`*_ci` localhost DBs (`tests/support/testDbGuard.ts`); they can never write to dev/staging/prod.

## Migration & seed confirmation gate (owner-run, not in CI auto-deploy)
Against the **staging** DB only, and only after the owner confirms the target:
```bash
# 1) Confirm the target is the STAGING database (host + db name), NOT production.
#    (Never paste the URL into chat/reports.)
# 2) Apply the additive migration chain:
DATABASE_URL="<staging-db-url>" npx prisma migrate deploy
# 3) (Optional) seed reference data for staging:
DATABASE_URL="<staging-db-url>" npx prisma db seed
# 4) Bootstrap a staging Super Admin (interactive; never commit creds):
DATABASE_URL="<staging-db-url>" npm run bootstrap:admin
```
- The Render `buildCommand` deliberately **excludes** `migrate deploy` so a deploy never auto-migrates a cloud DB.
- `prisma migrate deploy` is additive/forward-only; it never resets data.

## Rollback (staging)
- Bad deploy → redeploy the previous commit on Render (Render keeps deploy history).
- Bad migration → forward-fix preferred (additive); restore from an Aiven backup only as a last resort (enable backups first — report 04). Render free PG has no backups, which is another reason to use Aiven for staging.

## Safety in this batch
No cloud migration/seed executed; no staging DB created; the gate above is documentation for the owner to run under confirmation.
