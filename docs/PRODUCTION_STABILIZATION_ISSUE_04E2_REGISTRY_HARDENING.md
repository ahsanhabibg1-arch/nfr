# Issue 04-E.2 — Transactional Bootstrap & Evergreen Registry Integrity

**Status: LOCAL IMPLEMENTATION COMPLETE AND VERIFIED. Awaiting owner review.**
**Nothing committed, pushed, deployed, or written to production. No migration created.**

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`
**Databases touched:** `localhost:5433/nfrguide_dev` and `localhost:5433/nfrguide_test` only.
**Predecessors:** [04-E](PRODUCTION_STABILIZATION_ISSUE_04E_ARTICLE_TYPE_CMS.md) ·
[04-E.1](PRODUCTION_STABILIZATION_ISSUE_04E1_GOVERNANCE_REFINEMENT.md)

---

## 1. Root causes

### R-8 — the bootstrap was not atomic

`bootstrapArticleTypes` performed `await store.articleType.create(...)` **inside
the planning loop**, one definition at a time, with no transaction
(`grep -c '$transaction'` → **0**). A failure on the Nth definition therefore
left N−1 rows committed.

The result is worse than a failed run: the table is non-empty, so
`getArticleTypeSnapshot` reports `source: 'database'` and the registry presents
itself as initialised while missing definitions. Nothing warns, because nothing
is wrong from the snapshot's point of view.

### R-9 — the evergreen list read managed flags only

`getEvergreenArticleTypeValues` was `evergreenValuesIn(snapshot)`, i.e. the
managed rows and nothing else. A registry missing `guide` produced an evergreen
`IN` list without `guide`, and the six published `guide` articles silently left
the evergreen surface — Batch 04-A's original failure returning through a
different door.

### The two are one problem

R-8 is how an incomplete registry comes to exist; R-9 is what an incomplete
registry does. 04-E.1 had already defended the *structured-data* path against
this state. The evergreen path was still exposed.

---

## 2. The distinction R-9 depends on — and how it was settled

§3 required establishing whether "this definition is missing because seeding did
not finish" can be told apart from "an administrator deleted it", and to **stop**
if it cannot.

**The audit log cannot settle it.** Three findings, each verified:

1. `scripts/bootstrap-article-types.ts` calls `bootstrapArticleTypes` directly,
   not `runArticleTypeBootstrap`, so **the CLI bootstrap writes no audit entry
   at all**. The absence of an `articleType.bootstrap` row therefore does not
   mean no bootstrap ran.
2. A deletion performed in raw SQL writes no audit entry either.
3. `AuditLog` has no retention policy today, but the project does prune other
   data on retention (`analyticsService.analytics.retention.prune`), so audit
   rows are not a durable guarantee.

**But the project already has the right mechanism.** `SeedTombstone`
(migration `20261112010000_add_seed_tombstone`) exists precisely to record that
*a seeded foundational record was deliberately deleted, so a later seeding run
does not recreate it*, and `deleteDiscipline` already writes one **in the same
transaction as the delete** so a crash cannot leave a deletion without its
record of intent.

Article Type definitions are seeded the same way and need the same protection,
so this batch reuses that mechanism for its exact stated purpose —
`kind: 'articleType'`, `key: <the stored value>`. **No new schema, no new
marker, no migration**, which is what §4 asked for.

### The finding that makes the distinction load-bearing

A tempting shortcut was available: *a deleted definition can have no articles,
because `deleteArticleType` refuses while any article stores the value — so
filling it back in would be harmless.* **That reasoning is wrong**, and the audit
of every write path to `Article.articleType` shows why:

| Write path | Gated? |
|---|---|
| `saveArticle` → `persistArticle` | yes — `assertArticleTypeAssignable` |
| **`restoreRevision` → `persistArticle`** | **no** — a historical value is restored unconditionally, by design |
| `prisma/seed.ts` | direct Prisma |

So an article **can** acquire a deleted type after the deletion: move an article
off the type, delete the now-unused definition, restore an older revision. A
blind compatibility fill would then put that article back onto a public surface
against the administrator's decision. **This is asserted as a test**, not left as
an argument.

---

## 3. Changes implemented

### Task A — atomic bootstrap

- Planning (read + plan) stays outside the transaction; it is read-only, and
  holding a write lock across it buys nothing.
- **Every insert now runs inside one `$transaction`**, with a 20 s ceiling for a
  slow remote database.
- `$transaction` is part of the store contract. Applying **without** it is
  **refused** — `'Refusing to bootstrap article types without transaction
  support: a partial registry is worse than none.'` A silent non-atomic fallback
  is the defect being removed, so it is not offered. A dry run still works,
  because it writes nothing.
