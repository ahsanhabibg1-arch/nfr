# Batch 21 §F — Dependency Security & Upgrade Plan

**Commands (read-only):** `npm audit --omit=dev`, `npm audit --omit=dev --audit-level=critical`. **No `npm audit fix`, no upgrade applied.**

## Current findings (unchanged)
| Advisory | Path | Scope | Runtime-reachable? |
|----------|------|-------|--------------------|
| `deepmerge-ts <8` (stack-exhaustion, **high** ×3) | `@prisma/config` → `prisma` CLI | dev / build-time | No (CLI only; `@prisma/client` runtime unaffected) |
| `tinypool` (prototype-pollution→RCE, **critical** ×2) | `vitest` | dev / test-only | No (never shipped) |
| 1 moderate | dev tree | dev | No |

- Production tree (`--omit=dev`): **3 high, 0 critical**.
- CI gate `npm audit --omit=dev --audit-level=critical` → **exit 0 (pass)**.

## Compatible-patch feasibility
- No patched version clears these **without a major upgrade**:
  - `deepmerge-ts` fix ⇒ `prisma@7` (major).
  - `tinypool` fix ⇒ `vitest@5` (major).
- Per the batch rules (no automatic major prisma/vitest upgrade, no `--force`), **no change applied**.

## Major-upgrade migration plan (separate, owner-approved batch)
### Prisma 6 → 7
- **Compatibility:** review schema/client API changes, `prisma migrate`/`db` CLI changes, generated-client breaking changes, Node engine bump.
- **Steps:** bump in a branch → `prisma generate` → `prisma validate` → full Vitest against test DB → `migrate deploy` on a disposable DB → build → Playwright.
- **Rollback:** revert the version bump + regenerate client (schema unchanged).
- **Acceptance:** all suites green; `migrate status` clean; no runtime query regressions.
### Vitest 3 → 5
- **Compatibility:** config/API changes, reporter/`--outputFile` flags used in CI, `tinypool` transitive clears.
- **Steps:** bump → run full suite → confirm `assert-no-skipped-tests` + JSON reporter still work.
- **Rollback:** revert the version bump.
- **Acceptance:** 0 failed / 0 unexpected skips; CI JSON reporter intact.

## CI implications
- The existing production-critical gate is preserved and still passes; it does not mask the known dev/CLI highs (documented here and reviewed each release).
- After the upgrades land, re-run `npm audit` to confirm the advisories clear and keep the gate.

## Runtime exposure summary
**No critical/high advisory is reachable in the deployed runtime.** Residual risk is dev-tooling/build-time only and tracked for a dedicated upgrade batch.
