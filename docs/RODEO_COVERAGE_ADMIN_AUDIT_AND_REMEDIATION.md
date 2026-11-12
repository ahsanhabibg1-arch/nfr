# Rodeo Coverage — Admin Management Audit & Safe Remediation

**Project:** NFRGuide.com · **Area:** Admin CMS → Editorial & Content → Rodeo Coverage
**Route:** `/admin/rodeo-coverage/` · **Date:** 2026-11-12

---

## 1. Executive Summary

**Status: PARTIAL / OWNER APPROVAL REQUIRED.**

All five Rodeo Coverage sections were audited by observed behaviour against the isolated
test database, not by reading source alone. The audit found the admin far more capable
than the brief assumed — four of five entities already had working Create/Edit/Delete —
but it also found **one critical data-loss defect**, two silent-cascade gaps, and one
crash that the remediation itself exposed.

**Implemented and verified (no schema change, no approval needed):**

| # | Change | Severity |
|---|---|---|
| 1 | `deleteEdition` now refuses when competition history exists | **Critical — silent data loss** |
| 2 | `deleteVenue` now refuses when a scheduled session uses the venue | High — silent data corruption |
| 3 | Discipline **Create** and **Delete** built end to end (service → action → UI) | Owner-requested capability |
| 4 | Public discipline route no longer crashes for a guide-less discipline | **Critical — route down / build fails** |
| 5 | Dependency counts surfaced to the admin UI before the operator clicks Delete | UX / safety |

**Blocked, requiring owner approval:**

| Blocker | Why | Needs |
|---|---|---|
| **Archive / Reactivate** on all five entities | No lifecycle column exists anywhere in the schema | Migration approval (package in §13) |
| Durable discipline deletion | `prisma/seed.ts` recreates a deleted foundational discipline | Seed-ownership decision |
| Slug editing | Slugs are derived-once and immutable; changing one needs a redirect policy | Policy decision |

**The task is NOT COMPLETE**, and per §17 of the brief it cannot be: Archive and
Reactivate were explicitly required for Disciplines and are not implemented, because
implementing them honestly requires a schema migration that is not approved. They are
**not** faked with a UI-only flag.

**Test results:** TypeScript clean · Vitest **2611/2611** · production build succeeds on
both databases · route harness **37/37** · cache harness **10/10** · Chromium
**125/125** · mutation testing **6/6 killed**.

---

## 2. Repository Baseline

Captured before any edit. The brief's historical checkpoint (branch
`office-sync-2026-11-08`, HEAD `fd4fb10`) is **out of date**; actual state was used as
authoritative, as the brief instructs.

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `c03e233` |
| `origin/main` | `c03e233` (in sync) |
| Prisma migrations | **19** (unchanged; none created) |
| Working tree at start | 5 modified files — uncommitted QA fixes from the prior session |
| Test database | `nfrguide_test` on localhost, isolated, verified reachable |
| Development database | `nfrguide_dev` — **not modified** |

**Pre-existing work preserved.** The five uncommitted files from the previous QA session
(`DirectoryBlocks.tsx`, two rodeo-events route files, two test files) were left intact and
are still present. Nothing was committed, pushed, reset, stashed or discarded.

**Safety action taken:** a Next.js server from the prior QA session was running on port
3000 against the **development** database, and its page-layout scheduler writes to that
database on a 60-second timer. It was stopped before the audit began, to honour §15's
prohibition on modifying the development database.

---

## 3. Current Architecture

**Models** (`prisma/schema.prisma`): `RodeoHub`, `RodeoEvent`, `RodeoEventEdition`,
`Venue`, `Discipline`, plus join tables `RodeoHubEvent`, `EventDiscipline`,
`ArticleHub`/`ArticleEvent`/`ArticleEdition`/`ArticleDiscipline`,
`CompetitorDiscipline`, `CompetitorParticipation`, and the competition tables
`CompetitionSession`, `CompetitionResult`, `CompetitionStanding`.

**Service:** `lib/cms/rodeoService.ts` — the single authority. All mutations call
`req(a)`, which enforces the `rodeo.manage` permission.

