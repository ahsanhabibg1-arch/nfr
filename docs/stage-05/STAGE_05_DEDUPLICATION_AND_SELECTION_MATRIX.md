# Stage 05 — Deduplication & Selection Matrix

**Stage:** 05 of 10 · **Date:** 2026-11-09 · **HEAD:** `fd4fb10`

---

## 1. KD-01 — before and after

### 1.1 The defect

`lib/cms/homepageData.ts` built a one-way `shownInHero: string[]`, passed it to the `latest-coverage` slot alone, and never extended it. Sibling slots could deduplicate neither against the hero nor against each other.

```
BEFORE
  shownInHero = [hero lead, ...hero secondary]
  latest-coverage   → getLatestArticles(need, [...shownInHero, ...ex])   ← excluded
  plan-and-watch    → bySection(key, { excludeIds: ex })                 ← NOT excluded
  entertainment     → bySection(key, { excludeIds: ex })                 ← NOT excluded
  events-shopping   → bySection(key, { excludeIds: ex })                 ← NOT excluded
  learning          → getEvergreenArticles(...).filter(!ex)              ← NOT excluded
                      (`ex` is only pickedThenAuto's within-slot exclusion)
```

### 1.2 The fix

```
AFTER
  ctx = createSelectionContext()
  hero resolves and claims FIRST → ctx.claim(lead, ...secondary)
  every article slot             → pickedThenAuto(props, count, auto, ctx)
                                   · manual picks skip already-placed ids
                                   · auto-fill receives ctx.excluded()
                                   · result loop rejects any duplicate anyway
                                   · ctx.claim(final selection)
```

### 1.3 Evidence

| Measure | Before | After |
|---|---|---|
| KD-01 test (`stage03-dedup-invariant.test.ts`) | **FAILING** — 7 duplicated entities | **PASSING** |
| Test assertion | — | **unchanged**, file untouched since Stage 03 |
| Duplicated entities reported by the resolver | `hero-sec-02` ×2, `art-02` ×2, `art-03` ×2, `art-04` ×2, `art-05` ×2, `fixture-article-entertainment-article` ×2, `fixture-article-events-shopping-article` ×2 | **none** |
| Live HTML (Stage 02 audit, dev server) | one article at **3×**, five at 2×, mixed distribution | **uniform 2× for all 6** — the per-card signature, see §1.4 |

### 1.4 Reading the live-HTML evidence correctly

A naive count of `href="/articles/…"` on the homepage shows every article twice, which looks like duplication but is not. Each article card renders **two links to the same article**:

```html
<a tabindex="-1" aria-hidden="true" href="/articles/x/"><figure>…</figure></a>  <!-- image -->
<a href="/articles/x/">Article title</a>                                        <!-- title -->
```

The image link is correctly `aria-hidden` so assistive technology announces the article once.

**So the signature of a real duplicate is 4×, not 2×** — two cards, two links each. After the fix the distribution is **uniformly 2× across all 6 distinct articles**, with no article at 3× or 4×. Before the fix the distribution was mixed, with one article at 3×.

---

## 2. Deduplication guard matrix

Three independent layers, each with its own test.

| Layer | Where | Catches | Test |
|---|---|---|---|
| **1. Manual picks** | `pickedThenAuto` pick loop | an editor pinning the same article to two slots, or twice within one slot | "a later slot drops a MANUAL pick already placed earlier"; "de-duplicates a repeated manual id" |
| **2. Query exclusion** | exclude list passed to `auto` | the auto resolver returning something already placed | "a later slot excludes articles an earlier slot already placed" |
| **3. Result guard** | `pickedThenAuto` result loop | an auto resolver that **ignores** its exclude list — defence against a resolver bug | "guards against an auto resolver that IGNORES its exclude list" |

Layer 3 exists because layers 1 and 2 both depend on a resolver behaving correctly. A future content query that forgets its exclude parameter cannot reintroduce a duplicate.

---

## 3. Selection behaviour matrix

| # | Scenario | Configuration | Result | Test |
|---|---|---|---|---|
| 1 | **Automatic** | no `featuredIds`, `articleCount: 3` | 3 from the auto resolver, category filter honoured | ✅ |
| 2 | **Manual, ordered** | `featuredIds: 'p3,p1,p2'` | exactly `p3, p1, p2` — the editor's order, not store order | ✅ |
| 3 | **Manual, array shape** | `featuredIds: ['p2','p1']` | `p2, p1` | ✅ |
| 4 | **Manual over count** | 4 picks, `articleCount: 2` | first 2 in order | ✅ |
| 5 | **Mixed** | 1 pick, `articleCount: 3` | pick first, then 2 auto | ✅ |
| 6 | **Mixed, no overlap** | pick is also top of the auto pool | appears once, in the manual position | ✅ |
| 7 | **Missing reference** | `featuredIds` names a non-existent id | dropped; the rest keep order | ✅ |
| 8 | **Unpublished reference** | `featuredIds` names a draft article | dropped | ✅ |
| 9 | **Duplicate manual id** | `featuredIds: 'p1,p2,p1'` | `p1, p2` + auto fill — first occurrence wins | ✅ |
| 10 | **Zero count** | `articleCount: 0` | empty, and **no query issued** | ✅ |
| 11 | **Sparse content** | count 5, only 2 unique available | returns 2 — **never pads with a repeat** | ✅ |
| 12 | **Exhausted content** | all candidates already placed | returns **empty** rather than duplicating | ✅ |
| 13 | **Seeded context** | hero already claimed `p1` | first slot starts from `p2` | ✅ |
| 14 | **Accumulation** | 3 slots × 2 from a pool of 6 | all 6 distinct, in order | ✅ |
| 15 | **Determinism** | same inputs, run twice | identical output | ✅ |
| 16 | **No context** | `pickedThenAuto` without `ctx` | behaviour unchanged from before Stage 05 | ✅ |

