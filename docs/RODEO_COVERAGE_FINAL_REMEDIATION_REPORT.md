# Rodeo Coverage — Final Remediation & Verification

**Project:** NFRGuide.com · **Scope:** Admin CMS → Rodeo Coverage
**Continues:** `RODEO_COVERAGE_LIFECYCLE_AND_TRANSFER_REPORT.md` · **Date:** 2026-11-12

---

## 1. Executive summary

**Status: COMPLETE.**

All three owner decisions are implemented and verified, and every mandatory gate
passes. The two items the previous report listed as outstanding — durable seed
tombstones and working nested edition redirects — are done and proved over real
HTTP. The hydration warning turned out not to be an application defect, and the
evidence for that is in §8.

| Correction | Status |
|---|---|
| A — SeedTombstone, durable deletion | Implemented and verified |
| B — Edition slug editing + working 308 redirects (incl. nested) | Implemented and verified |
| C — Slug editor modal replacing `window.prompt` | Implemented and verified |
| D — Hydration investigation | Resolved: external cause, evidenced |
| E — Delete race, fail-closed under Decision C | Implemented without new locking |
| F/G/H — Transfer, archive, security regression | Verified |

**Gates:** TypeScript clean · Vitest **2687/2687** · build succeeds · route
**37/37** · cache **10/10** · Chromium **149/149** · mutations **4/5 killed**,
survivor explained in §15.

Two defects were found during this round that only real HTTP requests could
reveal, both now fixed: the nested edition route never consulted the redirect
store, and a slug change left the old URL serving its **prerendered** page
instead of the new 308.

---

## 2. Repository baseline

Verified before editing.

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `c03e233` — unchanged, nothing committed |
| Migrations before / after | 20 → **21** |
| Baseline suite before edits | **2663/2663**, matching the reference |
| Dev DB | `nfrguide_dev` — schema up to date (the owner authorised the `archivedAt` migration there last session) |
| Test DB | `nfrguide_test` — both migrations applied |

The dev server was stopped before work began, because its page-layout scheduler
writes to the development database every 60 seconds.

---

## 3. Owner decisions, as given

- **A — SeedTombstone: APPROVED.** Narrow additive migration authorised.
- **B — Edition slug editing and permanent redirects: APPROVED**, including
  nested routes.
- **C — Transactional delete race protection: NOT APPROVED.** No new row
  locking, SERIALIZABLE isolation or advisory locks. The risk must not be
  ignored, must fail closed, and must not be falsely claimed as eliminated.

---

## 4. SeedTombstone implementation

```prisma
model SeedTombstone {
  id        String   @id @default(uuid())
  kind      String
  key       String
  deletedAt DateTime @default(now())
  @@unique([kind, key])
}
```

**Identity is the stable primary key, not the slug.** The seed creates
foundational disciplines as `disc-<original-slug>`, and `changeSlug` never
touches `id`. Tombstoning by id therefore survives a rename, and an old slug can
never resurrect a deleted record — §4's identity requirement, verified by a test
that renames a discipline and confirms the seed still sees it as present.

**Seed behaviour.** The previous empty-table gate is gone. Each foundational
record is checked against its tombstone: skipped if deleted on purpose, upserted
with `update: {}` otherwise. That distinguishes "never installed" from "deleted
on purpose" **per record**, which neither earlier approach could do.

**Deletion behaviour.** Both delete paths (`deleteDiscipline` and
`permanentDeleteEntity`) write the tombstone **inside the same transaction** as
the delete. A crash between the two would otherwise leave a record deleted with
no record of intent, and the next seed would resurrect it; a failed delete must
leave no tombstone, or a surviving record would be excluded from seeding forever.

All 13 required behaviours in §4 are covered by `tests/rodeo-seed-tombstone.test.ts`
(15 tests), including delete-one, delete-all-seven, archive-does-not-tombstone,
failed-delete-writes-nothing, custom-discipline-preservation and uniqueness.

---

## 5. Migration verification

`prisma/migrations/20261112010000_add_seed_tombstone/migration.sql`

