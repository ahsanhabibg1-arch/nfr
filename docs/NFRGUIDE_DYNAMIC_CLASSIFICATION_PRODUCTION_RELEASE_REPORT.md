# NFRGuide.com — Dynamic Discipline Classification & Production Release

## FINAL STATUS: `PUSHED — RENDER VERIFICATION PENDING`

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `93975cc395dabeff39d9b738df47283140f4e30b`
**Pushed to** `origin/main` (`aafdad2..93975cc`), confirmed received · 0 ahead / 0 behind

| | |
|---|---|
| Feature implemented locally | **Yes — complete** |
| Local migration applied (dev + test) | **Yes** |
| **Production migrations applied** | **YES — all 3, verified (§12)** |
| **Production bootstraps applied** | **YES — Article Types + Classifications, verified** |
| Legacy Subcategory backfill | **NOT run — correctly withheld, still unapproved** |
| **Aiven backup-system restore verified** | **NO — the owner waived this gate** |
| Own pre-migration backup, proven restorable | **YES (§10)** |
| **Production site after migration** | **HEALTHY — 39/39 sitemap URLs HTTP 200** |
| Git commit / push | **DONE — `93975cc`, 95 files, +19,319 / −198 (§14)** |
| Render deployment | **UNVERIFIED — no Render API access here (§15)** |
| Paid resources provisioned | **NONE** |

### What changed from the earlier version of this report

This report first concluded `BLOCKED — BACKUP OR DATABASE SAFETY`, because §9 of
the brief makes a verified Aiven backup restore mandatory before any production
write, and that requires control-plane access and a paid fork that this session
cannot create.

**The owner then instructed that the production migrations be applied.** That
waives their own §9 gate; it is their decision and it is recorded here plainly.

The gate was not simply skipped. What *could* be done instead was done first: a
`pg_dump` of production was taken and then **proven restorable** by restoring it
into a disposable local database and checking its integrity (§10). That is not a
verification of Aiven's backup system — it is an independent artifact, taken
minutes before the migration, that is known to restore.

Priorities 7-8 of the brief — the Git push and the Render deployment — were
**not** performed. The instruction was for the migrations, and a push is a
separate, deploy-triggering action.

---

## 1. Architecture implemented

Classifications were a fixed pair written into the code in six places. They are
now administrator-managed records, built on the same pattern as Batch 04-E's
Article Types.

| Decision | Why |
|---|---|
| **New model `DisciplineClassification`** | A real table, so classifications can be created, renamed, reordered, deactivated and deleted |
| **Immutable `value`** — set once, never editable | It is the machine identity. The bootstrap and the legacy-text fallback both match on it, so letting it change would reintroduce the orphaning defect in a subtler form |
| **Mutable `name`** carries change | A rename updates one row; every discipline follows it |
| **`Discipline.classificationId` → FK on `id`** | **The fix.** The old column stored the *display label*, making the name the relationship key — a rename orphaned every discipline still holding the old string |
| **`ON DELETE RESTRICT`** | Deletion of a referenced classification is refused by PostgreSQL, not only by the service |
| **`Discipline.category` preserved, never rewritten** | It is what existing rows hold, what the full-text `searchVector` indexes, and the fallback when the managed table is absent. Keeping it is what makes the change reversible by dropping one column |
| **Both columns written on an edit** | `classificationId` is the truth; `category` mirrors the classification's `value`, so the fallback cannot disagree with the authority |
| **No relation to `Category`** | Editorial Category organises *articles*; classification classifies *disciplines*. A test asserts `Discipline` carries no `Category` reference |

### Why `pluralName` exists

The public filter button reads as a group ("Timed **Events**") while the value
names one discipline's classification ("Timed Event"). It is a nullable column
that falls back to `name`, so an administrator who does not care never sets it —
and the previous reader-facing wording is preserved exactly.

---

## 2. Prisma schema changes

```prisma
model Discipline {
  category          String?                   // LEGACY — preserved, never rewritten
  classificationId  String?                   // Batch 05 — the managed reference
  classification    DisciplineClassification? @relation(
    "DisciplineClassificationAssignment",
    fields: [classificationId], references: [id],
    onDelete: Restrict, onUpdate: Restrict)
  @@index([classificationId])
}

model DisciplineClassification {
  id          String   @id @default(uuid())
  value       String   @unique   // IMMUTABLE machine identity
  name        String             // mutable display name
  slug        String   @unique
  pluralName  String?            // public filter wording; falls back to name
  description String?
  sortOrder   Int      @default(0)
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @default(now()) @updatedAt
  disciplines Discipline[] @relation("DisciplineClassificationAssignment")
  @@index([sortOrder])
  @@index([active])
}
```

`prisma validate` → valid. `prisma migrate diff` → **"No difference detected."**

---

## 3. Migration file

**`prisma/migrations/20261113200000_add_managed_discipline_classification/migration.sql`**

Ordered after the two already-pending migrations. **No existing migration file
was edited.**

