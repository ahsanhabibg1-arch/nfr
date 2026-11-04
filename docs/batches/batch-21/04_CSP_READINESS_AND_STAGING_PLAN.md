# Batch 21 §D — CSP Readiness & Staging Plan

**CSP remains REPORT-ONLY. Enforcing is NOT enabled in this batch.**

## Implemented this batch
- **First-party report receiver** `app/api/csp-report/route.ts`:
  - `POST` only, `nodejs` runtime; always responds **204**.
  - **Size cap** 16 KB (content-length + text length) → oversized ignored before parse.
  - Tolerant of both legacy `{"csp-report":{…}}` and Reporting-API array shapes; caps at 10 reports/call.
  - Logs only 4 **truncated, non-sensitive** fields (`document-uri`, `violated-directive`, `blocked-uri`, `disposition`) via the redacting logger; **no DB writes**, no cookies/headers/bodies.
  - Verified live: valid → 204, 20 KB body → 204 (ignored), malformed → 204.
- `next.config.mjs` report-only CSP now includes `report-uri /api/csp-report/` (verified present in the response header). Policy otherwise unchanged.

## Nonce-based enforcement compatibility (assessment)
| Concern | Finding |
|---------|---------|
| App Router / Server Components | Nonce must be generated per request (middleware) and threaded to inline `<script>`; compatible for dynamic routes. |
| Static generation / ISR | A per-request nonce **cannot** be baked into cached HTML. Static/ISR pages need a hash-based allowance or `'strict-dynamic'` strategy, or acceptance of `script-src 'self'` without inline for those pages. **Do not convert static/ISR to dynamic just for CSP** (would hurt performance). |
| Streaming | Compatible (nonce set before stream starts). |
| Admin / rich-text editor / media upload | Same-origin only (`connect-src 'self'`); no third-party script origins needed today. |
| Fonts / images | Already allow-listed (`fonts.gstatic.com`, `data:`/`blob:`). |
| Future ads/analytics | Would require adding explicit script/connect origins — plan to add per-vendor when integrated, not pre-emptively. |

## Staging rollout procedure (future batch, owner-approved)
1. **Collect (now):** report-only + `report-uri`; review `csp.violation` logs on staging with real traffic.
2. **Nonce middleware:** add `middleware.ts` producing a per-request nonce; apply to inline scripts on dynamic routes; choose hash/`'strict-dynamic'` for static/ISR.
3. **Tighten `script-src`:** `'self' 'nonce-…' 'strict-dynamic'`; drop `'unsafe-inline'` for scripts; re-observe report-only on staging until the violation stream is clean.
4. **Styles:** nonce/hash or accept `'unsafe-inline'` for `style-src` as a documented residual (low risk).
5. **Flip to enforcing** (`Content-Security-Policy`) on **staging first**; verify public + admin + editor + media + CSP-report flow; then production, owner-approved.
6. HSTS `preload` is a separate deploy-time decision (not from code).

## Measurable-impact rule
No static/ISR route was converted to dynamic. Nonce middleware is deferred precisely because it requires that trade-off analysis on static/ISR pages, which should be measured on staging.
