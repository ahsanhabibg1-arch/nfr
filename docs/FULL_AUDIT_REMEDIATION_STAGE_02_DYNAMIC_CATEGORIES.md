# Full-Audit Remediation — Stage 02: Dynamic Category & Section Architecture

**Status: COMPLETE AND VERIFIED LOCALLY. Awaiting owner review.**
**Issues: H-01, H-02, H-03, H-04. Stage 03 was not started.**

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`
**Databases touched:** `localhost:5433/nfrguide_dev` and `localhost:5433/nfrguide_test` only.
**No migration was created.** No schema change was required.

---

## 1. Executive summary

An authorized administrator can now create a Category, give it a name and a
description, assign articles to it, publish them, and have its public archive
resolve with the correct identity — **without a developer touching source code**.

Proven end to end on the running dev server:

```
/categories/stage02-live-probe/     HTTP 200   robots=index, follow
    name:  Stage02 Live Probe                        ← admin-set, rendered
    desc:  A category created by an administrator, not by a developer.   ← H-02
/categories/nfr-competition/        HTTP 200   robots=index, follow   ← unchanged
…all five canonical archives        HTTP 200   robots=index, follow   ← unchanged
/categories/still-unknown/          HTTP 200   robots=noindex, nofollow ← Stage 01 intact
```

**The server was never the blocker.** `resolveCategoryId` has always looked the
category up by name in the database and refused an unknown one. What stopped a
sixth category being usable was four things in front of it: a compiled-in list
of five in the editor, a `PrimarySection` union that made a sixth category a
type error, a category archive that read its identity from `config/routes.ts`
alone, and a Settings field nothing consumed.

| Issue | Result |
|---|---|
| **H-01** | **Resolved** — the editor's Primary Section list is the managed `Category` set |
| **H-02** | **Resolved** — `Category.description` reaches the public archive, with documented precedence |
| **H-03** | **Resolved** — one database-aware resolver serves both public surfaces |
| **H-04** | **Resolved as a Builder-first fallback** — not a competing owner. See §7 |

**138 test files, 3,212 passing, 0 skipped.** TypeScript clean. Production build
succeeded. No migration, no production access, no Git operation.

---

## 2. Final ownership architecture

```
               ┌──────────────── EntitySeo (per-entity SEO overrides) ─────────────┐
               │  highest precedence for title / description / canonical            │
               └───────────────────────────────┬───────────────────────────────────┘
                                               │  applied by mergeSeoMeta
      ┌────────────────────────────────────────┴────────────────────────────────┐
      │                    resolveCategoryArchive(slug)                         │
      │                 ONE resolver, both public surfaces                      │
      └───┬──────────────────────┬───────────────────────────┬──────────────────┘
          │                      │                           │
   SectionConfig            Category                  config/routes.ts
   presentation            AUTHORITATIVE               technical routing
   override                editorial entity            + the five defaults
   (displayName,           (identity, slug,            (canonical URLs,
    tagline, hero)          name, description)          EntitySeo ids, sitemap)
