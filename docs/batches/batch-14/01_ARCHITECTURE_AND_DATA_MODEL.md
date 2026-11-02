# Batch 14 — Architecture & Data Model

Edition-scoped competition coverage. Generic + reusable (NOT NFR-specific). Reuses the existing entity
chain; no redesign, no destructive change.

## Reused (unchanged) existing architecture
- `RodeoEvent` → `RodeoEventEdition` (annual edition) → `Discipline`, `Competitor`,
  `CompetitorParticipation` (competitor↔edition eligibility), `Venue`, `Article`, `EntitySeo`/`EntityFaq`,
  the affiliate/monetization system, RBAC (`rodeo.manage`), audit (`guard.ts`), and the public edition
  route `/rodeo-events/[slug]/[edition]/`.

## New additive models (3) + enums (5)
| Model | Belongs to | Key fields | Notes |
|---|---|---|---|
| `CompetitionSession` (schedule) | edition (+ optional discipline, venue) | date?, title, sessionType, roundNumber?, startAt?/endAt?/timezone?, sortOrder, `status` | unknown times stay null; DST handled via IANA tz at render |
| `CompetitionResult` | edition + discipline + competitor (+ optional session) | `resultType`, `scoreNumeric` Decimal(10,3)?, `timeSeconds` Decimal(10,3)?, placement?, isTie, `correctionOfId` (self-ref) | **Decimal, never float**; TIME/SCORE require a value, NO_*/DQ/WD stay empty |
| `CompetitionStanding` | edition + competitor (+ optional discipline) | `category` (ROUND/AGGREGATE/CHAMPIONSHIP/SEASON), rankPosition?, aggregateValue/earnings/points Decimal?, lastUpdatedAt | categories never mixed; editorially-managed snapshots |

Every record carries `coverageStatus` (`CoverageStatus`: DRAFT/IN_REVIEW/APPROVED/PUBLISHED/ARCHIVED) +
`verification` (`CoverageVerification`: UNVERIFIED/VERIFIED/CORRECTION_REQUIRED) + `sourceRef`/`sourceUrl`
+ `verifiedById`/`verifiedAt` + `createdById`.
Enums: `CoverageStatus`, `CoverageVerification`, `CompetitionSessionStatus`, `CompetitionResultType`,
`StandingCategory`.

## Relationship cardinality & integrity
- All three FK to `RodeoEventEdition` (cascade). `discipline`/`venue` optional FK; `competitor` cascade.
- `verifiedById`/`createdById` are plain `String?` ids (no User FK) — same pattern as `EntitySeo`
  (avoids widening the User model).
- **Cross-edition safety (service-enforced):** a result/standing's competitor must have a
  `CompetitorParticipation` in that edition (eligibility); a result's `sessionId` must belong to the same
  edition. Prevents associating a competitor/session from the wrong edition.
- Indexes: `(editionId, sortOrder)`, `(editionId, disciplineId)` on sessions; `(editionId, disciplineId)`,
  `(competitorId)`, `(sessionId)` on results; `(editionId, category, disciplineId)`, `(competitorId)` on
  standings.

## Publishing & verification states
Two orthogonal axes (editorial state vs source verification). **Public visibility requires
`coverageStatus=PUBLISHED` AND `verification=VERIFIED`** (plus a valid edition/relationships). Publishing
an unverified record is blocked server-side; un-verifying a published record pulls it back to APPROVED.

## Standings calculation strategy
**Editorially-managed, source-verified snapshots** only (no automatic official-ranking computation — NFR
payout/tie-break rules are not invented). The data model supports a future calculation engine without
replacement (the snapshot fields remain valid inputs/outputs).

## Admin & public routes
- Admin: `/admin/competition/` (edition picker → Schedule/Results/Standings managers). Reuses the existing
  admin design system + `guard`/`audit`/RBAC.
- Public: `/rodeo-events/[slug]/[edition]/{schedule,results,standings}/` + coverage nav on the edition
  landing page. Trailing-slash + canonical preserved.

## Migration strategy
Additive migration `20261102120000_batch14_competition_coverage` (3 CreateTable + 5 CreateEnum + indexes +
FKs). No DROP, no column change; `Article.searchVector`/GIN/FTS untouched. Applied to local **dev + test**
only — **NOT Aiven** (deferred).
