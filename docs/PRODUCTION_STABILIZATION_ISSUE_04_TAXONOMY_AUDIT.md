# Production Stabilization Issue 04 — Article Type & Subcategory Architecture Audit

**Mode: READ-ONLY. Nothing was changed.**

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`

No code, schema, database record or configuration was modified. No migration was created. No
commit, push or deploy. Issue 03's implementation was not touched. Database access was a
read-only session (`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`) against the **local
development** database; no production database was contacted.

---

## 1. Root-cause analysis

**One field, three hardcoded vocabularies, none of them authoritative — and the database holds
a fourth.**

`Article.articleType` is a free-text `String` column. Nothing at the write boundary constrains
it: `articleService` validates it as `z.string().max(80).default('General Information')`. The
constraint that *looks* authoritative is a TypeScript union, which the write path never
consults. Four independent lists then disagree:

| # | List | Where | Values | Case |
|---|---|---|---|---|
| 1 | Admin dropdown | `AdminArticleEditorShell.tsx:26` (`ALL_ARTICLE_TYPES`) | **18** editorial typologies | Title-Case |
| 2 | Public archive filter | `CategoryArchiveView.tsx:69` — **hardcoded inline** | `feature`, `analysis`, `guide`, `news` | lowercase |
| 3 | Evergreen query | `content.ts:213` (`EVERGREEN_ARTICLE_TYPES`) | `Rules & Format`, `History`, `Records & Past Winners`, `General Information` | Title-Case |
| 4 | News structured data | `seo.tsx:111` (`NEWS_ARTICLE_TYPES`) | `news`, `event update` | compared **lower-cased** |
| — | TypeScript union | `types/index.ts:17` | **23** (the 18 **plus** 5 legacy) | mixed |
| — | **The database** | `Article.articleType` | **only the legacy lowercase set** | lowercase |

### What that costs, measured rather than inferred

Read-only counts over the development database (11 published articles):

| Measurement | Result |
|---|---|
| Distinct stored types | `guide` ×6 · `analysis` ×3 · `feature` ×2 |
| Articles whose type is one of the **18 selectable** options | **0 of 11** |
| Articles matching `EVERGREEN_ARTICLE_TYPES` | **0 of 11** |
| Articles with an empty type | 0 |

Three concrete consequences follow:

1. **Every existing article opens with a blank Article Type dropdown.** The select is
   `value={articleType}` with options from list #1; a stored `guide` matches no `<option>`, so
   the control renders as if nothing were chosen. The state still holds `guide`, so a save that
   does not touch the control preserves it — but the UI invites an editor to "fix" a field that
   is not broken, and once touched, the original value **cannot be chosen again**.
2. **`getEvergreenArticles()` returns nothing.** It is a case-sensitive SQL `IN` against list
   #3, and no row matches. That public surface is silently empty — not erroring, just empty.
3. **Selecting any of the 18 types removes the article from every filter button on its own
   category archive.** The archive's buttons are list #2, the legacy vocabulary. An article
   typed `Preview` would appear only under "all".

So the admin control cannot improve an article's classification and can only detach it from the
surfaces that use it. **That is the defect: not a missing field, but four disagreeing lists with
no single owner.**

**One thing that is NOT broken, stated so the report is not read as worse than reality.** The
`NewsArticle` vs `Article` JSON-LD decision (#4) lower-cases before comparing
(`seo.tsx:114`), so it works for `News` and for `news` alike. It is the only one of the four
that was written to tolerate both vocabularies.

---

## 2. Current taxonomy architecture

```
                    ┌──────────────────────────────────────────┐
  EDITORIAL AXIS    │  Category  (5 rows, DB table)            │  ← "Primary Section"
  (one per article) │  nfr-competition · nfr-entertainment     │     in the editor UI
                    │  nfr-events-shopping · nfr-plan-watch    │
                    │  more-rodeo                              │
                    └──────────────────────────────────────────┘
                              │ Article.categoryId (required, FK)
                              ▼
                    ┌──────────────────────────────────────────┐
                    │  Article                                 │
                    ├──────────────────────────────────────────┤
                    │  articleType   String   ← free text      │  §1: four vocabularies
                    │  subcategory   String?  ← free text      │  §5: no taxonomy at all
                    │  searchVector  (weight C on both)        │
                    └──────────────────────────────────────────┘
                     │        │        │        │        │
          ┌──────────┘        │        │        │        └──────────┐
          ▼                   ▼        ▼        ▼                   ▼
   ArticleTag[]        ArticleDiscipline[]  ArticleHub[]      ArticleEdition[]
   → Tag (42 rows,     → Discipline         ArticleEvent[]
     45 links)           (7 rows)           → coverage associations
   free, working        ORTHOGONAL axis:    (many-to-many), used for
   many-to-many         which rodeo event   related content, not
                        is contested        classification

  SectionConfig (0 rows) — display overrides for the five sections only
  (displayName / tagline / description / heroImage / visible). Empty, so the
  five sections come entirely from `config/routes.ts#PRIMARY_SECTIONS`.