```

**Precedence, highest first; each field resolves independently and a blank
override never wins:**

| Field | Order |
|---|---|
| **Name** | `EntitySeo.seoTitle` (metadata only) → `SectionConfig.displayName` → `Category.name` → `config/routes.ts` name → slug |
| **Description** | `EntitySeo.metaDescription` (metadata only) → `SectionConfig.description` → `Category.description` → `config/routes.ts` description |
| **Hero image** | `landing-hero.heroImageUrl` (Visual Builder) → `SectionConfig.heroImage` → none |

**Why this order.** `EntitySeo` is an explicit SEO instruction and outranks
everything. `SectionConfig` is the per-section override an administrator set in
Settings — deliberate and specific. `Category` is the general editorial record.
`config/routes.ts` is the shipped default for the five foundational sections.

**Ownership boundaries honoured:**

- **Category is authoritative** for identity, slug, name, description and
  article classification. No competing registry was introduced.
- **SectionConfig stays presentation-only.** No column was deleted and no
  record removed.
- **`config/routes.ts` keeps the canonical routes**, EntitySeo section ids,
  navigation fallback and sitemap keys — but no longer decides whether an
  administrator-created category can exist or be assigned.
- **Navigation is untouched.** Creating a category adds nothing to any menu;
  the Navigation CMS remains the sole owner of menu placement.

---

## 3. Exact files changed

**Modified (8)**

| File | Change |
|---|---|
| `types/index.ts` | `Article.category` widened from `PrimarySection` to `string`; `PrimarySection` kept and documented as the five foundational sections |
| `views/admin/AdminArticleEditorShell.tsx` | new `categories` prop and `CategoryOption` type; `PRIMARY_SECTIONS` → `FALLBACK_SECTIONS`; dropdown renders `sectionOptions`; category state widened to `string` |
| `app/admin/(dashboard)/articles/new/page.tsx` | resolves and passes `listCategories()` |
| `app/admin/(dashboard)/articles/[id]/edit/page.tsx` | same |
| `lib/content.ts` | new `resolveCategoryArchive(slug)` + `CategoryArchiveIdentity` |
| `app/(public)/categories/[slug]/page.tsx` | metadata and view both use the resolver; B-01 condition now `!identity.known` |
| `lib/cms/sectionLandingData.ts` | reads `SectionConfig.heroImage` into the hero slot's data |
| `components/blocks/LandingBlocks.tsx` | Builder-first hero precedence |

**New (1)** — `tests/full-audit-stage02-categories.test.ts` (27 tests).
**Updated (1)** — `tests/full-audit-stage01-b01.test.ts`: one source-pattern
assertion, see §12.

**No migration. No Prisma schema change. No record deleted. No route added.**

---

## 4. H-01 — Category selection is fully dynamic

**Not solved by changing the dropdown alone.** Every server-side assumption was
audited:

| Layer | Finding | Action |
|---|---|---|
| `resolveCategoryId` | **already dynamic** — `category.findFirst({ where: { name } })`, refuses unknown | none needed |
| `subcategoriesBySection` | **already keyed by `category.name`** from the database | none needed |
| `PrimarySection` union | a sixth category was a **type error** | widened `Article.category` to `string` |
| Editor dropdown | compiled-in five | renders managed categories |
| Editor state / casts | typed `PrimarySection` | widened to `string` |
| Two editor server pages | did not load categories | now pass `listCategories()` |

The compiled-in list survives as `FALLBACK_SECTIONS`, used only when a caller
supplies no categories (a test, an older entry point), so the control is never
empty. It has never been a security boundary — the server validates by database
lookup.

**Historical compatibility:** the article's current category is always offered,
even when it is no longer in the managed list, so an article classified under a
renamed or removed category shows what it actually stores rather than reading as
unclassified — the same rule the Article Type selector follows.

**Verified (§12 requirements 1-8):** a sixth category is created, appears in the
selector, is assignable, saves, reloads through `getEditableArticle`, can be
reassigned and back, and a nonexistent category is still refused with
`Unknown category`. Existing articles keep their original categories — asserted
by counting.

---

## 5. H-02 — `Category.description` is functional

It was editable in Editorial Organization, selected by `getCategoryBySlug`, and
then **ignored**: the page used `config/routes.ts`. It now flows through
`resolveCategoryArchive` into both the metadata description and the rendered
archive.

**Fallback when empty, documented:** a blank or whitespace-only value never
wins — resolution falls through to the next source, and when nothing supplies a
description the page keeps its existing generated sentence
(*"Explore comprehensive articles, analysis, and spectator intelligence for …"*).

**Canonical sections do not unexpectedly change:** their `SectionConfig`
override still outranks `Category.description`, and `EntitySeo` still outranks
both. Verified live — all five canonical archives render exactly as before.

---

## 6. H-03 — One metadata resolution path

`/[section]` applied the admin's `SectionConfig` override through the async
`getSectionMeta`; `/categories/[slug]` called the **synchronous**
`getSectionMetaByCategorySlug`, which cannot read the database. The same section
under two URLs disagreed about its own name.

**Migrated safely, not by flipping a helper to async.** All consumers were
identified first: `getSectionMetaByCategorySlug` had exactly **two call sites,
both inside the category page**. It is therefore left in place, unchanged, for
any other caller, and the page moved to the new async `resolveCategoryArchive`.
`getSectionMeta` and the 20+ consumers of `config/routes.ts` `PRIMARY_SECTIONS`
(sitemap, navigation fallback, landing SEO, analytics, search, breadcrumbs) were
**not touched**.

**Verified:** with a `SectionConfig` override set, `resolveCategoryArchive`
and `getSectionMeta` now return the same name and description; with a blank
override both fall through correctly. Canonical URLs are unchanged, no duplicate
indexable archive was introduced (the sitemap still lists exactly five), and
ISR/`revalidatePath` behaviour is untouched.

---

## 7. H-04 — Section hero image, as a Builder-first fallback

**The conflict was real and is resolved without a competing owner.** The section
hero is Visual-Builder property `landing-hero.heroImageUrl`, wired in Stage 04
Task D. `SectionConfig.heroImage` was saved by Settings and read by nothing —
`SectionMeta` has no such field.

**Deterministic precedence, Builder first:**

1. `landing-hero.heroImageUrl` set → **it wins, always**. SectionConfig never
   overwrites an explicitly configured Builder image.
2. Builder property empty → `SectionConfig.heroImage` applies.
3. Neither → the hero renders exactly as before, with no image.

**Scope limit, stated plainly:** the Settings value applies only where a
`landing-hero` block exists in the layout. It does not introduce a hero where
the Builder placed none — that would be exactly the competing-owner behaviour
§8 forbids.

**Safety:** `SectionConfigSchema` already validates `heroImage` as
`z.string().url()`, so an invalid URL cannot be saved; an empty value renders no
`<img>`, so there is no broken image and no layout shift.

All three precedence branches are tested by rendering the real block.

---

## 8. Five-section compatibility evidence

| Check | Result |
|---|---|
| Names, slugs, database ids | unchanged — `NFR Competition \| NFR Entertainment \| NFR Events & Shopping \| NFR Plan & Watch \| More Rodeo` in both databases |
| Canonical section URLs (`/competition/` …) | unchanged — `config/routes.ts` untouched |
| `/categories/<each>/` | all five HTTP 200 · `index, follow` |
| Article assignments | unchanged; the new category held only this suite's own articles |
| Navigation | unchanged — creating a category adds no menu entry |
| Visual Builder layouts | unchanged — no registry or layout change |
| EntitySeo / FAQ records | unchanged — still keyed by `Category.id` |
| Redirects, workflow, RBAC | untouched |
| Sitemap | still exactly five category archives |

---

## 9-11. New Category end to end · Editor · Subcategory · Public archive

Covered by `tests/full-audit-stage02-categories.test.ts` — **27 tests**:

| Area | Covered |
|---|---|
| Category management | create (slug derived), edit name + description, persistence, duplicate name refused, **Author refused and nothing written**, slug not rewritten by an edit |
| Article Editor | sixth category appears; fallback when no prop; current value always offered; `sectionOptions` is the render source, not the compiled list; `Article.category` no longer a closed union |
| Assignment | save → reload via `getEditableArticle`; reassign and back; unknown category refused |
| **Subcategory (04-B intact)** | a subcategory under the new category is offered for it and **not** for any other section; cross-section assignment refused; in-section assignment accepted; legacy label text untouched |
| Public archive | lists only that category's **PUBLISHED** articles — a draft in the same category is absent; every row carries the right category |
| Resolver | admin description used; canonical section resolves through the same path; `SectionConfig` override reaches `/categories/`; blank override falls through; unknown slug still unknown |
| Hero | Builder wins; SectionConfig applies only when Builder is empty; neither → no image |
| Sitemap | exactly five category URLs; the new category is absent |

**No Subcategory records were created outside the test's own fixtures, and no
legacy mapping or backfill ran.**

---

## 12. SEO, canonical, sitemap and cache

- **No duplicate indexable content.** The sitemap still contains exactly the
  five canonical category archives; an administrator-created archive is
  reachable and indexable but **not** auto-submitted. Adding it to the sitemap
  would be a deliberate policy change and was not made.
- **Canonical URLs stable.** `/categories/<slug>/` for every category;
  canonical section routes untouched.
- **Stage 01 (B-01) intact** — unknown slugs still `noindex, nofollow`, verified
  live and by test.
- **Cache invalidation unchanged.** `taxonomy-actions` already calls
  `revalidatePath('/admin/editorial-organization/')` and
  `revalidatePath('/', 'layout')` on every category mutation, which covers the
  archives; ISR windows are unchanged.

### One existing test was updated — and why it is not a weakening

`tests/full-audit-stage01-b01.test.ts` asserted the **source pattern**
`const unknownCategory = !meta && !catRow`. Stage 02 moved that question into
`resolveCategoryArchive`, so the line now reads `!identity.known`. The behaviour
is identical and is still pinned by the same file's database-backed cases
(unknown → `noindex, nofollow`; canonical and managed → `index, follow`). The
assertion now requires that the flag is **derived** and never the literal
`false`, which is the property that matters. No behavioural assertion was
removed or relaxed.

---

## 13. RBAC and security

| Check | Result |
|---|---|
| Category CRUD permission | `taxonomy.manage`; an **Author is refused and the row count is unchanged** |
| Article classification | existing `article.*` gates untouched |
| Server-side category validation | `resolveCategoryId` refuses an unknown name — tested |
| Slug uniqueness | duplicate name refused by `createCategory` — tested |
| Slug stability | an edit does not rewrite the slug, so existing article relationships and the archive URL survive — tested |
| Cross-category protection | service **and** composite foreign key both still refuse — tested |
| XSS | category names and descriptions render as ordinary React children, so they are escaped; no raw-HTML injection path was introduced |
| Missing category reference | `resolveCategoryArchive` returns `known: false` → noindex, no crash |

No RBAC rule or publication gate was weakened.

---

## 14. Test counts, TypeScript, build

| Run | Files | Passed | Skipped |
|---|---|---|---|
| Before Stage 02 | 137 | 3,185 | 0 |
| **After Stage 02** | **138** | **3,212** | **0** |

+1 file and +27 tests, accounting for the total exactly. **No failures.**

- `npx tsc --noEmit` — **clean**
- `npm run build` — **succeeded**, `BUILD_ID = vHGVwWf2pN30oCptTBvcK`
- `git diff --check` — clean
- Encoding scan, 64 changed/untracked files — **no BOM, no mojibake**

### A repair worth recording

While moving a hook in `AdminArticleEditorShell.tsx`, a regex-based edit of mine
spliced a block of the component body up into the import section. TypeScript
caught it immediately (`'existingArticle' used before its declaration`). The
file carries uncommitted work from Batches 04-A…04-E.2, so `git checkout` was
not an option; it was repaired by moving the 16 misplaced lines back, with
assertions on both the extracted block and the insertion point. Verified
afterwards by 5 editor suites (**147 tests**), a clean typecheck and an encoding
scan. **No content was lost.**

---

## 15. Git and database preservation

```
branch : main
HEAD   : aafdad296363e4b69d3b01594540116f9b58f39d   (unchanged)
stashes: 0
tree   : 32 modified + 32 untracked
```

| | `nfrguide_dev` | `nfrguide_test` |
|---|---|---|
| Articles | **11** — unchanged | **17** — unchanged |
| Categories | **5** — the five foundational, unchanged | **5** — unchanged |
| Subcategories | 0 | 0 |
| Live-probe category | created, then **removed** (verified) | — |
| Migrations | none created, none run | none |
| Production database | **never connected to** | — |

All uncommitted work from Issue 03 and Batches 04-A…04-E.2, plus Stage 01, is
intact.

---

## 16. Remaining risks and limitations

| # | Item | Severity | Note |
|---|---|---|---|
| R-1 | An administrator-created category archive is **not in the sitemap** | Low | Deliberate. Auto-including every category would be a policy change; §12 asked for an explicit justification before implementing one. **Owner decision.** |
| R-2 | A created category has **no canonical short route** (`/western-lifestyle/`) | Low | By design — §9 forbids auto-creating a top-level route per category. Its archive lives at `/categories/<slug>/` and can be added to Navigation manually |
| R-3 | `ArticleHeader` breadcrumbs fall back to `/competition/` for a non-canonical category | **Low–Medium** | Pre-existing, found during this stage, **not fixed** — it is a breadcrumb link, outside H-01…H-04, and fixing it touches article rendering. Recommend it as the first item of a follow-up |
| R-4 | `components/sections/LatestCoverage.tsx` keeps its own hardcoded category filter list | Low | A homepage widget's filter, not category availability. Out of scope; recorded |
| R-5 | `SectionConfig.heroImage` applies only where a `landing-hero` block exists | Low | Stated in §7; the alternative would make Settings a competing visual owner |
| R-6 | Two description fields still exist (`Category` + `SectionConfig`) | Low | §3B forbids deleting columns in this stage. Precedence is now documented and tested; consolidation is a later decision |
| R-7 | Verified locally only | — | Not deployed. No production claim is made |

**Browser-level verification was not performed** — no automated browser driver
is available here. Verification was by service calls, server-rendered markup,
HTTP probes against the dev server, and the test suite.

---

## 17. Explicit confirmations

| | |
|---|---|
| **Stage 03 started?** | **NO** |
| Migration created | **none** — no schema change was required |
| Production database | **UNTOUCHED** |
| Production deployment / UAT | **not performed** |
| BKP-01 | **not started** |
| Legacy Subcategory mapping / backfill | **not started** |
| Git | **untouched** — no commit, push, branch, reset, stash or rebase |
| Records or columns deleted | **none** |
| Navigation changed | **no** |
| Visual Builder ownership | **preserved** — Builder wins the hero, always |
| Existing tests weakened | **none** (one source-pattern assertion updated, §12) |

**Stopping here for owner review.**
