# Full-Audit Remediation — Stage 03: Final CMS, Category, SEO & Editorial Integration

**Status: COMPLETE AND VERIFIED LOCALLY. Awaiting owner review.**
**This was the final planned remediation stage. No Stage 04 was invented.**

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`
**Databases touched:** `localhost:5433/nfrguide_dev` and `localhost:5433/nfrguide_test` only.
**No migration was created.** No schema change was required.

---

## 1. Executive summary

All six approved items are implemented and verified behaviourally — not by the
presence of code or a control.

**Proven live, on the running dev server**, by creating an administrator category
and a published article, probing, then removing every fixture:

```
/categories/s03-live/          HTTP 200
/articles/s03-live-article/    HTTP 200
  visible breadcrumb href : /categories/s03-live/
  breadcrumb JSON-LD item : http://localhost:3000/categories/s03-live/   ← they agree
  publisher (default)     : "NFRGuide"
  publisher (configured)  : "Rodeo Desk Media"                           ← H-06
  sitemap /categories/    : the five canonical + s03-live                ← R-1
```

**139 test files, 3,241 passing, 0 skipped.** TypeScript clean. Production build
succeeded. No migration, no production access, no Git operation.

Four pre-existing tests failed mid-stage and **every one was a real signal, not
noise** — including the project's own test-quality gate catching a weak test I
had written. All four were diagnosed and fixed inside this stage (§15).

---

## 2. Completed issue checklist

| Issue | Classification | Evidence |
|---|---|---|
| **R-3** Dynamic article breadcrumbs | **VERIFIED COMPLETE** | §4 — rendered href and JSON-LD url compared as outputs; mutation-tested |
| **R-1** Conditional dynamic category sitemap | **VERIFIED COMPLETE** | §5 — empty / draft-only / archived / noindex all excluded; mutation-tested |
| **R-4** Homepage category filter | **VERIFIED COMPLETE** | §6 — derived from the feed; rendered markup asserted |
| **G-03** Tag rename | **VERIFIED COMPLETE** | §7 — id and every `ArticleTag` row preserved, asserted before/after |
| **H-06** Dynamic JSON-LD publisher | **VERIFIED COMPLETE** | §8 — configured value and fallback both proven, live and by test |
| **H-05** `SectionConfig.visible` | **VERIFIED COMPLETE** (deprecated, retained) | §9 — decision documented in schema; "nothing reads it" asserted by a repository scan |

---

## 3. Exact files changed

**New (2)**

| File | Purpose |
|---|---|
| `lib/seo/articleBreadcrumb.ts` | the shared, pure, synchronous category-crumb resolver |
| `tests/full-audit-stage03-final.test.ts` | 29 behavioural tests |

**Modified (14)**

| File | Change |
|---|---|
| `types/index.ts` | `Article.categorySlug?: string` |
| `lib/mappers.ts` | carries `category.slug` from the join already in `articleInclude` |
| `components/editorial/ArticleHeader.tsx` | uses the shared resolver; the `/competition/` fallback is gone |
| `app/(public)/articles/[slug]/page.tsx` | breadcrumb JSON-LD uses the same resolver; passes `publisherName`; dead `categorySlug` helper removed |
| `app/(public)/disciplines/[slug]/page.tsx` | passes `publisherName` |
| `lib/seo/sitemapEntries.ts` | conditional inclusion of eligible managed categories |
| `components/sections/LatestCoverage.tsx` | filter tabs derived from the feed |
| `lib/cms/taxonomyService.ts` | `updateTag` — rename in place |
| `app/admin/taxonomy-actions.ts` | `updateTagAction` |
| `views/admin/AdminEditorialOrgPage.tsx` | per-tag **Rename** control |
| `lib/cms/settingsService.ts` | `getPublicSiteName()` — narrow, un-gated read |
| `lib/seo.tsx` | `DEFAULT_PUBLISHER_NAME` + optional `publisherName` on both builders |
| `prisma/schema.prisma` | **comment only** on `SectionConfig.visible` |
| `tests/stage09-seo-integrity.test.ts`, `tests/full-audit-stage02-categories.test.ts` | updated to the approved contracts (§15) |

**`prisma migrate diff` reports "This is an empty migration"** — the schema
annotation changed no field, type or constraint.

---

## 4. R-3 — Breadcrumb resolution evidence

**The defect:** `ArticleHeader` matched the category name against the five
compiled-in sections and, finding nothing, used `categoryPath = sectionEntry?.path || '/competition/'`.
An administrator-created category therefore linked to **NFR Competition**, and
the visible trail disagreed with the JSON-LD, which slugified the name itself.

**The rule, in one pure function** (`articleCategoryCrumb`):

1. a canonical section keeps its established URL (`/competition/`, `/plan-watch/`, …);
2. anything else uses `/categories/<slug>/`, taken from `Article.categorySlug`;
3. no slug (a historical record, a hand-built fixture) → slugified name, **still
   inside `/categories/`**, so a missing or renamed category can never reach an
   unrelated section.

**Pure and synchronous on purpose**, reading only fields the article already
carries from one join — so the Server Component and the client header call the
same function, cannot diverge, and **no query is added**: no N+1 is possible.

**Evidence.** The test renders `ArticleHeader` and builds the JSON-LD, then
compares the two real outputs for a canonical section, a managed category and a
slug-less category. Live: visible `href="/categories/s03-live/"` and JSON-LD
`"item":".../categories/s03-live/"` — identical, neither `/competition/`.

**Mutation-tested:** restoring the `/competition/` fallback **failed 5 tests**;
restored and re-verified.

---

## 5. R-1 — Dynamic sitemap eligibility evidence

A managed category enters the sitemap only when **all** of these hold:

| Condition | How |
|---|---|
| archive resolves | a `Category` row exists — that list is the loop's input |
| ≥1 eligible PUBLISHED article | counted from `articles`, already filtered by `publicArticleWhere()`, so drafts, archived and hidden fixtures are excluded by construction |
| SEO allows indexing | `entity('CATEGORY', id)` attaches the stored `EntitySeo`; the **shared evaluator** applies noindex |
| canonical correct | `/categories/<slug>/` |
| not a duplicate | the five canonical archives are skipped explicitly, and the evaluator de-duplicates by URL |

**No minimum article count was invented** beyond "has published content".
**Sitemap inclusion cannot override SEO Intelligence** — noindex and canonical
are decided by the same evaluator every other family uses. **No extra query:**
`categories` and `articles` were already loaded.

**Evidence (tests, in order):** an empty managed category → excluded (5 URLs);
a draft-only category → still excluded; one published article → included
**exactly once** (6 URLs, all five canonical still present, no duplicates); an
editor `noindex` → excluded again (5); archiving the article → excluded again.
Live sitemap showed the five canonical plus `s03-live`.

**Mutation-tested:** dropping the published-content requirement **failed 3
tests**; restored and re-verified.

---

## 6. R-4 — Homepage filter behaviour

`LatestCoverage` held its own hardcoded list of the five section names, so an
administrator-created category could never appear on the homepage filter.

The tabs are now **derived from the articles the block was given**. That satisfies
both halves of the requirement: a category becomes available with no code change,
and **not every new category is displayed** — only one whose articles the
Builder's own selection actually contains. Builder ownership of *what the
homepage shows* is untouched; design, order and responsive behaviour are
unchanged; published-content filtering is not weakened (the block filters the
list it was handed).

**Evidence:** rendering with a `Western Lifestyle` article shows that tab;
rendering without one does not; an empty feed still renders `All` and does not
crash.

---

## 7. G-03 — Tag rename and association preservation

`updateTag` **updates the row**. It touches `ArticleTag` not at all, so every
association survives by construction rather than by careful copying.

| Property | Decision |
|---|---|
| id | **unchanged** — it is the association key, an identity, not a label |
| slug | moves with the name; no public tag route exists for an old slug to serve |
| uniqueness | checked for a readable message; the unique index is what makes it true, and a `P2002` from a concurrent rename is translated into the same conflict error |
| same-name rename | a no-op, not an error |
| RBAC | `taxonomy.manage` at the service boundary |
| revalidation | the existing `rev()` in `taxonomy-actions` |

**Evidence:** a tag attached to two articles is renamed; the id is identical,
the `ArticleTag` rows are identical before and after, and the article reloads
carrying the new name. A duplicate name is refused with nothing changed; an
unknown id is `not_found`; an **Author is refused and the row is unchanged**.
A structural test confirms the implementation contains no `tag.delete` or
`tag.create`.

---

## 8. H-06 — JSON-LD publisher verification

**The authoritative value already existed** and did not need inventing:
`SystemSetting.site_identity.siteName`, default `'NFRGuide'`, already editable
in Admin → Settings. No new branding model was created.

- `getPublicSiteName()` is a **narrow, un-gated** read — the site name is printed
  on every page, so structured data does not need `system.config` rights.
- `SystemSetting` has **no draft/published split**, so there is no draft branding
  to leak; the stored value is the live one.
- The builders stay **synchronous**: the page resolves the name and passes it, as
  04-E.1 does for `schemaType`. Four suites pin those signatures.
- Omitted, blank, or a failed read → `DEFAULT_PUBLISHER_NAME`. A page never
  loses its publisher.
- Author identity is unchanged and separate (`Person` vs `Organization`).

**Evidence, live:** with nothing configured the article declared `"NFRGuide"`;
after setting the site name it declared `"Rodeo Desk Media"`; the setting was
then removed.

---

## 9. H-05 — `SectionConfig.visible` decision

**Decision: formally DEPRECATED in code and documentation; the column is
RETAINED.** Recorded as a `///` comment on the field itself, so the next reader
finds it where they would look.

