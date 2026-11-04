# Finalization §4 — Competition Concurrency Verification

## Bypass found
Batch 17 made `expectedVersion` **optional** on `updateSession`/`updateResult`/`updateStanding`. When omitted, the service fell back to `where: { id }` — an unconditional (last-write-wins) update. An admin Server Action caller that omitted it would bypass concurrency protection.

## Call-graph review
- Server Actions `updateSessionAction` / `updateResultAction` / `updateStandingAction` are the only external callers.
- UI `views/admin/AdminCompetitionPage.tsx` always passes the loaded `ver` on an edit save (captured in each sub-editor's `open()`).
- Test callers: `batch17-concurrency.test.ts` (passes versions) and `batch15.test.ts:90` (did **not** — fixed).
→ Making it required is compatible with every real caller.

## Change
`lib/cms/competitionService.ts`:
- New `requireVersion(expectedVersion)` guard — rejects non-number / non-integer / `< 1` with `ServiceError('validation', …)`.
- All three update functions now take `expectedVersion: number` (required), call `requireVersion`, and use `where: { id, version: ev }` (no unconditional fallback).
- `req(a)` (RBAC) still runs first, so an unauthorized caller gets `forbidden` regardless of version.
- Create actions, `correctResult` (append+archive lineage), and `setVerification`/`setCoverageStatus` (independent workflow transitions) are unchanged.
- Conflict responses remain typed (`conflict`) → `toActionError` → user-friendly message; the admin UI keeps unsaved input and reloads the latest data on conflict.

`app/admin/competition-actions.ts`: the three update actions declare `expectedVersion: number`.

## Tests (`tests/batch17-concurrency.test.ts`, 8 cases — all pass)
1. New record starts at version 1.
2. Matching version → succeeds, increments exactly once.
3. Stale version → `conflict`, no overwrite, single increment.
4. **Missing / NaN / 0 / negative / non-integer → `validation`; record untouched (no bypass).**
5. Two concurrent editors (same loaded version) → exactly one wins, one `conflict`.
6. Results **and** standings enforce the guard.
7. Correction lineage intact (original ARCHIVED, `correctionOfId` set).
8. Unauthorized editor → `forbidden` (not conflict/validation).

Publication/verification gates and correction behavior remain covered by `batch14.test.ts` (green in the full run).

## Result
**Bypass eliminated.** Every existing-record content update now requires a valid version and is atomically version-guarded; RBAC, audit logging, correction chains, and publication gates preserved.