**Actions:** `app/admin/rodeo-actions.ts` — thin server actions; each re-checks
permission via `requireActor('rodeo.manage')` and revalidates `/admin/rodeo-coverage/`
plus `/` (layout).

**Admin UI:** `views/admin/AdminRodeoCoveragePage.tsx` — five tabs, modal editors.

**Public dependencies:** `/rodeo-events/`, `/rodeo-events/<slug>/`,
`/rodeo-events/<slug>/<edition>/`, `/venues/`, `/venues/<slug>/`, `/disciplines/<slug>/`,
`sitemap.xml`.

**Two architectural facts discovered during the audit:**

1. **Slugs are derived, not supplied.** `HubInput` and `EventInput` contain no slug
   field. The slug *and* the primary key are computed from the title/name
   (`hub-${slugify(title)}`). `updateHub`/`updateEvent` never write a slug, so **a
   rename changes the title but not the public URL**. This is deliberate URL stability,
   but it means title and URL can drift apart, and an operator cannot correct a slug.
2. **Hubs and events share one URL namespace** (`/rodeo-events/<slug>/`). PostgreSQL
   cannot express a cross-table unique constraint, so `assertRodeoSlugFree` enforces it
   at write time. Verified working.

---

## 4. Capability Matrix

Legend: ✅ working · ⚠️ defective · ❌ missing · 🔒 blocked on approval

| Capability | Hubs | Recurring Events | Editions | Venues | Disciplines |
|---|---|---|---|---|---|
| List | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create | ✅ | ✅ | ✅ | ✅ | ✅ **implemented** |
| View (detail) | ✅ public | ✅ public | ✅ public | ✅ public | ✅ public |
| Edit | ✅ | ✅ | ✅ | ✅ | ✅ via Landing SEO |
| Edit slug | ❌ immutable | ❌ immutable | ❌ immutable | ❌ immutable | ❌ immutable |
| Delete | ✅ | ✅ | ⚠️→✅ **fixed** | ⚠️→✅ **fixed** | ✅ **implemented** |
| Archive | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 |
| Reactivate | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 |
| Search | ❌ | ❌ | ❌ | ❌ | ❌ |
| Filter | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pagination | ❌ not needed | ❌ not needed | ❌ not needed | ❌ not needed | ❌ not needed |
| Relationship mgmt | ✅ hub↔event | ✅ | ✅ event/venue | ✅ | ⚠️ read-only counts |
| SEO management | ✅ Landing SEO | ✅ | ✅ | ✅ | ✅ |
| RBAC | ✅ verified | ✅ verified | ✅ verified | ✅ verified | ✅ verified |
| Audit logging | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dependency display | ✅ article count | ✅ counts | ✅ **added** | ✅ edition count | ✅ **added** |
| Public sync | ✅ | ✅ | ✅ | ✅ | ✅ |

**Search/filter/pagination** are absent across all five tabs. With current data volumes
(7 disciplines, single-digit hubs/events) this is not a defect, and adding it was judged
scope expansion. Listed in §14 as prioritised remaining work.

---

## 5. Identified Gaps

| ID | Finding | Classification | Status |
|---|---|---|---|
| **G-1** | `deleteEdition` checked only linked articles while five tables cascade from an edition — deleting one destroyed its sessions, results, standings and competitor participation silently | **Critical data-integrity defect** | **FIXED** |
| **G-2** | `deleteVenue` did not check `CompetitionSession.venueId` (optional FK ⇒ SET NULL), so deleting a venue silently blanked the location on historical schedule rows | Data-integrity defect | **FIXED** |
| **G-3** | Disciplines had no Create and no Delete at any layer | Missing CRUD | **FIXED** |
| **G-4** | `DisciplineGuideView` mapped `scoringBreakdown`/`rulesHighlights` unguarded; `toDiscipline` ended in `as Discipline`, suppressing the type error. A discipline with `guide = null` crashed the public route and **aborted `next build`** | **Critical** (exposed by G-3) | **FIXED** |
| **G-5** | No lifecycle column on any rodeo entity | Requires schema migration | 🔒 **BLOCKED** |
| **G-6** | `prisma/seed.ts` recreates a deleted foundational discipline | Ownership conflict | 🔒 Owner decision |
| **G-7** | Slugs immutable; renaming leaves URL on the original slug | Requires redirect policy | 🔒 Owner decision |
| **G-8** | The Disciplines tab claimed the seven are "managed in the schema/seed" — misleading, since `updateDiscipline` already existed in Landing SEO | UX defect | **FIXED** (copy corrected) |
| **G-9** | No search/filter on any tab | UX | Deferred (§14) |

