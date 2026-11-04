# Finalization §6 — Security & CI Verification

## Security headers (live, dev server `curl -I http://localhost:3000/`)
Confirmed present:
- `Content-Security-Policy-Report-Only: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'`
- `X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` · `Referrer-Policy: strict-origin-when-cross-origin` · `Strict-Transport-Security: max-age=63072000; includeSubDomains` · `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
- `/admin/login/` → `Cache-Control: no-store`.

CSP remains **report-only** (not enforcing). HSTS has **no `preload`**. Unchanged from Batch 17.

## Rich-content escaping (unchanged, re-confirmed)
- `safeHref` allowlist rejects `javascript:`/`data:`/`vbscript:`/`file:` (unit-tested, `batch17-sanitization.test.ts`).
- Article body = structured blocks rendered as escaped React children; only `dangerouslySetInnerHTML` is the escaped JSON-LD.
- Playwright e2e re-verified live: *"JSON-LD script bodies contain no raw `<`"* and *"edition pages never expose a purse figure"* pass.

## Dependency audit (read-only, no fix)
`npm audit --omit=dev` → 3 high (Prisma-CLI build-time `deepmerge-ts`); full → 2 critical **dev-only** (`vitest`→`tinypool`). No production-runtime-reachable critical/high. Details in `docs/batches/batch-17/06_DEPENDENCY_SECURITY_REPORT.md`. No `npm audit fix` run; no major upgrades.

## CI gate added
`.github/workflows/ci.yml`, after `npm ci`:
```yaml
- name: Dependency audit (production, critical only)
  run: npm audit --omit=dev --audit-level=critical
```
- Scope documented inline: `--omit=dev` (production tree), `--audit-level=critical`.
- Explicitly **does not conceal** the known high-severity advisories — they are documented in the Batch 17 dependency report and reviewed each release.
- Passes against the current tree (prod has highs, no criticals), so it does not block releases on dev-only noise while still stopping a genuine production critical.
- No `npm audit fix` in CI.

## Not changed
No CSP enforcement flip, no HSTS preload, no dependency upgrades, no external rate-limit service.
