# Batch 22 — Owner Action Checklist (Launch Blockers & Prep)

Actions only the owner/ops can take. No secret values are shown or collected; each item names the required external credential/resource abstractly.

## P0 — Launch blockers (must complete before production)
- [ ] **Rotate exposed credentials** — Super Admin password, Aiven DB password, R2 access key/secret (all were exposed in earlier chat). Invalidate the old ones. *Credential: new values set in the host secret store.*
- [ ] **Least-privilege Aiven app role** — create a scoped role for the app's `DATABASE_URL`; reserve a separate privileged role for migrations. *Credential: scoped role DSN.*
- [ ] **Apply migrations to Aiven** — `prisma migrate deploy` (additive, incl. `20261104120000_batch17_hardening`); verify `prisma migrate status` = up to date. *Access: Aiven connection via the privileged role.*
- [ ] **Choose host + CD + staging** — Node-capable host (Next 16, Node 22, server runtime for sharp); staging env mirroring prod; CD from green CI. *Resource: hosting account.*
- [ ] **Backup / PITR + rollback runbook** — enable Aiven automated backups/PITR; test a restore; write the rollback procedure. *Access: Aiven backup settings.*
- [ ] **Aiven CA / TLS verification** — pin the CA; replace `rejectUnauthorized:false` with verified TLS in prod. *Credential: Aiven CA cert.*
- [ ] **Source-verified NFR 2026 content** — enter dates/venue/broadcast/contestants/schedule/tickets via draft→verify→publish; never fabricated. *Input: official PRCA/NFR sources.*

## P1 — Pre-launch (strongly recommended)
- [ ] **Edge `x-request-id` injection** so the app's correlation `cid` spans the whole request chain.
- [ ] **External error tracking** — wire a provider inside `report()`/`instrumentation.ts` (code ready; approval needed to add the dependency/DSN). *Credential: provider DSN.*
- [ ] **Uptime monitoring** on `/api/health` + `/api/ready`.
- [ ] **Post-deploy smoke** wired into CD (`SMOKE_BASE_URL`).
- [ ] **CSP enforcement** — run the staged nonce rollout on staging (see `05_CSP_STAGING_PLAN.md`); flip to enforcing only after a clean report stream + owner approval.

## P2 — Post-launch / engineering (approval-gated, reversible plans exist)
- [ ] `prisma 6→7` + `vitest 3→5` upgrades (clears dev/CLI advisories) — plan in `07_...`.
- [ ] Legacy Vite repo cleanup (owner performs the git removal) — plan in `07_...`.
- [ ] `next/image` adoption with a gated-proxy loader + measured LCP/CLS — plan in `06_...`.
- [ ] Auth CAPTCHA/backoff as the long-term control for attacker-driven account-failure lockout — see `01_...`.

## Engineering status (no owner action)
- Application code is production-grade and fully green (406 Vitest + 45 Playwright). All remaining blockers above are **operational/content**, not code.

## Recommended next phase
**Phase 3 — Launch Execution:** owner completes P0, engineering supports staging deploy + post-deploy verification, then the CSP enforcement flip and observability activation (P1). Batch 23 (engineering) can proceed in parallel on the P2 items.