- **Concurrency:** two simultaneous runs are resolved by the unique constraint on
  `value` — the loser's insert fails, its whole transaction rolls back, and it
  reports the error rather than writing part of the registry. **No retry loop**:
  a retry would race identically, and this is an operator-triggered step, not a
  request path. Re-running afterwards is always safe because the function only
  ever inserts.

### Task B — evergreen integrity, tombstone-gated

- `deleteArticleType` now writes a `SeedTombstone` **in the same transaction** as
  the delete.
- The bootstrap **no longer recreates a deliberately deleted definition**; it
  reports it as `tombstoned`. This also closes a latent 04-E defect: re-running
  the bootstrap used to silently undo an administrator's deletion, which §2.3
  forbids.
- `verifyArticleTypeRegistry` treats a tombstoned value as **resolved, not
  missing**, so the rollout gate does not demand that a decision be reversed.
- `getEvergreenArticleTypeValues` fills genuine gaps and only genuine gaps
  (precedence in §4 below).
- `evergreenValuesIn` in the isomorphic shape module is **unchanged** — it still
  returns managed flags only. The gap-filling needs server-side knowledge
  (tombstones), so it lives in the registry, not in a function a client
  component can call.

### Task C — completeness diagnostics, derived not recorded

`getArticleTypeRegistryHealth()` returns `{ source, initialised, managedCount,
missing, unmanaged, complete }`, computed by comparing the managed values with
the compiled-in definitions.

**No initialisation marker was added, and none is needed.** A recorded "bootstrap
completed" flag is a second source of truth that can disagree with the registry:
set once and then rows deleted, it reads "complete" over an incomplete table.
The derived comparison cannot disagree, because it *is* the table.

The admin screen now distinguishes three states: **not initialised** (amber panel
with "Initialise registry"), **incomplete** (amber panel naming each missing
definition, with "Restore missing definitions"), and complete (no panel).

---

## 4. Evergreen precedence rules

In order; the first match wins.

| # | Condition | Result |
|---|---|---|
| 1 | The managed registry holds the definition | **Its `evergreen` flag, absolutely.** `true` includes, `false` excludes, and nothing below can override either. |
| 2 | Absent, **not** tombstoned, and in the compiled-in matrix | Filled in — treated as a gap in seeding. |
| 3 | Absent and **tombstoned** | Excluded, whatever the compiled-in matrix says. The administrator removed it. |
| 4 | Not one of the 23 compatibility values | Never evergreen. Only those 23 can be filled at all. |
| 5 | Registry not initialised (`source: 'fallback'`) | The whole compiled-in matrix, as before. |
| — | The tombstone read itself fails | **Fail towards NOT filling**, and report it. Over-including could reverse an administrator's decision; under-including only reproduces what 04-E shipped. The quieter mistake wins. |

**Cost:** the tombstone query runs *only* when the registry is incomplete, and the
resolved list is memoised alongside the snapshot it came from. A complete
registry — the normal state — and a fallback registry both cost nothing extra.
No per-row queries anywhere.

---

## 5. Partial-registry recovery behaviour

| Situation | Before 04-E.2 | After |
|---|---|---|
| Bootstrap interrupted | N−1 rows committed; registry looks initialised | **impossible** — nothing commits |
| Registry incomplete | invisible | amber panel naming each missing definition + one-click repair |
| Repair run | recreated everything, including deleted definitions | creates only genuine gaps; reports tombstoned ones |
| Administrator's label / flags during repair | preserved | preserved (tested explicitly) |
| Evergreen while incomplete | eligible articles silently dropped | preserved for gaps, honoured for deletions |
| Classification while incomplete | fixed in 04-E.1 | unchanged |

---

## 6. Transaction and rollback evidence

Counting rows after a *successful* run proves nothing about atomicity, so the
claim is tested by making a write fail **against the real database inside a real
interactive transaction**:

