# Issue 04-C — Legacy Subcategory Mapping Review

**Status: PROPOSAL ONLY. Every row is `PENDING_OWNER_APPROVAL`.**
**Nothing was created, merged, deleted or backfilled.**

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`
Machine-readable companion: `apps/web/prisma/taxonomy/subcategory-mapping.json`

---

## 0. The data this review is based on

Read-only, from **both** databases — so the analysis is not inferred from the local copy alone:

| | Development (`nfrguide_dev`) | **Production (`defaultdb`, Aiven)** |
|---|---|---|
| Published articles | 11 | **11** |
| Article types | `guide` 6 · `analysis` 3 · `feature` 2 | **identical** |
| Legacy subcategory labels | 11 distinct, each used once | **identical** |
| Labels spanning >1 section | 0 | **0** |
| `Subcategory` table | present (04-B migration applied) | **absent — 04-B not deployed** |
| `Article.subcategoryId` | present, all NULL | **absent** |

Production was read inside a forced `READ ONLY` session. **The two databases hold the same
eleven labels in the same five sections**, so the recommendations below apply to production
unchanged.

---

## 1. How each label was judged

Four questions, in order. A label has to survive all four to deserve a managed Subcategory:

1. **Does another axis already own it?** Article Type (code typology), Tag (42 rows, open),
   Discipline (7 entities with their own pages), Rodeo Hub/Event/Edition (coverage entities).
   A label that restates one of those would create a second source of truth.
2. **Is it a topic or a genre?** A subcategory groups *what an article is about*. "Analysis" is
   *how it is written* — that is Article Type's job.
3. **Would a reader recognise it as a section of the site?** House-style coinages read as
   internal vocabulary.
4. **Can it plausibly hold three or more articles?** Below that an archive page is a
   near-duplicate of a single article — the thin-archive problem that drives the indexing
   threshold (spec §6.3).

**Every label currently has exactly one article**, so question 4 is answered on editorial
intent, not on present counts. That is the judgement the owner is being asked to confirm.

---

## 2. The mapping proposal

| # | Section | Legacy label | **Proposed** | Target name → slug | Rationale | SEO / thin-archive |
|---|---|---|---|---|---|---|
| C-1 | NFR Competition | Championship Analysis | **RETAIN** | — | A **genre**, not a topic — and this very article's Article Type is `analysis`. Managing it would duplicate Article Type (04-A) on a second axis | n/a — no archive created |
| C-2 | NFR Competition | Discipline Deep Dive | **RETAIN** | — | Duplicates the **Discipline** axis, which already has 7 entities, its own URLs and article links (`ArticleDiscipline`). Issue 03 just completed that CMS | n/a |
| C-3 | NFR Competition | Scoring & Tactics | **CREATE** | Scoring & Tactics → `scoring-tactics` | How events are judged and how competitors play them. Durable, reusable, and owned by no other axis. The strongest candidate in this section | Needs ≥3 articles before its archive is indexable |
| C-4 | NFR Entertainment | Concerts & Nightlife | **CREATE** | Concerts & Nightlife → `concerts-nightlife` | Residencies, after-parties, evening programming. The clearest recurring topic this section has, and a reader would recognise it | Same threshold |
| C-5 | NFR Events & Shopping | Exhibition & Tack | **CREATE** | Exhibition & Tack → `exhibition-tack` | Trade-show floors, vendors, western gear — the section's actual subject matter | Same threshold |
| C-6 | NFR Plan & Watch | Accommodations | **CREATE** | Accommodations → `accommodations` | Where to stay. Evergreen, plainly named, obviously extensible | Same threshold |
| C-7 | NFR Plan & Watch | Broadcast Intelligence | **CREATE** | **Watching & Broadcast** → `watching-broadcast` | The topic is real; the *name* is house-style coinage. "Broadcast Intelligence" is not language a reader uses. **Renaming is proposed** — the legacy label stays on the article either way | Same threshold |
| C-8 | NFR Plan & Watch | Spectator Strategy | **MERGE** → C-9 | *(into)* Visiting Las Vegas → `visiting-las-vegas` | "Spectator Strategy" and "Venue Navigation" are the same job — getting around the arena and the city. Two one-article subcategories would be thinner than one two-article subcategory | **Merging is itself the SEO argument** |
| C-9 | NFR Plan & Watch | Venue Navigation | **CREATE** | Visiting Las Vegas → `visiting-las-vegas` | The CREATE half of the merge. Named for the reader rather than the arena | Starts with 2 articles |
| C-10 | NFR Plan & Watch | Tickets | **CREATE** | Tickets → `tickets` | Buying, pricing, resale traps. Unambiguous and durable | Same threshold |
| C-11 | More Rodeo | Global Rodeo Hubs | **RETAIN** | — | Duplicates the **Rodeo Hub** axis, which is a first-class entity with its own pages and admin | n/a |

**Totals if approved as proposed:** 7 CREATE · 1 MERGE · 3 RETAIN →
**7 managed subcategories, 8 articles attached, 3 left legacy-only.**

---

## 3. What RETAIN means, precisely

**Not deletion.** The article keeps its legacy `subcategory` text, the public page keeps showing
it (the mapper falls back to it), and nothing is rewritten. RETAIN records a decision that the
label is *not* a reusable taxonomy entry — which is why the backfill still requires an explicit
entry for it rather than treating it as unmapped.

The three RETAIN proposals share one reason: each restates an axis that already exists and is
already managed. Creating them would mean two places to maintain the same idea, and the audit's
central finding was that duplicated vocabularies are what broke Article Type in the first place.

---

## 4. Consequences the owner should weigh

| Consideration | Assessment |
|---|---|
| **Thin archives** | Six of the seven proposed subcategories would start with **one** article. Under the spec's rule (≥3 published articles to be indexable) their archives would render `noindex, follow` and stay out of the sitemap until coverage grows. That is the designed behaviour, not a defect — but it means **no SEO benefit on day one** |
| **A rename (C-7)** | "Broadcast Intelligence" → "Watching & Broadcast" changes what readers see in the kicker and breadcrumb. The legacy text remains on the record |
| **A merge (C-8/C-9)** | One article's visible label changes from "Spectator Strategy" to "Visiting Las Vegas". Reversible by detaching, since the legacy label is untouched |
| **Order matters** | C-8's MERGE depends on C-9's CREATE. The backfill processes CREATE before MERGE and resolves planned targets in dry-run, so the pair works in one run — verified |
| **Doing nothing is viable** | All eleven could stay RETAIN. The managed taxonomy then exists for *new* editorial work only, with zero change to existing articles. This is the lowest-risk option and a legitimate choice |
| **No URL changes either way** | A subcategory has no public route yet. Canonicals, the sitemap and BreadcrumbList are untouched by any action above |

---

## 5. Approval

No mapping is approved by appearing here. To approve:

1. Edit `apps/web/prisma/taxonomy/subcategory-mapping.json` — change any `action` you disagree
   with, and adjust names/slugs.
2. Set `approval.status` to exactly `APPROVED`, with `approvedBy` and `approvedAt`.
3. Run the dry run and read its plan (Issue 04-D).
4. Only then execute — and only after BKP-01 is resolved, since this is the first change that
   writes to existing production rows.

Until step 2, the backfill refuses to write anything. That refusal is tested.