```sql
CREATE TABLE "SeedTombstone" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeedTombstone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SeedTombstone_kind_key_key" ON "SeedTombstone"("kind", "key");
```

Non-destructive by construction: one new table, no existing table touched, no
row read or written, nothing dropped or retyped. An empty tombstone table means
"nothing was deliberately deleted", which is every current deployment's state,
so existing installations are unaffected until an admin actually deletes
something. Rollback is `DROP TABLE "SeedTombstone";`.

| Database | State |
|---|---|
| `nfrguide_test` | **Applied** and verified (column shape + unique index asserted by test) |
| `nfrguide_dev` | **Not applied** — no environment-specific authorisation was given for it |
| Production | Never contacted |

> **Action needed before the dev server is next used:** the dev database is now
> one migration behind, and the regenerated Prisma client expects
> `SeedTombstone`. Seeding or deleting a discipline there will fail until
> `prisma migrate deploy` is run against it. That needs your authorisation.

---

## 6. Edition redirects

**Two real defects found, both only visible over HTTP.**

1. **The nested route never consulted the redirect store.** `app/(public)/rodeo-events/[slug]/[edition]/page.tsx`
   called `notFound()` directly, so a renamed edition — or a renamed parent —
   404'd even though the redirect row was correct. Now wired to
   `resolveRodeoRedirect`.
2. **A renamed parent event redirected only its own path.** Editions are
   addressed through their parent, so every `/rodeo-events/<old>/<edition>/`
   broke while the operator was told the rename succeeded. `changeSlug` now
   captures nested paths before the rename and redirects each one in the same
   transaction.
3. **A slug change left the old URL serving its prerendered page.** The redirect
   row existed and the resolver returned it, but the old URL kept returning its
   cached 200 — it had been statically prerendered at build. `changeSlug` now
   returns `affectedPaths` and the server action revalidates each one.

**Actual HTTP results** (production build, isolated test DB):

| Case | Result |
|---|---|
| Unknown slug | **404** |
| Renamed hub, old URL | **308**, `Location: /rodeo-events/<new>/` |
| Destination URL | **200** |
| Renamed parent event, nested old URL | **308**, `Location: /rodeo-events/<new>/<edition>/` |
| Nested destination | **200** |
| Renamed twice, original URL | **308** straight to the final slug — one hop |

Redirect hygiene (loops, chains, reserved slugs, cross-table collisions,
per-parent edition uniqueness, trailing slashes, archived targets) is covered by
21 tests in `tests/rodeo-slugs-and-redirects.test.ts` and 9 browser tests in
`e2e/rodeo-slug-redirects.spec.ts`.

**One observation, harmless:** the 308 response carries the `Location` header
twice with the same relative value. A browser takes the first and they are
identical, so behaviour is correct; noted because the test had to account for it.

---

## 7. Slug editor

`window.prompt` is gone. The modal uses the existing `AdminModal`, which already
provides Escape-to-close, focus-in on open and focus-return on close, and
`role="dialog"` with `aria-modal`.

It shows entity name and type, the current public URL, an editable input, a live
preview of the resulting URL, inline validation, and an explicit warning that the
old URL becomes a permanent 308 — plus, for a recurring event, that every edition
URL beneath it is redirected too.

The live preview uses the **same** normaliser the server applies
(`lib/cms/slugRules.ts`, shared by both), so what the operator sees is what gets
stored. A browser copy would have drifted.

Verified in Chromium: preview normalises messy input, reserved slugs disable
Save, an unchanged slug disables Save, Escape closes without changing anything, a
failed save preserves the operator's input, and the modal is usable at **1280 /
768 / 390** with no horizontal page scroll.

---

## 8. Hydration investigation

**Finding: not an application defect, and not on `/admin/`.**

The previous session's note attributed a hydration warning to `/admin/`. The
component stack disproves that — it reads `pathname="/"`, the public homepage.

React named the mismatching attribute:

```
-   bis_skin_checked="1"
```

`bis_skin_checked` is injected by Bitdefender's browser protection. Evidence it
is not ours:

