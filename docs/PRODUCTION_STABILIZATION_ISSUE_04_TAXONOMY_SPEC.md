# Issue 04 — Final Taxonomy Architecture & Migration Safety Specification

**Mode: READ-ONLY. Specification only — nothing implemented, no migration created, no data changed.**

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`

No repository file was modified except the addition of this document. No Prisma migration was
created. No database was written to — the inventory in §3 came from a read-only session
(`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`, confirmed `on`) against the **local
development** database. No commit, push or deploy. Issue 03 untouched.

---

## 0. One correction to the brief, before anything else

The brief states **"D-04-5 Option A approved"** and then specifies a **managed Subcategory
taxonomy with a required parent Category**.

In the audit, Option A was *"retire Subcategory in favour of the existing Tag taxonomy"*; the
managed taxonomy was **Option B**. The prose is unambiguous, so **this specification builds the
managed taxonomy (audit Option B)**. Flagging it once because the two documents will be read
together, and because the two options share no implementation.

If the intent really was Option A (use Tags), stop here — none of what follows applies.

---

## 1. Final architecture specification

### 1.1 Where Subcategory sits

```
Category (5 rows, seeded, id prefix `cat-`)          ← "Primary Section". 1 per article, required.
   │ 1
   │
   │ n          NEW
Subcategory ─────────────────┐                        ← 0..1 per article, OPTIONAL,
   │ 1                       │                           must belong to the article's Category
   │                         │
   │ 0..n                    │
Article ─────────────────────┘
   ├─ articleType   String   (§4: one authoritative definition, unchanged column)
   ├─ subcategory   String?  (LEGACY label — preserved, read-only during transition)
   └─ subcategoryId String?  (NEW, nullable FK)

UNTOUCHED, and deliberately separate:
   Tag (42 rows)          free many-to-many keywords
   Discipline (7 rows)    which rodeo event — plus its own Roughstock/Timed Event
                          classification, which Issue 03 fixed and this must not disturb
   Hub / Event / Edition  coverage associations
```

Four axes, four jobs, no overlap: **Category** = site section (owns a URL); **Subcategory** =
a curated second level *inside* one section; **Article Type** = editorial typology that drives
code behaviour; **Tag** = open keywords. Discipline is a fifth axis belonging to rodeo content.

### 1.2 Why Subcategory is a table and Article Type is not

Both decisions follow the same rule, applied to different facts.

| | Subcategory | Article Type |
|---|---|---|
| Vocabulary changes | editorially, as coverage grows | rarely, by house-style decision |
| Does code branch on the value? | **no** — it groups and labels | **yes** — JSON-LD `@type`, evergreen eligibility, archive filters |
| Consequence of an unknown value | a new group appears | **a code path silently stops matching** (this is the measured Issue 04 defect) |
| Therefore | **database table** | **code constant** |

A DB-configurable Article Type would let an editor create a value no code path recognises —
which is exactly the failure already measured (11/11 articles carry a type no surface matches).

### 1.3 Identity and slug uniqueness — compound, per parent

**`@@unique([categoryId, slug])`**, following the existing precedent
`RodeoEventEdition.@@unique([eventId, editionSlug])`.

Rationale, and its one consequence:

- The natural public route is **nested** — `/categories/<category>/<subcategory>/` — where
  uniqueness is only required within the parent. "Tickets" may then exist under *Plan & Watch*
  and under *Events & Shopping* without collision, which a global unique would forbid for no
  benefit.
- **If the owner later chooses a FLAT route** (`/subcategories/<slug>/`), slugs must be globally
  unique, and adding that constraint after rows exist is a migration that can **fail on real
  data**. This is why the route shape is an owner decision *now* (§8 D-04-9) rather than later.

A second constraint, `@@unique([categoryId, name])`, stops two differently-slugged "Tickets"
inside one section — a display-level duplicate the slug constraint alone would allow.

### 1.4 Cross-category integrity — enforced by the database, not only by code

The requirement "an article may belong to one Subcategory **within its Primary Section**" can be
made structurally impossible to violate, using a composite foreign key:

- `Subcategory` carries `@@unique([categoryId, id])` (free — `id` is already unique);
- `Article` references **both** columns: `@relation(fields: [categoryId, subcategoryId], references: [categoryId, id])`.

PostgreSQL then rejects any article whose subcategory belongs to another category. Service
validation still runs first so the operator sees a sentence rather than a constraint name, but
the invariant no longer depends on every future code path remembering it.

**The one behavioural consequence, stated plainly:** changing an article's Category while a
subcategory is set becomes an error. That is correct — the subcategory no longer exists in the
new section — and the editor must surface it as *"clear or change the subcategory before moving
this article to another section"*. It must not reach the user as a raw FK violation.

A simpler alternative (service validation only) is in §8 D-04-10 if the composite FK is judged
too strict.

### 1.5 Lifecycle, ordering, timestamps

All three reuse existing conventions rather than inventing any:

| Concern | Reused convention |
|---|---|
| Archive | `archivedAt DateTime?` — nullable, **no default**, so every row reads as active and the migration rewrites nothing (the `Discipline` convention). `ACTIVE_ONLY` / `lifecycleWhere()` in `lib/cms/lifecycle.ts` already filter it |
| Ordering | `sortOrder Int @default(0)`, as `Category` and `Discipline` use |
| Timestamps | `createdAt @default(now())`, `updatedAt @default(now()) @updatedAt` |
| Slug shape | `normalizeSlug()` / `slugShapeError()` / `RESERVED_SLUGS` in `lib/cms/slugRules.ts` |
| Permission | **`taxonomy.manage`** — the permission `createCategory`/`updateCategory`/`deleteCategory` already use |
| Audit | `audit(actorId, action, 'subcategory', id, detail)` |

**Archive, not delete, is the normal retirement path** — consistent with the rodeo entities, and
it keeps published articles' links intact.

---

## 2. Proposed Prisma schema diff (text only — NOT applied)

```diff
 model Category {
   id          String    @id @default(uuid())
   slug        String    @unique
   name        String    @unique
   description String?
   sortOrder   Int       @default(0)
   articles    Article[]
+  subcategories Subcategory[]
+
+  // Required by the composite FK on Article (§1.4). `id` is already unique, so
+  // this adds an index, not a new restriction.
+  @@unique([id, slug])
 }