| Statement | Effect |
|---|---|
| `ALTER TABLE "Discipline" ADD COLUMN "classificationId" TEXT` | **Nullable, no default** → catalog-only in PostgreSQL 11+; no table rewrite, no backfill scan |
| `CREATE TABLE "DisciplineClassification"` | new table |
| 4 indexes + `Discipline_classificationId_idx` | |
| `ADD CONSTRAINT … ON DELETE RESTRICT ON UPDATE RESTRICT` | validates against `Discipline` — 7 rows in production |

**No `DROP`, `DELETE`, `TRUNCATE` or `UPDATE`.** Seeding is deliberately *not* in
the migration: applying schema and changing data stay two reviewable steps.

**Rollback** (documented in the file, needs no code rollback because the
application falls back to the legacy text):

```sql
ALTER TABLE "Discipline" DROP CONSTRAINT "Discipline_classificationId_fkey";
DROP INDEX "Discipline_classificationId_idx";
ALTER TABLE "Discipline" DROP COLUMN "classificationId";
DROP TABLE "DisciplineClassification";
```

---

## 4. Data preservation

### Bootstrap / backfill — `lib/cms/disciplineClassificationBootstrap.ts`

Idempotent **by construction**, not by a "has run" marker: classifications are
matched on the immutable `value`, and a discipline is linked only while its
`classificationId` is still `NULL`, so a later administrator reassignment is
never undone.

Verified on the local development database:

```
DRY RUN  created: Roughstock, Timed Event   attached: 7   already: 0   unmatched: none
RUN 1    created: Roughstock, Timed Event   attached: 7   already: 0   → Applied
RUN 2    created: none (all present)        attached: 0   already: 7   → Applied
VERIFY   complete: YES
```

- **`Discipline.category` is never written** — asserted by a test that snapshots
  every row's legacy text before the bootstrap and compares after.
- **A rename does not orphan anything** — asserted directly: a discipline is
  linked, the classification is renamed, and the discipline still resolves,
  now reading the new name, with `value` unchanged.

> **A defect found and fixed in my own code.** The dry run originally looked up
> only classifications that already existed, so before the first apply it
> reported all 7 disciplines as `UNMATCHED` — predicting the opposite of what
> applying did. The values a run *would* create are now treated as present
> during a dry run, and a test pins it.

---

## 5. Classification management UI

**Admin → Rodeo Coverage → Classifications** (`/admin/rodeo-coverage/`), a new
tab in the existing page, using the existing design system.

| # | Requirement | Implementation |
|---|---|---|
| 1 | List classifications | Table: Identity · Name · Public filter label · Order · State · Disciplines |
| 2 | Add | `+ Add Classification` → modal |
| 3 | Edit name + description | Edit → modal. **Identity is not a field**, and the modal says why |
| 4 | Change display order | ↑ / ↓ send the whole order, so the server never infers neighbours from a stale view |
| 5 | Activate / deactivate | Per row; inactive rows hidden behind "Show inactive" |
| 6 | Assigned-discipline count | `Disciplines` column, from `_count` |
| 7 | Delete an unused one | Offered **only** when the count is 0 |
| 8 | Prevent deleting a referenced one | Button hidden, service re-counts and refuses, **and** `ON DELETE RESTRICT` refuses again |
| 9 | Prevent duplicates | Identity, name and slug — including case variants |
| 10 | Meaningful errors | Service `ServiceError` sentences surface through `toActionError` |

The tab also states, in the admin itself, that these are **not** the five
editorial sections — the confusion that started this work.

**When the migration has not been applied**, the tab says so and names the
migration, instead of showing an empty editor. When the table exists but is
empty, it offers "Initialise from the existing values".

### RBAC

`rodeo.manage` — the permission that already governs disciplines, enforced in
the **service**, not the UI. A reader-level actor is refused on every write *and*
on the list read; asserted by test.

---

## 6. Selectors updated

| Surface | Behaviour |
|---|---|
| **Rodeo Coverage → Add Discipline** | Label **"Classification (optional)"** (was the misleading "Category (optional)"). Offers active classifications from the database; sends `classificationId` |
| **Landing SEO → Discipline content** | Label "Classification". Offers active classifications **plus the one this discipline already holds**, even if deactivated |
| Both | Fall back to the compatibility pair when the managed table is absent, rather than rendering an empty dropdown |

Two bugs this design avoids, both asserted by tests:

1. **Silently clearing an assignment.** If a discipline's classification was
   later deactivated, a list of active-only options would render the select with
   nothing chosen, and the next save would clear a real assignment.
2. **"Clear" meaning two different things.** For the legacy column an absent
   field means *clear*; for the reference it means *leave unchanged*. Landing
   SEO therefore sends `classificationId: null` explicitly when the editor
   chooses "—".

An unknown classification id is a **validation error**, not a silently dropped
field.

---

## 7. Public Competition page

Entirely dynamic. Filter buttons are derived from the disciplines rendered:

- **Stable keys** — grouped by `classification.id`, never by the display name, so
  a rename renames the button and breaks no grouping.
- **Only classifications with eligible disciplines appear** — the set is built
  from the rendered disciplines, which `getAllDisciplines()` has already filtered
  to active ones, so an archived discipline cannot put a button on the page.
- **An inactive classification still shows while disciplines reference it** —
  the point of deactivating rather than deleting: it stops *new* assignment
  without hiding published content.
- **Counts are counted.** They previously read `All 7 Events`, `Roughstock (3)`
  and `Timed Events (4)` literally — true only for exactly the seven seeded
  disciplines.
- **Layout, styling and canonical URLs unchanged.** No public route reads a
  classification; it appears in no canonical, no JSON-LD field and no sitemap
  entry.

`getAllDisciplines()` includes the relation inside a `try` and retries without it
if the table is absent, so the homepage still renders on an environment where
the migration has not been applied.

---

## 8. Automated test results

| Gate | Result |
|---|---|
| Full Vitest suite | **141 files · 3,281 passed · 0 skipped** (baseline 140 / 3,256) |
| New: `tests/discipline-classification-managed.test.ts` | **25 tests** |
| `tsc --noEmit` | **clean** |
| Production build | **succeeded** — `BUILD_ID = jxYp-zsqIbTNqSsk70pi6` |
| `prisma validate` | valid |
| Schema drift | **"No difference detected."** |
| `git diff --check` | clean |
| Encoding scan (new files) | no BOM, no mojibake |
| Secret scan (90 changed text files) | **no credentials, keys or connection strings** |

Coverage maps to §8 of the brief: CRUD, immutable identity, **rename without
orphaning**, inactive behaviour, deletion protection (service *and* database),
duplicate prevention, RBAC, invalid references, Add Discipline, Edit Discipline,
Landing SEO, public filters, dynamic counts, editorial-category independence,
existing-discipline preservation, and bootstrap idempotency.

### A test from the previous task was inverted, not deleted

`tests/discipline-classification.test.ts` asserted *"is NOT
administrator-managed: no model, table or CRUD service exists"* — the previous
architecture, which the owner has now approved reversing. It was rewritten to
pin the **new** architecture and the two properties that make it safe (immutable
identity, FK with `RESTRICT`), so the reversal is visible in the history instead
of a guarantee quietly disappearing. **No assertion was weakened.**

---

## 9. Browser E2E and mobile verification

**New spec: `e2e/discipline-classifications.spec.ts`** — the Classifications tab,
the immutable identity never offered as a field, no Delete on a referenced
classification, the renamed Add Discipline label, the Landing SEO selector,
no page overflow at 390px on the admin tab, no page overflow at 320px and 390px
on the public homepage, and an arithmetic check that the per-classification
counts sum to the "All N" count.

### Two failures this work caused, diagnosed and fixed

**1. A leaked test fixture broke two unrelated layout tests.** The first version
of the managed test suite awaited each cleanup delete in a bare loop; one threw,
the rest of the teardown was skipped, and two disciplines and three
classifications were left in the shared test database. The Competition filter
renders one button per classification with eligible disciplines, so the extra
rows widened the row and broke `navbar` (320px, 102px overflow) and the hero
(390px, 32px overflow) — **two specs failing for a reason neither contained**.
Teardown is now failure-tolerant per step, removes audit rows before the rows
they reference, and **throws if it leaves any residue**. Re-run: 25/25 pass and
the test database is back to 7 disciplines / 2 classifications.

**2. A pre-existing fixture drift, surfaced by re-running.** `public.spec.ts`
asserts HTTP 200 for `/rodeo-events/calgary-stampede/2026/`;
`rodeo-slug-redirects.spec.ts` renames that real seeded event to
`<slug>-renamed-<4 chars>` and nothing restored it. The suffixes had accumulated
across runs — the event had reached
`calgary-stampede-renamed-akrp-renamed-eeod-renamed-uutj-renamed-78jr` — so the
canonical URL now 308-redirects and the suite's cleanliness depended on nobody
having run it before. `e2e/global-setup.ts` now strips that exact suffix shape
before each run, making the suite genuinely re-runnable. **This defect predates
Batch 05**; it is reported because an earlier "149/149 passing" claim of mine
was true only by ordering luck.

### A third cause, and the one that mattered most: the limiter was exhausted

`admin.spec.ts` and `account-menu.spec.ts` each register a reader through the
real public sign-up flow. Registration is rate limited per IP at 5 per window,
and the limiter is **durable** — it lives in `RateLimitHit`, and nothing reset
it between runs. Every browser run spent two of the five, so after a handful of
runs the counter for `register:::1` stood at **13 with the window still open**.
Sign-up then failed **closed and silently**, which is correct product behaviour
(it must not reveal whether an account exists) — so both specs timed out waiting
for a redirect, with no error on the page and nothing in the server log.