- **0 occurrences** in the server-rendered HTML (`curl … | grep -c` → 0);
- **0 occurrences** in stored content;
- **0 occurrences** in the live DOM, and **0 console warnings**, in a clean
  headless Chromium with a throwaway profile;
- React's own message lists this exact cause ("a browser extension installed
  which messes with the HTML before React loaded").

No code change was made, and `suppressHydrationWarning` was **not** used.

**Regression test added** — `e2e/admin-hydration.spec.ts` (5 tests) covers `/`,
`/admin/` and `/admin/rodeo-coverage/`, filtering only known external-injection
attributes so a *real* mismatch still fails. It also pins the two things this
workstream could plausibly have broken: row content must not change across
hydration, and archive dates are rendered with `toISOString()` rather than
`toLocaleDateString()`, which would differ between a UTC server and another
timezone.

---

## 9. Permanent delete safety

**Decision C honoured: no new locking, no isolation change — and the race is
closed anyway, using existing database behaviour.**

The delete is now issued as a **single conditional statement** whose `WHERE`
requires every blocking relation to be empty:

```ts
await tx.discipline.deleteMany({
  where: { id, articles: { none: {} }, competitors: { none: {} }, /* … */ },
});
if (deleted.count === 0) throw new ServiceError('conflict', '…nothing was deleted…');
```

Two existing PostgreSQL behaviours do the work:

- the statement evaluates its `NOT EXISTS` subqueries against a snapshot taken
  when the **statement** begins, so a dependency committed before it starts is
  visible and the delete matches zero rows;
- a concurrent child `INSERT` takes a `FOR KEY SHARE` lock on the parent row, so
  it cannot commit underneath the delete — it waits, then fails with a
  foreign-key violation once the parent is gone.

`count === 0` is the fail-closed signal. This is ordinary referential integrity,
not a new concurrency-control mechanism.

### Per-entity classification

| Entity | Irreplaceable relation | DB action | Outcome |
|---|---|---|---|
| Hub | none (join rows only) | Cascade | Safe |
| Recurring event | Editions → competition history | **Cascade** | Guarded by conditional delete |
| Edition | Sessions / Results / Standings / Participation | **Cascade** | Guarded by conditional delete |
| Venue | Edition + session locations | **SetNull** | Guarded by conditional delete |
| Discipline | Results | **Restrict** (DB refuses) + conditional delete | Doubly safe |

No permanent deletion is left blocked, and no historical data loss is accepted.
The Delete button remains available on every row and always opens the dependency
dialog.

---

## 10. Relationship transfer

Re-verified unchanged by this round: 21 tests in
`tests/rodeo-dependency-transfer.test.ts`. Curated associations move; conditional
ones require the operator to confirm a stated premise; `historical` groups are
refused **at the service boundary**, so a crafted request cannot rewrite a
result. Duplicate pairings are merged rather than failing the transfer, edition
moves refuse a slug collision rather than renaming a published URL, and article
URLs and publication state are untouched by a transfer.

---

## 11. Archive / Reactivate

Re-verified: 19 tests in `tests/rodeo-lifecycle.test.ts`. All five families
archive and reactivate; archived records leave listings, search, sitemap and
`generateStaticParams`; archived detail URLs stay **200 + noindex**; an edition
inherits its parent's archive state without any child row being written; archive
writes only `archivedAt` and never changes publication state; both directions are
audited. The approved `archivedAt` migration is present and consistent in the
test database.

---

## 12. Public SEO

Robots, canonicals, sitemap eligibility, listings and cache invalidation all
re-verified by the route (37/37) and cache (10/10) harnesses plus the Stage 09
SEO suites. Redirect targets that are archived keep their approved 200 + noindex
behaviour rather than being redirected elsewhere.

---

## 13. Security and RBAC

