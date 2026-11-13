# Issue 04-E — Controlled Hybrid Article Type Management

**Status: LOCAL IMPLEMENTATION COMPLETE AND VERIFIED. Awaiting owner review.**
**Nothing committed, pushed, deployed, or written to production.**

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`
**Databases touched:** `localhost:5433/nfrguide_dev` and `localhost:5433/nfrguide_test` only.

---

## 1. Architecture audit findings

### 1.1 What Article Type was before this batch

Batch 04-A replaced seven competing vocabularies with one code registry,
`lib/content/articleTypes.ts`: 18 selectable typologies plus 5 recognised legacy
values, with `evergreen` and `news` flags. `Article.articleType` is a `String`
column; all 11 published articles store a lowercase legacy value
(`guide` ×6, `analysis` ×3, `feature` ×2).

### 1.2 Every consumer, its runtime, and what would break

This is the finding that determined the whole design. **Four of the six
consumers cannot await a database read**, and four existing test suites pin the
synchronous signatures.

| Consumer | Runtime | Synchronous assumption | How 04-E resolves it |
|---|---|---|---|
| `views/admin/AdminArticleEditorShell.tsx` | **`'use client'`** | `SELECTABLE_ARTICLE_TYPES` module constant | snapshot passed as the `articleTypes` prop by both server pages |
| `views/CategoryArchiveView.tsx` | **`'use client'`** | `articleTypeOptionsFor(articles)` in `useMemo` | snapshot prop from the category server page |
| `components/admin/editor/ArticleDraftPreview.tsx` | **`'use client'`** | `articleTypeLabel` | snapshot forwarded by the editor shell |
| `lib/seo.tsx` | **isomorphic, all sync** | `NEWS_ARTICLE_TYPES` built at module load; `articleJsonLd` sync | optional `{ schemaType }` argument resolved by the server page; omitting it preserves today's behaviour exactly |
| `lib/cms/articleService.ts` | server-only | `ArticleInputSchema.refine(isKnownArticleType)` on a **sync `.parse()`**, at three call sites | schema checks shape only; assignability moved to an async gate in `saveArticle` |
| `lib/content.ts` | server-only, async | `EVERGREEN_ARTICLE_TYPES` module constant in a SQL `IN` | awaits the managed values |
| `types/index.ts` | compile-time | `articleType?: ArticleType` closed union | widened to `string`; the union remains, exported, as the compatibility vocabulary |

Pinning suites: `tests/batchA.test.ts`, `tests/seo.test.ts`,
`tests/stage09-seo-integrity.test.ts`, `tests/issue04a-article-types.test.ts`.

### 1.3 Reusable infrastructure found (nothing new invented)

- `lib/cms/guard.ts` — `requireActor(perm)`, `audit()`, `toActionError`, `ActionResult`
- `lib/auth/rbac.ts` — 6 roles, static `ROLE_PERMISSIONS`, `roleHasPermission`
- `lib/cms/lifecycle.ts` — the `archivedAt` convention and `lifecycleWhere`
- `prisma.auditLog` — `actorId / action / entityType / entityId / detail`
- Caching is **ISR only** (`export const revalidate`), invalidated by
  `revalidatePath`. There is no `unstable_cache` anywhere in the app.
- Batch 04-B's Subcategory CRUD is the template this batch copies: service →
  server action → tab inside the existing Editorial Organization screen.

---

## 2. Final architecture — Controlled Hybrid

```
            ┌─────────────────────────── DATABASE OWNS ───────────────────────────┐
            │  ArticleType: value, label, description, sortOrder, selectable,     │
            │  evergreen, schemaType, archivedAt + AuditLog history               │
            └─────────────────────────────────┬───────────────────────────────────┘
                                              │
                    lib/cms/articleTypeRegistry.ts   ← the ONLY read path
                    (10 s process cache, invalidated on every mutation)
                                              │
        ┌─────────────────────────────────────┼─────────────────────────────────────┐
        │                                     │                                     │
   server reads                        snapshot prop                          write boundary
   evergreen `IN`,                     (editor, archive,                      saveArticle's
   JSON-LD `@type`                      draft preview)                        assignability gate
        │                                     │                                     │
        └──────────────── falls back to ──────┴─────────────────────────────────────┘
                 lib/content/articleTypes.ts — the 23 compiled-in definitions
                 (bootstrap seed AND fallback; never overrides the database)