+
+/// Issue 04 — curated second level inside ONE primary section.
+///
+/// Separate from Article Type (a code-level typology), Tag (open keywords) and
+/// Discipline (which rodeo event, with its own Roughstock/Timed Event
+/// classification). Slugs are unique WITHIN the parent category, following the
+/// RodeoEventEdition precedent, because the intended public route is nested.
+model Subcategory {
+  id          String    @id @default(uuid())
+  categoryId  String
+  slug        String
+  name        String
+  description String?
+  sortOrder   Int       @default(0)
+  /// Archive lifecycle, same convention as Discipline: nullable with no
+  /// default, so existing and new rows read as ACTIVE and nothing is rewritten.
+  archivedAt  DateTime?
+  createdAt   DateTime  @default(now())
+  updatedAt   DateTime  @default(now()) @updatedAt
+
+  category    Category  @relation(fields: [categoryId], references: [id], onDelete: Restrict)
+  articles    Article[]
+
+  @@unique([categoryId, slug])
+  @@unique([categoryId, name])
+  /// Target of Article's composite FK (§1.4).
+  @@unique([categoryId, id])
+  @@index([categoryId, sortOrder])
+  @@index([archivedAt])
+}

 model Article {
   …
   subcategory         String?        // LEGACY free-text label — preserved, unchanged
+  /// Issue 04 — the managed subcategory. Nullable: optional by design, and NULL
+  /// for every existing row so the migration rewrites nothing.
+  subcategoryId       String?
   categoryId          String
   category            Category   @relation(fields: [categoryId], references: [id])
+  /// Named `subcategoryTaxon` because the legacy string column already owns the
+  /// name `subcategory`. Renaming the legacy column mid-transition would be a
+  /// breaking change; the rename belongs to the final clean-up migration, after
+  /// the legacy column is dropped.
+  ///
+  /// COMPOSITE FK: references (categoryId, id), so the database itself refuses a
+  /// subcategory from another section.
+  subcategoryTaxon    Subcategory? @relation(fields: [categoryId, subcategoryId], references: [categoryId, id], onDelete: Restrict)
   …
+  @@index([subcategoryId])
 }
