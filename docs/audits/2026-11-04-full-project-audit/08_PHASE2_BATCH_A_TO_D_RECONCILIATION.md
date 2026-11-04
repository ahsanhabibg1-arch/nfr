# 08 — Phase 2 Batch A–D Reconciliation

**Mode:** READ-ONLY. Evidence: `docs/batches/batch-{a,b,c,d}/*`, `tests/batch{A,B,D}.test.ts`, `e2e/*`, `.github/workflows/ci.yml`, `package.json`. Commits `80f633b`, `6da137d`.

## Batch A — "Truth and Test Reliability"
- **Scope:** test-suite honesty / CI skip-guard / fixture policy.
- **Implemented:** `scripts/assert-no-skipped-tests.mjs` gate wired into CI; `tests/allowed-skips.json` = `[]` (zero skips permitted); synthetic `fixture-` records policy (`lib/fixturePolicy.ts`, `tests/test-db-guard.test.ts`, `tests/support/testDbGuard.ts`). HEAD commit `6da137d` makes the fixture-exclusion test self-contained and fails the gate on unloadable test files.
- **Tests:** `tests/batchA.test.ts`, `test-db-guard.test.ts`.
- **Status:** IMPL-NOT-RTV (gate logic present; executed in CI, not re-run here).

## Batch B — Accessibility & Demo-Content Safety
- **Scope:** a11y fixes + removal of Phase 0 demo content/labels + release verification.
- **Implemented:** "Demo Stage" badge removed from `AdminTopbar`; editor demo auto-population removed; new-article form blank defaults. Playwright + `@axe-core/playwright` e2e added (`e2e/a11y.spec.ts`), with `e2e/a11y-known-issues.json` = `[]` (no accepted a11y violations — axe must pass clean).
- **Tests:** `tests/batchB.test.ts`, `e2e/a11y.spec.ts`.
- **Status:** IMPL-NOT-RTV (axe assertions run in CI; not executed here).

## Batch C — Sharp Security Upgrade
- **Scope:** upgrade/validate image-processing dependency.
- **Implemented:** `sharp ^0.35.5` in `package.json`; report `docs/batches/batch-c/01_SHARP_SECURITY_UPGRADE_REPORT.md`.
- **Tests:** no dedicated `batchC.test.ts`; covered by `media-processing.test.ts`.
- **Status:** IMPL-NOT-RTV. **Note:** `npm audit` not executed this pass — confirm no residual advisory on the pinned sharp version before launch.

## Batch D — Admin Accessibility, Regression & Main Release
- **Scope:** admin keyboard/screen-reader support, focus management, form labels/error announcements; regression verification; merge to `main`.
- **Implemented:** admin a11y improvements + editor relationship/source option props (`AdminArticleEditorShell` gained `relationshipOptions`/`sourceDirectory` props; `articles/new` + `[id]/edit` load `listArticleRelationshipOptions`/`listSourceDirectoryOptions`, `key={payload.version}`).
- **Tests:** `tests/batchD.test.ts`, `tests/editor-fields.test.ts`, `tests/phase2-editorial.test.ts`, `e2e/admin.spec.ts`.
- **Status:** IMPL-NOT-RTV.

## CI configuration (`.github/workflows/ci.yml`)
- Service: **`postgres:18`** (disposable).
- Steps: `prisma migrate deploy` → `prisma db seed` → **typecheck** → **Vitest** (JSON reporter) → **`assert-no-skipped-tests`** gate → **production build** → **HTTP route smoke** → **Playwright install chromium** → **Playwright + axe browser/a11y smoke** → upload report.
- Node pinned via `.nvmrc`.
- **Status:** configured; whether the latest `main` run is green on the hosted runner was not checked (no CI API call).

## Did Phase 2 complete any planned Batch 17–19 work?
- **Accessibility hardening** and **test-reliability/CI** items that might have been slated for later batches are **already done** in A–D. Avoid re-planning: admin a11y, axe gating, sharp upgrade, skip-guard, fixtures.
- **NOT done by A–D:** verified NFR 2026 content, credential rotation, competition optimistic concurrency, CSP/rate-limiting, responsive-overflow fix, staging/deploy. These remain outstanding (see reports 12–14).

## Regression risks
- Editor prop additions (`relationshipOptions`, `sourceDirectory`, `key={payload.version}`) touched the article editor; `tsc` is clean, but the editor's save/concurrency path should get a runtime smoke before launch.
- CI depends on `postgres:18` + seed + fixtures; a drifting seed could break the gate.

## Documentation-vs-code
- A–D docs are consistent with code (badges removed, sharp pinned, axe/known-issues empty, editor props present). The only stale doc is top-of-`KNOWN_LIMITATIONS.md` (Phase 0 preamble).