```

### What each term actually means today

| Term | Authoritative source | Meaning | Cardinality |
|---|---|---|---|
| **Primary Section** | `Category` table + `PRIMARY_SECTIONS` in code | The site's five top-level navigation areas. **The editor's "Primary Section" field writes `categoryName`** — Section and Category are *the same axis under two names*, not a hierarchy | exactly 1 per article |
| **Category** | `Category` table (5 rows) | Same as above. Owns the archive URL `/categories/<slug>/` | 1 |
| **Subcategory** | `Article.subcategory` free text | A per-article editorial label. Not a taxonomy (§5) | 0 or 1 |
| **Article Type** | nothing single (§1) | Editorial typology, intended to drive JSON-LD type, evergreen eligibility and archive filtering | exactly 1 (required column) |
| **Discipline** | `Discipline` table (7 rows) + `ArticleDiscipline` | Which rodeo event the article concerns. **A different axis from Category/Subcategory** — it has its own pages, its own `Roughstock`/`Timed Event` classification (Issue 03 §4) and its own URL space | 0..n |
| **Hub / Event / Edition** | `ArticleHub` / `ArticleEvent` / `ArticleEdition` | Coverage associations to recurring events and their annual editions. Used for related content and the rodeo pages, not for editorial classification | 0..n |
| **Tag** | `Tag` (42 rows) + `ArticleTag` (45 links) | Free, open, many-to-many keyword taxonomy. **Already working** | 0..n |

**The confusion the brief warns about is real and it is in the naming, not the data.** "Primary
Section" and "Category" are one axis with two labels; "Subcategory" sounds like a child of it
but is an unrelated free-text label; "Discipline Classification" (`Roughstock`/`Timed Event`)
belongs to a third axis entirely and must not be merged into either.

---

## 3. Database and CMS capability matrix

| Axis | Storage | Admin manageable? | Validated? | Public surface | URL / SEO |
|---|---|---|---|---|---|
| Category / Primary Section | `Category` table, FK | **Yes** — select in the editor; rows are seed-managed | FK enforced | `/categories/<slug>/` archive, breadcrumbs, JSON-LD | **Yes** — owns a URL and is in BreadcrumbList |
| Article Type | free-text `String` | **Partly, and harmfully** — a dropdown of 18 values the data never uses (§1) | `max(80)` only | archive filter, evergreen query, JSON-LD `@type`, search weight C | **No URL.** Affects `@type` only |
| Subcategory | free-text `String?` | **Yes, as free text** — a bare input with a placeholder | `max(120)` only | card kicker, unlinked visual breadcrumb label, search weight C | **No URL, not in BreadcrumbList JSON-LD** |
| Discipline | `Discipline` + join | **Yes** — Issue 03 completed this | FK enforced | `/disciplines/<slug>/`, related articles | **Yes** |
| Hub / Event / Edition | join tables | **Yes** — Rodeo Coverage admin | FK enforced | rodeo pages, related content | **Yes** (own URLs) |
| Tag | `Tag` + join | **Yes** — editor | unique name | article tag list, search | no tag archive route |
| Section display | `SectionConfig` (**0 rows**) | Yes — Website admin | — | section landing overrides | no |

### URL and SEO dependency — the key de-risking finding

I checked `lib/seo/`, `app/sitemap.ts`, `components/editorial/Breadcrumbs.tsx` and the article
page's JSON-LD. **Neither `articleType` nor `subcategory` appears in any URL, canonical,
sitemap entry or BreadcrumbList item.** The article page's structured breadcrumb is
`Home → Category → Article`; the visible trail inserts the subcategory as an **unlinked label**
only.

**Consequence: remediating either field cannot change a URL, a canonical or a sitemap entry.**
Issue 04's constraint "preserve existing published articles, relationships and URLs" is
therefore satisfiable with no URL work at all — the risk is confined to display, filtering and
one structured-data property.

*(Minor, recorded without inflating it: the visible breadcrumb has four levels and the
structured one has three. Since the subcategory label has no URL it could not be a
`BreadcrumbList` item anyway, so this is defensible rather than a defect — but the two trails
do disagree.)*

---

## 4. Article Type inventory and origin

**Origin: hardcoded in a view component.** `ALL_ARTICLE_TYPES` is a module-level array in
`views/admin/AdminArticleEditorShell.tsx:26`, typed by the `ArticleType` union in
`types/index.ts:17`. It is **not** database-backed and **not** derived from existing data.

### The 18 selectable typologies (list #1)

News · Event Update · Event Guide · Schedule · Results & Standings · How to Watch · Preview ·
Competitor Profile · Rules & Format · History · Records & Past Winners · Entertainment Guide ·
Ticket Guide · Venue Guide · Travel Guide · Product Buying Guide · Product Review ·
General Information

### The 5 legacy values — in the type, not in the dropdown

`feature` · `analysis` · `guide` · `explainer` · `news`

These are members of the `ArticleType` union but absent from `ALL_ARTICLE_TYPES`, so they are
**representable, storable and unselectable**. The editor's label reads "Article Type (18
Typologies)" while the type admits 23.

### What is actually stored

| Value | Articles | In the dropdown? |
|---|---|---|
| `guide` | 6 | no |
| `analysis` | 3 | no |
| `feature` | 2 | no |
| `explainer` | 0 | no |
| `news` | 0 | no |
| *any of the 18* | **0** | yes |

**100% of real content uses the unselectable vocabulary.**

---

## 5. Subcategory implementation status

**The field is complete end to end. The classification does not exist.**

| Layer | Present? |
|---|---|
| Column (`Article.subcategory String?`) | **yes** |
| Editor input | **yes** — a bare text box, placeholder "e.g. Roughstock, Arena Logistics, Ticketing…" |
| Validation | `max(120)` only — no list, no normalisation, no case handling |
| Persistence | **yes** (`v.subcategory \|\| null`) |
| Search | **yes** — weight C in the generated tsvector |
| Public display | **yes** — card kicker (`HomeArticleFeed`), unlinked breadcrumb label (`ArticleHeader`) |
| A taxonomy of allowed values | **no** |
| Any grouping, archive or filter by subcategory | **no** |
| Reuse / autocomplete across articles | **no** |

### The measurement that settles it

**11 articles → 11 distinct subcategory values, each used exactly once:**
Broadcast Intelligence · Venue Navigation · Spectator Strategy · Tickets · Accommodations ·
Discipline Deep Dive · Global Rodeo Hubs · Scoring & Tactics · Exhibition & Tack ·
Championship Analysis · Concerts & Nightlife

A classification that never repeats is not classifying anything. In practice the field is being
used as a **per-article kicker line**, and the placeholder encourages exactly that by offering
three unrelated examples. Note too that the placeholder's first suggestion, "Roughstock", is a
**Discipline classification** — the naming confusion is already leaking into editor guidance.

**Answer to the brief's question:** it exists *partially* — the plumbing is whole, the taxonomy
is entirely absent.

---

## 6. Recommended target architecture

### 6.1 Article Type → a fixed editorial enum, in code, with exactly ONE owner

**Recommendation: keep it a code-level enum. Do not make it a database-configurable entity.**

The reasoning is specific rather than stylistic:

- **It drives code behaviour, not just display.** JSON-LD `@type`, evergreen eligibility and
  archive filtering all branch on the value. A DB-editable list lets an editor create a value
  that no code path recognises — which is precisely today's failure mode wearing a new costume.
- **The vocabulary is stable.** 18 editorial typologies is a publication's house style, revised
  rarely and deliberately, not fast-moving data.
- **A single constant removes four lists.** Today three components hardcode their own; the fix
  is one exported module consumed by the editor, the archive filter, the evergreen query and
  the write-boundary validator.

Proposed shape (illustrative only — nothing was written):

```
lib/content/articleTypes.ts        ← the ONLY definition
  ARTICLE_TYPES            18 selectable typologies, each with:
                             { value, label, evergreen: boolean, news: boolean }
  LEGACY_ARTICLE_TYPES     5 aliases: storable, readable, NOT offered for new articles
  isNewsType(v)  isEvergreenType(v)  isSelectableType(v)