```

**Every change is additive.** No column is dropped, renamed, retyped or made required. No
existing row is touched: `subcategoryId` is NULL for all 11 articles, and `archivedAt` has no
default.

**One generated-SQL caveat worth naming:** the composite FK means the migration adds a
constraint referencing `Article.categoryId`, which already exists. The generated SQL must be
read before use — and in the rehearsal (§7) the exact statements are reviewed, not assumed.

**Deliberately NOT in this diff:**

- No new `LandingEntityType` enum member for Subcategory. There is no public subcategory route
  yet (§6), so no EntitySeo or FAQ record is needed, and adding an enum value is a separate
  migration that can wait until a route exists.
- No change to `Article.articleType` (§4 keeps it `String`).
- No `Prisma` enum for Article Type — that would make the five legacy values unreadable until
  data were rewritten, the opposite of the preservation requirement.

---

## 3. Legacy-data mapping inventory (read-only)

**11 articles, all PUBLISHED, every one carrying a legacy label.**

| Parent Category | Legacy label | Articles | Article slug |
|---|---|---|---|
| `nfr-competition` | Championship Analysis | 1 | `inside-the-chutes-nfr-roughstock-intensity` |
| `nfr-competition` | Discipline Deep Dive | 1 | `saddle-bronc-riding-the-classic-event-evolution` |
| `nfr-competition` | Scoring & Tactics | 1 | `the-anatomy-of-the-10-round-average` |
| `nfr-entertainment` | Concerts & Nightlife | 1 | `country-music-residencies-after-parties-roundup` |
| `nfr-events-shopping` | Exhibition & Tack | 1 | `cowboy-christmas-2026-buyers-handcrafted-curation` |
| `nfr-plan-watch` | Accommodations | 1 | `hotel-district-breakdown-las-vegas-resort-corridor` |
| `nfr-plan-watch` | Broadcast Intelligence | 1 | `how-to-watch-nfr-streaming-cable-cord-cutters` |
| `nfr-plan-watch` | Spectator Strategy | 1 | `las-vegas-in-december-insiders-logistics` |
| `nfr-plan-watch` | Tickets | 1 | `ticket-advisory-consumer-protection-guide` |
| `nfr-plan-watch` | Venue Navigation | 1 | `navigating-thomas-and-mack-center-guide` |
| `more-rodeo` | Global Rodeo Hubs | 1 | `calgary-stampede-to-las-vegas-the-qualifying-pipeline` |

### Two measurements that make the backfill safe

| Check | Result | Why it matters |
|---|---|---|
| Labels used by more than one article | **0** | Every label is a one-off; no merge decisions |
| Labels spanning more than one Category | **0** | **Parent assignment is unambiguous for all 11** — no label has to be split or duplicated |

### The ambiguity that remains — and it is editorial, not technical

The *parent* of each label is unambiguous. What is **not** obvious is whether each label should
become a Subcategory at all: a 1:1 backfill produces **11 subcategories holding one article
each**. That is a taxonomy with no grouping power, and it has a direct SEO consequence (§6.3).

**So the mapping mechanism must not be automatic.** Specified as:

1. A **reviewed mapping file** (e.g. `docs/issue-04-subcategory-mapping.md`) listing every
   legacy label with three owner columns: `→ create as subcategory` / `→ merge into <existing>`
   / `→ drop (keep the legacy label only)`.
2. The backfill script **reads that file and refuses to run on any unmapped label.** It never
   infers, never slugifies-and-hopes, never creates a row the owner has not written down.
3. The script is **idempotent** (re-running changes nothing) and **scoped** — it writes only
   `Subcategory` rows and `Article.subcategoryId`, nothing else.

### Compatibility reads during transition

| Surface | Rule |
|---|---|
| Card kicker, visible breadcrumb label | `subcategoryTaxon?.name ?? article.subcategory ?? null` — the managed value wins, the legacy label is the fallback. **Nothing disappears while the backfill is partial** |
| Search | the legacy column stays in the generated tsvector; no change. Adding the managed name to the index is a later, separate step (§8 D-04-11) |
| Article editor | shows the managed select; when an article still has only a legacy label, it is displayed read-only beside it so an editor can see what it was before choosing |

### Conflict handling

| Conflict | Handling |
|---|---|
| Two labels normalising to the same slug within a category | the script **stops** and reports both; the owner picks the winning name or a distinct slug. Never auto-suffixed (`-2`) |
| A label whose parent category has since changed | cannot occur today (0 cross-category labels), and the script re-checks at run time rather than trusting this report |
| An article already having `subcategoryId` | skipped — makes the script idempotent |
| A legacy label that is only whitespace | treated as unmapped → the script stops |

### Explicitly unchanged by all of the above

Article slugs · URLs · canonical metadata · published state · `EntitySeo` · `EntityFaq` · tags ·
disciplines · events · hubs · editions · `articleType`. The backfill writes exactly two things:
new `Subcategory` rows, and `Article.subcategoryId`. **§8 of the test plan asserts byte-identical
canonical, sitemap and BreadcrumbList output before and after.**

---

## 4. Article Type — one authoritative definition

### 4.1 Shape

```
lib/content/articleTypes.ts          ← the ONLY definition in the codebase
  interface ArticleTypeDef { value; label; selectable; evergreen; news }
  ARTICLE_TYPES: readonly ArticleTypeDef[]      // 18 selectable + 5 legacy
  SELECTABLE_ARTICLE_TYPES   // for the editor dropdown
  isKnownArticleType(v)      // write-boundary validation: selectable ∪ legacy
  isEvergreenType(v) / isNewsType(v)
