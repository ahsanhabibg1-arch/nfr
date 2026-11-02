# Batch 14 — Verification & Publication Rules

Two orthogonal axes govern every schedule/result/standing record.

## Editorial state (`coverageStatus`)
DRAFT → IN_REVIEW → APPROVED → PUBLISHED → ARCHIVED. Transitions via `setCoverageStatus` (rodeo.manage,
audited). Publishing is blocked unless the record is VERIFIED.

## Verification state (`verification`)
UNVERIFIED → VERIFIED → CORRECTION_REQUIRED. Via `setVerification` (records `verifiedById`/`verifiedAt`;
optionally `sourceRef`/`sourceUrl`). Flagging a published record UNVERIFIED/CORRECTION_REQUIRED pulls it
back to APPROVED (so it leaves public view).

## Public eligibility (service-enforced)
A record is public **only** when: `coverageStatus=PUBLISHED` AND `verification=VERIFIED` AND a valid
edition association AND valid discipline/competitor relationships. `getPublicSchedule/Results/Standings`
filter on exactly this; cancelled sessions are also excluded from the public schedule. Admin reads show
all states; public reads never expose DRAFT/unverified data.

## Cross-entity integrity (no wrong-edition association)
- A result/standing competitor must have a `CompetitorParticipation` in the result's edition (eligibility).
- A result's `sessionId` must belong to the same edition.
- Discipline/venue references must exist. All checked in the service before write.

## Result-type correctness (no fabricated values)
- TIME requires `timeSeconds`; SCORE requires `scoreNumeric`; otherwise rejected (use NO_TIME/NO_SCORE).
- NO_TIME / NO_SCORE / DISQUALIFIED / WITHDRAWN store **no** measured value. Unknown values stay null.
- Authoritative numerics are `Decimal` (Postgres numeric) — never floating point.

## Corrections (official values preserved)
`correctResult` creates a NEW result linked via `correctionOfId` to the original and ARCHIVES the original
(never silently mutates the official value). The public results page flags corrected rows.

## Source attribution
`sourceRef` (text) + `sourceUrl` are optional on every record and surfaced publicly (as a `nofollow`
"source ↗" link) so results/standings can cite their official source. Verification never fabricates
attribution; it records who verified and when.