### G-1 in detail — the critical finding

Five tables reference `RodeoEventEdition`, and **every one is `onDelete: Cascade`**:

```
CompetitionSession.editionId       -> Cascade   (schedules)
CompetitionResult.editionId        -> Cascade   (results)
CompetitionStanding.editionId      -> Cascade   (standings)
CompetitorParticipation.editionId  -> Cascade   (who competed)
RodeoEventEditionMedia.editionId   -> Cascade
ArticleEdition.editionId           -> Cascade   (was the ONLY one checked)
```

The sibling guard on `deleteEvent` did not help: it refuses only *while editions exist*,
so deleting the editions first destroyed the same records one level down. The defect was
reproduced end to end before being fixed (§12).

---

## 6. Dependency Matrix

Actual foreign keys and delete actions, read from `prisma/schema.prisma`.

### Incoming references, by entity

| Target | Referencing table | On delete | Guarded in service? |
|---|---|---|---|
| **RodeoHub** | `RodeoHubEvent.hubId` | Cascade | n/a (join row) |
| | `ArticleHub.hubId` | Cascade | ✅ refuses |
| | `RodeoHubMedia.hubId` | Cascade | n/a (attachment) |
| **RodeoEvent** | `RodeoEventEdition.eventId` | **Cascade** | ✅ refuses |
| | `ArticleEvent.eventId` | Cascade | ✅ refuses |
| | `RodeoHubEvent.eventId` | Cascade | n/a (join row) |
| | `RodeoEventMedia.eventId` | Cascade | n/a |
| **RodeoEventEdition** | `CompetitionSession.editionId` | **Cascade** | ✅ **added** |
| | `CompetitionResult.editionId` | **Cascade** | ✅ **added** |
| | `CompetitionStanding.editionId` | **Cascade** | ✅ **added** |
| | `CompetitorParticipation.editionId` | **Cascade** | ✅ **added** |
| | `ArticleEdition.editionId` | Cascade | ✅ refuses |
| | `RodeoEventEditionMedia.editionId` | Cascade | n/a (attachment) |
| **Venue** | `RodeoEventEdition.venueId` | **SetNull** (optional) | ✅ refuses |
| | `CompetitionSession.venueId` | **SetNull** (optional) | ✅ **added** |
| | `VenueMedia.venueId` | Cascade | n/a |
| **Discipline** | `CompetitionResult.disciplineId` | **Restrict** (required) | ✅ **added** |
| | `CompetitionSession.disciplineId` | SetNull (optional) | ✅ **added** |
| | `CompetitionStanding.disciplineId` | SetNull (optional) | ✅ **added** |
| | `ArticleDiscipline.disciplineId` | Cascade | ✅ **added** |
| | `CompetitorDiscipline.disciplineId` | Cascade | ✅ **added** |
| | `EventDiscipline.disciplineId` | Cascade | ✅ **added** |
| | `DisciplineMedia.disciplineId` | Cascade | n/a |

**Unique constraints:** `RodeoHub.slug`, `RodeoEvent.slug`, `Venue.slug`,
`Discipline.slug` (all `@unique`); `RodeoEventEdition` `@@unique([eventId, editionSlug])`.
Plus the cross-table hub/event slug rule enforced in application code.

**Deliberate non-guards.** Media attachments (`*Media`) are not counted as blocking
dependencies. They belong to the parent record, carry no independent history, and
blocking on them would make an otherwise-empty entity undeletable.