```

Consumed by **all five** surfaces named in the brief, each of which hardcodes its own list today:

| Surface | Today | After |
|---|---|---|
| Article Editor | `ALL_ARTICLE_TYPES` (18, in a view component) | `SELECTABLE_ARTICLE_TYPES`, plus a stored legacy value shown as the current selection, marked legacy, instead of a blank control |
| Write validation | `z.string().max(80)` — accepts anything | `isKnownArticleType` (selectable ∪ legacy, so an untouched legacy article still saves) |
| Archive filter | hardcoded `['all','feature','analysis','guide','news']` | derived from the types **present** in the articles received, so no button is ever empty and none is ever missing |
| Evergreen query | hardcoded 4 Title-Case values, matching **0 rows** | `ARTICLE_TYPES.filter(t => t.evergreen)` |
| JSON-LD `@type` | `NEWS_ARTICLE_TYPES` = {`news`,`event update`}, lower-cased | `isNewsType` — **same semantics, preserved deliberately** (this is the one surface that already tolerated both vocabularies) |

The column stays `String`. Legacy values stay valid forever unless the owner remaps them.

### 4.2 Evergreen eligibility matrix

Evergreen = still worth surfacing months later, independent of a specific edition.
**FLAG = needs owner approval.**

| Type | Selectable | Evergreen | News | Note |
|---|---|---|---|---|
| News | ✅ | ✗ | **✅** | time-bound |
| Event Update | ✅ | ✗ | **✅** | time-bound |
| Event Guide | ✅ | **FLAG** | ✗ | a guide, but bound to one edition |
| Schedule | ✅ | ✗ | ✗ | expires |
| Results & Standings | ✅ | ✗ | ✗ | expires |
| How to Watch | ✅ | **FLAG** | ✗ | recurs annually; evergreen if written generically |
| Preview | ✅ | ✗ | ✗ | expires |
| Competitor Profile | ✅ | **FLAG** | ✗ | ages but stays useful |
| Rules & Format | ✅ | ✅ | ✗ | already evergreen in code |
| History | ✅ | ✅ | ✗ | already evergreen in code |
| Records & Past Winners | ✅ | ✅ | ✗ | already evergreen in code |
| Entertainment Guide | ✅ | **FLAG** | ✗ | line-up changes yearly |
| Ticket Guide | ✅ | **FLAG** | ✗ | process is stable, prices are not |
| Venue Guide | ✅ | ✅ | ✗ | venues persist |
| Travel Guide | ✅ | ✅ | ✗ | |
| Product Buying Guide | ✅ | **FLAG** | ✗ | product cycles |
| Product Review | ✅ | ✗ | ✗ | dated |
| General Information | ✅ | ✅ | ✗ | already evergreen in code |
| `feature` *(legacy, 2)* | ✗ | **FLAG** | ✗ | |
| `analysis` *(legacy, 3)* | ✗ | **FLAG** | ✗ | |
| `guide` *(legacy, 6)* | ✗ | **FLAG** | ✗ | **the highest-stakes flag — see below** |
| `explainer` *(legacy, 0)* | ✗ | **FLAG** | ✗ | no rows; leans evergreen |
| `news` *(legacy, 0)* | ✗ | ✗ | **✅** | preserves current behaviour |

### 4.3 The decisive practical point

**All 11 articles carry a legacy value. So the legacy flags alone decide whether the evergreen
surface has any content at all.**

If every legacy value is marked non-evergreen, `getEvergreenArticles()` returns **zero** even
after the code is fixed — the same empty surface, now by decision rather than by accident. The
six `guide` articles are the practical content of that surface.

**Recommendation:** mark `guide` and `explainer` evergreen, leave `feature`/`analysis`
non-evergreen. That gives the surface six articles immediately and matches what those six
articles actually are (venue navigation, broadcast, accommodation, tickets, logistics, buyer's
guide — all durable). **Owner confirmation required (D-04-4).**

---

## 5. Admin experience

**Home: the existing `views/admin/AdminEditorialOrgPage.tsx`**, which already manages
Categories, Tags and Authors through `app/admin/taxonomy-actions.ts` and
`lib/cms/taxonomyService.ts`. Subcategory CRUD goes **beside `createCategory`/`updateCategory`
in that same service** — no new page, no second taxonomy system, which is the brief's
constraint.

| Capability | Specification |
|---|---|
| **List & search** | Grouped by parent Category, ordered by `sortOrder`. Columns: name, slug, parent, article count, state. Text filter on name/slug. Archived hidden behind a toggle (the `lifecycleWhere()` pattern) |
| **Create** | Name + parent Category (required) + optional description. Slug auto-derived via `normalizeSlug()`, editable before first save, validated by `slugShapeError()` and `RESERVED_SLUGS` |
| **Edit** | Name, description, slug, `sortOrder`. **Parent change is blocked while articles are attached** — moving it would orphan them across sections (§1.4); the error says so and names the count |
| **Ordering** | `sortOrder` within the parent, reusing the ↑/↓ pattern built for Issue 03's list editors |
| **Archive / reactivate** | Sets / clears `archivedAt`. An archived subcategory keeps existing article links and disappears from the editor's选 options for *new* assignment. Articles already attached are untouched |
| **Delete policy** | Mirrors `deleteCategory` exactly: `not_found` → 404; **`conflict` when any article references it**, with the count and the advice to archive instead; only an unreferenced subcategory is deletable. The composite FK (`onDelete: Restrict`) is the database-level backstop |
| **Editor selection** | A select **filtered to the article's current Primary Section**. Changing the section clears the subcategory with an explicit inline notice — never silently, and never leaving a cross-section value |
| **Validation errors** | duplicate name in section · duplicate slug in section · reserved slug · blank name · subcategory from another section · parent change with attachments. Each a sentence naming the conflict |
| **Empty states** | *"No subcategories in this section yet"* in admin; in the editor, *"This section has no subcategories — add them in Editorial Organisation"* with a link. The select is never a dead control |
| **RBAC** | `taxonomy.manage` for all mutations (same as Category); `cms.access` to view. Article assignment rides the article's own edit permission |
| **Audit** | `subcategory.create` · `.update` · `.archive` · `.reactivate` · `.delete` · `.reorder`, each with the name in `detail`, via the existing `audit()` |

---

## 6. Public rendering and SEO

**No public route is created in this phase** (per the brief). What follows is the specification
for when one is approved.

### 6.1 Compatibility with what already renders

| Surface | Rule |
|---|---|
| Card kicker (`HomeArticleFeed`) | `subcategoryTaxon?.name ?? article.subcategory` — unchanged appearance |
| Visible breadcrumb (`ArticleHeader`) | same fallback; stays an **unlinked label** until a route exists |
| `BreadcrumbList` JSON-LD | **unchanged** — stays `Home → Category → Article`. A subcategory becomes a real item **only** when it has a URL, because a breadcrumb item without one is invalid |
| Canonical / sitemap / article URL | **unchanged**, now and after. Subcategory never enters an article's canonical |

### 6.2 Route options (owner decision D-04-9)

| Option | Shape | Uniqueness needed | Assessment |
|---|---|---|---|
| **A — Nested (recommended)** | `/categories/<category>/<subcategory>/` | per-parent — **matches §1.3 as specified** | Expresses the parent relationship in the URL; no new constraint later |
| B — Flat | `/subcategories/<slug>/` | **global** | Shorter, but needs a global unique added **after** rows exist, a migration that can fail on real data |
| C — Filtered query | `/categories/<category>/?sub=<slug>` | none | Zero SEO value; a filter, not a page |

### 6.3 Indexing — the thin-archive problem is real here

A 1:1 backfill gives **11 subcategories with one article each** (§3). A subcategory archive
holding one article is a near-duplicate of that article: a classic thin/duplicate page.

**Specified rule:** a subcategory archive is indexable **only** when it holds at least a minimum
number of published articles (**recommended: 3**). Below the threshold it renders at HTTP 200
with `noindex, follow` and is **excluded from the sitemap** — exactly the pattern the existing
SEO policy (`lib/seo/policy.ts`) already applies to thin entities, so no new mechanism.

| Concern | Rule |
|---|---|
| Canonical ownership | each archive is self-canonical **when indexable**; below threshold, `noindex` and no canonical claim. The Category archive remains canonical for the section |
| Sitemap | only indexable archives, via the existing eligibility policy |
| Pagination | reuse the Category archive's paging; page 2+ `noindex, follow`, self-canonical per page (no `rel=prev/next` invention) |
| Archived subcategory | its archive returns **404** if it never had a URL, or 200 + `noindex` if it did (the Discipline archive convention from the Rodeo Coverage work) |
| Article counts | computed from **published, non-fixture** articles only — the `publicArticleWhere()` policy, not a raw count |
| Related content | may prefer same-subcategory articles, then fall back to same-category. **No new relationship model** — it is a sort preference over existing data |
| Duplicate-content avoidance | the threshold rule above, plus: a subcategory archive lists excerpts only, never article bodies |

---

## 7. Development and production migration plan

### 7.1 Development migration

1. **Additive only** (§2). `prisma migrate dev --create-only`, then **read the generated SQL
   before applying** — the composite FK is the one statement worth checking by eye.
2. Apply to the **development** database, then the **test** database.
3. `prisma generate`; `tsc --noEmit`; full suite; `next build`.
4. **Verify nothing was rewritten:** all 11 articles still have `subcategoryId IS NULL` and
   their legacy `subcategory` string intact.

### 7.2 Pre-migration requirements for production — one is unmet

| Requirement | Status |
|---|---|
| A **verified, restorable** backup taken immediately before | **UNMET — this is the blocker.** BKP-01 remains unproven: WAL archiving was observed (`archive_mode = on`), but **no restore has ever been tested** and no retention window is confirmed. Do not run this migration until a restore has been rehearsed |
| Migration rehearsed against a restored copy of production data | required (§7.4) |
| Deploy ID and current env values recorded | required |
| A maintenance window, or confidence that the migration is non-blocking | `ALTER TABLE … ADD COLUMN` (nullable, no default) and `CREATE INDEX` are fast on 11 rows; the FK addition takes a brief lock. At this data size the window is seconds |

**This is the first change in the whole stabilisation programme that touches schema. Previous
releases were code-only and rollback-by-revert. That property is now lost, which is why §7.6
exists.**

### 7.3 Existing-data verification queries (read-only, run before and after)

```sql
-- 1. Baseline: no article may already carry a managed subcategory.
SELECT count(*) FROM "Article" WHERE "subcategoryId" IS NOT NULL;         -- expect 0

