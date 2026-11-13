# Issue 04-E.1 — Article Type CMS: RBAC Refinement & NewsArticle Fallback Safety

**Status: LOCAL IMPLEMENTATION COMPLETE AND VERIFIED. Awaiting owner review.**
**Nothing committed, pushed, deployed, or written to production.**

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`
**Databases touched:** `localhost:5433/nfrguide_dev` and `localhost:5433/nfrguide_test` only.
**Predecessor:** [Issue 04-E](PRODUCTION_STABILIZATION_ISSUE_04E_ARTICLE_TYPE_CMS.md)

---

## 1. Initial audit findings

### 1.1 Safety gate (§2)

| Check | Result |
|---|---|
| Branch / HEAD | `main` / `aafdad2` — unchanged |
| Stashes | none |
| Working tree | 30 modified + 21 untracked, matching the 04-E hand-off |
| Database identity | `nfrguide_dev` and `nfrguide_test`, both `localhost:5433` |
| Production credentials | not present in `.env`; never used |
| New migration required | **No.** Task A is a code-level permission; Task B is a resolution-order fix. Nothing in either needs a schema change, so none was created. |

### 1.2 Task A — where the evergreen gate actually was

Three sites, all found and all changed:

| Site | Before | After |
|---|---|---|
| `lib/cms/articleTypeService.ts` `requireSeo` | `seo.config` | `articletype.seo` |
| `app/admin/article-type-actions.ts` evergreen action | `requireActor('seo.config')` | `requireActor('articletype.seo')` |
| `app/admin/(dashboard)/editorial-organization/page.tsx` | `roleHasPermission(roles, 'seo.config')` | `roleHasPermission(roles, 'articletype.seo')` |

`seo.config` has **three other uses**, all deliberately untouched:
`app/admin/(dashboard)/seo/page.tsx` (module config visibility), and
`lib/cms/seoService.ts` ×2 (audit-threshold configuration). It also keeps every
role that held it.

### 1.3 Task B — what the classification path actually did

Measured, not assumed, against the three cases the brief defines:

| Case | Behaviour **before** 04-E.1 | Correct? |
|---|---|---|
| 1 — known type, registry available | managed `schemaType` used | ✅ already correct |
| 2 — registry **unavailable or uninitialised** | `getArticleTypeSnapshot` falls back to **all 23** compatibility definitions, so `News`/`news`/`Event Update` still resolved to `NewsArticle` | ✅ **already correct** |
| 3 — truly unknown type | `Article` | ✅ already correct |

**So the concern as literally stated was already handled.** The whole-registry
fallback was never a partial answer — that was a deliberate 04-E design point.

**But a related, quieter defect was reachable, and it was real:**

> A snapshot that came **from the database** and is **incomplete**.

`schemaTypeIn` was a one-liner: `findType(...)?.schemaType === 'NewsArticle' ? … : 'Article'`.
A value absent from a `source: 'database'` snapshot therefore resolved to
`Article` with nothing logged.

That state is reachable rather than theoretical: **the bootstrap inserts row by
row with no transaction** (`grep -c '$transaction' lib/cms/articleTypeBootstrap.ts`
→ **0**). An interrupted or killed bootstrap run leaves a genuine partial
registry, and a published `News` article would then have declared `Article` to
search engines — silently, because `source` is still `'database'` so no fallback
warning fires either.

A definition removed by hand produces the same state.

---

## 2. RBAC permission changes

**New permission:** `articletype.seo` — Article Type evergreen eligibility, and
nothing else.

```
lib/auth/rbac.ts
  + 'articletype.seo' in the Permission union (documented)
  + super_admin: [...ADMIN_PERMS, 'system.config', 'articletype.seo']
  + seo_manager: [... , 'articletype.seo']
  ─ deliberately NOT in ADMIN_PERMS, so Administrator does not inherit it

lib/auth/permissions.ts
  + { key: 'articletype.seo', label: 'Set article type evergreen eligibility' }
