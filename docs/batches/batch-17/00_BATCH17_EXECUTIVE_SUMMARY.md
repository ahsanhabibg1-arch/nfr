# Batch 17 — Executive Summary

**Pre-Launch Security & Integrity Hardening** · 2026-11-04 · Started `main @ 6da137d`.

## What shipped (all local, additive, no cloud/credential/deploy actions)

| # | Workstream | Outcome |
|---|-----------|---------|
| A | **Competition optimistic concurrency** | Added `version` to CompetitionSession/Result/Standing (additive migration) + atomic version-guarded updates. Last-write-wins is eliminated; correction lineage preserved. 8 new tests. |
| B | **CSP + HSTS review** | Added `Content-Security-Policy-Report-Only` (safe, non-blocking) + kept all existing headers. HSTS `preload` deliberately **not** enabled (deployment-stage decision). |
| C | **Rate limiting** | New **durable, Postgres-backed, multi-instance** limiter. Login migrated to it; **media upload now rate-limited** (429 + Retry-After, keyed by user id). Fail-open on limiter-storage error (documented). |
| D | **Sanitization + dependency audit** | Verified **no HTML-injection vuln** (structured blocks rendered as escaped React text; `safeHref` allowlist; escaped JSON-LD). 5 lock-in tests. `npm audit`: no production-runtime critical/high (criticals are dev-only Vitest/`tinypool`). |
| E | **Horizontal overflow** | Root-caused to the **desktop site header** (not mobile). Fixed in `SiteHeader.tsx`; re-verified **OK at 360→1440** with the global clamp neutralized. |
| F | **Docs** | `KNOWN_LIMITATIONS.md` updated with a current-status banner + `[RESOLVED]` markers; Phase 0 preamble marked historical. |

## Verification (this batch)
- `prisma validate` ✅ · `tsc --noEmit` ✅ (exit 0) · `next build` ✅ (57/57 static pages)
- **Vitest: 378 passed / 0 failed / 0 skipped** (42 files, isolated `nfrguide_test` DB) — incl. 13 new Batch 17 tests.
- Migration applied **only** to the disposable test DB (clean, on top of existing 12 + data).
- Overflow re-probe via Playwright/chromium across 7 breakpoints.

## Explicitly NOT done (out of scope / disclosed)
- Full Playwright e2e + axe suite and a **live CI run** (require harness / a push).
- Migration **not** applied to dev or Aiven; **no** cloud connection; **no** credential rotation; **no** deploy/DNS; **no** `npm audit fix`.
- CSP is report-only (not enforcing); durable-limiter dedicated integration test deferred.

## State
- Ending git state: **not committed, not pushed** (per stop rule). 10 files modified, 6 new (incl. migration, 2 tests, 2 doc folders).
- Owner review required before any Git operation and before the P0 launch-blocker tracks (credential rotation, Aiven migrate, host/staging/backup, NFR 2026 content).

See `11_BATCH17_FINAL_REPORT.md` for the full §14 delivery response.