**Why not implement it.** The Navigation CMS is already the single authority for
whether a section appears in a menu. A second visibility flag could hide a
section's menu entry while its published articles and canonical URL stayed live —
two owners disagreeing about one question, which is the defect class this whole
programme removes.

**Why not drop it.** That needs a migration, and a migration for cleanup alone is
not worth the risk. No admin control writes it.

**Evidence:** a repository scan over `lib`, `app`, `views` and `components`
asserts that **no code reads `sectionConfig…​.visible`** — the assertion fails if
anyone starts.

---

## 10. Category / Section / SEO ownership preserved

Stage 02's precedence is intact and still tested:

| Field | Order |
|---|---|
| Name | EntitySeo (metadata) → SectionConfig.displayName → Category.name → canonical default |
| Description | EntitySeo (metadata) → SectionConfig.description → Category.description → canonical default |
| Hero image | Visual Builder `landing-hero.heroImageUrl` → SectionConfig.heroImage → none |

`Category.description` and `SectionConfig.description` are both retained; neither
was merged or deleted. No competing visual owner was introduced — the Builder
still wins the hero, always.

---

## 11. End-to-end workflow results (§10 of the brief)

| # | Step | Result |
|---|---|---|
| 1-2 | create a managed Category, edit name + description | ✅ |
| 3 | appears in the Article Editor | ✅ `listCategories` contains it |
| 4-5 | create an article with it, save and reload | ✅ via `getEditableArticle` |
| 6 | associate a managed Subcategory | ✅ section-scoped; cross-section still refused |
| 7 | publish through the existing workflow | ✅ |
| 8 | public page and breadcrumb | ✅ 200; crumb → `/categories/<slug>/`, never `/competition/` |
| 9 | breadcrumb JSON-LD | ✅ identical url to the rendered href |
| 10 | category archive content | ✅ published only; a draft in the same category is absent |
| 11 | sitemap eligibility | ✅ appears once published |
| 12 | homepage filtering | ✅ the tab appears when its articles are in the feed |
| 13-14 | rename a tag, associations intact | ✅ id and every `ArticleTag` row preserved |
| 15 | archive the article → sitemap updates | ✅ the category drops out again |
| 16 | restore fixtures, nothing persists | ✅ verified — see §17 |