```

The three Article Type gates are **mutually independent** — none implies
another:

| Capability | Permission | Holders |
|---|---|---|
| create, label, description, order, activate, archive, delete | `articletype.manage` | Administrator, Super Admin |
| **evergreen eligibility** | **`articletype.seo`** | **SEO Manager, Super Admin** |
| Article ↔ NewsArticle | `system.config` | Super Admin |

`seo.config` is unchanged in definition, in holders, and in every other place it
is used.

---

## 3. Exact roles authorized and denied

### Evergreen eligibility (`articletype.seo`)

| Role | Access | Verified by |
|---|---|---|
| Super Admin | **ALLOWED** | test (1) — toggled off and back on |
| SEO Manager | **ALLOWED** | test (2) — toggled off and back on |
| Administrator | **DENIED** | test (3) — `forbidden`, message checked, `evergreen` **and `updatedAt`** unchanged |
| Editor | **DENIED** | test (4) — `forbidden`, nothing mutated |
| Author | **DENIED** | test (5) — `forbidden`, nothing mutated |
| Reader | **DENIED** | matrix test — holds no permissions at all |

### Preserved access

| Role | Retains | Verified by |
|---|---|---|
| Administrator | full Article Type management: create → rename → deactivate → archive → delete | test (6), the whole lifecycle exercised end to end |
| SEO Manager | evergreen only — **no** create / rename / activate / archive / delete / reorder | test (7), six refusals plus "nothing changed" |
| Super Admin | all three gates | matrix test |

### Unchanged

Only Super Admin may change the Article/NewsArticle classification — test (8)
refuses Administrator, Editor, Author **and SEO Manager**, then confirms Super
Admin succeeds.

Enforcement is in the **service**; each server action re-checks before calling,
and the UI only decides what is rendered. A direct server-action call cannot
bypass anything, because the gate is not in the action alone — tests call the
service functions directly as each role, which is the path a bypass would take.

---

## 4. NewsArticle fallback behaviour, before and after

```
                                      BEFORE                AFTER
Case 1  managed definition present    managed schemaType     managed schemaType   (unchanged)
Case 2a registry absent/unreachable   NewsArticle preserved  NewsArticle preserved (unchanged)
Case 2b registry empty                NewsArticle preserved  NewsArticle preserved (unchanged)
Case 2c registry PARTIAL (from DB)    ⚠ Article  ← defect    NewsArticle preserved  ← FIXED
Case 3  unknown value                 Article                Article              (unchanged)
```

`schemaTypeIn` now resolves in three explicit steps:

1. the snapshot defines the value → **the managed classification wins, always**,
   including when it disagrees with the compiled-in definition (a Super Admin
   who reclassified `News` to `Article` is never overruled);
2. the snapshot does not define it but the compatibility registry does → the
   compiled-in classification applies;
3. nothing defines it → `Article`.

**Deliberate constraints honoured**

- The compiled-in fallback **cannot** override a managed classification: step 2
  only runs when step 1 found nothing.
- Matching in step 2 is by **exact stored string**. `News` and the legacy `news`
  each keep their own entry, and a case variant (`NEWS`, `News `, `EVENT UPDATE`)
  is *not* a recognised type, so it resolves to `Article` — resolving it as news
  would be classifying an unknown value as `NewsArticle`.
- `articleJsonLd()` is **still synchronous**, with the same one-argument
  behaviour and the same optional `{ schemaType }`. No signature changed.
- No client-side database request was introduced.
- Canonical URLs, publication dates and every other JSON-LD field are
  untouched — asserted by comparing the full object key-by-key between the two
  classifications.

**Diagnostics and recovery, also improved (same concern, operational side)**

| | Before | After |
|---|---|---|
| Repeated failures | logged **once per process** per reason — an intermittent fault became invisible after its first occurrence | logged at most once per **60 s** per reason, with a count of occurrences suppressed since the last line |
| Fallback caching | an error-derived fallback was cached for the full **10 s** success window, turning a 200 ms blip into 10 s of degraded answers | error-derived fallback cached for **1 s**; a successful read still 10 s |

---

## 5. Were code changes required for fallback safety?

**Yes — one, and it is narrow.** `lib/content/articleTypeShape.ts`:
`schemaTypeIn` gained the step-2 compatibility lookup (and a module-level
`COMPAT_SCHEMA_TYPE` map). `lib/cms/articleTypeRegistry.ts` gained the shorter
error TTL and the throttled reporting.

Nothing was rewritten. Cases 1, 2a, 2b and 3 already behaved correctly and were
left exactly as they were; evidence and tests were added for them rather than
new code.

**The fix was mutation-tested, because "we fixed it" is a claim, not a result.**
`schemaTypeIn` was reverted to its pre-04-E.1 one-liner (patch confirmed applied:
10,122 → 9,991 bytes) and the suites re-run:

```
04-E.1 suite   3 failed | 28 passed   ← Case 2 matrix, News/news distinction,
                                        and the REAL partial-registry test
