# Batch 23 §7 — End-to-End Test & Regression Results

All automated DB writes ran against the **isolated disposable test DB** (`nfrguide_test`). `nfrguide_dev` and Aiven were not written; no migration applied.

| Check | Command | Result |
|-------|---------|--------|
| Prisma schema validate | `npx prisma validate` | ✅ valid |
| Migrate status (test DB) | `npx prisma migrate status` | ✅ "up to date" (13/13) |
| Migration-chain replay | `npm run test:migration` | ✅ 5/5 (FTS artifacts + tables; from-zero replay runs in CI — local role lacks CREATEDB) |
| TypeScript typecheck | `npx tsc --noEmit` | ✅ exit 0 |
| Batch 23 auth test | `vitest run tests/batch23-auth.test.ts` | ✅ 3/3 (concurrency ceiling, reset, fail-closed) |
| **Full Vitest** | `REQUIRE_DB_TESTS=1 npx vitest run` | ✅ **49 files, 409 tests, 409 passed, 0 failed, 0 skipped** (+3 vs Batch 22's 406) |
| Production build | `next build` (test DB, local media) | ✅ compiled, **57/57** static pages |
| **Playwright + axe** | `npx playwright test` | ✅ **45 passed** |
| Dependency audit gate | `npm audit --omit=dev --audit-level=critical` | ✅ pass (from Batch 21; unchanged) |

## Functional surfaces (covered by the suites above)
- **Public:** homepage + 5 sections, rodeo directories/events/editions, competitor/venue pages, article detail (+JSON-LD, draft-isolation, redirects), search + navigation, loading/error states — `public.spec.ts`, `rodeo-public`, `batch12`, `batch14`, `content`, `public-content`, `batch18-ui`.
- **Admin:** login + gating, RBAC/ownership, editorial workflow, media upload (RBAC+limit+signature), competition management (optimistic concurrency + atomic rate gate), SEO settings, landing FAQs, loading/error states — `admin.spec.ts`, `a11y.spec.ts`, `cms`, `rbac`, `governance`, `team`, `batch16`, `batch17-concurrency`, `batch19-admin-ui`.
- **Infra:** health/ready endpoints, security headers + CSP report-only, rate limiter (atomic/fail-closed/concurrency), correlation ids — `batch13-infra`, `batch21/22/23`, route smoke (CI).

## Blockers
- Full **from-zero migration replay** needs a `CREATEDB` role locally (CI has it); verified via `migrate status` + FTS/table checks locally. Not a defect.
- No test was skipped (`allowed-skips.json = []`).

## Honesty note
No test result fabricated. The storage-failure auth tests emit an expected redacted `[database] Error: boom` log (by design). Media upload against R2 is not exercised locally (local provider); R2 behavior is verified by code + the earlier round-trip (Batch 17) and documented in report 04.