-- 2. Legacy labels and their parents — compare to §3 (expect 11 rows, all distinct).
SELECT c.slug, a."subcategory", count(*) FROM "Article" a
  JOIN "Category" c ON c.id = a."categoryId"
 WHERE a."subcategory" IS NOT NULL GROUP BY 1,2 ORDER BY 1,2;

-- 3. No label may span two categories (expect 0).
SELECT count(*) FROM (SELECT "subcategory" FROM "Article"
  WHERE "subcategory" IS NOT NULL GROUP BY 1 HAVING count(DISTINCT "categoryId") > 1) x;

-- 4. Slug collisions the backfill would hit (expect 0 rows).
SELECT c.slug AS category, lower(regexp_replace(a."subcategory",'[^a-zA-Z0-9]+','-','g')) AS derived, count(*)
  FROM "Article" a JOIN "Category" c ON c.id=a."categoryId"
 WHERE a."subcategory" IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;

-- 5. Preservation fingerprint — capture BEFORE, compare AFTER (must be identical).
SELECT slug, "articleType", "subcategory", "workflowStatus", "categoryId",
       "heroImageUrl", "publishedAt" FROM "Article" ORDER BY slug;
```

### 7.4 Migration rehearsal

Against a **restored copy** of production, never production itself:

1. Restore the backup into an isolated database.
2. Run the four verification queries; record the §7.3 query-5 fingerprint.
3. Apply the migration. Record its duration and any lock waits.
4. Re-run the fingerprint — **it must be byte-identical**.
5. Run the backfill in `--dry-run` and review every row it *would* create.
6. Run it for real; re-run the fingerprint — only `subcategoryId` may differ.
7. Boot the application against the copy; load an article page and the editor; confirm the card
   kicker and breadcrumb are unchanged.

### 7.5 Backfill approval and sequencing

The backfill is **a separate, explicitly approved step — never part of the migration**.

1. Owner completes the mapping file (§3). The script refuses unmapped labels.
2. `--dry-run` output reviewed and attached to the approval.
3. Run inside one transaction; abort entirely on any conflict.
4. Post-run integrity checks (§7.7).

### 7.6 Compatibility deployment order — this ordering is not optional

Prisma generates explicit column lists, so **code that selects a column the database does not
have fails at runtime.** The MED-01B/C audit recorded the same hazard for
`MediaAsset.description`, and it is the reason that column was deferred.

```
1. MIGRATION  →  database gains the new table and columns. Old code is unaffected:
                 it never selects them.
