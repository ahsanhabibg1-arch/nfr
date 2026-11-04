# Batch 21 §G — Legacy Vite Repository Cleanup

**Decision: NO files deleted in this batch.** The repo-root Phase 0 Vite app is a **tracked, interdependent unit coupled to the root workspace manifests**, which the batch rules say to defer for approval. A precise, verified proposal follows.

## Tracked-status verification (`git ls-files`)
Confirmed **tracked** at repo root: `index.html`, `vite.config.ts`, `bun.lock`, `metadata.json`, `src/**` (App.tsx, components/**, editorial/**, admin/**, assets/images/**, …), `package.json`, `public/robots.txt`. (`dist/`, `node_modules/` are generated/ignored — not git-tracked; must not be bulk-deleted.)

## Dependency analysis
- **No Next.js code imports from repo-root `src/`** — `grep -rn "\.\./\.\./(\.\./)?src/" apps/web` → **empty**. The Next app resolves everything under `apps/web` via the `@/` alias.
- Next workspace root is pinned to `apps/web` (`next.config.mjs` `turbopack.root = import.meta.dirname`), explicitly to avoid the repo-root lockfile/manifest.
- CI (`.github/workflows/ci.yml`) operates entirely in `apps/web`; it does not reference any root Vite file.

## Why deletion is deferred (interdependency)
The Vite unit is self-referential **and** bound to the root manifests:
`index.html` → `src/index.tsx`; root `package.json` (vite scripts) → `index.html`/`vite.config.ts`; `tsconfig.json`/`bun.lock` configure that build.
Deleting `src/`/`index.html`/`vite.config.ts` while keeping the root `package.json` that references them leaves a half-broken (though unused) manifest — and touching root `package.json`/`tsconfig.json` is exactly the "affects root package manifests / workspace configuration → stop for approval" case. So the unit must be removed **together**, under approval.

## Must be preserved (never cleanup targets)
- All `docs/**` (audits, batch reports, migration docs) — historical evidence.
- All root `*.md` requirements/architecture/reports, `NFR_REQUIRMENT/`.
- `.github/workflows/**`, `.gitattributes`, `.gitignore`, `.nvmrc`.
- Everything under `apps/web/`.

## Approved-cleanup proposal (for owner sign-off, separate operation)
Remove together (all git-recoverable):
```
src/            index.html         vite.config.ts     bun.lock      metadata.json
package.json    package-lock.json  tsconfig.json      public/       tests/   (repo-root copies only)
```
Then:
1. `next build` + full CI in `apps/web` — confirm green and that the Next workspace-root warning is gone.
2. Evaluate `node_modules/` (root) removal (ignored; local only — not a git op).
3. Keep all docs/requirements.
4. Owner performs the git removal + commit (all git operations remain owner-controlled).

## This batch
Nothing removed; build/tests unaffected. The proposal above supersedes the Batch 20 manifest with confirmed tracked-status and import evidence.
