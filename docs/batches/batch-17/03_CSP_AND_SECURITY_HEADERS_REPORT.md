# Batch 17 §B — CSP & Security Headers Report

**Date:** 2026-11-04 · **File:** `next.config.mjs` (`headers()`).

## What changed
Added a **`Content-Security-Policy-Report-Only`** header to the global `/:path*` security header set. Report-only means violations are **reported, never blocked** — it cannot break Next.js hydration, the rich-block editor, Google Fonts, or gated media while the policy is tuned.

### Policy shipped
```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
img-src 'self' data: blob:;
font-src 'self' https://fonts.gstatic.com data:;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
script-src 'self' 'unsafe-inline';
connect-src 'self';
frame-src 'none';
```
- No wildcard origins, no `unsafe-eval`.
- `'unsafe-inline'` for `script`/`style` is tolerated **only** because Next injects an inline bootstrap and Tailwind emits inline styles. This is explicitly a transitional allowance in **report-only** mode.
- `frame-ancestors 'none'` + the existing `X-Frame-Options: DENY` doubly block clickjacking.

## HSTS (B3)
Reviewed. `Strict-Transport-Security: max-age=63072000; includeSubDomains` is **kept as-is** — `preload` is **not** added. Preload is an irreversible apex+subdomain commitment that must be verified across all subdomains at deploy time, not enabled from code locally. Documented as a deployment-stage decision.

## Existing headers preserved
`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `X-DNS-Prefetch-Control`, HSTS, `Permissions-Policy`, and the admin/API `Cache-Control: no-store` rules are all unchanged.

## Verification
- `next build` passes with the new header config (no config error).
- Browser render check (report `07`/`08`) confirms public pages, admin login, and the editor render normally under report-only CSP (report-only never blocks, so no functional risk).
- CSP violation reports are not wired to a collector endpoint yet (no `report-uri`/`report-to`); the header surfaces violations in the browser console during QA.

## Phased rollout plan (follow-up, NOT in this batch)
1. **Now (this batch):** report-only, observe console/report violations in staging.
2. **Next:** introduce a per-request **nonce** for `<script>` (Next 16 supports nonce via middleware/headers), drop `'unsafe-inline'` from `script-src`.
3. **Then:** flip `Content-Security-Policy-Report-Only` → enforcing `Content-Security-Policy` once the report stream is clean on staging.
4. Add `preload` to HSTS only after verifying HTTPS across apex + all subdomains and submitting to the preload list.

**Do not flip to enforcing until step 2–3 are validated on staging.**
