# Batch 20 §5 — CSP Enforcement Readiness

**CSP remains REPORT-ONLY. Not switched to enforcing in this batch** (per instruction). No external reporting service introduced.

## Current state (`next.config.mjs`)
`Content-Security-Policy-Report-Only`:
```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self';
img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com data:;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline';
connect-src 'self'; frame-src 'none'
```

## What blocks enforcing today
| Factor | Finding |
|--------|---------|
| Inline scripts | Next.js injects an inline bootstrap/runtime; requires a nonce (or hash) to drop `'unsafe-inline'` from `script-src`. |
| Inline styles | Tailwind + some inline styles (e.g. `global-error.tsx`) rely on `style-src 'unsafe-inline'`. Lower risk; nonce or hash later. |
| Fonts/images | Google Fonts (`fonts.gstatic.com`) + `data:`/`blob:` images already allow-listed. |
| Dynamic rendering | Nonce must be generated per request (middleware) and threaded to the document — compatible with dynamic routes; needs care for static/ISR pages (nonce can't be baked into a cached HTML). |
| Analytics/monetization | First-party only (`connect-src 'self'`); no third-party script origins currently needed — simplifies the policy. |
| Admin interactions | Same-origin Server Actions + fetches; covered by `'self'`. |

## Staged nonce-based enforcement plan (for a future batch, on staging)
1. **Observe (now):** keep report-only; collect violations on staging via the browser console / a first-party report sink (below).
2. **Nonce middleware:** add `middleware.ts` generating a per-request nonce; expose it (header/context) and apply to `<script>` tags; keep ISR/static pages on a hash-or-`'strict-dynamic'` strategy since they can't carry a per-request nonce.
3. **Tighten `script-src`:** `'self' 'nonce-…' 'strict-dynamic'`, drop `'unsafe-inline'` for scripts; re-observe report-only.
4. **Styles:** move to nonce/hash or accept `'unsafe-inline'` for `style-src` as a documented residual (low risk).
5. **Flip to enforcing** (`Content-Security-Policy`) on staging first, verify no breakage across public + admin + editor + media, then production.
6. **HSTS preload** considered separately at deploy time (not from code).

## Reporting endpoint design (not built — no new service)
A **first-party** `report-to`/`report-uri` could point to an internal `app/api/csp-report/route.ts` that logs violations via the existing redacting logger (no external provider). Deferred until step 1 is actively needed on staging.

## Isolated, backward-compatible prep done
None required beyond what exists — report-only is already the correct preparatory state and is verified live (header present on `/`). No enforcing switch, no nonce middleware added yet (would change request handling for static pages and needs staging validation).