```

**Code owns** validation, the three permission gates, the two supported schema
classifications, lifecycle semantics, the fail-safe direction, and cache
invalidation. **The database owns** the definitions themselves.

There is no second registry. `lib/content/articleTypes.ts` is retained
explicitly as the immutable compatibility definition, and it is consulted only
when the table is absent, unreachable, or empty.

### 2.1 Two deliberate "fails towards" decisions

- **An empty table is "not initialised", not "no article types."** Returning an
  empty set would blank the editor's dropdown and silently empty the evergreen
  surface — the exact Batch 04-A failure in a new costume. The registry returns
  the 23 compatibility definitions instead and labels itself `source: 'fallback'`,
  which the admin screen displays.
- **An unresolvable classification is `Article`, never `NewsArticle`.** Claiming
  `NewsArticle` for a page that is not news is the misstatement that costs
  something. A missing definition cannot produce it.

---

## 3. Prisma schema and migration

**Migration:** `prisma/migrations/20261113090000_add_managed_article_type/migration.sql`
— **purely additive**: 1 `CREATE TYPE`, 1 `CREATE TABLE`, 4 `CREATE INDEX`.
No `ALTER TABLE "Article"`. No row is read for writing.

```prisma
model ArticleType {
  id          String            @id @default(uuid())
  value       String            @unique          // immutable stored identity
  label       String
  description String?
  sortOrder   Int               @default(0)
  selectable  Boolean           @default(true)
  evergreen   Boolean           @default(false)
  schemaType  ArticleSchemaType @default(ARTICLE)
  archivedAt  DateTime?                          // nullable, NO default
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @default(now()) @updatedAt
  @@index([sortOrder]) @@index([selectable]) @@index([archivedAt])
}
enum ArticleSchemaType { ARTICLE  NEWS_ARTICLE }
```

**`schemaType` replaces the `news` boolean** (§5 asked this to be evaluated).
One authoritative field, constrained to two values, rather than two overlapping
SEO flags that can disagree. The `news` boolean survives in exactly one place —
the compatibility registry, where it is read once to derive the bootstrap's
`schemaType`.

**No foreign key from `Article`,** and `Article.articleType` keeps its `String`
column. A FK would have to be satisfied by all 11 existing rows the instant it
was created, i.e. it would make a data rewrite part of a schema change.
Integrity is enforced where it is cheap and reversible: deletion is blocked
while any article stores the value, and the write boundary validates
assignability.

**Ordering:** after `20261113071524_add_managed_subcategory`. The two are
independent — neither references the other's objects — so either order applies
cleanly; the timestamp keeps the recorded history linear.

### 3.1 A correction made during implementation, and why it matters

The first design carried a second column, `valueKey` (lower-cased `value`),
`@unique`, to make case collisions impossible **at the database level**. The
data refused it: the compatibility vocabulary contains **both `News`** (the
current selectable typology) **and `news`** (a legacy value six articles-worth
of history store). They are two distinct stored strings, each held by real rows.

A unique index on `lower(value)` would have made one of the 23 definitions
unrepresentable — the bootstrap created 22 and failed on the 23rd, which is how
this was caught. §6 (preserve all 23 exactly) outranks a convenience
constraint, so:

- the column is **exact-unique**, not case-folded;
- **case-collision is refused in the service, at CREATE** — where the policy
  actually applies, since an administrator may not add a variant of an existing
  value;
- the pre-existing `News`/`news` pair is grandfathered by the bootstrap, which
  writes exact values directly.

**This is a measured limitation, not an assumed guarantee**, and it is asserted
as such: `tests/issue04e-article-type-cms.test.ts` proves a direct insert of
`PrEvIeW` *succeeds* at the database level while `createArticleType('preVIEW')`
is refused. The superseded migration was dropped and re-applied locally while
the table was empty (0 rows in both databases, verified before and after;
`Article` counts 11 and 17, unchanged).

---

## 4. Bootstrap and compatibility strategy

`lib/cms/articleTypeBootstrap.ts` — **only ever INSERTS.**

| Requirement (§6) | How |
|---|---|
| Creates the 23 definitions | from `ARTICLE_TYPES` in declared order, so `sortOrder` reproduces today's editorial order |
| Preserves exact stored values | `value` written verbatim; nothing normalised |
| Preserves evergreen classification | copied from the approved matrix |
| Preserves NewsArticle behaviour | `news: true` → `schemaType: NEWS_ARTICLE` |
| Preserves the 18/5 split | legacy values created with `selectable: false` |
| No duplication on re-run | existing exact value → reported `present`, left untouched |
| Never overwrites administrator changes | **it does not update, ever** — tested by renaming a label and deactivating a type, then re-running |
| Rejects conflicts clearly | a row that case-folds onto a definition without *being* one is reported as `conflict` with the reason, never repaired |
| Never automatic against production | dry-run default, `--execute` required, non-local target needs `BOOTSTRAP_ALLOW_REMOTE=I_HAVE_A_VERIFIED_BACKUP` |

Legacy values are **not mapped** into newer types. `guide` stays `guide`.

**CLI:** `npm run bootstrap:article-types [-- --execute | --verify]`.
Run with `tsx` (as this repo already does for `bootstrap:admin`) because the
module's import graph reaches `types/index.ts` through extensionless specifiers
that Node's ESM resolver cannot follow — the 04-D `.ts`-extension trick does not
scale to a deeper graph.

**Verified on `nfrguide_dev`:** dry run planned 23 / 0 conflicts → execute
created 23 → **second execute: created 0, present 23** → `--verify` complete YES
→ `Article` rows 11 before and after.

---

## 5. Admin UI

A new **Article Types** tab inside the existing Editorial Organization screen
(`/admin/editorial-organization/`), using the same design system as Categories
and Subcategories. No separate module.

- list with stored value (monospace), label, order, state badge, evergreen,
  structured data, usage count
- search over value and label; "show inactive & archived" toggle
- create (value + label + description + order + offer-immediately)
- edit label / description / order — **the value field is read-only when
  editing**, and says why before it is tried
- activate / deactivate, archive / unarchive, delete (offered only at 0 usage)
- evergreen toggle and schema-type selector, each shown only to the role that
  may use it, each with a confirmation naming the public consequence
- an amber **"registry is not initialised"** panel with a one-click bootstrap
  (Super Admin) when `source === 'fallback'`
- the last 20 audit entries for the entity
- three standing explanations: the value is permanent; deactivating affects new
  work only; two settings change public SEO output and take effect at the next
  revalidation without a deployment

Usage counts come from **one** `groupBy` over `Article.articleType`, not 23
queries.

---

## 6. RBAC enforcement

Checked against the existing model first; one new permission string was needed
and was added through the established architecture.

| Capability | Permission | Roles holding it |
|---|---|---|
| create, label, description, order, activate, archive, delete | **`articletype.manage`** (new) | Super Admin, Administrator |
| evergreen eligibility | `seo.config` (existing) | Super Admin, Administrator, SEO Manager |
| Article ↔ NewsArticle | `system.config` (existing) | **Super Admin only** |
| bootstrap / initialise | `system.config` | Super Admin only |

`articletype.manage` is deliberately **not** `taxonomy.manage`: Editors hold
that one, and an Article Type governs structured data and the evergreen surface
site-wide, so creating one is an administrative act rather than an editorial
one. Editors keep `taxonomy.manage` for categories, subcategories and tags and
are otherwise unaffected.

A new type is created **not evergreen and classified `Article`**, so an
Administrator cannot mint a `NewsArticle` type in a single action.

Every gate is in the service. Each server action re-checks before calling, and
the UI hides controls — neither is the boundary. All six "unauthorized" paths
are tested per role, including that nothing changed after the refusal.

---

## 7. Evergreen integration

`getEvergreenArticles` now awaits `getEvergreenArticleTypeValues()`. The article
query itself is unchanged — one `findMany`, `publicArticleWhere()` applied first,
same ordering and limit. The registry read is cached in-process for 10 s and
shared with the editor and JSON-LD paths, so this is not an N+1.

`EVERGREEN_ARTICLE_TYPES` is kept, unchanged, as the compatibility export and
the documented fallback, marked `@deprecated` for querying.

**Effect on previously published articles:** immediate in the process that made
the change (the registry cache is dropped), and visible publicly at the next
revalidation of the pages that render the surface — the homepage, via
`lib/cms/homepageData.ts`. Articles themselves are never modified, so a flag can
be set and cleared with no residue.

---

## 8. Structured data integration

`articleJsonLd(article, opts?)` takes an optional resolved
`schemaType`. `app/(public)/articles/[slug]/page.tsx` — a Server Component —
resolves it with `getArticleSchemaType(article.articleType)` and passes it in.

- only `Article` and `NewsArticle` are accepted, validated in the service, not
  trusted from the form
- unknown / uninitialised / unreachable ⇒ `Article`, **never** `NewsArticle`
- omitting the option reproduces pre-04-E behaviour exactly, which is what keeps
  the four pinning suites meaningful rather than merely passing
- no client component reads the database
- canonical URLs, publication dates and every other JSON-LD property are
  untouched
- changing it requires Super Admin and invalidates the public tree

---

## 9. Archive and preview integration

`archiveFilterOptions(snapshot, articles)` still derives options **from the
articles actually present**, now labelled from the managed definitions. That is
what keeps a deactivated or archived type in its archive filter while its
articles remain public: lifecycle withdraws a type from new classification, and
never from public discovery of work already published. An unknown stored value
is shown as stored, never hidden or substituted.

The draft preview and the editor's own kicker read the same snapshot. The
editor's dropdown renders the current value as its own option whenever it is not
among the offered ones — one condition that covers legacy, deactivated,
archived, and undefined values, each labelled ("no longer offered" /
"unrecognised") and none of them silently converted.

---

## 10. Cache invalidation

Per-change, not blanket, because `revalidatePath('/', 'layout')` discards the
whole public render tree:

| Change | Admin | Public | Why |
|---|---|---|---|
| label, description | ✓ | ✓ | printed in the archive filter, kicker, preview |
| order | ✓ | ✓ | orders the archive filter |
| selectable, archive | ✓ | — | governs NEW classification only |
| evergreen | ✓ | ✓ | changes which articles the evergreen surface may show |
| schemaType | ✓ | ✓ | changes `@type` in article JSON-LD |
| delete | ✓ | ✓ | the definition is gone |

Admin invalidation covers the taxonomy screen and both editor pages. No
unauthenticated revalidation endpoint was added or exposed. **Admin changes need
no deployment.**

---

## 11. Files changed

**New (7)**

| File | Purpose |
|---|---|
| `lib/content/articleTypeShape.ts` | isomorphic shape + pure snapshot reads + value policy |
| `lib/cms/articleTypeRegistry.ts` | the only read path; DB → fallback, cache, invalidation |
| `lib/cms/articleTypeService.ts` | CRUD, three permission gates, audit, immutability |
| `lib/cms/articleTypeBootstrap.ts` | idempotent insert-only bootstrap + registry verification |
| `app/admin/article-type-actions.ts` | 9 server actions with per-change revalidation |
| `scripts/bootstrap-article-types.ts` | CLI: dry-run default, local-target guard |
| `prisma/migrations/20261113090000_add_managed_article_type/` | additive migration |
| `tests/issue04e-article-type-cms.test.ts` | 44 behavioural tests |

**Modified (13)**

| File | Change |
|---|---|
| `prisma/schema.prisma` | `ArticleType` model + `ArticleSchemaType` enum |
| `lib/auth/rbac.ts` | `articletype.manage` added to the union and to Admin+ |
| `lib/auth/permissions.ts` | the new permission in the matrix catalogue |
| `lib/cms/articleService.ts` | shape-only type validation + async assignability gate |
| `lib/content.ts` | evergreen values from the registry |
| `lib/seo.tsx` | optional resolved `schemaType` on `articleJsonLd` |
| `types/index.ts` | `articleType?: string`; `ArticleType` documented as compatibility |
| `views/admin/AdminEditorialOrgPage.tsx` | the Article Types tab + modal |
| `views/admin/AdminArticleEditorShell.tsx` | snapshot prop; dropdown from managed types |
| `views/CategoryArchiveView.tsx` | snapshot prop for filter labels |
| `components/admin/editor/ArticleDraftPreview.tsx` | snapshot prop for the label |
| `app/admin/(dashboard)/editorial-organization/page.tsx` | loads types, audit, 3 permission flags |
| `app/admin/(dashboard)/articles/{new,[id]/edit}/page.tsx` | pass the snapshot |
| `app/(public)/articles/[slug]/page.tsx` | resolve and pass `schemaType` |
| `app/(public)/categories/[slug]/page.tsx` | pass the snapshot |
| `package.json` | `bootstrap:article-types` script |
| `tests/issue04a-article-types.test.ts` | three tests updated to the new contract (§17 below) |
| `tests/rodeo-lifecycle.test.ts` | `ArticleType` added to the explicit `archivedAt` table list |

---

## 12. Test results

**Focused — `tests/issue04e-article-type-cms.test.ts`: 44 passed / 44.**

Mapping to the §17 requirements (several are covered by more than one case):

| § | Requirement | Covered |
|---|---|---|
| 1 | 23 values bootstrap correctly | ✓ incl. 18/5 split, SEO matrix, the `News`/`news` pair |
| 2 | repeated bootstrap idempotent | ✓ and proves it does not revert a rename or a deactivation |
| 3 | existing article values unchanged | ✓ `groupBy` identical before/after |
| 4 | labels change without touching values | ✓ |
| 5 | values cannot be renamed | ✓ refused, not ignored |
| 6 | duplicates and case collisions rejected | ✓ plus the measured DB-level limitation |
| 7 | inactive types not assignable to new articles | ✓ inactive, archived, and undefined |
| 8 | existing inactive types survive unrelated edits | ✓ title edit lands, type preserved |
| 9 | referenced types cannot be deleted | ✓ and unreferenced ones can |
| 10 | unauthorized users cannot mutate | ✓ 6 paths as Editor + bootstrap as Admin/Editor |
| 11 | SEO Manager limited to SEO settings | ✓ can set evergreen, cannot rename/create/reclassify |
| 12 | Super Admin controls classification | ✓ incl. an unsupported value refused |
| 13 | evergreen queries reflect managed flags | ✓ end to end through `getEvergreenArticles` |
| 14 | NewsArticle reflects managed settings | ✓ through the registry into JSON-LD |
| 15 | archive filters include legacy types | ✓ |
| 16 | draft preview shows managed labels | ✓ rendered, plus the fallback label |
| 17 | creation and editing still work | ✓ |
| 18 | cache invalidation after authorized change | ✓ next read reflects it with no manual flush |
| 19 | missing definitions fail safely | ✓ empty table → 23 fallback definitions, saving still works |
| 20 | SEO URLs, canonicals, publication state unchanged | ✓ slug/publishedAt/workflowStatus compared before/after |
| 21 | 04-B Subcategory behaviour correct | ✓ assignable list + cross-section refusal |
| 22 | Issue 03 Discipline CMS correct | ✓ absent `name`/`image` still leave values unchanged |
| 23 | no production writes | ✓ host guard + `current_database()` assertion |

**Full regression: 134 files, 3,112 passed, 3 skipped (3,115).**
Baseline before this batch was 133 files / 3,071 tests → +1 file, +44 tests, **0
regressions**.

### Two existing tests were updated, deliberately

**`tests/issue04a-article-types.test.ts` (3 cases).** 04-A accepted a legacy
value on *any* save, because `isKnownArticleType` asked only "is this
recognised?". 04-E manages the five legacy values as non-selectable, and §10 is
explicit that a non-selectable type is "unavailable for new articles but
preserved for existing articles". So creating a *new* article with `guide` is
now refused, while a `guide` article still saves with its type intact — the half
that matters is unchanged and still asserted. Two things were checked before
accepting this change:

- **revision restore is unaffected** — it bypasses `saveArticle` and parses the
  snapshot directly, so a historical value restores unconditionally;
- **the seeder is unaffected** — `prisma/seed.ts` writes `articleType` through
  Prisma, not the service.

The editor never offered legacy values anyway (04-A deliberately excluded them),
so this closes a gap rather than removing a capability.

**`tests/rodeo-lifecycle.test.ts` (1 case).** It asserts the *exact* list of
tables carrying a nullable `archivedAt` so an unintended one is caught.
`ArticleType` adopts the convention by design, as `Subcategory` did in 04-B.

---

## 13. TypeScript and build

- `npx tsc --noEmit` — **clean**, no errors, no new `any`.
  (One `as never` cast written during implementation turned out to be
  unnecessary and was removed rather than left in place.)
- `npm run build` — **succeeded**; `.next/BUILD_ID` = `gMuvm_1kxmtH3qM8Vqig5`.
  Route table rendered; the article and category pages still prerender via
  `generateStaticParams`.
- `git diff --check` — clean (only the repository's pre-existing CRLF notices).
- Encoding scan of all 49 changed/untracked source files — **no BOM, no
  mojibake**. No PowerShell 5.1 text round-trip was used on any source file.

---

## 14. Database preservation evidence

| | `nfrguide_dev` | `nfrguide_test` |
|---|---|---|
| Articles before | 11 | 17 |
| Articles after | **11** | **17** |
| Stored types before | `guide` 6 · `analysis` 3 · `feature` 2 | — |
| Stored types after | **identical** | **identical** |
| `ArticleType` rows | 23 (bootstrapped locally) | 0 (suite restores the empty state) |
| Published slugs / `publishedAt` / `workflowStatus` | compared before and after the bootstrap — **equal** | asserted in-suite |

The migration contains no `ALTER TABLE "Article"` and no `UPDATE`. The bootstrap
only inserts into `ArticleType`.

---

## 15. Git status

Branch `main`, HEAD `aafdad2` — **unchanged**. No commit, push, branch, stash,
reset or rebase. No stashes exist.

All pre-existing uncommitted work is intact: Issue 03 and Batches 04-A/B/C/D
files all still present and modified as before (29 modified + 20 untracked
paths, up from 23 + 13 — the increase is this batch's own files).

---

## 16. Production rollout and rollback plan — PLANNING ONLY

**BKP-01 (verified restore rehearsal) remains a mandatory blocker for the
production schema migration. None of the steps below were executed.**

The ordering matters because of one rule: **a newly deployed code version must
not depend on a table that has not yet been migrated and initialised.** This
release satisfies it by construction — the fallback means 04-E code is safe to
deploy *before* the migration, not merely after it. That makes the sequence
order-tolerant rather than fragile.

1. **Resolve BKP-01.** Verified, restorable backup of the Aiven database.
2. **Apply the migration** (`prisma migrate deploy`). Additive: 1 enum, 1 table,
   4 indexes. No lock on `Article`.
3. **Bootstrap** — `npm run bootstrap:article-types` first (dry run, read the
   plan), then `-- --execute` with `BOOTSTRAP_ALLOW_REMOTE=I_HAVE_A_VERIFIED_BACKUP`.
4. **Verify completeness** — `-- --verify` must print `complete: YES`.
5. **Deploy the application code.** (Safe at any point from step 1; placed here
   so the admin screen is useful the moment it appears.)
6. **Verify behaviour** — the Article Types tab lists 23 rows and does *not*
   show the "not initialised" panel; an article page's JSON-LD `@type` is
   unchanged; the homepage evergreen surface still shows its six articles.
7. **Later, separately approved:** retire the fallback once the registry is
   verified in production. Not part of this change.

**Rollback.** `DROP TABLE "ArticleType"; DROP TYPE "ArticleSchemaType";` restores
the prior schema exactly — nothing outside those two objects was altered.
Because the application falls back to the compiled-in definitions, **a schema
rollback does not require a code rollback**, and a code rollback does not
require a schema rollback. No article row is involved in either direction.

---

## 17. Remaining risks and owner decisions

| # | Item | Assessment |
|---|---|---|
| R-1 | **Administrator also holds `seo.config`** | §8 named "SEO Manager / Super Admin" for evergreen. `seo.config` is the existing permission for that, and Administrator already holds it site-wide. Narrowing it would have meant a new permission that Administrator lacks — a change to the established model for this one field. **Owner decision:** accept, or add `articletype.seo` granted to SEO Manager + Super Admin only. |
| R-2 | **No database-level case-folded uniqueness** | Measured and documented in §3.1; the `News`/`news` pair makes it impossible. Service-enforced at CREATE, and asserted as a limitation rather than assumed. A future option is a partial unique index, which Prisma cannot model and which `selectable` toggles would destabilise — not recommended. |
| R-3 | **Legacy values are no longer assignable to new articles** | Intended per §10/§11.6, verified not to affect revision restore or the seeder. Flagged because it is a behaviour change to a tested contract (§12). |
| R-4 | **10 s cross-instance staleness** | A change is immediate in the process that made it; another Render instance may serve prior definitions for up to 10 s. Deliberate: the alternative, caching SEO classification longer, is worse. Lower it if Render is scaled out and the owner wants tighter convergence. |
| R-5 | **`Article.articleType` has no foreign key** | Justified in §3. Integrity rests on the delete block and the write gate. Introducing a FK would require a data migration and its own authorization. |
| R-6 | **`ArticleType` is bootstrapped in dev only** | Production and staging remain uninitialised and on the fallback until step 3 above. |
| R-7 | **No public archive route for an article type** | Out of scope and unchanged; the type is a filter and a classification, not a URL. |

### Explicit confirmation

| | |
|---|---|
| Production database | **UNTOUCHED** — never connected to in this batch |
| Production R2 / environment variables / Render | **UNTOUCHED** |
| Production migration | **NOT RUN** |
| Backfill / data rewrite | **NONE** — no `UPDATE` to any `Article` row |
| Git | **UNTOUCHED** — no commit, push, branch, stash or reset |
| Existing uncommitted work | **PRESERVED** in full |
| Local migrations | applied to `nfrguide_dev` and `nfrguide_test` only, after verifying both are `localhost` |
