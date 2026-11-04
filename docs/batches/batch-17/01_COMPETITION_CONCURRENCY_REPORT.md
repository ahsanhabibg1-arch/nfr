# Batch 17 §A — Competition Optimistic Concurrency

**Date:** 2026-11-04 · **Audit finding addressed:** competition editing was last-write-wins (report `05_DATABASE_AND_DATA_INTEGRITY.md`, finding P1-CONC-01).

## Problem
`CompetitionSession`, `CompetitionResult`, and `CompetitionStanding` edits used a plain `prisma.*.update({ where: { id } })` — no version check. Two editors loading the same record and saving would silently overwrite each other. Articles already solved this with an optimistic `version` lock; competition did not.

## Implementation

### Schema (additive)
`prisma/schema.prisma` — added `version Int @default(1)` to all three models. Existing rows default to 1. No column dropped/renamed.

### Migration
`prisma/migrations/20261104120000_batch17_hardening/migration.sql`:
```sql
ALTER TABLE "CompetitionSession"  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CompetitionResult"   ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CompetitionStanding" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
```
Additive, backward-compatible. Verified applied on top of the existing 12 migrations on the disposable test DB (see `02_DATABASE_MIGRATION_SAFETY_REPORT.md`). **NOT applied to dev or Aiven.**

### Service (`lib/cms/competitionService.ts`)
`updateSession` / `updateResult` / `updateStanding` now take an optional `expectedVersion?: number` and perform an **atomic conditional update**:
```ts
const where = typeof expectedVersion === 'number' ? { id, version: expectedVersion } : { id };
const upd = await prisma.competitionX.updateMany({ where, data: { …, version: { increment: 1 } } });
if (upd.count === 0) throw new ServiceError('conflict', 'This X was changed by someone else. Reload…');
const after = await prisma.competitionX.findUniqueOrThrow({ where: { id }, select: { version: true } });
return { version: after.version };
```
- The match-and-increment happen in **one** statement (`updateMany` with a `version` predicate) — no read-then-write race.
- A mismatch (`count === 0`) throws `ServiceError('conflict', …)`, mapped by `guard.ts toActionError` to `{ ok:false, code:'conflict', error }`.
- The admin list mappers (`listSessionsAdmin`/`listResultsAdmin`/`listStandingsAdmin`) now return `version` so the editor can submit it.
- `version` is bumped **only** on these content edits, not on the discrete verify/publish toggles (`setVerification`/`setCoverageStatus` touch a disjoint set of workflow fields), which avoids false conflicts between the two UI controls.

### Server Actions (`app/admin/competition-actions.ts`)
`updateSessionAction` / `updateResultAction` / `updateStandingAction` gained an `expectedVersion?: number` arg and now return `ActionResult<{ version: number }>` via a new `withVersion` wrapper.

### Admin UI (`views/admin/AdminCompetitionPage.tsx`)
- `Sess`/`Res`/`Stand` interfaces carry `version`.
- Each editor captures the loaded `version` on `open(...)` and submits it as `expectedVersion` on an edit save.
- The shared `act(...)` helper handles `code === 'conflict'` specially: it shows a clear **"Conflict — … reload and reapply"** toast, **refreshes the list to the latest server data, and keeps the edit form open** (the user's unsaved input is never silently discarded). A new record (`createX`) is unaffected.

### Correction lineage (A5)
`correctResult` is unchanged: it appends a new linked result and archives the original (it is not an in-place overwrite), so the immutable correction chain is preserved and not subject to the version guard.

## Tests (`tests/batch17-concurrency.test.ts`, 8 cases — all pass)
1. New records start at version 1.
2. Matching-version update succeeds and increments exactly once.
3. Stale version → `conflict`; the winner's data is intact (no overwrite); only one increment occurred.
4. Two concurrent editors with the same loaded version → exactly one succeeds, one `conflict`.
5. Update without `expectedVersion` still works (back-compat) and increments.
6. Results **and** standings enforce the same guard.
7. Correction lineage intact (original ARCHIVED, new `correctionOfId` set).
8. RBAC: a non-manager update is `forbidden`, not `conflict`.

Existing `tests/batch14.test.ts` (4 cases incl. verification/publication gates and correction) still passes — no regression.

## Result
**CONFIRMED FIXED.** Competition edits can no longer silently overwrite concurrent changes; correction chains and publication gates are preserved.