---

## 12. RBAC and security verification

| Check | Result |
|---|---|
| Tag rename permission | `taxonomy.manage`; **Author refused, row unchanged** |
| Category CRUD | unchanged; Author still refused |
| Invalid tag reference | `not_found`, no write |
| Invalid category reference | `Unknown category`, no write |
| Duplicate tag name | refused; both rows unchanged |
| Concurrent rename | unique index enforces it; `P2002` becomes a readable conflict |
| Publisher read | narrow accessor; **no `system.config` rights granted to a public page** |
| Draft/published separation | `SystemSetting` has no draft channel; Builder draft/published untouched |
| Draft & archived leakage | archives and sitemap both exclude them — tested |
| Navigation | still administrator-controlled; nothing auto-added |

No RBAC rule or publication gate was weakened.

---

## 13. Five-section compatibility

| Check | Result |
|---|---|
| Canonical URLs (`/competition/` …) | unchanged — the crumb resolver returns them first |
| Category names, slugs, ids | unchanged in both databases |
| The five canonical sitemap archives | all present, in every sitemap assertion |
| Visual Builder layouts | untouched |
| Navigation | untouched |
| EntitySeo / FAQ | untouched |

---

## 14. Stage 01 and Stage 02 regression

- **Stage 01 (B-01)** — an unknown category slug is still `noindex`; asserted in
  the Stage 03 suite and by Stage 01's own suite, both passing.
- **Stage 02** — the resolver still returns `sectionKey: 'competition'` and
  `categoryKey: 'NFR Competition'` for a canonical section, and `known: false`
  for an unknown slug. Its whole suite passes, with one assertion updated to the
  newly approved sitemap rule (§15).

---

## 15. The four mid-stage failures — all real, all fixed here

