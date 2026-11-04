# Batch 21 — Remaining Risks & Batch 22 Plan

## Remaining risks (engineering)
- **Limiter victim-lockout trade-off** — the per-account login cap (50/60 min) could, in theory, be abused to lock out a victim. Generous threshold + per-IP+email limit mitigate; a CAPTCHA/exponential-backoff is the real fix (Batch 22).
- **Fail-closed availability** — a Postgres outage now blocks login/upload (by design; the DB is required anyway; 30 s self-healing retry).
- **CSP report-only** — not enforcing; monitoring-only until the staged nonce rollout on staging.
- **No request-scoped correlation id** — `report()` supports one but it isn't propagated app-wide yet.
- **`next/image` not adopted** — potential LCP/CLS win deferred (needs dimensions + proxy-compatible loader + config + measurement).
- **Dev/CLI dependency advisories** — `vitest→tinypool` (critical, dev-only) and `@prisma/config→deepmerge-ts` (high, build-time); not runtime-reachable; cleared only by major upgrades.
- **Legacy Vite unit** — tracked/interdependent; removal deferred to an approved operation.

## Blocked (content / owner-ops — not code; P0 launch blockers)
- Rotate Admin/Aiven/R2 credentials; least-privilege Aiven role; apply the Batch 17 migration to Aiven; host + CD + staging; backup/PITR + rollback; Aiven CA verification.
- Source-verified NFR 2026 editorial content (never fabricated).

## Recommended Batch 22 scope — "Launch Readiness & Observability Activation"
Engineering (local/safe):
1. **Auth backoff / CAPTCHA** after N global failures — replaces the account-lockout trade-off with a non-DoS control.
2. **Request correlation id** via middleware/`AsyncLocalStorage`, threaded into `report()` and surfaced as the boundary `digest`.
3. **External monitoring activation** (owner-approved): initialize a provider inside `report()`/`instrumentation.ts`; uptime on `/api/health|ready`.
4. **CSP nonce middleware + staged enforcement on staging** (plan in `04_...`); keep static/ISR performance.
5. **`next/image` adoption** with a gated-proxy loader + measured LCP/CLS before/after.
6. **Prisma 6→7 / Vitest 3→5** upgrades (plan in `06_...`) to clear the audit advisories.
7. **Legacy Vite cleanup** per the approved proposal in `07_...` (owner performs the git removal).

Owner/ops (gates launch, independent of engineering):
- The P0 list above — credential rotation, Aiven migrate, least-priv role, host/CD/staging, backup/rollback, Aiven CA, NFR 2026 content.

## Sequencing
Batch 22 engineering items are local and independent; the P0 owner/ops track must complete before any production launch regardless of engineering progress.
