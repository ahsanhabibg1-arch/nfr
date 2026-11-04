# 01 — Git & Architecture Baseline

**Audit date:** 2026-11-04 · **Mode:** READ-ONLY · **Auditor:** Claude (Opus 4.8)

## 1. Git state (verified)

| Item | Value | Evidence |
|------|-------|----------|
| Branch | `main` | `git rev-parse --abbrev-ref HEAD` |
| HEAD | `6da137d4e5a31384325271913f55b0c0d4dc1aa7` | `git rev-parse HEAD` |
| HEAD message | `fix(ci): make fixture-exclusion test self-contained; gate fails on unloadable test files` | `git log -1` |
| Upstream | `origin/main` | `git rev-parse --abbrev-ref @{u}` |
| Local vs origin/main | **Identical** (`6da137d` = `6da137d`) | `git rev-parse origin/main` |
| Working tree | **Clean** (no modified/untracked) | `git status -sb` → `## main...origin/main` only |

**Baseline matches the expected state in the audit brief** (branch `main`, HEAD `6da137d`, Phase 1 Batches 01–16 + Phase 2 Batches A–D present). No discrepancy. No checkout/pull/fetch/merge/push performed.

### Recent history (Phase 1 → Phase 2)
```
6da137d fix(ci): fixture-exclusion test self-contained; gate fails on unloadable test files   ← Phase 2 CI hardening
80f633b feat: complete admin accessibility and Phase 2 / Batches A-D hardening                  ← Phase 2 A–D
4ad0ae4 feat(batch16): database-backed author bylines, editor production readiness, browser QA
8323a7e feat(batch15): public competitor/venue directories, competition admin UX, editor cleanup
4f41120 feat(batch14): edition-scoped competition coverage — schedules/results/standings
f1186c1 feat(batch13): production hardening — env validation, isolation guard, health/ready, CI
...
3dcde14 feat(cms): Batch 04 — editorial management modules
```
Full Phase 1 Batch 01–16 lineage and Phase 2 A–D are present in history. Infra commits (Aiven setup, R2 activation, local→cloud import) are interleaved between Batch 12 and Batch 13.

## 2. Repository / monorepo structure

Repo root is a **mixed workspace**: it contains the active Next.js app under `apps/web/` **and** a leftover Phase 0 Vite SPA at the repo root.

```
/ (repo root)
├── apps/web/                 ← ACTIVE application (Next.js 16 App Router)
├── docs/                     ← batch docs + audits
├── *.md (85+ root docs)      ← architecture/batch/test reports
├── NFR_REQUIRMENT/           ← original requirements source
├── .github/workflows/ci.yml  ← CI pipeline
│
├── dist/  src/  index.html  vite.config.ts  bun.lock  package.json (Phase 0 Vite)  ← LEGACY, still tracked
└── metadata.json  public/  tests/
```

> **Finding (cleanup, non-blocking):** The repo root still tracks the Phase 0 Vite SPA (`src/`, `dist/`, `index.html`, `vite.config.ts`, `bun.lock`, root `package.json`/`tsconfig.json`). These are not part of the Next.js build and are dead weight / potential confusion. Recommend removing in a dedicated cleanup task (see backlog `R-CLEANUP-01`). Not a launch blocker.

## 3. Active application stack (`apps/web`)

Evidence: `apps/web/package.json`.

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js App Router | `16.4.3` |
| UI | React / React-DOM | `19.2.0` |
| Language | TypeScript | `^7.0.2` |
| Styling | Tailwind CSS + PostCSS | `^4.3.3` |
| ORM | Prisma / `@prisma/client` | `6.19.3` |
| DB driver (scripts) | `pg` | `^8.23.1` |
| Validation | Zod | `^4.6.7` |
| Auth hashing | bcryptjs | `^3.0.3` (cost 12) |
| Image processing | sharp | `^0.35.5` |
| Object storage | `@aws-sdk/client-s3` | `^3.1161.0` (R2) |
| Unit/integration tests | Vitest | `^3.2.4` |
| E2E / a11y | Playwright + `@axe-core/playwright` | `^1.64.1` / `^4.14.0` |
| Node engine | `>=22.23.4 <23` (`.nvmrc` present) | — |

### Available commands (`package.json` scripts)
`dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:routes`, `test:cache`, `test:migration`, `db:generate|migrate|deploy|seed|reset|setup|studio`, `bootstrap:admin`, `test:e2e` (Playwright).

## 4. Architecture summary

- **App Router** with two route groups: `app/(public)/` (editorial site) and `app/admin/(dashboard)/` (CMS). Server Components + Server Actions.
- **Data access** concentrated in `lib/cms/*Service.ts`, `lib/content.ts`, `lib/rodeoContent.ts`, `lib/seo-intel`, `lib/search`, `lib/analytics`, `lib/media`, `lib/monetization`.
- **Server Actions** in 17 files under `app/admin/*-actions.ts`, all routed through a shared authorization guard (`lib/cms/guard.ts`: `requireActor` / `audit` / `toActionError` / `ActionResult`).
- **Prisma schema** `prisma/schema.prisma` — 1,479 lines, ~70 models + ~30 enums, 12 ordered migrations.
- **Instrumentation** `instrumentation.ts` startup hook; health (`/api/health`) and readiness (`/api/ready`) endpoints.

## 5. Limitations of this baseline check
- Git metadata reflects **local** repo only; whether `origin/main` on GitHub has newer commits pushed from another machine since the last fetch was **not** re-verified over the network (no `git fetch` performed per read-only rule). Local `origin/main` ref = `6da137d`.
- Dependency **installed** versions were read from `package.json` ranges, not from a fresh `npm ls` (no install performed).
