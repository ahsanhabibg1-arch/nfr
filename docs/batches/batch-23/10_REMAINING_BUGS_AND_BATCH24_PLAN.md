# Batch 23 — Remaining Items & Batch 24 Plan

## Confirmed defects fixed this batch
- **Login rate-limit ceiling under concurrency** (peek→record TOCTOU + failed-record fail-open) → reverted to the atomic check-and-increment gate (concurrency-safe, fail-closed), reset-on-success retained. Tested. See report 02.

## No new application bugs found
The public site and Admin CMS pass the full regression (409 Vitest + 45 Playwright/axe). Remaining items are **content** or **external infrastructure**, not code defects.

## Remaining (engineering, non-blocking)
- **Auth CAPTCHA / exponential backoff** — the real long-term control for attacker-driven account-failure lockout (approval-gated). Batch 24 candidate.
- **CSP enforcement** — nonce rollout on staging, then flip (report 05 of Batch 22 / Batch 21 plan). Stays report-only.
- **`next/image`** adoption with a gated-proxy loader + measured LCP/CLS.
- **External monitoring** wired into `report()` (approval-gated).
- **prisma 6→7 / vitest 3→5** upgrades (clears dev/CLI advisories).
- **Legacy Vite repo cleanup** (owner-approved removal of the interdependent root unit).

## Remaining (owner / ops — launch blockers)
- Rotate Admin/Aiven/R2 credentials; least-privilege Aiven role (+ separate migration role); Aiven CA/TLS verification.
- Create a **dedicated Aiven staging DB**; apply the migration there (confirmation-gated).
- Create the Render staging service from `render.yaml`; set secrets; first deploy + post-deploy smoke.
- **Source-verified NFR 2026 editorial content** (never fabricated).
- Backup/PITR + rollback for the production Aiven DB; choose the paid VPS for production.

## Batch 24 recommended scope — "Render Staging Bring-up & NFR 2026 Content Prep"
Once the owner approves and completes the P0 prerequisites:
1. **Staging deploy support** — execute the approval checklist (report 09): Aiven staging DB + migrate, Render service, env vars, first deploy, post-deploy smoke.
2. **On-staging QA** — test every public page + Admin module on Render; capture hosting-vs-app issues (cold start, R2 media round-trip, DB connection limits); fix confirmed app defects.
3. **NFR 2026 editorial + SEO prep** — set up the draft→verify→publish workflow for source-verified content; landing SEO + FAQs; internal linking; sitemap/robots validation against the staging domain.
4. **Auth CAPTCHA/backoff** (if approved) and **CSP nonce** prep on staging.

## Sequencing
Batch 24 depends on the owner completing the P0 security prerequisites and approving the Render/Aiven staging operations (report 09). No external action was taken in Batch 23.
