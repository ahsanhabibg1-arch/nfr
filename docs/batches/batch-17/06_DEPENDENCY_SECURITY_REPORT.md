# Batch 17 §D4 — Dependency Security Report

**Date:** 2026-11-04 · Commands executed (read-only; **no `npm audit fix`**):
`npm audit --omit=dev` and `npm audit`.

## Results

### Production dependency tree (`npm audit --omit=dev`)
- **3 high**, 0 critical. All three stem from a single advisory:
  - `deepmerge-ts <8.0.0` — **stack exhaustion** (DoS) when merging recursive object graphs (GHSA-ggr8-5vv4-36mx), reached via `@prisma/config` → `prisma`.

### Full tree (`npm audit`, incl. devDependencies)
- **6 vulnerabilities: 1 moderate, 3 high, 2 critical.**
  - **2 critical:** `tinypool <=2.1.1` — prototype-pollution → RCE (GHSA-5gmw-xhrv-c9v3 / GHSA-85c8-ppgw-ccpr), reached via **`vitest`**.

## Reachability / practical-risk analysis
| Advisory | Via | Reachable at runtime? | Practical risk |
|----------|-----|----------------------|----------------|
| `tinypool` (critical) | `vitest` (devDependency, test runner) | **No** — never shipped to production; runs only in local/CI tests | Low (dev tooling only) |
| `deepmerge-ts` (high ×3) | `@prisma/config` → `prisma` CLI | **No** — the Prisma CLI runs at build/migrate time, not in the server request path (`@prisma/client` is the runtime package and is unaffected) | Low (build/CLI-time; attacker cannot supply the config it merges) |
| 1 moderate | (dev tree) | No | Low |

**No production-runtime-reachable critical or high was found.** The headline criticals are confined to the test runner.

## Remediation decision
- **Do NOT run `npm audit fix --force`.** It would force `prisma@7` (major, breaking — our schema/migrations target Prisma 6.19.3) and `vitest@5` (major, breaking). Both are disproportionate to dev/build-time-only advisories.
- **Track** the advisories; upgrade `prisma` and `vitest` on a planned, tested basis (their own releases will pull non-vulnerable `@prisma/config` / `tinypool`).

## CI gate added (recommendation — documented, not yet wired)
Add a **non-brittle** production-severity gate rather than one that fails on dev-only noise:
```yaml
- name: Dependency audit (production, critical only)
  run: npm audit --omit=dev --audit-level=critical
```
- **Severity threshold:** `critical`, **scope:** production deps (`--omit=dev`).
- With the current tree this **passes** (prod has highs, no criticals), so it will not block releases on the Vitest/Prisma-CLI dev advisories, but will stop a genuine production-runtime critical.
- **Exception process:** a documented, time-boxed allowance (comment in the workflow) for any advisory confirmed non-reachable, reviewed each release.

> Note: `npm audit` was run against the committed `package-lock.json`; no dependencies were installed, upgraded, or modified in this batch.
