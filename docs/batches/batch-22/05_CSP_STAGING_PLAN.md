# Batch 22 §5 — CSP Staging Plan

**CSP remains REPORT-ONLY. No enforcement, no static/ISR → dynamic conversion in this batch.**

## Current state (verified)
- `next.config.mjs` emits `Content-Security-Policy-Report-Only` with `report-uri /api/csp-report/`.
- First-party receiver `app/api/csp-report/route.ts` (Batch 21): 16 KB cap, tolerant parse, sanitized logging (now with a `cid`), always 204, no DB writes. Verified live.

## Nonce-enforcement compatibility (assessment)
| Surface | Compatibility |
|---------|---------------|
| Server Components / dynamic routes | OK with a per-request nonce (middleware). |
| **Static generation / ISR** | A per-request nonce **cannot** be baked into cached HTML → needs hash-based allowance or `'strict-dynamic'`; **do NOT convert to dynamic just for CSP** (perf regression). |
| Streaming | OK (nonce set before stream). |
| Admin / rich-text editor / media upload | Same-origin (`connect-src 'self'`); covered. |
| Fonts / images | Already allow-listed (`fonts.gstatic.com`, `data:`/`blob:`). |
| Future monetization/analytics scripts | Will require explicit per-vendor `script-src`/`connect-src` origins — add when integrated, not pre-emptively. |

## Backward-compatible prep done this batch
- Correlation id added to `csp.violation` logs so staging triage can group reports per request.
- No policy change (still report-only); no middleware/nonce added (would need the static/ISR trade-off validated on staging).

## Staged enforcement procedure (owner-approved, on staging)
1. **Observe:** report-only + `report-uri` on staging with real traffic; review `csp.violation` logs until the stream is clean.
2. **Nonce middleware:** add `middleware.ts` minting a per-request nonce for dynamic routes; for static/ISR use hashes or `'strict-dynamic'` (do not force dynamic).
3. **Tighten `script-src`:** `'self' 'nonce-…' 'strict-dynamic'`; drop `'unsafe-inline'` for scripts; re-observe report-only.
4. **Styles:** nonce/hash or accept `style-src 'unsafe-inline'` as a documented residual.
5. **Flip to enforcing** (`Content-Security-Policy`) on **staging** first; verify public + admin + editor + media + report flow; then production (owner-approved).

## Rollback
- Enforcement is a single header-name change (`Content-Security-Policy` → `Content-Security-Policy-Report-Only`) in `next.config.mjs`; revert + redeploy instantly restores report-only. No data or schema involved.
- Nonce middleware can be removed independently; static/ISR pages are unaffected by its absence.
