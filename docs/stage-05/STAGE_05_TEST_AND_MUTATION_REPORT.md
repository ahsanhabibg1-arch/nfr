# Stage 05 — Test & Mutation Report

**Stage:** 05 of 10 · **Date:** 2026-11-09 · **HEAD:** `fd4fb10`

---

## 1. Executed results

| Command | Status | Result |
|---|---|---|
| `npx vitest run` | **EXECUTED** | **90 files · 1885 tests · 1885 passed · 0 failed · 0 skipped · 135.55s** |
| `npx tsc --noEmit` | **EXECUTED** | **0 errors** |
| `npx next build` | **EXECUTED** | **SUCCESS (exit 0)** |
| `npm run test:routes` | **EXECUTED — first time in this programme** | **33 passed, 4 failed** — all 4 are dev-mode status-code artefacts, §5 |
| Mutations S5-M1 / M2 / M3 | **EXECUTED** | each turned the suite red, then restored green |
| KD-01 live-HTML verification | **EXECUTED** | no duplicate article placement on the running homepage |
| `npm run test:cache` | **NOT RUN** | writes to the database; not authorized for this stage |
| `npm run test:migration` | **NOT RUN** | creates a throwaway database; not authorized |
| `npm run test:e2e` | **NOT RUN** | needs a production server (env guard) plus Playwright browsers |

### 1.1 The headline

**Zero known failures. Zero skipped.** KD-01 — failing since Stage 03 by design — is green, and its assertion was never touched.

### 1.2 Baseline movement

| | Files | Tests | Passing | Known failures | Skipped |
|---|---|---|---|---|---|
| Stage 04 (reported and accepted) | 87 | 1822 | 1821 | 1 (KD-01) | 0 |
| **Stage 05** | **90** | **1885** | **1885** | **0** | **0** |
| Change | +3 | **+63** | +64 | **−1** ✅ | 0 |

**A note on baseline re-measurement.** The directive asked me not to assume the Stage 04 numbers. I attempted a background re-measurement, but it started after my first Stage 05 edits and so reflected mid-edit state (1820 tests, 6 failures) — it is **void** and is not quoted as a baseline. This is the second stage where a backgrounded baseline run overlapped my own edits; the correct order is measure-then-edit, and I should have done that. What *is* verified: the working tree at Stage 05 preflight was identical to Stage 04's recorded end state (18 modified files, 19 migrations, HEAD `fd4fb10`), so Stage 04's figure is the valid comparison point, and the final clean run above is the authoritative result.

---

## 2. New tests — 63 across 3 files

| File | Tests | Covers |
|---|---|---|
| `tests/stage05-content-source.test.ts` | **36** | the content-source contract: selection modes, ordering, bounds, cross-slot deduplication, fixture exclusion |
| `tests/stage05-registry-retirement.test.ts` | **16** | D-11: newsletter removal, legacy-layout compatibility, and that nothing is rendered or collected |
| `tests/stage05-content-ownership.test.ts` | **13** | D: references-not-copies, plus KD-01 through the real resolver against the isolated database |

Plus **4 replaced** tests in `batch33-unit.test.ts`: six source-text assertions about symbols inside the deleted engine became four behavioural assertions on the live contract.

All assertions are on observable behaviour or real function output. **None reads source text to prove behaviour** — confirmed by the Stage 03 quality gate, which reports zero new violations from Stage 05.

### 2.1 Coverage against Task J's fifteen required areas

| # | Required | Where | Count |
|---|---|---|---|
| 1 | Homepage cross-slot deduplication | content-source §4; content-ownership Task C | 8 + 3 |
| 2 | Manual selection ordering | content-source §2 | 7 |
| 3 | Automatic selection | content-source §3 | 2 |
| 4 | Mixed selection | content-source §3 | 3 |
| 5 | Missing manual references | content-source §2 | 1 |
| 6 | Unpublished records | content-source §2; content-ownership | 2 |
| 7 | Fixture exclusion | content-source §6 | 4 |
| 8 | Category filtering | content-ownership Task E | 2 |
| 9 | Count boundaries | content-source §5 | 6 |
| 10 | Deterministic repeated resolution | content-source §3; content-ownership | 2 |
| 11 | Sparse-content behaviour | content-source §3, §4 | 3 |
| 12 | Newsletter registry removal | registry-retirement | 6 |
| 13 | Legacy newsletter compatibility | registry-retirement | 10 |
| 14 | Authoritative CMS reference behaviour | content-ownership Task D | 3 |
| 15 | Page-family compatibility | content-ownership Task E | 5 |

### 2.2 The assertions that matter most

**References, not copies** (Task D). An article's title is edited in the database; the page resolves the new title; the stored layout JSON is asserted **byte-identical** before and after. A second test asserts the stored slot contains the id and **not** the title — so a factual field cannot have leaked into the layout.