```
(3) R-8: a mid-bootstrap failure rolls back EVERY newly inserted definition
    → injected failure on the 5th of 23 inserts
    → calls === 5, ArticleType.count() === 0, values === []
(3) …and the registry therefore never reports a half-initialised state
    → injected failure on the 18th insert
    → health.initialised === false, source === 'fallback'
    → News still resolves NewsArticle; evergreen still contains `guide`
```

**Mutation-tested.** Replacing `await store.$transaction(` with a direct call
(patch confirmed applied, 12,682 → 12,687 bytes) **failed 2 tests**; restored and
verified. Replacing the evergreen fill `values = [...managed, ...filled]` with
`values = managed` (12,594 → 12,578 bytes) **failed 2 tests**; restored and
verified. Neither fix passes vacuously.

---

## 7. Test counts and failures

**Focused — `tests/issue04e2-registry-hardening.test.ts`: 23 passed / 23.**

| § | Requirement | Covered |
|---|---|---|
| 1 | bootstrap creates all 23 | ✓ |
| 2 | repeated bootstrap creates zero duplicates | ✓ |
| 3 | mid-bootstrap failure rolls back | ✓ twice, at insert 5 and insert 18 |
| 4 | managed labels and flags unchanged | ✓ through a repair run |
| 5 | an existing partial registry completes safely | ✓ 3 gaps repaired, 20 left alone |
| 6 | `News` and `news` stay distinct | ✓ through bootstrap, repair and tombstoning |
| 7 | managed `evergreen: true` respected | ✓ end to end via `getEvergreenArticles` |
| 8 | managed `evergreen: false` respected, never overridden | ✓ using `guide`, the strongest case |
| 9 | missing definitions handled per policy | ✓ gap filled, deletion honoured, **same absence → opposite outcomes** |
| 10 | unknown types never evergreen | ✓ and the list can only contain the 23 |
| 11 | visibility, ordering and limits unchanged | ✓ |
| 12 | 04-E.1 NewsArticle classification correct | ✓ including through a partial registry |
| 13 | RBAC and CRUD correct | ✓ 04-E.1 gates re-checked |
| 14 | Issue 03 / 04-A/B/C/D unaffected | ✓ by the full suite below |

Also tested: a **failed** delete leaves no tombstone; applying without
transaction support is refused; health distinguishes not-initialised / partial /
complete; and the `restoreRevision` case that makes the distinction necessary.

**Full regression: 136 files, 3,169 passed, 0 skipped.** No failures.

| Run | Files | Passed |
|---|---|---|
| 04-E | 134 | 3,112 (+3 skipped) |
| 04-E.1 | 135 | 3,146 |
| **04-E.2** | **136** | **3,169** |

+1 file and +23 tests, accounting for the total exactly.

---

## 8. TypeScript and build