---

## 7. Implemented Changes

| File | Change |
|---|---|
| `lib/cms/rodeoService.ts` | `getEditionDependencies()` + full dependency guard in `deleteEdition`; session guard in `deleteVenue`; `createDiscipline()`, `deleteDiscipline()`, `getDisciplineDependencies()`; `listDisciplinesRef()` now returns `dependencyCount` |
| `app/admin/rodeo-actions.ts` | `createDisciplineAction`, `deleteDisciplineAction` |
| `views/admin/AdminRodeoCoveragePage.tsx` | Disciplines tab: Add button, References column, row actions with accurate block reasons, create modal with live slug preview; corrected the misleading footnote |
| `views/DisciplineGuideView.tsx` | Guarded the Judicial Standards section and both lists |
| `lib/mappers.ts` | `toDiscipline` defaults `scoringBreakdown`/`rulesHighlights` to `[]` before the guide spread |
| `tests/rodeo-admin-capability.test.ts` | **New** — 22 tests |

Pre-existing uncommitted QA work from the prior session is untouched.

---

## 8. CRUD Verification

| Entity | Create | Read | Update | Delete | Archive | Reactivate |
|---|---|---|---|---|---|---|
| Hub | Already working | Already working | Already working | Already working (guarded) | **Blocked** | **Blocked** |
| Recurring Event | Already working | Already working | Already working | Already working (guarded) | **Blocked** | **Blocked** |
| Edition | Already working | Already working | Already working | **Implemented & verified** (guard added) | **Blocked** | **Blocked** |
| Venue | Already working | Already working | Already working | **Implemented & verified** (guard added) | **Blocked** | **Blocked** |
| Discipline | **Implemented & verified** | Already working | Already working (Landing SEO) | **Implemented & verified** | **Blocked** | **Blocked** |

No capability is marked verified unless a test exercises it against the database.

---

## 9. Public Website and SEO Impact

Observed, not assumed.

- **Create (discipline):** a new discipline appears at `/disciplines/<slug>/` and renders
  header + summary, omitting sections it has no content for. **This only became true
  after fixing G-4** — before the fix the route threw and the production build aborted.
- **Edit:** content updates flow to the public page. The slug — and therefore the
  canonical URL — does not change, so no redirect is needed and no inbound link breaks.
- **Delete:** refused wherever a dependency exists, so no public page can be orphaned by
  a delete that the admin permits. `cleanupLandingRows` removes the entity's `EntitySeo`
  and FAQ rows, so no orphaned SEO metadata is left behind.
- **Cache:** every action calls `revalidatePath('/admin/rodeo-coverage/')` and
  `revalidatePath('/', 'layout')`. Blunt but correct — the layout-level revalidation
  covers all public rodeo routes. Verified green by the cache harness (10/10).
- **Sitemap:** unchanged by this work. Note the directory listings `/venues/` and
  `/competitors/` are `index, follow` and in the sitemap while currently empty — recorded
  in the prior QA session, unchanged here, still an open owner question.

---

## 10. Security and RBAC

`rodeo.manage` is held by Editor and above; Author does not hold it.

**Authorization is enforced at the service boundary, not by hiding buttons.** All 15
mutations were called directly with an actor lacking `rodeo.manage` and every one was
refused — including the two new discipline functions. Mutation M2 (removing `req(a)` from
`createDiscipline`) was detected by this test.

Validation: all inputs are zod-parsed; slugs are derived and length-bounded; the
cross-table slug rule is enforced; duplicate editions are blocked by a composite unique
constraint. Audit rows are written for every create, update and delete; mutation M6
(disabling the discipline-delete audit) was detected.

No draft or unpublished content is exposed through these paths; no public API surface was
added.

---

## 11. Local Test Results

| Gate | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | **Clean** |
| Vitest (full) | **2611 / 2611 passed**, 120 files |
| New rodeo capability suite | **22 / 22** |
| Production build (dev DB) | **Succeeds**, 59 static pages |
| Production build (test DB) | **Succeeds**, 70 static pages |
| Route harness | **37 / 37** |
| Cache harness | **10 / 10** |
| Chromium (Playwright) | **125 / 125** |
| Mutation testing | **6 / 6 killed** |

