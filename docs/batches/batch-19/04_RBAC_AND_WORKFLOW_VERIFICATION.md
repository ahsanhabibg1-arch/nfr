# Batch 19 §B.B/B.D — RBAC & Editorial Workflow Verification

## RBAC (unchanged, re-verified)
- Every admin Server Action calls `requireActor(perm)` (default-deny) before work; `lib/cms/guard.ts`.
- Dashboard scopes to own items unless `article.edit.any` (`getDashboardData({ canViewAll })`).
- Covered by `tests/rbac.test.ts`, `permissions-unit.test.ts`, `governance.test.ts`, `team.test.ts` — all green in the 388-test run.
- Playwright: *"unauthenticated admin access is redirected to login"*, *"authorized admin reaches the editor"*, *"every sidebar module loads (no mock or dead admin routes exposed)"* — pass.

## Competition concurrency (Batch 17 — verified NOT weakened)
`lib/cms/competitionService.ts`:
- `updateSession/updateResult/updateStanding` take `expectedVersion: number` (required) and call `requireVersion()` → missing/NaN/0/negative/non-integer rejected as `validation`.
- Atomic `updateMany({ where: { id, version: ev }, data: { …, version: { increment: 1 } } })`; `count === 0` → `conflict`.
- `correctResult` append+archive lineage preserved; `setVerification`/`setCoverageStatus` publication gates intact.
- `tests/batch17-concurrency.test.ts` (8) + `batch14.test.ts` (4) green.

## Editorial workflow (unchanged, re-verified)
- States DRAFT → IN_REVIEW → APPROVED → PUBLISHED, plus SCHEDULED (manual-publish only — no auto-publish, surfaced on the dashboard tile and editor).
- Unpublish, revision snapshot + restore (DB-backed `ArticleRevision` + `restoreRevisionAction`), optimistic `version` on articles.
- `EditorialWorkflowHistory` records transitions; `audit()` logs every mutation.
- Covered by `cms.test.ts` (draft private → publish public → unpublish; author cannot publish an approved article), `batch16.test.ts`, `phase2-editorial.test.ts`.

## Audit logging
- `audit(actorId, action, entityType, entityId, detail)` on all mutations → `AuditLog`.
- The revision modal's audit-log copy now accurately states a restore "records a restore event in the audit trail" (matches `restoreRevision` behavior).

## Conclusion
RBAC, competition concurrency, and the editorial workflow are intact and were not weakened by Batch 19 (which only added loading/error UI and corrected labels).