- `npx tsc --noEmit` — **clean**.
- `npm run build` — **succeeded**; `.next/BUILD_ID` = `cgNUyAsVmYiUfbb64PNAg`.
- `git diff --check` — clean (only the repository's pre-existing CRLF notices).
- Encoding scan, all 54 changed/untracked source files — **no BOM, no mojibake**.

---

## 9. Database preservation evidence

| | `nfrguide_dev` | `nfrguide_test` |
|---|---|---|
| `Article` rows | **11** (unchanged) | **17** (unchanged) |
| Stored types | `guide` 6 · `analysis` 3 · `feature` 2 — **unchanged** | unchanged |
| `ArticleType` rows | **23**, `--verify` → **complete: YES** | 0 — the suite restores the state it found |
| `articleType` tombstones | **0** | 0 after cleanup |
| Migrations run | **none** | **none** |

No schema change was made, so there was nothing to migrate. No `UPDATE` was
issued against `Article`. Every destructive step in the test suite targets rows
the suite itself created, and restores the registry and tombstones in
`beforeEach`/`afterAll`.

---

## 10. Files changed

**New (1)**

| File | Purpose |
|---|---|
| `tests/issue04e2-registry-hardening.test.ts` | 23 behavioural tests, incl. two real-database rollback cases |

**Modified (7)**

| File | Change |
|---|---|
| `lib/cms/articleTypeBootstrap.ts` | planning/writing split; all inserts in one `$transaction`; refuses to apply without one; reads and honours tombstones; `tombstoned` outcome + report field; `ARTICLE_TYPE_TOMBSTONE_KIND`; `verifyArticleTypeRegistry` treats tombstoned as resolved |
| `lib/cms/articleTypeService.ts` | `deleteArticleType` writes the tombstone in the delete's transaction; bootstrap result forwards `tombstoned` |
| `lib/cms/articleTypeRegistry.ts` | tombstone-gated evergreen resolution + memoisation; `getArticleTypeRegistryHealth()` |
| `lib/content/articleTypeShape.ts` | `compatibilityValues()`, `compatibilityEvergreenValues()`; `evergreenValuesIn` documented as managed-only |
| `app/admin/article-type-actions.ts` | bootstrap action result carries `tombstoned` |
| `app/admin/(dashboard)/editorial-organization/page.tsx` | passes registry health instead of the bare snapshot source |
| `views/admin/AdminEditorialOrgPage.tsx` | incomplete-registry panel naming each missing definition, with repair |
| `scripts/bootstrap-article-types.ts` | prints tombstoned definitions |

**No migration. No Prisma schema change. No `Article` row touched. No legacy
taxonomy mapping touched.**

---

## 11. Remaining risks and decisions

| # | Item | Assessment |
|---|---|---|
| **R-8** | **CLOSED** | Atomic, with database-backed rollback evidence and a mutation test. |
| **R-9** | **CLOSED** | Gaps filled, deletions honoured, managed flags never overridden. |
| **D-1** | **Owner decision: the bootstrap no longer recreates a deleted definition.** | This is a behaviour change to 04-E, and the right one — recreating it reversed an administrator's decision. It is reversible by not writing the tombstone in `deleteArticleType`. **Please ratify.** |
| **D-2** | **Owner decision: `SeedTombstone` now carries `kind: 'articleType'`.** | An existing, owner-approved table used for its stated purpose, so no schema change was needed. It does mean Article Type deletions are recorded permanently. **Please ratify.** |
| R-2 | No DB-level case-folded uniqueness on `ArticleType.value` | Carried forward from 04-E §3.1, unchanged. |
| R-3 | Legacy values not assignable to new articles | Carried forward, intended. |
| R-5 | `Article.articleType` has no foreign key | Carried forward. |
| **R-11** | **`restoreRevision` can restore a deleted or non-assignable type** | Discovered during this audit and documented above. It is *correct* for restore to be unconditional — a revision must restore what it recorded — but it means an article can hold a value no definition covers. Classification and evergreen both fail safe for that case, so nothing is broken. **No change recommended**; recorded so it is not rediscovered as a surprise. |
| R-12 | A raw-SQL deletion still looks like a gap | It writes no tombstone, so it is filled back in. Treated as a gap deliberately: an unrecorded disappearance is indistinguishable from never-created, and preserving historical behaviour is the safer reading. |
| R-10 | BKP-01 | Still a mandatory blocker for the production schema migration (04-B and 04-E). Unchanged. |

---

## 12. Git status

```
branch : main
HEAD   : aafdad296363e4b69d3b01594540116f9b58f39d   (unchanged)
stashes: 0
tree   : 30 modified + 25 untracked
```

(04-E.1 handed over 30 + 23. The two added paths are
`tests/issue04e2-registry-hardening.test.ts` and this report; the seven modified
files were already modified, so that count does not move.)

No commit, push, branch, stash, reset or rebase. All pre-existing uncommitted
work from Issue 03 and Batches 04-A/B/C/D/E/E.1 is intact.

---

## 13. Confirmation of zero production changes

| | |
|---|---|
| Production database | **UNTOUCHED** — never connected to |
| Production R2 / environment variables / Render | **UNTOUCHED** |
| Production migration | **NOT RUN** — and none was created |
| Prisma schema | **UNCHANGED** |
| Backfill / data rewrite | **NONE** |
| Legacy taxonomy mappings | **UNTOUCHED** |
| Git | **UNTOUCHED** |
| Production UAT | **NOT INITIATED** |
| Local databases | `nfrguide_dev` and `nfrguide_test` only, both verified `localhost` first |

**Stopping here.** No Subcategory mapping, no BKP-01, no deployment, no
production migration, no Git commit or push.