Requirement 8 of Task C — *"never fill an empty slot using an already displayed article solely to meet its requested count"* — is rows 11 and 12. A slot returning fewer items than requested is the **correct** outcome when unique content runs out, not a failure.

---

## 4. Content bounds

| Property | Min | Max | Enforced where | Behaviour outside range |
|---|---|---|---|---|
| `articleCount` (homepage slots) | 0 | 12 | `numProp` at resolve; `validateOneProp` at save | clamped at resolve, **rejected** at save |
| `articleCount` (`landing-grid`) | 0 | 20 | `limitList` → `numProp`; validation at save | clamped / rejected |
| `articleCount` (`detail-related`) | 1 | 6 | `relatedCount` in `detailTemplateData` | clamped; `0` → default 3 |
| `secondaryCount` (hero) | 0 | 4 | `numProp` | clamped |
| `featuredIds` length | — | 50 | `validateOneProp` | **rejected** at save |

Defence in depth: a value that somehow reached storage is clamped at resolve time, so an out-of-range number can never produce an unbounded query.

---

## 5. Exclusion matrix — what never reaches public selection

| Excluded | Mechanism | Scope | Verified |
|---|---|---|---|
| Unpublished records | `workflowStatus: 'PUBLISHED'` in `publicArticleWhere()` | **every** environment | ✅ test asserts all three env values |
| Fixture / demo records | `NOT: { slug: { startsWith: FIXTURE_PREFIX } }` | **production only**, by design — fixtures stay visible in test/CI so smoke tests can exercise real routes | ✅ tests assert production excludes and test retains |
| Already-placed entities | `SelectionContext`, three layers | per request | ✅ 8 tests |
| Draft layout content | `isStaffDraftPreview()` double gate | per request | ✅ Stage 03 suite, unchanged |

**The fixture gate is environment-dependent, and that is deliberate.** `excludeFixturesFromPublic()` returns true only when `appEnv() === 'production'`. Stage 05 added the first behavioural tests of this, because the previous assertion merely checked that the filter object existed — which would have passed even if the production branch were broken.

---

## 6. Page-family selection coverage

| Family | Manual | Automatic | Mixed | Count bound | Cross-slot dedup |
|---|---|---|---|---|---|
| **Homepage** | ✅ `featuredIds` | ✅ | ✅ | ✅ 0–12 | ✅ **shared context** |
| **Section landing** — `landing-featured` | ✅ `featuredIds` | ✅ fallback to newest | ✅ | n/a (single item) | per-slot |
| **Section landing** — `landing-grid` | — | ✅ | — | ✅ 0–20 | per-slot |
| **Detail template** — `detail-related` | — | ✅ related-by-entity | — | ✅ 1–6 | n/a (one block) |
| **Directory** | — | — | — | — | — |

**Directory has no configurable content source**, documented as a gap rather than invented: listings are fetched directly by each route through `listPublicCompetitors` / `listPublicVenues`, outside the slot system. Stage 07 owns directory templates.

**Section landings are per-slot by circumstance, not by design** — each has a single article-bearing feed, so a shared context has nothing to deduplicate against. The contract already supports one if Stage 07 adds more feeds.

---

## 7. Determinism guarantees

| Guarantee | Mechanism |
|---|---|
| Same data + same configuration → same output | slots resolve in `order`; the context is first-claim-wins; queries carry explicit, de-duplicated exclude lists |
| Hero priority is independent of block position | the hero resolves and claims before the loop, regardless of where the admin placed it |
| Manual order is stable | `getPublishedArticlesByIds` preserves caller order, and the pick loop does not re-sort |
| Repeated resolution is identical | asserted twice — once on mocked data, once against the real database |

---

## 8. Known limitations

1. **Sequential resolution.** Cross-slot deduplication requires it — a parallel resolve cannot know what a sibling claimed. Cost is latency proportional to article-slot count (at most six, two bounded queries each). If it ever matters, the answer is one batched candidate fetch shared across slots, not reintroducing parallelism.
2. **Exclusion list grows within a request.** Bounded by articles already placed (well under 100 given a 12-item cap per slot) and de-duplicated before reaching a query. Not a practical concern at this scale; worth revisiting only if slot caps rise substantially.
3. **A slot can legitimately render fewer items than requested** when unique content is exhausted. This is correct behaviour, but an admin may read it as a bug. Surfacing "showing 2 of 4 — not enough unique articles" in the Builder would be a useful Stage 06 addition.
4. **Dedup is scoped to the homepage.** Section landings do not need it today (§6); detail and directory families have no multi-feed composition.
5. **The hero-priority rule is a product decision made in code.** The lead story wins over a category feed. It is documented and deterministic, but it has not been explicitly ratified by the owner.
