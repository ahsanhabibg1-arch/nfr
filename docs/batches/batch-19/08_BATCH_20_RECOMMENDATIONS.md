# Batch 19 — Batch 20 Recommendations

Public (Batch 18) and Admin (Batch 19) UX are now complete. The remaining work is primarily **launch-readiness (owner/ops)** and a few engineering polish items. Suggested Batch 20 scope (engineering, local, safe):

## 1. Admin form resilience
- **Unsaved-change guard** on the article editor + competition forms (dirty-state tracking → confirm before route change / `beforeunload`).
- Optional per-module error boundaries for finer-grained recovery.

## 2. CSP enforcement rollout (from Batch 17)
- Introduce nonce-based `script-src`, drop `'unsafe-inline'` for scripts, wire a `report-to` collector, then flip `Content-Security-Policy-Report-Only` → enforcing on staging.

## 3. Observability
- External error tracking so the `digest` shown by the public/admin error boundaries correlates to captured stacks; uptime + health/ready monitoring.

## 4. Performance / streaming
- Use the new loading boundaries to enable Suspense streaming on heavy pages; review ISR `revalidate` windows and image optimization.

## 5. Dependency hygiene
- Plan `prisma@7` / `vitest@5` upgrades to clear the dev/CLI advisories (tracked in Batch 17 dependency report); keep the `npm audit --omit=dev --audit-level=critical` CI gate.

## 6. Repo hygiene
- Remove the leftover Phase 0 Vite SPA at the repo root (noted in the Nov-4 audit).

## Owner / ops — P0 launch blockers (NOT code; gate any production launch)
1. Rotate Admin / Aiven / R2 credentials.
2. Provision a least-privilege Aiven application DB role.
3. Apply the Batch 17 additive migration to Aiven (`prisma migrate deploy`) + verify `migrate status`.
4. Choose host + CD + staging; backup/PITR + rollback runbook; Aiven CA verification (replace `rejectUnauthorized:false`).
5. Enter **source-verified** NFR 2026 editorial content (never fabricated).
6. Full manual a11y pass + live SEO/OG validation against the deployed domain.

## Sequencing
Batch 20 (engineering polish) can proceed locally now. The P0 owner/ops track is independent and must complete before launch regardless of Batch 20.