### Mutation results

| ID | Mutation | Outcome |
|---|---|---|
| M1 | Bypass the new edition dependency check | **KILLED** |
| M2 | Remove authorization from `createDiscipline` | **KILLED** |
| M3 | Bypass the discipline dependency check | **KILLED** |
| M4 | Allow a duplicate discipline slug | **KILLED** (after the test was corrected — see §12) |
| M5 | Remove the venue/session guard | **KILLED** |
| M6 | Stop auditing discipline deletion | **KILLED** (after an assertion was added — see §12) |

All mutations were reverted; the final suite was re-run clean.

---

## 12. Issues Discovered During Testing

**Recorded honestly, including my own errors.**

1. **The cache harness first failed 3/10.** Cause: `INTERNAL_REVALIDATE_SECRET` is not set
   in `.env` (it is commented out in `.env.example`), so ISR revalidation was skipped and
   the published article was unreachable on a production server. Re-running with the
   secret set gave **10/10**. This is a local environment gap, **not** a regression —
   but it means the documented "10/10" baseline is only reproducible with that variable
   set.

2. **Mutation M4 initially SURVIVED, and the reason is a genuine testing trap.** My
   assertion matched the error message with a regex. **Prisma embeds the failing call's
   source code in its error message** — including the very line containing the expected
   string — so the regex matched text quoted *inside the Prisma error*, and the test
   passed even with the service check disabled. Fixed by asserting the
   `ServiceError.code === 'conflict'` and the exact message. *Any message-substring
   assertion around a Prisma call is vulnerable to this.*

3. **Mutation M6's first kill was false.** The mutation replaced `audit(` with a
   non-existent `noAudit(`, so it died on a reference error rather than on any assertion.
   Re-run as a valid compiling mutation (`Promise.resolve`) it **survived**, revealing
   that nothing asserted the discipline-delete audit trail. An assertion was added and M6
   now genuinely fails.