**Never pad with a duplicate.** The pool holds two articles; the first slot takes both; a second slot asking for three returns **empty**. Requirement 8 of Task C, asserted directly.

**Defence against a buggy resolver.** An auto resolver that ignores its exclude list is handed an already-claimed id; the result still excludes it. This guards the invariant against a future content query that forgets its parameter.

**Fixture exclusion is environment-dependent, and now actually tested.** The previous assertion merely checked the filter object existed — it would have passed with the production branch broken. The new tests assert production excludes fixture slugs, test retains them by design, and the published-only constraint holds in every environment.

**No subscription surface exists.** A test walks `app/api/` and asserts no route directory matches `/newsletter|subscri/i`.

---

## 3. Mutation verification

Each mutation reintroduced a specific defect, confirmed the suite goes red, then restored the file from a backup taken beforehand outside the repository.

### S5-M1 — deduplication removed (reproduces KD-01)

**Target:** `lib/cms/slotUtils.ts`. All three guard layers disabled: manual picks stopped skipping placed ids, the exclude list stopped carrying `ctx.excluded()`, and the result loop stopped rejecting duplicates — i.e. the original defect, faithfully reproduced.

```
9 failed
  × Stage 03 Task D — homepage deduplication invariant  ← KD-01 ITSELF
  × Stage 05 Task C — a single article pinned to two slots appears in only the first
  × Stage 05 Task C — no article repeats across a full multi-slot homepage
  × Stage 05 — a later slot excludes articles an earlier slot already placed
  × Stage 05 — a later slot drops a MANUAL pick already placed earlier
  × Stage 05 — NEVER pads a slot with an already-shown article to meet its count
  × Stage 05 — a seeded context (the hero) is honoured by the first slot
  × Stage 05 — guards against an auto resolver that IGNORES its exclude list
  × Stage 05 — the context accumulates across many slots
```

**Restored:** 37/37. *Satisfies Task J's "removing deduplication makes a test fail".*

The important detail: **KD-01 itself fails under this mutation.** The fix and the test are genuinely coupled — the test is not passing for an incidental reason.

A narrower first attempt, disabling only the manual-pick guard, failed just 2 tests. That was worth knowing: it showed the three layers are independent, and that a partial regression would be caught but would not look like the original defect.

### S5-M2 — fixtures allowed into public selection

**Target:** `lib/fixturePolicy.ts`. `excludeFixturesFromPublic()` forced to `false`.

```
2 failed
  × IN PRODUCTION the public article filter excludes fixture slugs
  × IN PRODUCTION a fixture slug is reported as hidden
```

**Restored:** 36/36. *Satisfies "allowing fixtures into public selection makes a test fail".*

Note the two tests that **correctly kept passing**: the test-environment visibility test, and the published-only constraint. The mutation broke exactly the production guarantee and nothing else.

### S5-M3 — manual ordering broken

**Target:** `lib/cms/slotUtils.ts`. Resolved manual picks reversed before use.

```
5 failed
  × returns hand-picked articles in the picked order, not store order
  × accepts an array as well as a comma string
  × bounds manual picks to the requested count, keeping the first N in order
  × drops a reference to a MISSING record and keeps the rest in order
  × drops a reference to an UNPUBLISHED record
```

**Restored:** 36/36. *Satisfies "breaking manual ordering makes a test fail".*

Five failures rather than one, because order is load-bearing in every manual-selection assertion — which is the point: editor intent is not incidentally preserved.

### Residue check

```
$ grep -rn "S5-M1|S5-M2|S5-M3" lib/ components/ views/ tests/
none - clean
```

| File | Mutation | Restored |
|---|---|---|
| `lib/cms/slotUtils.ts` | S5-M1, S5-M3 | ✅ 37/37, 36/36 |
| `lib/fixturePolicy.ts` | S5-M2 | ✅ 36/36 |

`tsc --noEmit` 0 errors after all restorations; full suite 1885/1885.

---

## 4. Regressions found and resolved

Stage 05's changes broke **10 pre-existing tests**. All ten asserted the old implementation's source text or counts; none was a behavioural expectation. Each was retargeted, with a comment naming the behavioural test that now proves the guarantee.

| File | Tests | Was asserting | Now |
|---|---|---|---|
| `batch33-unit` | 6 | symbols inside the **deleted** engine | 4 behavioural assertions on the live contract: the engine is gone, nothing imports it, the helpers exist, the context deduplicates |
| `stage03-registry-contract` | 5 | 23 renderers; newsletter props exempt as `NO_RENDERER` | 22 renderers; newsletter registered under the new `RETIRED` reason |
| `batch-t1-featured-picker` | 3 | exact old `pickedThenAuto` code lines | the new code markers, pointing at the Stage 05 behavioural suite |
| `batch-h-integration` | 1 | "exactly 23 block entries" | 22, with the reason recorded inline |
| `batch-i-hardening` | 1 | `getAvailableBlockTypes(family)` in save validation | `getKnownSectionTypes(family)` — retired blocks stay saveable |

