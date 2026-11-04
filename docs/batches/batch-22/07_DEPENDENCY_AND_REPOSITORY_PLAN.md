# Batch 22 §7 — Dependency & Repository Plan

**No upgrade applied. No files removed. No `npm audit fix`.**

## Dependency advisories (reassessed — unchanged)
| Advisory | Path | Scope | Runtime-reachable? | Fix |
|----------|------|-------|:------------------:|-----|
| `deepmerge-ts <8` (high ×3) | `@prisma/config`→`prisma` CLI | dev/build-time | No | `prisma@7` (major) |
| `tinypool` (critical ×2) | `vitest` | dev/test-only | No | `vitest@5` (major) |
| 1 moderate | dev tree | dev | No | — |
- Production tree (`--omit=dev`): 3 high, 0 critical. CI gate `--omit=dev --audit-level=critical` → **pass**.
- No compatible non-major patch clears these → **no change** (per "no automatic major upgrades").

### Reversible major-upgrade plans
**Prisma 6→7:** branch → bump → `prisma generate` + `validate` → full Vitest on test DB → `migrate deploy` on disposable DB → build → Playwright. Rollback = revert bump + regenerate (schema unchanged). Accept = all green + `migrate status` clean.
**Vitest 3→5:** branch → bump → full suite + `assert-no-skipped-tests` + JSON reporter intact. Rollback = revert bump. Accept = 0 failed / 0 unexpected skips.

## Legacy Vite repository cleanup (reassessed)
- Tracked root Phase-0 files: `index.html`, `vite.config.ts`, `bun.lock`, `metadata.json`, `src/**`, root `package.json`/`package-lock.json`/`tsconfig.json`, `public/robots.txt`, root `tests/**`. (`dist/`, `node_modules/` are generated/ignored — not git-tracked.)
- **No Next code imports from root `src/`** (grep empty); Next pins workspace root to `apps/web`; CI runs in `apps/web`.
- The unit is **interdependent and coupled to the root workspace manifests** → removing it touches root `package.json`/`tsconfig.json`, which the rules say requires **owner approval**. **Not removed.**

### Reversible cleanup plan (owner-approved, separate op)
1. `git rm -r` the unit together: `src/ index.html vite.config.ts bun.lock metadata.json package.json package-lock.json tsconfig.json` (+ evaluate root `public/`, `tests/` per-file). All recoverable from Git history.
2. `next build` + full CI in `apps/web`; confirm green and the Next workspace-root warning is gone.
3. Keep all `docs/**`, `NFR_REQUIRMENT/`, root `*.md`, `.github/`, `.nvmrc`, `.gitignore`, `.gitattributes`.
4. Owner performs the git removal + commit (git operations stay owner-controlled).

## Decision
Both tracks are **documented, reversible plans** awaiting owner approval; nothing upgraded or deleted in Batch 22.
