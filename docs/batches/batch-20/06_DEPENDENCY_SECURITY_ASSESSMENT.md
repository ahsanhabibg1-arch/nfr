# Batch 20 §6 — Dependency Security Assessment

**Commands (read-only, no fix, no upgrade):** `npm audit --omit=dev`, `npm audit --omit=dev --audit-level=critical`.

## Findings (unchanged from Batch 17)
| Advisory | Path | Scope | Runtime-reachable? |
|----------|------|-------|--------------------|
| `deepmerge-ts <8` (stack-exhaustion, **high** ×3) | `@prisma/config` → `prisma` CLI | **devDependency / build-time** | No — Prisma CLI runs at build/migrate, not in the server request path (`@prisma/client` runtime is unaffected). |
| `tinypool` (prototype-pollution → RCE, **critical** ×2) | `vitest` | **devDependency / test-only** | No — never shipped to production. |
| 1 moderate | dev tree | dev | No |

**Production (`--omit=dev`) tree: 3 high, 0 critical.** The CI gate `npm audit --omit=dev --audit-level=critical` → **exit 0 (pass)**.

## Patch feasibility
| Fix | Required change | Risk | Decision |
|-----|-----------------|------|----------|
| `deepmerge-ts` high | `npm audit fix --force` → **`prisma@7`** (major) | Breaking: schema/migration/client API changes; the project is pinned to `prisma 6.19.3` | **Do NOT apply** — major upgrade, out of batch scope |
| `tinypool` critical | → **`vitest@5`** (major) | Breaking test-runner changes | **Do NOT apply** — major upgrade; dev-only, not shipped |

No low-risk, demonstrably-compatible patched version exists without a major upgrade, so **no dependency change was applied** (per the batch's "no automatic major Prisma or Vitest upgrades").

## CI implications
- The existing gate (Batch 17 finalization) is preserved and still passes: production-scope, critical-only — it stops a genuine production critical without blocking releases on the known dev/CLI advisories.
- Recommendation (future): schedule the `prisma 6 → 7` and `vitest 3 → 5` upgrades as their own tested batches to clear these advisories; both will pull non-vulnerable `@prisma/config` / `tinypool`.

## Production runtime exposure summary
**None of the critical/high advisories are reachable in the deployed runtime.** The criticals are the test runner; the highs are the Prisma CLI. Residual risk is low and tracked.