**Worth stating:** this is the second consecutive stage where legacy source-text tests broke because the code improved while behaviour was preserved or strengthened. That is the cost the Stage 03 quality gate was created to stop accumulating, and it is why every retargeted assertion now names the behavioural test that carries the real proof.

### 4.1 A new exemption reason

`RETIRED` was added to the Stage 03 exemption register alongside `NO_RENDERER`, `INERT`, `VIA_RESOLVER` and `BY_DESIGN`. Without it, the four newsletter properties would have been recorded as `NO_RENDERER` — which reads as a defect. They are not: the block was retired by an owner decision and *should* have no renderer. Register totals: 15 → 16 entries, with `INERT` still at **zero**.

---

## 5. Route harness — executed, with four dev-mode artefacts

**First successful execution in this programme.** Stage 04 identified the cause of the previous blockage: `next start` sets `NODE_ENV=production`, which activates the environment isolation guard and correctly refuses a production build against a local database. **That guard was not weakened or bypassed.** Dev mode does not trip it.

### 5.1 Preconditions verified before starting

| Check | Result |
|---|---|
| `TEST_DATABASE_URL` host | `localhost` |
| Database name | **exactly `nfrguide_test`** |
| Distinct from `DATABASE_URL` (dev = `nfrguide_dev`) | ✅ |
| Distinct from `CLOUD_DATABASE_URL` | ✅ |
| Conflicting server on 3000/3100 | none |
| Server env actually loaded | `APP_ENV=development`, `NODE_ENV=development`, `db: local` — confirmed from the startup log |
| Production database | never contacted |

```bash
DATABASE_URL=$TEST_DATABASE_URL APP_ENV=development npx next dev -p 3100
SMOKE_BASE_URL=http://localhost:3100 npx tsx scripts/route-smoke.mts
```

### 5.2 Result: 33 passed, 4 failed

**Passed (33)** — section landings, article routes, canonical tags, sitemap presence and `<urlset>`, sitemap excludes `/admin`, `robots.txt` present and disallowing `/admin`, `/search` returns 200 and is `noindex` and renders its control, the legacy `/nfr-competition/` → `/competition/` permanent redirect in one hop, unauthenticated `/admin/` redirecting to `/admin/login`, `/admin/articles/` gated, the login page rendering a sign-in form, and the empty-state venue/competitor sitemap checks.

**Failed (4)** — all the same shape:

```
✗ GET unknown article returns 404 — status 200
✗ GET unknown rodeo slug returns 404 — status 200
✗ GET unknown venue slug returns 404 — status 200
✗ GET unknown competitor slug returns 404 — status 200
```

### 5.3 Diagnosis — dev-mode artefact, not a product defect

Evidence gathered rather than assumed:

1. The route **does** call `notFound()` — `app/(public)/articles/[slug]/page.tsx:45`.
2. The response **body is the 404 page** — it contains "404" and "Not Found".
3. Only the **HTTP status** is 200, which is Next's dev-server behaviour for `notFound()`.
4. The harness's own docstring says *"Usage: start the app (`npm run start`) then `npm run test:routes`"* — it is written for a **production** server, where `notFound()` yields a real 404.

So the correct reading is: **the routing is right and the harness is right; they disagree only because dev mode does not set the production status code.** Confirming the status in production requires `next start`, which the env guard blocks against a local database — exactly the constraint Stage 04 documented.

**Not claimed:** that these four would pass in production. That needs a production-mode run against an isolated database, which requires either an `APP_ENV`/`NEXT_PUBLIC_SITE_URL` combination that satisfies the guard, or a hosted staging environment. Carried to the handover.

### 5.4 KD-01 verified in live HTML

With the server up, the original audit method was repeated — counting repeated article links on the homepage:

```
6 article(s) appear 2x     ← uniform distribution
0 article(s) appear 3x or 4x
```

Each card renders two links to its article: an `aria-hidden` image link and the title link. **A genuinely duplicated article would appear 4×** (two cards × two links). Before the fix, the Stage 02 audit found a *mixed* distribution with one article at 3×. The uniform 2× distribution is the per-card signature with no cross-slot duplication.

Server terminated afterwards; ports 3000 and 3100 confirmed free.

---

## 6. Test-quality gate compliance

The Stage 03 gate passes, including:

- `Stage 04's own suites introduce no new violations` ✅ — and Stage 05's do not either; none of the 63 new tests claims a rendering outcome on source-text evidence.
- The 49-entry legacy baseline is **unchanged** — Stage 05 added nothing to it.
- No stale baseline entries.

Stage 05 **reduced** structural debt outside the baseline: six source-text assertions about a deleted file became four behavioural ones.
