# Batch 17 §11 — Remaining Limitations & Risks

**Date:** 2026-11-04

## Introduced by Batch 17 (known, accepted)
1. **CSP is report-only.** It does not yet *block* anything. Enforcing requires moving to a nonce-based `script-src` and dropping `'unsafe-inline'`, then flipping the header — a documented phased rollout (report 03). Until then, CSP provides monitoring, not enforcement.
2. **Rate limiter fails open on storage error.** If the `RateLimitHit` query throws, the request is allowed (availability over strictness). A sustained DB outage would disable abuse protection (but the site would be degraded anyway). Documented in `durableRateLimit.ts`.
3. **Fixed-window limiter** (not sliding) — a burst straddling a window boundary can briefly exceed the nominal rate. Acceptable for login/upload.
4. **`RateLimitHit` rows are not auto-pruned.** Harmless (bounded by active keys); an optional periodic `DELETE WHERE "resetAt" < now()` is suggested.
5. **Global `overflow-x: hidden` retained** as defense-in-depth. The real offender is fixed, but the backstop remains, so a *future* regression could again be masked. Mitigation: the overflow probe script can be re-run in CI/QA.

## Not addressed by Batch 17 (out of scope — separate tracks)
These remain from the Nov-4 audit and are explicitly out of this batch's scope:

### P0 — launch blockers (owner / ops action, NOT code)
- **Rotate exposed credentials** (Admin / Aiven / R2).
- **Least-privilege Aiven app DB role**; verify Aiven migration state (`migrate status`).
- **Apply this migration to dev + Aiven** via `migrate deploy` (additive; safe).
- **Host selection + CD + staging**; backup/PITR + rollback runbook; Aiven CA verification (replace `rejectUnauthorized:false`).
- **Source-verified NFR 2026 content** (never fabricated).

### P1 / follow-up (engineering, future batch)
- CSP enforcing (nonce) rollout; wire a CSP `report-to` collector.
- Full live axe + manual a11y pass (keyboard, SR, contrast, touch targets).
- Wire the `npm audit --omit=dev --audit-level=critical` CI gate (report 06).
- Plan `prisma@7` / `vitest@5` upgrades to clear the dev/CLI advisories.
- Dedicated integration test for the durable limiter's multi-call behavior.

### P2 — post-launch
- Public author profiles, advanced analytics, external APM/observability, repo-root legacy Vite SPA cleanup.

## Unverified assumptions
- Aiven applied-migration state is **not** verified here (no cloud connection). The new migration is proven only against `nfrguide_test`.
- The full Playwright e2e + axe suite and a live CI run were not executed in this batch (report 08).