```

Then:
- `AdminArticleEditorShell` maps `ARTICLE_TYPES` (and shows a stored legacy value as a
  disabled, clearly-labelled current selection rather than a blank control);
- `CategoryArchiveView` derives its buttons from the types **actually present** in the articles
  it received, so a filter can never offer an empty bucket or hide a real one;
- `EVERGREEN_ARTICLE_TYPES` becomes `ARTICLE_TYPES.filter(t => t.evergreen)` plus whichever
  legacy aliases the owner maps as evergreen;
- `articleService` validates against the union of selectable + legacy, so the column can no
  longer accept an arbitrary string.

**Keep the database column as `String`.** A Prisma enum would require a migration and would
make the five legacy values unreadable without first rewriting data — the opposite of the
preservation constraint. Validating on write gives the same guarantee going forward with zero
schema risk.

### 6.2 Subcategory → retire it in favour of Tags (recommended), or promote it

Two coherent options; the third (leave as-is) is what produced §5.

| Option | What it means | Assessment |
|---|---|---|
| **A — Retire, use Tags (recommended)** | Stop offering a free-text subcategory; keep the column readable for existing rows; let the existing `Tag` taxonomy (42 tags, 45 links, many-to-many, already editable) carry the same intent. Optionally keep rendering the stored value as a kicker for existing articles | **No new table, no duplicate source of truth.** Tags already provide exactly the capability a repeating subcategory would need, and the measured data shows the field is being used as a label, not a class |
| **B — Promote to a real taxonomy** | A `Subcategory` table keyed to `Category`, a select in the editor, optionally an archive route | Honest if the owner wants a **two-level browsable hierarchy with its own URLs**. But it sits beside `Tag` doing a similar job, and 11/11 unique values suggest no demand for grouping yet |
| C — Leave as free text | status quo | Produces §5 indefinitely; not recommended |

**The deciding question for the owner is not technical:** *is a subcategory meant to group
articles for readers (then it needs URLs and a vocabulary → B), or to label one article in a
card (then Tags already do it → A)?*

### 6.3 Names

Whatever is decided, **"Primary Section" and "Category" should be one name in the UI.** Two
labels for one database column is the cheapest confusion in this audit to remove, and it costs
only label text.

---

## 7. Migration requirements and data-preservation risks

### Schema migrations required: NONE for the recommended path

| Change | Migration? |
|---|---|
| One authoritative type constant; three hardcoded lists derive from it | **no** |
| Write-boundary validation of `articleType` | **no** |
| Archive filter derived from present types | **no** |
| Evergreen query fixed | **no** |
| Editor shows a legacy value instead of a blank control | **no** |
| Retiring the subcategory input (option A) | **no** |
| Promoting Subcategory to a table (option B) | **yes** — additive, owner-approved |

### Data normalisation — an editorial decision, not a technical one

The five legacy values could stay forever as aliases, or be remapped to the 18. **Aliasing
needs no data change and carries no risk**, and I recommend it as the first step:

| Legacy | Rows | Plausible target (owner decides) |
|---|---|---|
| `guide` | 6 | `Event Guide`? `Rules & Format`? `How to Watch`? — **ambiguous; 6 articles would need individual judgement** |
| `analysis` | 3 | no direct equivalent among the 18 |
| `feature` | 2 | no direct equivalent among the 18 |
| `explainer` | 0 | — |
| `news` | 0 | `News` (exact, case only) |

**The ambiguity is the point.** `guide` covers six articles that the 18-value typology would
split across several types, and `analysis`/`feature` have no equivalent at all. A blind mapping
would mis-classify real published content. If the owner wants a remap it should be
**article-by-article in the editor**, after the dropdown correctly shows the current value.

### Preservation risks, and how each is contained

| Risk | Containment |
|---|---|
| A remap mis-classifies published articles | Alias first (no data change); remap per article in the UI, never in bulk |
| Editors silently overwrite a legacy type via the blank dropdown | **This is already happening today.** Showing the stored value is itself the fix |
| Tightening validation rejects a stored value | The validator must accept legacy aliases, not only the 18 — otherwise saving an untouched legacy article would fail |
| Retiring the subcategory input loses existing labels | Keep the column and keep rendering it; only stop offering new free text |
| URLs change | **Not possible** — neither field appears in any URL, canonical or sitemap (§3) |
| Issue 03 regression | No overlap: Issue 03 touched discipline content, this touches article classification. The two share no column |

---

## 8. Owner decisions required before implementation

| # | Decision | Recommendation |
|---|---|---|
| **D-04-1** | Article Type: fixed code enum, or DB-configurable entity? | **Fixed code enum** — it drives behaviour, and a configurable list recreates today's defect (§6.1) |
| **D-04-2** | Legacy values: permanent aliases, or remap the data? | **Aliases first** — zero data change, zero risk; remap later per article if wanted |
| **D-04-3** | If remapping: the mapping for `guide` (6), `analysis` (3), `feature` (2) | Needs editorial judgement per article; no safe automatic answer exists |
| **D-04-4** | Which types count as **evergreen**? The current four match 0 articles | Define it on the type definition (`evergreen: boolean`) so the query and the list cannot diverge again |
| **D-04-5** | Subcategory: retire in favour of Tags, or promote to a taxonomy? | **Retire (option A)** unless a browsable two-level hierarchy with URLs is wanted |
| **D-04-6** | Should the archive filter be derived from the types actually present? | **Yes** — a hardcoded filter list is how the current mismatch became invisible |
| **D-04-7** | Rename "Primary Section" or "Category" so one column has one name? | **Yes** — label-only change, removes the main naming confusion |
| **D-04-8** | Keep the unlinked subcategory breadcrumb label? | Keep or drop; either is defensible. If the subcategory gains URLs (option B) it should become a real `BreadcrumbList` item |

---

## 9. Proposed implementation sequence and behavioural test plan

Each step is independently shippable and independently revertible. **None requires a migration
unless D-04-5 selects option B.**

| Step | Scope | Depends on |
|---|---|---|
| **04-A** | Create the single authoritative type module (selectable + legacy aliases, with `evergreen`/`news` flags). No behaviour change yet | D-04-1, D-04-4 |
| **04-B** | Point the editor at it; a stored legacy value renders as the current selection, clearly marked legacy, instead of a blank control. **Stops the silent-overwrite path.** | 04-A, D-04-2 |
| **04-C** | Validate `articleType` at the write boundary against selectable + legacy | 04-A |
| **04-D** | Derive the archive filter from the types present in the received articles | 04-A, D-04-6 |
| **04-E** | Fix the evergreen query to use the flagged types; verify it returns content | 04-A, D-04-4 |
| **04-F** | Subcategory per D-04-5 — retire the input (A) or add the table and select (B, migration) | D-04-5 |
| **04-G** | Label unification per D-04-7 | D-04-7 |

### Behavioural test plan — assert behaviour, not source strings

Following the conventions these suites already use (real database, real mapper, rendered HTML):

1. **Legacy preservation** — an article stored as `guide`, loaded and saved with the type
   untouched, is still `guide` afterwards.
2. **Legacy visibility** — the editor's rendered markup shows `guide` as the selected option
   (asserted on HTML, since the current defect is invisible at the data layer).
3. **Validation** — a type outside selectable ∪ legacy is rejected; every selectable value and
   every legacy alias is accepted.
4. **Evergreen** — with articles of known types, `getEvergreenArticles()` returns exactly the
   flagged ones. A test that would have caught the present bug: **the query must return > 0 for
   the actual seeded data**.
5. **Archive filter** — the rendered filter offers exactly the types present among the given
   articles, and selecting one yields that subset; no button yields an empty list.
6. **JSON-LD** — `News`, `news` and `Event Update` all produce `NewsArticle`; others produce
   `Article` (guards the one behaviour that currently works).
7. **Search** — subcategory and type remain weight-C searchable after any change.
8. **No URL change** — canonical, sitemap entries and `BreadcrumbList` for a published article
   are byte-identical before and after. This is the preservation guarantee that matters most.
9. **Cross-axis isolation** — changing an article's type or subcategory does not alter its
   Category, Discipline, Hub, Event or Tag links.
10. **Issue 03 isolation** — discipline content and the discipline classification are unchanged
    by any article-type work.
11. **RBAC** — unchanged: a role without article-edit permission cannot change either field.
12. **Subcategory (if option B)** — values persist, reorder where applicable, and existing
    free-text values remain readable without migration.

---

## Appendix — files inspected

`prisma/schema.prisma` (Article, Category, SectionConfig, Tag, ArticleTag, Discipline,
ArticleDiscipline, ArticleHub, ArticleEvent, ArticleEdition) · `types/index.ts` ·
`views/admin/AdminArticleEditorShell.tsx` · `lib/cms/articleService.ts` · `lib/mappers.ts` ·
`lib/content.ts` · `lib/seo.tsx` · `lib/seo/` · `lib/search/publicSearch.ts` ·
`views/CategoryArchiveView.tsx` · `components/editorial/ArticleHeader.tsx` ·
`components/editorial/Breadcrumbs.tsx` · `components/sections/HomeArticleFeed.tsx` ·
`app/(public)/articles/[slug]/page.tsx` · `app/(public)/categories/[slug]/page.tsx` ·
`app/sitemap.ts` · `config/routes.ts`

**Repository state:** `main` @ `aafdad2`, level with `origin/main`. Working tree contains only
this report. No code, schema, data or configuration was changed.

**Stop point:** audit only. Issue 04 is not implemented and awaits the decisions in §8.