| Failure | Cause | Fix |
|---|---|---|
| `stage02 … sitemap lists exactly five` | **R-1 deliberately changes this** by owner decision | assertion moved from a fixed count to the **rule**: the five canonical are present, no duplicates, and this suite's category is included *exactly when* it has published content. Stronger, not weaker |
| `stage09 … publisher is a hardcoded brand string` | **H-06 deliberately changes this** | updated to the new contract and converted from a source grep to a behavioural assertion: configured name used, safe default otherwise |
| `stage03-test-quality-gate … no NEW source-text test may claim a behaviour` | **the project's own gate caught a weak test of mine** — "the visible header and the JSON-LD use the SAME resolver" proved a behaviour by grepping two files | **converted to a real behavioural test**: it now renders `ArticleHeader`, builds the JSON-LD, and compares the href against the url. The gate's `[structural]` escape hatch was deliberately *not* used |
| `stage08-quality-gate-enforcement` | same root cause | resolved by the same conversion |

No test was weakened to make it pass.

---

## 16. New tests, full counts, TypeScript, build, encoding

**`tests/full-audit-stage03-final.test.ts` — 29 passed / 29**, covering every
fix plus its failure cases.

| Run | Files | Passed | Skipped |
|---|---|---|---|
| Before Stage 03 | 138 | 3,212 | 0 |
| **After Stage 03** | **139** | **3,241** | **0** |

+1 file and +29 tests, accounting for the total exactly. **No failures.**

- `npx tsc --noEmit` — **clean**
- `npm run build` — **succeeded**, `BUILD_ID = ilao4RCjUrzJkNZ8V39VS`
- `git diff --check` — clean
- Encoding scan, 73 changed/untracked files — **no BOM, no mojibake**
- `prisma migrate diff` — **"This is an empty migration"**

**Mutation testing (§12):** both critical new behaviours were mutation-tested.
Restoring the `/competition/` breadcrumb fallback killed **5** tests; removing
the sitemap's published-content requirement killed **3**. Both patches were
verified applied (byte counts recorded) and both were restored and re-verified.

---

## 17. Database preservation

| | `nfrguide_dev` | `nfrguide_test` |
|---|---|---|
| Articles | **11** — unchanged | **17** — unchanged |
| Categories | **5** — the five foundational | **5** |
| Tags | 42 | 45 |
| Subcategories | 0 | 0 |
| `SystemSetting` | **0** — the probe's `site_identity` was removed | 2 (other suites' own) |
| Live fixtures | category + article + setting created, then **removed** | — |
| Stage 02/03 fixture scan | **no leaks found** (searched `S03`, `s03`, `Stage03`, `stage02`, `Western Lifestyle`) | same |
| Migrations | none created, none run | none |
| Production database | **never connected to** | — |

---

## 18. Git status and uncommitted-work preservation

```
branch : main
HEAD   : aafdad296363e4b69d3b01594540116f9b58f39d   (unchanged)
stashes: 0
tree   : 38 modified + 35 untracked
```

No commit, push, branch, reset, rebase, stash or force push. **No destructive
Git command was used at any point, including to repair files.** All uncommitted
work from Issue 03, Batches 04-A…04-E.2 and Stages 01-02 is intact.

---

## 19. Remaining limitations

| # | Item | Note |
|---|---|---|
| L-1 | **Browser-level verification not performed** | No automated browser driver is available here. Verification was by service calls, server-rendered markup, HTTP probes and the test suite |
| L-2 | **Local only** | Nothing is deployed. No production claim is made anywhere in this report |
| L-3 | A managed category still has **no canonical short route** | By design (Stage 02 §9) — its archive is `/categories/<slug>/`, addable to Navigation by hand |
| L-4 | Tag ids keep their original derivation | A renamed tag's id still reflects its first name. Deliberate: the id is the association key, and changing it would break the links the rename exists to preserve |
| L-5 | `SectionConfig.visible` column remains | Deprecated, not dropped — §9 |
| L-6 | On-hold items untouched | BKP-01, legacy Subcategory mapping, backfill, production migration and deployment were not reopened |

---

## 20. Final readiness assessment

**Code readiness: READY, pending owner review.** Every approved audit finding
from the Full-System Audit is now either fixed and behaviourally verified, or
formally deprecated with the reasoning recorded.

**Production readiness: STILL BLOCKED**, and not by anything in this stage. The
two blockers from the Combined Final Review are unchanged:

1. **BKP-01** — no restore has ever been verified for the production database.
2. **The legacy Subcategory mapping** — all 11 rows remain `PENDING_OWNER_APPROVAL`.

Plus two migrations (04-B, 04-E) still pending for production. **Stage 03 itself
adds no migration and no deployment prerequisite.**

| | |
|---|---|
| Stage 04 invented? | **NO** — this was the final planned stage |
| Production deployment / migration / writes | **NOT PERFORMED** |
| New database migrations | **none** |
| BKP-01 / mapping / backfill | **not reopened** |
| Git commit or push | **none** |

**Stopping here for owner review.**
