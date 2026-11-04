# 12 — Test & Verification Evidence

**Mode:** READ-ONLY. Each check records: command · executed? · result · environment · limitations.

## Checks EXECUTED in this audit (safe, non-mutating)

| # | Command | Executed | Result | Env | Limitations |
|---|---------|:-------:|--------|-----|-------------|
| 1 | `git status -sb` / `git rev-parse HEAD` / `git log` | ✅ | branch `main`, HEAD `6da137d`, clean, = `origin/main` | local | reflects local refs only |
| 2 | `npx prisma validate` | ✅ | **"schema is valid 🚀"** | local, `.env` loaded | validates schema, not DB state |
| 3 | `npx tsc --noEmit` (typecheck) | ✅ | **exit 0, no errors** | local | static types only |
| 4 | HTTP route smoke (manual `curl`) | ✅ | `/`, `/competitors/`, `/venues/`, `/rodeo-events/`, `/admin/login/` → **200** | local dev server :3000, local DB | liveness/status only, not content/visual |
| 5 | Source/static inspection (grep/find/read) | ✅ | routes, models, actions, security controls enumerated | local | — |
| 6 | Migration SQL inspection (Batch 14, Batch 07 FTS) | ✅ | competition tables + enums present; `searchVector` tsvector + GIN present | local | SQL file presence ≠ applied to Aiven |

## Checks NOT EXECUTED (require mutation / network / credentials / test DB)

| # | Command | Why NOT executed |
|---|---------|------------------|
| 7 | `vitest run` (full suite, 40 test files) | Many tests write to a DB; requires an **isolated disposable TEST_DATABASE_URL**. Running against local dev data would mutate it. Not created/used per read-only rule. **NOT EXECUTED.** |
| 8 | `next build` (production build) | Build is safe but resource-heavy and not required for a read-only audit; CI already runs it. **NOT EXECUTED** (left to CI). |
| 9 | `playwright test` (e2e + axe) | Needs browser install + seeded disposable DB + running server. **NOT EXECUTED.** |
| 10 | `prisma migrate status` **against Aiven** | Requires production cloud connection. Forbidden by read-only rules. **NOT EXECUTED.** |
| 11 | R2 round-trip verify (`scripts/r2-verify.mts`) | Requires R2 credentials + object writes. **NOT EXECUTED.** |
| 12 | `npm audit` | Requires install/network. **NOT EXECUTED** — recommend wiring into CI. |

## Prior test reports (claimed, NOT this audit's evidence)
Root `BATCH0{4,6,7,8,9}_TEST_REPORT.md`, `BATCH1{0,1}_TEST_REPORT.md`, `SECURITY_TEST_REPORT.md`, `MEDIA_INTEGRATION_TEST_REPORT.md`, and batch docs report prior green runs. Per brief, **a prior green report is not treated as an independently-executed verification in this audit.** They are context, not proof of current state.

## Confidence summary
- **High confidence:** git baseline, schema validity, type safety, route liveness, presence of migrations/models/actions/security controls.
- **Not independently verified here:** full test-suite pass, production build, e2e/a11y pass, Aiven applied-migration state, R2 operability, dependency CVE status.