I initially attributed these to machine contention. **That was wrong, and
measurement disproved it**: run in isolation with `--repeat-each=2`, both failed
2 of 2. `global-setup.ts` now clears the limiter rows in the isolated test
database at the start of each run, which the limiter's own unit tests do not
depend on — they inject their own storage. Re-run in isolation: **36/36**.

### One more trap worth recording

A run after the label fix still failed, because Playwright's `webServer` is
`next start` — it serves the **last build**, not the working tree. An
application change needs `npm run build` before the browser suite can see it.

### Final browser result

| | |
|---|---|
| **Full Playwright suite** | **159 passed · 0 failed (9.0 min)** |
| Baseline | 149 — the 10 new tests are this batch's spec |
| Mobile viewports exercised | 320px and 390px on the public homepage; 390px on the Classifications tab; the existing navbar sweep (320/375/768/1024/1280/1440) and the Rodeo Coverage desktop/tablet/phone renders |

**No test was weakened.** Every change above either made a spec
order-independent, made teardown prove it left no residue, reset ephemeral
infrastructure state, or replaced a wrong premise with the real invariant
(Delete appears exactly when the discipline count is zero).

---

## 10. Production backup — BKP-01

### Status: Aiven backup system **still unverified**; an independent pre-migration backup **was taken and proven restorable**

### 10a. The backup that was taken, and the proof it restores

Taken immediately before the migration. `pg_dump` is read-only on production;
the restore target was a disposable local database.

```
artifact : prod-pre-migration.dump
size     : 248,781 bytes          created : 2026-11-13 23:27:50 (local)
sha256   : f5d8a651ec5729a270fd9f9fbcc31fcc...
readable without restoring : 507 TOC entries, 85 TABLE DATA sections
restored into a disposable local database, then verified:
  tables=85   foreign_keys=86   migrations=21   unfinished=0
  articles=12 published=11      categories=5    disciplines=7
  tags=42     authors=6         users=2
  orphan_category_refs=0        orphan_author_refs=0
  sample record intact: calgary-stampede-to-las-vegas-the-qualifying-pipeline (title 84 chars)
  discipline categories present: Roughstock, Timed Event
verify database dropped afterwards; artifact retained
```

> **The artifact holds real production data.** Its path is given to the owner
> separately. It lives in this session's scratch directory, which is temporary —
> it should be moved somewhere deliberate or deleted on purpose, not left to be
> cleaned up by accident.

### 10b. What remains unverified, and why

| Check | Result |
|---|---|
| Service identity | `defaultdb`, **PostgreSQL 18.6**, `pg_is_in_recovery = false` |
| WAL archiving | `archive_mode = on`, `wal_level = logical` |
| Archiver | **156 archived, 0 failed**, last archived 2026-11-13 16:02 UTC |
| **Aiven backup catalogue / retention / PITR window** | **Not visible from SQL** — Aiven exposes none of it over a PostgreSQL connection |
| Aiven API token / `avn` CLI / CLI config | **absent / not installed / absent** |

**WAL archiving being healthy is a necessary signal, not a verification.** It
shows the mechanism runs; it says nothing about whether Aiven's backup restores
or how far back recovery reaches. Closing BKP-01 properly still needs Aiven
console or API access plus cost approval for one point-in-time fork.

### 10c. Pre-execution gates that were checked

| Gate | Result |
|---|---|
| Restorable backup in hand | **yes (§10a)** |
| Production identity confirmed | `defaultdb` on the Aiven host |
| Migration checksums | `prisma migrate status` listed exactly the 3 expected, no "modified after applied" warning |
| Destructive statements | **none** in any of the 3 — only a nullable `ADD COLUMN`, `CREATE TABLE/TYPE/INDEX` and `ADD CONSTRAINT` |
| Concurrent migration or blocking DDL | `unfinished_before=0`, `blocking_ddl_locks=0`, 1 other backend (the running app) |
| **Recovery point recorded** | **`2026-11-13 17:29:15.109609 UTC`, WAL LSN `9/7A002BE0`** |

A **read-only** inspection of the production service was performed. The session
was set `default_transaction_read_only = on`, and only `SELECT` statements were
issued. No credential appears in this report.

| Check | Result |
|---|---|
| Service identity | `defaultdb`, **PostgreSQL 18.6**, `pg_is_in_recovery = false` |
| Migrations applied | **21**, 0 unfinished |
| WAL archiving | `archive_mode = on`, `wal_level = logical` |
| Archiver | **156 archived, 0 failed**, last archived 2026-11-13 16:02 UTC |
| Backup catalogue / retention / PITR window | **Not visible from SQL** — Aiven exposes none of it over a PostgreSQL connection |
| Aiven API token in environment | **absent** |
| Aiven CLI (`avn`) installed | **no** |
| Aiven CLI configuration | **absent** |

**WAL archiving being healthy is a necessary signal, not a verification.** It
shows the mechanism is running; it says nothing about whether a backup restores,
how far back recovery reaches, or whether the restored copy is intact.

### What is required to close BKP-01

