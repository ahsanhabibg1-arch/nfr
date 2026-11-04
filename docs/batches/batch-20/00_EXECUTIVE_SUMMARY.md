# Batch 20 — Executive Summary

**Application Reliability & Engineering Hardening** · 2026-11-04 · `main @ 6da137d` (unchanged; Batch 17–19 uncommitted work preserved).

## Approach
Audit-first. Implemented one concrete reliability feature (unsaved-change protection) + one correctness fix (error-boundary wording); the rest of the batch is **assessment + staged plans** with deliberately no risky changes (per the safety rules: no enforcing CSP, no major dependency upgrades, no file deletions without approval, no schema/migration/cloud changes).

## Implemented (code)
1. **Unsaved-change protection (Stage 2)** — reusable `useUnsavedChangesWarning` hook (`beforeunload` guard, the reliably-supported subset in the App Router). Wired into the **article editor** (via existing `isDirty`) and all three **competition editors** (new snapshot-based dirty tracking per sub-editor, aggregated). Warns on refresh/tab-close; clears on save; preserves input on validation/conflict.
2. **Error-boundary correctness (Stage 3)** — removed an incorrect guarantee ("Your data was not changed") from the admin error boundary, since a render-error boundary cannot know whether a mutation committed. Replaced with honest guidance to re-check the record.

## Assessed (no code change — documented)
- **Error handling / observability (Stage 3):** boundaries (public B18 + admin B19), redacting logger, health/ready — adequate; external APM deferred (no provider connected without approval).
- **Performance / streaming (Stage 4):** ISR/static split already well-tuned; no N+1 found; no measured regression → no change.
- **CSP enforcement readiness (Stage 5):** staged nonce plan documented; **CSP stays report-only** (not switched to enforcing).
- **Dependency security (Stage 6):** audit re-run; no production-runtime critical/high; CI gate passes; no upgrade applied (would require major prisma/vitest).
- **Legacy Vite cleanup (Stage 7):** repo-root Phase-0 files confirmed unreferenced by Next, but removal is a **separate approved plan** (manifest provided) — nothing deleted.

## Verification (all green)
`tsc` ✅ · Prisma validate ✅ (no schema change) · **Vitest 392/392, 0 skipped** (46 files, +4) · build ✅ 57/57 · **Playwright + axe 45/45**.

## Files changed (3 added, 2 edited)
Added: `lib/hooks/useUnsavedChangesWarning.ts`, `tests/batch20-unsaved.test.ts`, `docs/batches/batch-20/*`. Edited: `views/admin/AdminArticleEditorShell.tsx`, `views/admin/AdminCompetitionPage.tsx`, `app/admin/(dashboard)/error.tsx`.

## Safety
Stayed on `main`; no commit/push/branch; no Aiven/R2/DNS/hosting/credential/schema/migration changes; no CSP enforcement; no dependency upgrade; no file deletions; Batch 17–19 intact.
