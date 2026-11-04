# Batch 17 §12 — Security & Regression Checklist

**Date:** 2026-11-04. Acceptance criteria from the Batch 17 prompt §12, each with evidence.

| # | Acceptance criterion | Status | Evidence |
|---|----------------------|:------:|----------|
| 1 | Competition edits no longer silently overwrite concurrent changes | ✅ | Atomic version-guarded `updateMany`; `tests/batch17-concurrency.test.ts` cases 3–4 (stale → conflict; concurrent → exactly one wins) |
| 2 | Existing result correction chains remain intact | ✅ | `correctResult` unchanged (append+archive); batch17 test case 7 + `batch14.test.ts` |
| 3 | Migration is additive and validated in isolation | ✅ | Report 02; `migrate deploy` on `nfrguide_test` on top of existing data |
| 4 | CSP report-only implemented and verified | ✅ | `next.config.mjs` `Content-Security-Policy-Report-Only`; build pass; report-only cannot block |
| 5 | Existing security headers remain functional | ✅ | nosniff/X-Frame/Referrer/HSTS/Permissions-Policy all retained (report 03) |
| 6 | HSTS preload NOT enabled without verification | ✅ | `preload` deliberately omitted; documented deployment-stage decision |
| 7 | Login + upload abuse protection with clear limitations | ✅ | Durable PG limiter; login (5/15min), upload (30/5min, 429+Retry-After); fail-open documented (report 04) |
| 8 | Rich-content sanitization verified or remediated | ✅ | No vuln (structured blocks + `safeHref` + escaped JSON-LD); locked by `tests/batch17-sanitization.test.ts` (report 05) |
| 9 | Dependency security status documented | ✅ | `npm audit` run; report 06; no prod-runtime critical/high; no `audit fix` |
| 10 | Horizontal overflow investigated & fixed at source | ✅ | SiteHeader fix; re-verified OK at 7 breakpoints with clamp neutralized (report 07) |
| 11 | Stale documentation corrected | ✅ | `KNOWN_LIMITATIONS.md` §0 current-status banner + `[RESOLVED]` markers (Workstream F) |
| 12 | Existing functionality preserved | ✅ | 378/378 tests pass, 0 skipped; build pass; typecheck clean |
| 13 | Required tests pass or unexecuted checks disclosed | ✅ | Full Vitest green; e2e/axe + live CI explicitly marked NOT EXECUTED (report 08) |
| 14 | No local dev or production data destroyed | ✅ | Only `nfrguide_test` written; dev/Aiven untouched; no reset/push/truncate |
| 15 | No cloud resources or credentials changed | ✅ | No Aiven/R2 connection; no secret rotation; no `.env` change |

## Regression surface reviewed
- **Competition update API shape changed** (update actions now return `{ version }` instead of `void`). Callers: only `AdminCompetitionPage.tsx`, updated in lockstep. Typecheck clean confirms no other caller broke.
- **Login path** switched to async durable limiter — `tests/cms.test.ts` login-verification + `auth.test.ts` still green.
- **next.config headers()** — one accidental dropped line caught by typecheck and fixed before any further step.
- **SiteHeader** — CSS-class-only changes; nav reachable via drawer <xl; build + overflow probe confirm.

## NOT claiming FULL PASS beyond evidence
- Full Playwright e2e + axe suite and a live CI run were **NOT executed** here (require the harness / a push). All code-level and local-runtime checks are green. These are disclosed, not glossed.