| Need | Why |
|---|---|
| Aiven console or API access to the production service | Backup listing, retention and the PITR window are control-plane data, unreachable from a PostgreSQL connection |
| **Cost approval for one point-in-time fork** | A fork is a **paid** service while it runs. The database is small (85 tables, 12 articles), so the smallest plan suffices and it is expected to live under two hours. §9 requires stopping for this approval rather than creating it |

**Acceptance criteria:** the fork reports *running*; §11's integrity fingerprint
reproduces on it; the three-migration chain applies cleanly with output
recorded; the application is exercised against it; the fork is then deleted and
its credential rotated.

> A local restore rehearsal was performed in earlier work and is **not** counted
> here. §9 is explicit that it is insufficient, and this report does not
> represent it as a production backup verification.

---

## 11. Production baseline and migration rehearsal

### Read-only production baseline (established fresh, not quoted)

| | |
|---|---|
| Migrations applied | 21 · unfinished 0 |
| `20261113071524_add_managed_subcategory` | **not applied** |
| `20261113090000_add_managed_article_type` | **not applied** |
| `20261113200000_add_managed_discipline_classification` | **not applied** |
| `Subcategory` / `ArticleType` / `DisciplineClassification` tables | **absent (0 / 0 / 0)** |
| `Article.subcategoryId` / `Discipline.classificationId` | **absent (0 / 0)** |
| Articles | **12** — 11 PUBLISHED, 1 DRAFT |
| Categories · Disciplines | 5 · 7 |
| Discipline classification text | **Roughstock 3, Timed Event 4** — exactly the compatibility pair, so the bootstrap will attach all 7 and report no unmatched value |
| Tags · Authors · Users | 42 · 6 · 2 |
| Orphan article→category / →author | **0 / 0** |
| Tables · Foreign keys | 85 · 86 |

> **The brief was right to forbid assuming.** Earlier reports recorded **11**
> articles; production now holds **12** (a draft was added). This baseline
> replaces the earlier figure.

### Migration-chain rehearsal

Run on a disposable local database rolled back to production's exact migration
state, then advanced through the whole chain:

```
before: migrations=21  articles=10  disciplines=7  categories=5  tags=42
  → prisma migrate deploy
     Applying 20261113071524_add_managed_subcategory
     Applying 20261113090000_add_managed_article_type
     Applying 20261113200000_add_managed_discipline_classification
     "All migrations have been successfully applied."
after : migrations=24  unfinished=0  articles=10  disciplines=7  categories=5  tags=42
        Subcategory=1  ArticleType=1  DisciplineClassification=1
        article_subcategoryId_nulls=10        ← no data rewrite
        discipline_classificationId_nulls=7   ← no data rewrite
        classifications_seeded=0              ← bootstrap is a separate step

bootstrap: DRY(created 2, attached 7) → RUN1(created 2, attached 7)
           → RUN2(created 0, attached 0, already 7) → VERIFY complete: YES

after bootstrap: classifications=2  disciplines_linked=7
                 legacy_category_still_set=7      ← legacy text intact
                 link_matches_legacy=7            ← mirror consistent
                 orphan_classification_refs=0

rollback rehearsal: articles=10  disciplines=7  legacy_category_set=7
cleanup: rehearsal_db_remaining=0   source_untouched_articles=10
```

**Application compatibility against the migrated schema** is covered by the
Vitest and Playwright suites, which run against a database holding all three
migrations.

### Verification limitation, stated plainly

The rehearsal target was a **local clone shaped to production's migration
state**, not a restore of an Aiven backup — §9's prerequisite is unmet, so the
restore target §10 of the brief asks for could not be created. The clone matched
production's migration count, and production's discipline classification text
matches the compatibility pair exactly, so the bootstrap's behaviour there is
predictable. It is still a rehearsal on a *shaped* clone, not on production's
own data.

### A compatibility blocker that still stands, independently

Deploying the current working tree **before** the migrations are applied breaks
the public site. Measured against a clone at production's migration state:

```
getPublishedArticles        P2022: The column `Article.subcategoryId` does not exist
getPublishedArticleBySlug   P2022   (every article page)
getPublishedArticlesByCategory P2022 (every category archive)
getHeroArticle / getLatestArticles / getEvergreenArticles  P2022  (homepage)
listArticleRelationshipOptions P2021: The table `public.Subcategory` does not exist
getAdminArticleList         P2022
```

This is **Batch 04-B's** column, not Batch 05's: Batch 05's own reads are guarded
and fall back. It corrects an earlier claim of mine that every surface falls
back — the Article Type registry does; the Subcategory column does not. **The
migrations must precede the deploy**, which is one more reason the push is
withheld.

---

## 12. Actual production migration results

### `prisma migrate deploy` against `defaultdb` — exit 0

```
Applying migration 20261113071524_add_managed_subcategory
Applying migration 20261113090000_add_managed_article_type
Applying migration 20261113200000_add_managed_discipline_classification
All migrations have been successfully applied.
```

