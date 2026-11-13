# Full-Audit Remediation — Stage 01: Category Archive Indexing Safety (B-01)

**Status: COMPLETE AND VERIFIED LOCALLY. Awaiting owner review.**
**Scope: B-01 only. Stage 02 was not started.**

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`
**Databases touched:** `localhost:5433/nfrguide_dev` and `localhost:5433/nfrguide_test` only.
**Source:** [Full-System Audit](FULL_SYSTEM_ARCHITECTURE_AND_HARDCODING_AUDIT.md) §3

---

## 1. Root cause confirmation

**Confirmed, and with one piece of evidence the audit had not yet found.**

`app/(public)/categories/[slug]/page.tsx` accepts any slug. Its `generateMetadata` passed
`derivedNoindex: false` **unconditionally**, even when neither the canonical section metadata nor
a managed `Category` row resolved:

```ts
const meta = getSectionMetaByCategorySlug(slug);   // undefined for an unknown slug
const catRow = await getCategoryBySlug(slug);      // null for an unknown slug
return buildMetadata(mergeSeoMeta(seo, {
  …
  derivedNoindex: false,                           // ← never reconsidered
}));
```

### How the policy actually composes

`mergeSeoMeta` (`lib/cms/entitySeoService.ts:98-101`) is the precedence point:

```ts
robots: combineRobots(
  d.derivedNoindex ? LEGACY_NOINDEX : INDEX_FOLLOW,   // route-level
  seo?.noindex     ? EDITOR_NOINDEX : INDEX_FOLLOW,   // stored editor flag
)
```

`combineRobots` keeps the most restrictive of each flag independently, so
`derivedNoindex: true` yields `noindex, nofollow` (`LEGACY_NOINDEX`) and an editor `noindex`
still combines on top. This was read before changing anything, as §2 required.

### The evidence the audit had not found

The project's **own route model already says what the answer should be.**
`tests/seo-routes.test.ts:61,74`:

```
['/categories/nfr-competition/', 'indexable']   ← canonical section
['/categories/other-cat/',       'indexable']   ← managed, NON-canonical category
['/categories/made-up/',         'not-found']   ← unknown slug
```

So `buildRouteIndex`/`resolveRoute` has always modelled an unknown category slug as
**not-found**, while the live route answered 200 + `index, follow`. **The runtime was the only
component that disagreed.** That test also pins the case a careless fix would have broken: a
managed category that is *not* one of the five canonical sections must stay indexable.

---

## 2. Exact files changed

| File | Change |
|---|---|
| `app/(public)/categories/[slug]/page.tsx` | `derivedNoindex: false` → `derivedNoindex: unknownCategory`, where `const unknownCategory = !meta && !catRow`, plus the comment explaining the two meanings of "known" |
| `tests/full-audit-stage01-b01.test.ts` | **new** — 16 regression tests |

`git diff --stat`: **1 file changed, 29 insertions(+), 1 deletion(-)** — the single logic line and
its explanation. No shared helper, no route, no schema, no taxonomy behaviour was touched.

### The condition, and why it has two halves

```ts
const unknownCategory = !meta && !catRow;
```

* `meta` — one of the five canonical sections in `config/routes.ts`.
* `catRow` — a managed `Category` row, which may not be a canonical section.

Only when **neither** resolves is the slug genuinely unknown. Keying on `meta` alone would have
made every admin-created category archive `noindex` and broken the `other-cat` expectation.

**The HTTP status stays 200**, matching `/articles`, `/disciplines`, `/venues` and `/competitors`.
§2 asked for consistency with the existing unknown-entity policy, and that policy is 200 +
`noindex`, not 404. (The route model's `not-found` is noted in §8 as a separate question.)

---

## 3. Before / after behaviour

Live probes against the dev server with `Host: nfrguide.com`, so IDX-02's staging
`X-Robots-Tag` does not mask the result — which is why this defect was invisible on localhost.

| Route | Before | After |
|---|---|---|
| `/categories/does-not-exist/` | 200 · **`index, follow`** | 200 · **`noindex, nofollow`** |
| `/categories/made-up-thing/` | 200 · **`index, follow`** | 200 · **`noindex, nofollow`** |
| `/categories/nfr-competition/` | 200 · `index, follow` | 200 · `index, follow` — unchanged |
| `/categories/more-rodeo/` | 200 · `index, follow` | 200 · `index, follow` — unchanged |
| `/articles/does-not-exist/` | 200 · `noindex, follow` | unchanged |
| `/disciplines/does-not-exist/` | 200 · `noindex, nofollow` | unchanged |
| `/venues/does-not-exist/` | 200 · `noindex, nofollow` | unchanged |
| `/competitors/does-not-exist/` | 200 · `noindex, nofollow` | unchanged |

Preserved as required: canonical archives, managed-category archives, stored `EntitySeo`
overrides, non-production hostname protection, sitemap contents and robots behaviour.

---

## 4. Regression test results

**`tests/full-audit-stage01-b01.test.ts` — 16 passed / 16.**

| § | Requirement | Covered |
|---|---|---|
| 1 | unknown slug is not indexable | ✓ pure composition + `generateMetadata` against the database, over five unknown shapes |
| 2 | known canonical section stays indexable | ✓ plus **all five** canonical archives checked in a loop |
| 2 | managed non-canonical category stays indexable | ✓ the `other-cat` case, with a real row created and removed |
| 3 | stored SEO overrides respected | ✓ editor `noindex` → `noindex, follow`; title/description overrides preserved; editor + unknown combine to the most restrictive |
| 4 | non-production hostname protection effective | ✓ `isIndexableHost` for production, staging, localhost and `null` |
| 5 | sitemap contents unchanged | ✓ exactly five category URLs, and the suite's own category is absent |
| 6 | no sibling route regresses | ✓ sibling robots policies asserted unchanged; `notFound(` confirmed absent |

### The fix is load-bearing — mutation-tested

Reverting the one line to `derivedNoindex: false` (patch confirmed applied, 4,686 → 4,676 bytes,
and the changed line re-read from disk) **failed 3 tests**, including both database-backed
behavioural cases:

```
FAIL  derivedNoindex is no longer the literal false
FAIL  (1) an UNKNOWN slug is not indexable
FAIL  (1) several unknown shapes are all refused indexing
      Tests  3 failed | 13 passed (16)
```

Restored and re-verified: **16 passed / 16**. The tests do not pass vacuously.

> The first mutation attempt aborted with `ABORT: anchor not present` because the patch script's
> anchor still carried a trailing `\n` against a CRLF file. It failed loudly rather than
> silently reporting a surviving mutant, which is the behaviour that matters; the anchor was
> corrected and the mutation then applied.

### Existing SEO suites — unchanged and passing

**7 files, 278 tests passed**, including `seo-routes.test.ts` (which asserts `other-cat` is
indexable) and `sitemap-policy.test.ts`. **No existing test was modified or weakened.**

---

## 5. Full test counts

| Run | Files | Passed | Skipped |
|---|---|---|---|
| Before Stage 01 | 136 | 3,169 | 0 |
| **After Stage 01** | **137** | **3,185** | **0** |

+1 file and +16 tests, accounting for the total exactly. **No failures.**

---

## 6. TypeScript and build

- `npx tsc --noEmit` — **clean**.
- `npm run build` — **succeeded**; `.next/BUILD_ID` = `nbLmT9YC4Vki6Y6nek-iA`.
- `git diff --check` — clean (only the repository's pre-existing CRLF notices).
- Encoding scan, all 60 changed/untracked source files — **no BOM, no mojibake**.

---

## 7. Data preservation

| | `nfrguide_dev` | `nfrguide_test` |
|---|---|---|
| Articles | **11** — unchanged | **17** — unchanged |
| Categories | **5** — unchanged | **5** — unchanged |
| Suite's temporary category | — | created and removed; **0 leftovers** |
| Migrations | none created, none run | none |
| Production database | **never connected to** | — |

The only database write in this stage is the one `Category` row the regression suite creates to
exercise the managed-but-non-canonical case, removed in `afterAll` and verified absent.

---

## 8. Remaining risks

| # | Item | Severity | Note |
|---|---|---|---|
| R-1 | **The route model says `not-found`, the runtime says 200** | Low | `tests/seo-routes.test.ts` models `/categories/made-up/` as `not-found`; the page returns 200 + `noindex`, consistent with every other unknown-entity route. The indexing risk is closed either way. Whether unknown entity routes should 404 instead of soft-404 is a **site-wide** policy question, not a category-route question, and was deliberately left alone |
| R-2 | A managed, non-canonical category archive is indexable but has no navigation entry and no `config/routes.ts` metadata | Low | Pre-existing, and part of **H-01 / Stage 02**. Not changed here |
| R-3 | H-02, H-03, H-04 remain open | P2 | The section-ownership cluster — **Stage 02**, which needs a design decision first (audit §6, A-1) |
| R-4 | Fix verified locally only | — | Not deployed. Production behaviour is unverified by definition |

---

## 9. Git status

```
branch : main
HEAD   : aafdad296363e4b69d3b01594540116f9b58f39d   (unchanged)
stashes: 0
tree   : 30 modified + 30 untracked
```

No commit, push, branch, reset, rebase or stash. All pre-existing uncommitted work from Issue 03
and Batches 04-A…04-E.2 is intact. Stage 01 added exactly one modified source file and one new
test file to that set.

---

## 10. Explicit confirmations

| | |
|---|---|
| **Stage 02 started?** | **NO** — H-01, H-02, H-03, H-04 are untouched; no Category/Section refactoring was performed |
| Production database | **UNTOUCHED** |
| Migrations / schema | **none** |
| Deployment | **not performed** |
| BKP-01 | **not started** |
| Legacy Subcategory mapping / backfill | **not started** |
| Git | **untouched** |
| New routes or taxonomy behaviour | **none introduced** |
| Existing tests weakened | **none** |

**Stopping here for owner review.**
