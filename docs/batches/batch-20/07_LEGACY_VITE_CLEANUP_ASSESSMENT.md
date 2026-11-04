# Batch 20 §7 — Legacy Vite Cleanup Assessment

**Decision: DO NOT DELETE in this batch.** A precise manifest is provided; removal should run as a separate, explicitly-approved cleanup (per the instruction to provide an approved plan rather than delete when scope/uncertainty warrants). Nothing was removed.

## Repo-root inventory (Phase 0 Vite SPA, outside `apps/web/`)
| Path | What it is | Used by Next app? | Recommendation |
|------|-----------|:-----------------:|----------------|
| `src/` | Phase 0 Vite React SPA source | No | Remove (candidate) |
| `dist/` | Phase 0 Vite build output | No | Remove (candidate) |
| `index.html` | Vite entry HTML | No | Remove (candidate) |
| `vite.config.ts` | Vite config | No | Remove (candidate) |
| `bun.lock` | Phase 0 Bun lockfile | No | Remove (candidate) |
| `metadata.json` | Phase 0 metadata | No (verify) | Remove (candidate) after confirming no doc/script reference |
| root `package.json` / `package-lock.json` / `tsconfig.json` | Phase 0 workspace manifests | **Indirectly** — `next.config.mjs` notes the root `package-lock.json` triggers a Next workspace-root warning (worked around via `turbopack.root`) | Remove **carefully**; re-verify the Next warning disappears / `turbopack.root` still pins correctly |
| root `node_modules/` | Phase 0 deps | No | Remove (candidate; large) |
| root `public/`, `tests/`, `.qodo/` | mixed | verify per-file | **Do not bulk-remove** — inspect individually |

## Evidence
- `grep` across `apps/web/*.mjs`, `apps/web/*.json`, `apps/web/scripts` for `vite.config` / `/dist/` / root references → **none**. The Next app does not import or build from any repo-root Vite file.
- `next.config.mjs` `turbopack.root = import.meta.dirname` already pins the workspace to `apps/web`, explicitly to avoid the repo-root lockfile.

## Must be preserved (not cleanup targets)
- All `docs/**` (audits, batch reports, migration docs) — **historical evidence**.
- All root `*.md` architecture/requirements/report files and `NFR_REQUIRMENT/`.
- `.github/workflows/ci.yml`, `.gitattributes`, `.gitignore`, `.nvmrc`.

## Risks of deleting now (why deferred)
- The root `package.json`/`tsconfig.json`/`node_modules` may interact with editor tooling, the workspace-root detection, or an as-yet-unverified script. Removal needs a dedicated verification pass (build + CI green after removal) and an owner sign-off, since it touches the repository's top level.
- Deletion is a large, cross-cutting change inappropriate for a reliability batch that must preserve Batch 17–19 uncommitted work.

## Proposed approved cleanup plan (separate batch)
1. On a clean checkpoint, `git rm -r` the confirmed-unused candidates (`src/`, `dist/`, `index.html`, `vite.config.ts`, `bun.lock`, root `node_modules/`).
2. Re-run `next build` + full CI; confirm the workspace-root warning is gone and nothing broke.
3. Evaluate the root `package.json`/`tsconfig.json` individually; remove only if build/CI stay green.
4. Keep all docs and requirements.
5. Commit as an isolated "chore(repo): remove Phase 0 Vite SPA" change for easy revert.