| Check | Before | After |
|---|---|---|
| Migrations applied | 21 | **24** · unfinished **0** |
| `Subcategory` / `ArticleType` / `DisciplineClassification` tables | 0 / 0 / 0 | **1 / 1 / 1** |
| `ArticleSchemaType` enum | absent | **present** |
| `Article.subcategoryId` / `Discipline.classificationId` | absent | **present** |
| Tables · Foreign keys | 85 · 86 | **88 · 89** (+3 · +3) |

**No data was rewritten.** Immediately after the migration and before any
bootstrap: `article_subcategoryId_nulls=12` (every row),
`discipline_classificationId_nulls=7` (every row),
`legacy_discipline_category_set=7` (untouched), and the three new tables held
**0** rows.

### Bootstraps (dry run first, then applied, then verified)

| Step | Dry run | Applied | Re-run (idempotency) | Verify |
|---|---|---|---|---|
| Article Types | 23 would create, 0 conflicts | **23 created, 0 conflicts** | — | **`complete: YES`** |
| Discipline Classifications | 2 would create, 7 would attach, 0 unmatched | **2 created, 7 attached** | **0 created, 0 attached, 7 already** | **`complete: YES`** |

The `--execute` guard (`BOOTSTRAP_ALLOW_REMOTE=I_HAVE_A_VERIFIED_BACKUP`) was set
only because §10a's backup had actually been proven restorable first.

**The legacy Subcategory mapping/backfill was NOT run** — `Subcategory` holds 0
rows. It remains an unapproved editorial decision.

## 13. Production data integrity after the migration

| | Before | After |
|---|---|---|
| Articles | 12 | **12** |
| Published | 11 | **11** |
| Categories | 5 | **5** |
| Disciplines | 7 | **7** |
| Tags · Authors | 42 · 6 | **42 · 6** |
| Orphan article→category / →author | 0 / 0 | **0 / 0** |

New state created by the bootstraps:

| | |
|---|---|
| Article Types | **23** (18 selectable, 10 evergreen, 3 `NewsArticle`) |
| Discipline Classifications | **2** |
| Disciplines linked to a classification | **7 of 7** |
| Link agrees with the legacy text | **7 of 7** |
| Legacy `Discipline.category` still set | **7 of 7** — never written |
| Orphan classification references | **0** |

### One pre-existing data observation, deliberately left alone

`unrepresentable_types=1`: one **DRAFT** article stores an **empty string** for
`articleType` rather than `NULL`, so it matches no registry row. All 11 published
articles are representable (`guide` 6, `analysis` 3, `feature` 2).

This predates the migration — nothing in this work writes `Article.articleType`,
and rewriting stored type values is explicitly forbidden. The practical effect is
limited to that one draft: its Article Type select will open with nothing chosen
until an editor picks a value. **Reported, not altered.**

## 14. Git commit and push status

### Pushed — `aafdad2..93975cc`

| | |
|---|---|
| Commit | **`93975cc395dabeff39d9b738df47283140f4e30b`** |
| Message | `feat: dynamic discipline classifications and production CMS stabilization` |
| Contents | **95 files · +19,319 / −198** |
| Pushed to | `origin/main` at `github.com/ahsanhabibg1-arch/nfr.git` |
| Push type | **normal** — never `--force`, no rebase, no reset, no stash |
| Remote confirmed | re-fetched: `origin/main` == local `93975cc`, **0 ahead / 0 behind** |
| Working tree after | **clean — 0 uncommitted entries** |

The push was authorised by the owner after §12-§13 verified that production's
schema now matches the code.

### Safety checks performed before staging

| Check | Result |
|---|---|
| `.env` tracked by git | **no** — ignored by `apps/web/.gitignore:7`, and **0 commits in all of history** touch it |
| Live credential in the staged diff | **none** — scanned the staged content, not just the file list |
| Keys / tokens / private keys added | **none** |
| Forbidden file kinds (`.env`, dumps, logs, traces, `test-results/`, `playwright-report/`, `node_modules`, `.next/`) | **none staged** |
| Staging method | an **explicit list** of the 46 modified + 49 untracked paths; never `git add .` or `-A` |
| Nothing missed | after staging: 95 staged, **0 unstaged, 0 untracked** |
| `git diff --cached --check` | **clean** (two trailing-whitespace hits in docs were fixed first) |

> **One exposure worth knowing about, pre-existing.** Several committed docs name
> the production database (`defaultdb`) and its user (`avnadmin`) — identifiers,
> not credentials, and no host or password appears in any committed file. Files
> already in the repository carried these before this commit; this commit adds
> more of the same. If the repository is public, that is a small information leak
> worth cleaning up deliberately rather than urgently.

### Preflight that was completed earlier