04-E suite     1 failed | 43 passed
```

Restored and re-verified: **75 passed / 75**. The change is load-bearing and the
tests are not passing vacuously.

---

## 6. Files changed

**New (1)**

| File | Purpose |
|---|---|
| `tests/issue04e1-governance.test.ts` | 31 behavioural tests (RBAC, three classification cases, controlled registry failure) |

**Modified (7)**

| File | Change |
|---|---|
| `lib/auth/rbac.ts` | `articletype.seo` added to the union; granted to `super_admin` and `seo_manager` only |
| `lib/auth/permissions.ts` | the new permission in the matrix catalogue |
| `lib/cms/articleTypeService.ts` | `requireSeo` now checks `articletype.seo`; header and doc comments corrected |
| `app/admin/article-type-actions.ts` | evergreen action gated by `articletype.seo` |
| `app/admin/(dashboard)/editorial-organization/page.tsx` | `canArticleTypeSeo` derived from `articletype.seo` |
| `lib/content/articleTypeShape.ts` | `schemaTypeIn` three-case resolution + `COMPAT_SCHEMA_TYPE` |
| `lib/cms/articleTypeRegistry.ts` | per-outcome cache TTL + throttled failure reporting |
| `tests/issue04e-article-type-cms.test.ts` | one assertion updated to the owner's Case-2 decision (below) |

**No migration was created.** No Prisma schema change. No `Article` row touched.
No legacy taxonomy mapping touched.

### The one existing assertion that changed, and why

`tests/issue04e-article-type-cms.test.ts` previously asserted:

```ts
expect(schemaTypeIn({ source: 'database', types: [] }, 'News')).toBe('Article');
```

04-E had flagged this very state in a comment as "a distinct state". The owner's
Case-2 decision makes the safer answer the required one, so the assertion now
expects `'NewsArticle'`, with `'Freestyle'` added beside it to prove the
conservative rule still holds for genuinely unknown values. **No test was
weakened to obtain a pass** — the one changed assertion is strictly stronger
about the behaviour that matters, and the mutation test above proves the file
still fails if the fix is removed.

---

## 7. Focused test results

**`tests/issue04e1-governance.test.ts` — 31 passed / 31.**

| § | Requirement | Covered |
|---|---|---|
| 1 | Super Admin can modify evergreen | ✓ |
| 2 | SEO Manager can modify evergreen | ✓ |
| 3 | Administrator cannot | ✓ + `updatedAt` unchanged |
| 4 | Editor cannot | ✓ + nothing mutated |
| 5 | Author cannot | ✓ + nothing mutated |
| 6 | Administrator retains management | ✓ full lifecycle |
| 7 | SEO Manager gains no management rights | ✓ six refusals |
| 8 | only Super Admin changes classification | ✓ four roles refused |
| 9 | unauthorized requests mutate nothing | ✓ incl. **no audit entry written** |
| 10 | authorized changes audited + revalidated | ✓ audit detail checked; next read reflects it |
| 11 | managed NewsArticle respected | ✓ |
| 12 | managed Article respected | ✓ |
| 13 | compatibility NewsArticle survives an unavailable registry | ✓ mocked `P1001`, **and** a real partial registry against the database |
| 14 | compatibility Article falls back correctly | ✓ |
| 15 | unknown resolves to Article | ✓ 7 values × 3 snapshot sources |
| 16 | `News` and `news` stay distinct | ✓ incl. managing one without the other |
| 17 | managed override beats the fallback | ✓ both directions, and against the database |
| 18 | synchronous JSON-LD API backward compatible | ✓ incl. "not a Promise" |
| 19 | canonicals and dates unchanged | ✓ full key-by-key object comparison |
| 20 | temporary failure causes no uncaught render failure | ✓ `P1001` and `P2021`, plus transient-recovery timing |

**Controlled failure simulation** is real, not asserted: `vi.doMock('../lib/db')`
injects a client whose `findMany` throws with a Prisma error code, the registry
module is re-imported, and the resolution is read through the actual public API.
A separate test spies on `console.warn` to prove the failure is **reported with
its reason**, not swallowed. Another lets a transient failure recover without any
explicit invalidation, which would still read `fallback` if the error path used
the 10 s success TTL.

**Related suites — 6 files, 250 passed / 250:** 04-E.1, 04-E, 04-A, 04-B,
04-C/D, Issue 03.

---

## 8. Full regression results

**135 files, 3,146 passed, 0 skipped.**

| Run | Files | Passed | Skipped |
|---|---|---|---|
| 04-E hand-off | 134 | 3,112 | 3 |
| **04-E.1** | **135** | **3,146** | **0** |

+1 file and +31 tests, which accounts for the total exactly (3,115 → 3,146).

### Two observations about this run, both explained rather than waved through

**The 3 previously-skipped tests now run and pass.** They are the three
`it.skipIf(!hasRevisions)` cases in `tests/stage03-draft-publish-causation.test.ts`.
`hasRevisions` is a capability probe — `prisma.pageLayoutRevision.findFirst()`
must not throw. It was throwing because the generated Prisma client in
`node_modules` was stale relative to the schema; `prisma generate` during 04-E
brought it back into sync, so the probe now succeeds. Unrelated to this feature,
and a strict improvement: three tests that were being skipped are now actually
executing.

**A first full run showed ~17 files failing to load, and it was environmental.**
The failures were module-load failures (`FAIL [ tests/x.test.ts ]`), not
assertions, and every one of those files passed when run directly. The
difference was that the Next **dev server was running** during that attempt,
competing for database connections and memory across 135 sequential workers; the
earlier green 04-E run had it stopped. Stopping the dev server and re-running
produced the clean 135/3,146 above. **Not a code regression** — but worth
recording, because a full suite run and a live dev server should not share this
machine.

---

## 9. TypeScript and build

- `npx tsc --noEmit` — **clean**, no errors.
- `npm run build` — **succeeded**; `.next/BUILD_ID` = `oDtpZ3XmNZ41ZVf_nIz1R`.
- `git diff --check` — clean (only the repository's pre-existing CRLF notices).
- Encoding scan, all 52 changed/untracked source files — **no BOM, no mojibake**.
  No PowerShell 5.1 text round-trip was used on any source file.

---

## 10. Database preservation evidence

| | `nfrguide_dev` | `nfrguide_test` |
|---|---|---|
| `Article` rows | **11** (unchanged) | **17** (unchanged) |
| Stored types | `guide` 6 · `analysis` 3 · `feature` 2 — **unchanged** | unchanged |
| `ArticleType` rows | **23** | 0 — the suite restores the empty state it found |
| Registry completeness | `--verify` → **complete: YES**, 0 missing, 0 miscased | asserted in-suite |

No migration ran. No `UPDATE` was issued against `Article`. The one destructive
operation in the test suite — deleting the `News` definition to reproduce a
partial registry — is wrapped in `try/finally` and restores the exact row,
after which the completeness check passes.

---

## 11. Git branch, HEAD and working-tree status

```
branch : main
HEAD   : aafdad296363e4b69d3b01594540116f9b58f39d   (unchanged)
stashes: 0
tree   : 30 modified + 23 untracked
```

(04-E handed over 30 + 21. This batch modified seven files that were already
modified, and added two untracked paths: `tests/issue04e1-governance.test.ts`
and this report. `lib/content/articleTypeShape.ts` and
`lib/cms/articleTypeRegistry.ts` were already untracked from 04-E, so editing
them does not move either count.)

No commit, push, branch, stash, reset or rebase. All pre-existing uncommitted
work from Issue 03 and Batches 04-A/B/C/D/E is intact.

---

## 12. Remaining risks and blockers

| # | Item | Assessment |
|---|---|---|
| R-1 | **R-1 from 04-E is now CLOSED** | Administrator no longer holds Article Type evergreen control. |
| R-2 | No database-level case-folded uniqueness on `ArticleType.value` | Carried forward from 04-E §3.1, unchanged and still documented. The `News`/`news` pair makes it impossible; the service refuses variants at CREATE. |
| R-3 | Legacy values are not assignable to new articles | Carried forward from 04-E, intended per §10/§11.6. |
| R-4 | 10 s cross-instance staleness for a successful read | Unchanged for success; an error-derived fallback is now only 1 s. |
| R-5 | `Article.articleType` has no foreign key | Carried forward from 04-E §3. |
| **R-8** | **The bootstrap is not transactional** | This batch made a *partial* registry harmless for classification, which was the asked-for fix. The underlying cause is that the bootstrap inserts row by row. **Recommendation:** wrap the inserts in `prisma.$transaction` so a partial registry cannot exist at all. Not done here — it is a change to 04-E's bootstrap semantics rather than a governance refinement, and it deserves its own authorization. |
| **R-9** | **The evergreen list has the same partial-registry exposure** | A partial registry yields a short evergreen `IN` list, so the evergreen surface would quietly show fewer articles. The same per-value compatibility rescue would close it. **Not changed here**, because Task B scoped the correction to the NewsArticle/classification path, and changing which articles appear on a public surface is a separate behavioural decision. **Flagged for owner decision.** |
| R-10 | BKP-01 | Still a mandatory blocker for the production schema migration. Unchanged. |

---

## 13. Explicit confirmation

| | |
|---|---|
| Production database | **UNTOUCHED** — never connected to in this batch |
| Production R2 / environment variables / Render | **UNTOUCHED** |
| Production migration | **NOT RUN** — and no migration was created at all |
| Prisma schema | **UNCHANGED** by this batch |
| Backfill / data rewrite | **NONE** — no `UPDATE` to any `Article` row |
| Legacy taxonomy mappings | **UNTOUCHED** |
| Git | **UNTOUCHED** — no commit, push, branch, stash, reset or rebase |
| Production UAT | **NOT INITIATED** |
| Existing uncommitted work | **PRESERVED** in full |
| Local databases | `nfrguide_dev` and `nfrguide_test` only, both verified `localhost` before use |

**Completion rule (§8) — all satisfied:** `articletype.seo` is enforced
server-side; Administrator no longer has evergreen control; SEO Manager and
Super Admin retain the correct access; known `NewsArticle` classifications
survive registry fallback *including a partial registry*; unknown types remain
conservative; the 04-E CMS behaviour is preserved; all required verification
passes.

**Stopping here.** No Subcategory mapping, no BKP-01, no production migration,
no deployment, no Git commit or push.
