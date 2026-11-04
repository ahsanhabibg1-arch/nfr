# Batch 20 — Remaining Risks & Next Steps

## Remaining risks (engineering)
- **In-app navigation not guarded** — the unsaved-change prompt covers refresh/tab-close/external nav only; App Router `<Link>`/`router.push` is not intercepted (no stable API). Mitigated by the visible dirty badge + blocked workflow transitions. Revisit if the App Router adds navigation interception.
- **CSP report-only** — not enforcing; XSS blast-radius reduction is monitoring-only until the nonce rollout.
- **Rate limiter fail-open** + per-IP+email login key (distributed brute-force) — carried from Batch 17.
- **Dev/CLI dependency advisories** — `vitest`→`tinypool` (critical, dev-only) and `@prisma/config`→`deepmerge-ts` (high, build-time); not runtime-reachable; cleared only by major upgrades.
- **Repo-root Phase-0 Vite files** — unreferenced but not yet removed (approved-plan pending).
- **Pre-existing Prisma 5s interactive-transaction timeout** can flake under heavy local load (not a regression; CI unaffected).

## Blocked (content / owner-ops — not code)
- NFR 2026 source-verified editorial content.
- P0 launch blockers: rotate Admin/Aiven/R2 credentials; least-privilege Aiven role; apply the Batch 17 migration to Aiven; host + CD + staging; backup/PITR + rollback; Aiven CA verification.

## Recommended next development batch — Batch 21: "Observability, CSP Enforcement & Repo Hygiene"
1. **External error tracking** (approval-gated) wired to the existing `digest`; uptime monitoring on `/api/health|ready`.
2. **CSP nonce middleware** + staged flip to enforcing on **staging** (plan in `05_CSP_ENFORCEMENT_READINESS.md`); add a first-party `/api/csp-report` sink (no external service).
3. **Streaming / `next/image`** performance pass (the loading boundaries enable Suspense streaming).
4. **Dependency upgrades** as isolated, tested changes: `prisma 6→7`, `vitest 3→5` (clears the audit advisories).
5. **Legacy Vite cleanup** per the approved manifest in `07_LEGACY_VITE_CLEANUP_ASSESSMENT.md`.
6. (Optional) in-app unsaved-nav guard if/when App Router supports it.

## Sequencing
Batch 21 engineering items are local/safe and independent of the P0 owner/ops launch track, which must complete before any production launch regardless.