| Check | Result |
|---|---|
| Branch / remote / upstream | `main` · `origin` → `github.com/ahsanhabibg1-arch/nfr.git` · `origin/main` |
| Remote divergence | **none** (0 / 0) |
| Stashes | 0 |
| Working tree | 43 modified + 47 untracked, **0 staged** |
| Secret scan | clean (§8) |
| Forbidden file kinds (`.env`, dumps, logs, traces, reports) | **none present** |
| Render build command | `npm ci && npx prisma generate && npm run build` — **no migration, no seed** |
| Render start command | `npm run start` → `next start` — **no database mutation** |
| `postinstall` / predeploy / release hook | **none** |
| CI workflow on push | `prisma migrate deploy` + `db seed` run **only** against the ephemeral CI container, with an explicit guard refusing any target that is not `localhost/*_ci`, and no secrets |

> **One discrepancy the owner should resolve.** `render.yaml` declares
> `autoDeploy: false` and names the service `nfrguide-staging` on the **free**
> plan, while the brief states that pushing to `main` deploys to production
> automatically. A Blueprint file does not override a dashboard setting, and the
> dashboard is not visible from here. The brief's statement was treated as
> authoritative — a push was handled as a production release action — but the two
> should be reconciled before the first intentional deploy.

## 15. Render deployment status — **UNVERIFIED**

**A successful push is not a successful deployment, and this report does not
treat it as one.** No Render API token or CLI exists in this session, so whether
Render picked up `93975cc` cannot be confirmed from here.

Two things make that genuinely uncertain rather than merely unobserved:

1. **`render.yaml` declares `autoDeploy: false`.** If the dashboard matches the
   Blueprint, **nothing will deploy** until the owner triggers it manually. The
   owner's brief says `main` auto-deploys, so the dashboard probably differs —
   but a Blueprint file does not override a dashboard setting and the dashboard
   is not visible here.
2. The service is on Render's **free** plan and spins down when idle, so a
   deployment can take a minute to become observable.

### Baseline for detecting the deployment

Captured immediately after the push, before any deploy could land:

| Signal | Value at push time |
|---|---|
| Homepage `ETag` | `W/"lcjqbkqyhm3t0b"` |
| `x-nextjs-cache` / `x-nextjs-prerender` | `HIT` / `1` |
| `/api/health/` | `{"status":"ok","time":"2026-11-13T17:46:30Z"}` — carries no commit id |

A changed homepage `ETag` is the cheapest evidence that a new build is serving.

> **The public Competition filter is NOT a usable deploy signal.** It currently
> reads `All 7 Events`, `Roughstock (3)`, `Timed Events (4)` — which the new
> dynamic code would also produce, because production genuinely has 7
> disciplines split 3/4. Identical output either way.

**Until a deployment lands, the running application is the old code** (`aafdad2`),
which is the safe direction: its Prisma client selects explicit column lists and
knows nothing of the three new tables, so the added columns and tables are inert
to it — verified empirically in §16, where all 39 sitemap URLs returned 200 after
the migration.

### What the owner needs to supply to close this

The Render build log and service log for the deploy of `93975cc`, checked for: a
successful build, service startup, no Prisma schema errors, no `P2022`, and no
unexpected database writes. Then the §16 smoke list again, plus an authenticated
pass over Rodeo Coverage → **Classifications**, Add/Edit Discipline, Landing SEO,
Editorial Organization and the Article Editor.

## 16. Production smoke test results — after the migration

Run against the live site. Requests were paced 1.2 s apart after a first attempt
showed that firing them back to back gets throttled.

| Check | Result |
|---|---|
| **Every URL in the live sitemap** | **39 / 39 HTTP 200** |
| Homepage | **200**, renders navigation, masthead and 6 article links |
| Five canonical sections (`/competition/`, `/entertainment/`, `/events-shopping/`, `/plan-watch/`, `/rodeo-events/`) | **200** |
| Category archive (`/categories/nfr-competition/`) | **200** |
| Discipline guide (`/disciplines/bull-riding/`) | **200** |
| All 11 published article pages | **200** |
| `/sitemap.xml` · `/robots.txt` · `/api/health/` | **200** · **200** · **200** |
| `/search/` · `/about/` · `/admin/login/` | **200** |
| `X-Robots-Tag` on the production host | **absent** — correct; the official domain is indexable |
| Article JSON-LD | `Article`, `BreadcrumbList`, `ListItem`, `Organization`, `Person` — **unchanged** |
| Sitemap entry count | **39** |

### Two first-pass results that were NOT defects

- **Homepage `520` on the very first request.** Cloudflare's "unknown error",
  caused by a cold start — the service is on Render's free plan and spins down
  after 15 minutes idle. Three immediate retries returned **200** in 0.34-0.73 s.
- **Ten article pages returning `000`.** `000` is curl reporting *no HTTP
  response at all*, from my own rapid sequential requests being throttled — not
  a site error. Paced, all 39 sitemap URLs return 200.

A third first-pass result *was* my mistake: `/plan-and-watch/` → 404 and
`/more-rodeo/` → 308 were **wrong URLs I guessed**. The real paths, read from
`config/routes.ts` and the live sitemap, are `/plan-watch/` and `/rodeo-events/`,
and both return **200**.