4. **The test-DB build failed, and found a real defect.** Mutation runs left orphaned
   discipline rows in the test database (while authorization was mutated off, the RBAC
   test's create *succeeded*). Those rows then broke `next build` — which is how **G-4**
   was discovered: a guide-less discipline crashed `/disciplines/<slug>/`. Two outcomes:
   the product crash was fixed in the mapper, and the suite's cleanup now sweeps by tag so
   mutation runs cannot leave orphans.

5. **Three of my own test-authoring errors**, corrected: `HubInput`/`EventInput` take a
   name, not a slug; `CompetitionSession` requires `title` and `sessionType`;
   `CompetitionResultType`/`StandingCategory` enum values were guessed wrong.

No assertion was weakened to make anything pass.

---

## 13. Owner Decisions Required

### D-R1 — Archive / Reactivate (schema change)

**Decision:** approve a migration adding a lifecycle column to `RodeoHub`, `RodeoEvent`,
`RodeoEventEdition`, `Venue` and `Discipline`.

**Why it is blocked:** no lifecycle field exists on any of the five. `RodeoEvent.status`
is free text (`text`, unconstrained) used as editorial descriptive copy and filtered on by
nothing. The brief forbids faking Archive with a UI-only flag, so it is not implemented.

**Recommended option — `archivedAt DateTime?` on each of the five.**

```prisma
model Discipline {
  // …
  archivedAt DateTime?
  @@index([archivedAt])
}
```

- Nullable ⇒ no backfill, no default, no table rewrite; existing rows are active.
- Reactivate is `archivedAt = null`; identity and relationships are untouched.
- Public queries add `where: { archivedAt: null }`.

**Alternatives:** (a) a `Lifecycle` enum — more expressive, but needs a default and a
backfill; (b) reuse `RodeoEvent.status` — rejected, it is free text, exists on only one
entity, and is already used for other purposes.

**Risks:** every public query must be updated or archived records stay visible; missing
one is a silent leak. Mitigate with a test per public route.

**Still needs a separate policy answer — what an archived PUBLIC URL does.** Four options,
not interchangeable: 404, 410 Gone, redirect to parent, or 200 + `noindex`. The brief
forbids assuming. **Recommendation: 200 + `noindex` + removal from listings and sitemap**,
preserving inbound links and historical reference while stopping new indexing. This
behaviour must be decided before Archive ships.

### D-R2 — Seed ownership of foundational disciplines

`prisma/seed.ts` upserts the seven by fixed id `disc-<slug>` with `update: {}`.

- **Good news:** it is create-missing-only, so **admin edits are never overwritten** — the
  conflict the brief anticipated does not exist.
- **Open issue:** a *deleted* foundational discipline **is recreated** by the next seed
  run. Delete is therefore not durable for those seven.

**Recommendation:** leave the seed as-is and keep the warning now shown in the UI and
written into the audit log. Making deletion durable means either removing them from the
seed (losing first-run bootstrapping) or adding a tombstone table (new schema).

### D-R3 — Slug editing and redirects

Slugs are derived once and immutable, so a renamed hub keeps its original URL. A
`RedirectStatus` enum and redirect system **already exist** in the schema, so a slug-change
feature would not need inventing one — but it needs a policy: when a slug changes, is the
old URL redirected permanently, and who may do it? **Recommendation: defer**; URL
stability is currently a feature, and the cost is cosmetic drift between title and URL.

---

## 14. Remaining Work (prioritised)

1. **Decide D-R1** — Archive/Reactivate is the single largest missing capability.
2. **Set `INTERNAL_REVALIDATE_SECRET`** locally and in deployment; without it ISR
   revalidation silently does not happen.
3. **Decide the archived-URL public behaviour** before building Archive.
4. **Search/filter** on the five tabs — not yet needed at current data volumes.
5. **Discipline inline editing** in Rodeo Coverage — currently links to Landing SEO,
   which is correct for avoiding duplicate editors but costs a navigation.
6. **Empty indexable directories** (`/venues/`, `/competitors/`) — carried from the prior
   QA session; decide whether an empty directory should be in the sitemap.
7. **Relationship editing for hub↔event ordering** — `RodeoHubEvent.sortOrder` exists but
   has no UI.

---

## 15. Final Repository State

| Check | State |
|---|---|
| Commits created | **None** |
| Pushes | **None** |
| Branch switches / resets / stashes | **None** |
| Production database accessed | **No** |
| Development database modified | **No** (QA server stopped to guarantee this) |
| Migrations created or applied | **None** — still 19 |
| `prisma db push` / `migrate reset` | **Never run** |
| Foundational disciplines | All seven intact, asserted by test |
| Pre-existing uncommitted work | Preserved |
| Working tree | 10 modified + 1 new file, all listed in §7 |

Test-database writes were confined to the isolated `nfrguide_test` database. Orphan rows
created by mutation runs were cleaned up and the suite hardened against recurrence.

---

## Appendix — How to reproduce

```bash
cd apps/web

# Unit + DB suites (isolated test DB, auto-detected from TEST_DATABASE_URL in .env)
APP_ENV=test npx vitest run
APP_ENV=test npx vitest run tests/rodeo-admin-capability.test.ts

npx tsc --noEmit

# Build + harnesses against the isolated test DB
TDB=<TEST_DATABASE_URL from .env>
DATABASE_URL="$TDB" APP_ENV=test npx next build
DATABASE_URL="$TDB" APP_ENV=test INTERNAL_REVALIDATE_SECRET=local-dev npx next start -p 3100 &

SMOKE_BASE_URL=http://localhost:3100 DATABASE_URL="$TDB" APP_ENV=test \
  npx tsx scripts/route-smoke.mts
CACHE_BASE_URL=http://localhost:3100 TEST_DATABASE_URL="$TDB" DATABASE_URL="$TDB" \
  APP_ENV=test INTERNAL_REVALIDATE_SECRET=local-dev npx tsx scripts/cache-invalidation.mts

APP_ENV=test npx playwright test
```
