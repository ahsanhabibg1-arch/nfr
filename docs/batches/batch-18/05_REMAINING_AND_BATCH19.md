# Batch 18 §4 — Remaining Issues & Batch 19 Recommendations

## Remaining issues (public/editorial)
Batch 18 found the public site essentially complete. Nothing is *broken*; the items below are enhancements or out-of-scope tracks.

- **Admin loading/error states** — not added (public-focused batch). `global-error.tsx` covers catastrophic admin root failures, but per-segment admin loading skeletons + error boundary would polish the CMS. (Low risk, small.)
- **CSP still report-only** (from Batch 17) — enforce via nonce later; unrelated to Batch 18 UI.
- **NFR 2026 editorial content** — ⛔ still absent and content-blocked; must be source-verified human entry (never fabricated). Infrastructure is ready.
- **Live manual a11y pass** — automated axe is green; a manual screen-reader/keyboard pass on real content is still advisable pre-launch.

## P0 launch blockers (unchanged — owner/ops, not code)
Rotate Admin/Aiven/R2 credentials · least-privilege Aiven role · apply the Batch 17 migration to Aiven · host + CD + staging · backup/PITR + rollback · Aiven CA verification · source-verified NFR 2026 content.

## Batch 19 recommendations (suggested scope)
1. **Admin UX resilience** — `app/admin/(dashboard)/loading.tsx` + `error.tsx` mirroring the public pattern.
2. **CSP enforcement rollout** — nonce-based `script-src`, wire a `report-to` collector, flip report-only → enforcing on staging.
3. **Perf/ISR tuning** — review `revalidate` windows, image optimization, and streaming/Suspense for heavy pages (the loading skeleton enables progressive streaming).
4. **Observability** — external error tracking so `error.tsx` / `global-error.tsx` digests correlate to captured stacks.
5. **Content enablement** — editorial workflow dry-run for NFR 2026 (draft → verify → publish) once sources are available.
6. **Repo hygiene** — remove the leftover Phase 0 Vite SPA at the repo root (noted in the Nov-4 audit).

## Git / safety status
- Stayed on `main`; **no commit, no push, no new branch**; Batch 17 uncommitted changes preserved; no reset/overwrite.
- No Aiven/R2/DNS/hosting/credential/schema changes.
- Batch 18 adds 4 files only: `app/(public)/loading.tsx`, `app/(public)/error.tsx`, `app/global-error.tsx`, `tests/batch18-ui.test.ts`.