2. CODE       →  deploy a build that READS BOTH (managed value preferred, legacy
                 fallback) and WRITES the managed value. Safe because step 1 landed.
3. BACKFILL   →  separately approved, after step 2 is verified healthy.
4. LATER      →  only once every article is mapped and verified: stop reading the
                 legacy column, then (a separate migration) drop it and rename
                 `subcategoryTaxon` → `subcategory`.
```

**Never deploy step 2 before step 1.** Doing so breaks every article query, not one field.

### 7.7 Post-migration integrity checks

```sql
-- No article points at a subcategory in another section (the composite FK should
-- make this impossible; verify it anyway).
SELECT count(*) FROM "Article" a JOIN "Subcategory" s ON s.id = a."subcategoryId"
 WHERE s."categoryId" <> a."categoryId";                                   -- expect 0

-- Every created subcategory has a parent that exists and at least the mapped article.
SELECT s.id, s.name, c.slug, (SELECT count(*) FROM "Article" a WHERE a."subcategoryId"=s.id) AS articles
  FROM "Subcategory" s JOIN "Category" c ON c.id = s."categoryId" ORDER BY c.slug, s."sortOrder";

-- Preservation: the §7.3 query-5 fingerprint, excluding subcategoryId, is unchanged.
-- Published count is unchanged.
SELECT count(*) FROM "Article" WHERE "workflowStatus"='PUBLISHED';          -- expect 11
```

Plus HTTP checks: one article page renders with an unchanged canonical; `/sitemap.xml` has the
same URL count; the editor loads and the subcategory select is populated for its section.

### 7.8 Rollback and forward recovery

| Scenario | Action |
|---|---|
| Migration fails mid-way | Prisma applies each statement in order; a failure leaves a partial state recorded in `_prisma_migrations`. **Resolve forward** (fix and re-apply) rather than hand-editing. Restore only if the table is left inconsistent |
| Code (step 2) misbehaves after a good migration | **Revert the code.** The additive columns are harmless to old code — it never selects them. **This is why the ordering in §7.6 matters: it keeps a code-only rollback available** |
| Backfill produced wrong rows | Reversible without touching anything else: `UPDATE "Article" SET "subcategoryId" = NULL WHERE "subcategoryId" IN (…)` then delete those `Subcategory` rows. The legacy label was never modified, so the previous display returns automatically |
| Must undo the schema | A down-migration dropping the column/table is possible **only** after `subcategoryId` is NULL everywhere. Prefer leaving the unused table in place — an empty additive table costs nothing and avoids a second risky migration |
| Data loss | Restore from the §7.2 backup. **This path is currently unproven (BKP-01) and is the reason the migration is gated** |

---

## 8. Remaining owner decisions

| # | Decision | Recommendation |
|---|---|---|
| **D-04-9** | Public route shape: nested, flat, or none yet? | **Nested** (`/categories/<cat>/<sub>/`) — keeps per-parent slug uniqueness valid; a flat route needs a global unique added later, which can fail on real data |
| **D-04-10** | Cross-category integrity: composite FK (database-enforced) or service validation only? | **Composite FK** — makes the invariant structural. Accept that moving an article between sections requires clearing its subcategory first |
| **D-04-4** | Evergreen flags for the 8 flagged selectable types **and the 5 legacy values** | Mark `guide` + `explainer` evergreen (gives the surface 6 real articles); `Event Guide`, `How to Watch`, `Ticket Guide`, `Venue Guide` lean evergreen; `Competitor Profile`, `Entertainment Guide`, `Product Buying Guide` lean not |
| **D-04-12** | Mapping of the 11 legacy labels: create / merge / drop for each | **Review individually.** A 1:1 backfill creates 11 single-article subcategories — valid but thin, and it drives the §6.3 indexing rule |
| **D-04-13** | Minimum articles for an indexable subcategory archive | **3** |
| **D-04-11** | Add the managed subcategory name to the search vector? | Defer — it needs a generated-column migration and the legacy column already covers today's content |
| **D-04-14** | Keep `Article.subcategory` after the backfill, or schedule its removal? | Keep through the transition; schedule removal as a separate migration once every article is mapped |
| **D-04-7** | *(carried from the audit)* Unify the "Primary Section" / "Category" labelling | Yes — label-only, and more valuable now that a second level exists |
| **BKP-01** | **Prove a restore before any production migration** | **Blocking.** This is the first schema change in the programme |

---

## 9. Exact implementation sequence

Each step is independently reviewable; steps 1–3 need no migration at all.

| # | Step | Migration | Gate |
|---|---|---|---|
| **1** | `lib/content/articleTypes.ts` — the single Article Type definition with the approved matrix | no | D-04-4 |
| **2** | Point all five surfaces at it; the editor shows a stored legacy value instead of a blank control; fix the evergreen query; derive the archive filter | no | step 1 |
| **3** | Validate `articleType` at the write boundary (selectable ∪ legacy) | no | step 2 |
| **4** | Schema diff (§2) reviewed; migration created `--create-only`, generated SQL read, applied to **dev + test only** | **yes, dev** | D-04-9, D-04-10 |
| **5** | `taxonomyService` Subcategory CRUD + archive/reactivate + dependency-safe delete; actions; RBAC; audit | no | step 4 |
| **6** | Admin UI in `AdminEditorialOrgPage`; editor select filtered by section, with the section-change clear notice | no | step 5 |
| **7** | Compatibility reads (`managed ?? legacy`) on card kicker and breadcrumb | no | step 5 |
| **8** | Mapping file completed; backfill script with `--dry-run`, idempotent, refuses unmapped labels | no | D-04-12 |
| **9** | **Production:** prove a restore (BKP-01) → rehearse (§7.4) → migrate → deploy code → approve backfill → integrity checks | **yes, prod** | **BKP-01 + owner approval** |
| **10** | *(later, separate)* Public archive route, indexing threshold, sitemap inclusion | no | D-04-9, D-04-13 |
| **11** | *(later, separate)* Drop the legacy column; rename the relation | **yes** | D-04-14 |

### Behavioural test plan

Following the conventions these suites use — real database, real mapper, rendered HTML,
behaviour over source strings.

| # | Area | Test |
|---|---|---|
| 1 | Parent integrity | a subcategory always resolves to its parent; its article count uses `publicArticleWhere()` |
| 2 | **Cross-category rejection** | assigning a subcategory from another section is refused — both by the service (clear message) and by the database (FK) if the service is bypassed |
| 3 | Section change | changing an article's Category with a subcategory set is refused with the specific message, and the article is left untouched |
| 4 | **Legacy preservation** | the 11 existing articles keep `subcategory`, slug, `articleType`, published state, SEO, tags, disciplines, hubs and events through migration **and** backfill |
| 5 | New assignment | selecting a subcategory persists, reloads, and renders in the kicker and breadcrumb |
| 6 | Compatibility read | an article with only a legacy label still renders it; one with both prefers the managed name |
| 7 | Rename & slug | renaming changes the display everywhere; slug uniqueness is per parent; the same slug in two sections is allowed; a reserved slug is refused |
| 8 | Archive / reactivate | archiving hides it from new assignment but keeps existing links; reactivating restores it; archiving with attachments does not orphan |
| 9 | Delete policy | refused while referenced, with the count; allowed when unreferenced; `onDelete: Restrict` blocks a bypass |
| 10 | RBAC & audit | only `taxonomy.manage` mutates; every mutation writes the expected audit action and detail |
| 11 | **Article Type legacy aliases** | a stored `guide` loads, renders as the selected option in the editor's HTML, saves unchanged, and passes validation |
| 12 | **Evergreen query** | returns exactly the flagged types — and **> 0 for the actual seeded data**, the assertion that would have caught the present bug |
| 13 | Archive filter | offers exactly the types present; no button yields an empty list; none hides a real article |
| 14 | JSON-LD | `News`, `news`, `Event Update` → `NewsArticle`; everything else → `Article` |
| 15 | Search | legacy subcategory and type remain weight-C searchable |
| 16 | **SEO URL stability** | canonical, sitemap entries and `BreadcrumbList` for a published article are **byte-identical** before and after migration and backfill |
| 17 | Backfill safety | idempotent on a second run; refuses an unmapped label; aborts wholly on a slug conflict; `--dry-run` writes nothing |
| 18 | **Issue 03 isolation** | discipline content, the Roughstock/Timed Event classification, discipline hero ALT/caption and the discipline guide JSON are all unchanged |

---

**Specification ends here. Nothing was implemented.** Implementation awaits §8 — in particular
**D-04-4**, **D-04-9**, **D-04-10**, **D-04-12**, and **BKP-01**, which blocks the production
migration regardless of the rest.