---

## 17. Files changed

### New

| File | Purpose |
|---|---|
| `prisma/migrations/20261113200000_add_managed_discipline_classification/migration.sql` | the additive migration |
| `lib/cms/disciplineClassificationService.ts` | CRUD, reads, RBAC, guards |
| `lib/cms/disciplineClassificationBootstrap.ts` | idempotent bootstrap + registry verification |
| `app/admin/discipline-classification-actions.ts` | server actions, per-change revalidation |
| `scripts/bootstrap-discipline-classifications.ts` | CLI: dry-run default, `--execute`, `--verify`, remote guard |
| `tests/discipline-classification-managed.test.ts` | 25 behavioural tests |
| `e2e/discipline-classifications.spec.ts` | browser + mobile verification |

### Modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | new model, `classificationId` + relation + index |
| `lib/content/disciplineClassifications.ts` | reframed as the compatibility fallback and bootstrap seed source |
| `lib/cms/rodeoService.ts` | accepts `classificationId`, resolves it, mirrors `category` |
| `lib/cms/landingAdminService.ts` | supplies the reference and the assignable options |
| `lib/content.ts` | includes the relation, with a fallback when the table is absent |
| `lib/mappers.ts` | carries the managed classification onto the public type |
| `types/index.ts` | `Discipline.classification` |
| `components/sections/CompetitionSection.tsx` | dynamic, id-keyed filter with counted totals |
| `views/admin/AdminRodeoCoveragePage.tsx` | Classifications tab, modal, selector |
| `views/admin/AdminLandingSeoPage.tsx` | managed selector |
| `app/admin/(dashboard)/rodeo-coverage/page.tsx` | loads classifications defensively |
| `package.json` | `bootstrap:classifications` script |
| `e2e/global-setup.ts` | restores renamed rodeo slugs (§9) |
| `tests/discipline-classification.test.ts` | inverted assertion (§8) |

No unrelated module was touched. The pending 04-B / 04-E migrations, the
subcategory mapping and every earlier stage's work are untouched.

---

## 18. Remaining risks and blockers

| # | Item | Severity |
|---|---|---|
| 1 | **Aiven's own backup system is still unverified.** An independent, proven-restorable dump exists (§10a), but nobody has shown that Aiven's backups restore or how far back PITR reaches | **High — the §9 gate the owner waived** |
| 2 | ~~Deploying before the migrations breaks the site~~ | **Resolved** — the migrations are applied, so this ordering hazard is gone |
| 3 | ~~Production is 3 migrations behind~~ | **Resolved** — 24 applied, 0 unfinished |
| 4 | Backup retention and PITR window unknown | High |
| 4b | The pre-migration dump sits in a temporary scratch directory and holds real production data | **Medium — move it somewhere deliberate or delete it on purpose** |
| 4c | The new managed tables are now live but **no code using them is deployed**. Harmless, but the feature is not available to editors until the push happens | Medium |
| 5 | `render.yaml` says `autoDeploy: false`, `nfrguide-staging`, free plan; the brief says `main` auto-deploys to production | **Medium — reconcile before the first deploy** |
| 6 | The e2e suite was not re-runnable — slug drift, leaked fixtures **and** a durable rate limiter nothing reset. All three fixed, but it means earlier "149/149" claims held only on a fresh database | Medium — recommend adding `test:e2e` to the routine gate |
| 7 | ~~Files remain uncommitted~~ | **Resolved** — all 95 committed as `93975cc` and pushed; working tree clean |
| 7b | **Render has not been confirmed to have deployed `93975cc`** (§15). `render.yaml` says `autoDeploy: false`, so it may need a manual trigger | **High — the release is not live until this is settled** |
| 7c | Committed docs name the production database and user (`defaultdb`, `avnadmin`) — identifiers only, no host or password. Pre-existing; this commit adds more | Low |
| 8 | Legacy Subcategory mapping/backfill still unapproved | Low — explicitly out of scope here, and not executed |

---

## 19. The exact owner decisions needed

The database is migrated and the code is pushed. What is left:

1. **Confirm Render deployed `93975cc`, or trigger it.** `render.yaml` says
   `autoDeploy: false`, so the push may have deployed nothing. Until a build
   lands, the new tables sit unused and the Classifications tab does not exist
   for editors. §15 lists the baseline signals and the logs needed to verify.
2. **Reconcile the Render service definition** — `render.yaml` names
   `nfrguide-staging` on the **free** plan while serving the production domain.
   Whatever the dashboard actually says, the file and reality should agree.
3. **Decide what happens to the pre-migration dump** (§10a) — it holds real
   production data and currently lives in a temporary directory.
4. **Still open:** Aiven console access and cost approval for a fork, if you want
   BKP-01 genuinely closed rather than waived; the legacy Subcategory mapping,
   still unapproved and unexecuted; and the one draft article whose
   `articleType` is an empty string (§13).

**Stopping here.** The push is done and verified; the deployment is not, and is
not claimed to be.
