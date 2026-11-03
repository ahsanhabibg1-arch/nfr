# Batch 15 — Competition Admin UX

Enhances `/admin/competition/` without changing the Batch 14 domain architecture.

## Editing (D1)
Every session, result and standing row has an **edit** action that opens an inline form **prefilled from
the actual database values** and saves via the existing `updateSession/updateResult/updateStanding`
service (RBAC `rodeo.manage`, audited). Only the edited fields change; unrelated fields (e.g. sourceRef)
are preserved (verified by test). Loading/saving state + success/error toasts are shown.

## Result corrections (D2)
Each result has a **correct** action exposing the Batch 14 `correctResult` service. The correction form
prefills the original's values, **requires a correction note/reason**, then: creates a NEW result linked
via `correctionOfId`, **archives the original** (never overwrites the published official value), and leaves
the correction UNVERIFIED so it must be re-verified before it becomes public. Audited. The public results
page flags corrected rows.

## Filtering (D3)
A filter bar (discipline, competitor, editorial status, verification, standing category) drives
server-side `where` clauses on the three `list*Admin` functions via URL search params (shareable; bounded
— the server filters, the client does not load-everything). A clear "Reset filters" control is provided.

## RBAC & audit (D4)
All mutations go through the existing server actions → `requireActor('rodeo.manage')` → service `req(a)`;
every edit/correction/verification/publish/delete writes an `AuditLog` row. The public-eligibility rule is
unchanged: **PUBLISHED && VERIFIED**. Un-verifying a published record pulls it back to APPROVED (out of
public view). Concurrency: edits are last-write-wins at the row level through Prisma `update`; corrections
create a distinct linked record so a correction never races/overwrites the original.