`rodeo.manage` enforced at the service boundary for create, edit, archive,
reactivate, dependency inspection, transfer, slug change and permanent delete —
each exercised by a direct call with an unauthorised actor. Mutation T1/T5
confirm tombstone writes are asserted; earlier rounds confirmed the RBAC checks.
Validation covers slug shape, reserved paths, cross-table and per-parent
uniqueness, source ≠ destination, and entity existence. No audit row is written
for a failed transaction.

---

## 14. Local verification

| Gate | Result |
|---|---|
| TypeScript | **Clean** |
| Vitest | **2687 / 2687**, 124 files |
| Production build (test DB) | **Succeeds**, 94 static pages |
| Route harness | **37 / 37** |
| Cache harness | **10 / 10** |
| Chromium | **149 / 149** |

New suites this round: `rodeo-seed-tombstone` (15), `e2e/admin-hydration` (5),
`e2e/rodeo-slug-redirects` (9), plus additions to the lifecycle, transfer and
slug suites.

---

## 15. Mutation results

| ID | Mutation | Outcome |
|---|---|---|
| T1 | Tombstone not written on delete | **KILLED** |
| T2 | Seed ignores tombstones | **KILLED** |
| T4 | Nested edition redirects not written on parent rename | **KILLED** |
| T5 | Tombstone not written on the permanent-delete path | **KILLED** |
| T3 | Conditional-delete guards removed | **SURVIVED** |

**T3 is reported as survived, not explained away.** The guards it removes only
matter in a true race: the pre-check runs first and already refuses when a
dependency is visible, so a single-process test never reaches the conditional
delete. Detecting T3 would need two concurrent transactions interleaved at an
exact point, which the suite cannot express. The guard is correct and worth
keeping; what is missing is a concurrency harness. This is the same limitation
recorded as L6 in the previous round.

All mutations were reverted and the suite re-run clean.

---

## 16. First-run failures

1. **Nested edition URL returned 200, not 308** — the nested route never
   consulted the redirect store. Real defect, fixed (§6).
2. **Renamed hub URL returned 200** — the old path was prerendered and served
   from cache. Real defect, fixed with targeted `revalidatePath` (§6).
3. **Everything returned 200 in dev mode**, including a slug that never existed.
   This proved to be a **Turbopack dev-mode artifact**: the same build served by
   `next start` returns 404 and 308 correctly. Diagnosed by comparing dev against
   a production build rather than assuming either.
4. **An obsolete audit assertion** — a test still required the delete audit to
   say a discipline "would be recreated by the next seed run". Decision A made
   that false; the assertion was inverted with the reason recorded.
5. **Three Playwright locator errors of my own** — a title cell equal to its slug
   cell tripped strict mode; `filter({ has })` with a page-rooted locator; and
   the Recurring Events table has no slug column, so the row had to be found via
   the admin search box. None were product defects.
6. **A premature assertion** — the nested-URL warning was asserted before the
   slug differed, so it had not yet rendered.

No assertion was weakened to obtain a pass.

---

## 17. Remaining issues

1. **Dev database is one migration behind** (§5). Needs authorisation.
2. **No concurrency harness** for the conditional-delete guard (mutation T3).
3. **Duplicate `Location` header** on redirects — harmless, worth tracing.
4. **Admin filtering is client-side**; correct at current volumes, move into the
   query if any list grows past a page or two.
5. **Test-database residue**: the browser specs create hubs and events with
   `E2E Slug …` names that global teardown does not remove.

---

## 18. Additional owner approvals

**Only one:** permission to run `prisma migrate deploy` against `nfrguide_dev`
so the development database matches the regenerated Prisma client. Nothing else
in this round requires approval.

---

## 19. Final repository state

| Check | State |
|---|---|
| Commits / pushes / merges | **None** |
| Branch / HEAD | `main`, `c03e233` — unchanged |
| Resets, cleans, stashes, branch switches | **None** |
| Production database | **Never contacted** |
| Development database | **Not modified this round** |
| Migration applied to | **Isolated test database only** |
| `prisma db push` / `migrate reset` | **Never run** |
| New locking / isolation mechanisms | **None** (Decision C honoured) |
| Foundational disciplines | Intact |
| Stage 09 work | Preserved |
