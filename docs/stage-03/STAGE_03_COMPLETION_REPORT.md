# NFRGuide.com — Stage 03 Completion Report
## Behavioral Testing Foundation & Regression Protection

**Stage:** 03 of 10 (absolute maximum 12) · **Date:** 2026-11-09
**Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` — unchanged, no commit created
**Written for:** the project owner and the independent reviewer authorizing Stage 04

### Evidence convention

**[EXECUTED]** — a command was run in this stage; the result is reported as returned. **[SOURCE]** — read at the cited `path:line`. **[BLOCKED]** — not run, with the precise reason and setup requirement. Nothing unexecuted is reported as passing.

---

## A. Executive Summary

**Status: COMPLETE**, with one intended failing test and four harnesses documented as BLOCKED.

Stage 03 built the verification capability the programme depends on. The project had twice been misled by a green suite: 1,528 and then 1,549 tests passed while ten block properties were inert, `helpText` never reached the DOM, and the live homepage rendered one article three times. Roughly 93% of the suite's substring assertions targeted source *text*, and **no test proved that an admin edit reached public HTML**.

That is no longer true.

### What was accomplished

1. **Registry contract suite — 123 tests.** Coverage derives from the live registry at run time, so every one of the 27 declared block types and all 105 of their advertised properties is checked. Each is proven to change the rendered HTML, or carries an explicit reasoned exemption.
2. **Draft→publish→public causation — 28 tests.** The chain no previous test traversed, executed through the real services against the isolated database. Including the assertion that matters most: **an unpublished draft never reaches the public page.**
3. **Draft isolation across all 15 page keys** — each exercised with a block type valid for its own family, so appendage-only families are tested against their actual contract rather than an assumed one.
4. **The homepage duplication defect is captured as a failing test** — 7 duplicated entities detected. Left failing, not skipped.
5. **SEO causation pattern — 11 tests**, including proof that an editor cannot widen the indexing policy.
6. **Observability fixed (the one product change)** — a database failure in layout retrieval is now logged and distinguishable from a missing layout, with the fallback preserved.
7. **Test quality gate — 8 tests.** 49 pre-existing violations grandfathered; the set can shrink but never grow.
8. **Three mutations applied and reverted**, each proving the new tests can actually fail.

### Executed verification

| Check | Result |
|---|---|
| `npx vitest run` | **84 files · 1732 tests · 1731 passed · 1 failed (intended) · 0 skipped · 129.76s** |
| `npx tsc --noEmit` | **0 errors** |
| Mutation M1 / M2 / M3 | **each turned the suite red, then restored green** |

Baseline movement: Stage 01 executed 78 files / 1549 tests with 28 skipped. Stage 03 executes **84 files / 1732 tests with 0 skipped** — **+183 tests**, and every one of them asserts behaviour.

### The one failing test, and why it stays failing

`stage03-dedup-invariant.test.ts` fails, detecting 7 entities resolved into more than one homepage slot. **This is the intended Stage 03 outcome.** Stage 05 owns the fix. Marking a known live defect green would reproduce precisely the reporting failure this programme exists to correct.

**Operational note:** `npm test` exits non-zero until Stage 05 lands. The expected-failure count is exactly **1**; any change in that number — in either direction — is a regression.

### Remaining blockers

None for Stage 03. Four harnesses are BLOCKED on environment (§E-4) and have never executed in this programme; wiring them in is carried to Stage 04 so Stage 10 is not their first run. **D-04 remains unapproved and blocks Stage 05.**

---

## B. Repository Baseline

[EXECUTED] `git rev-parse`, `git log -1`, `git status --porcelain`, `git diff --stat HEAD`

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` |
| HEAD at start and end | `fd4fb1008e28cd99fa578a154d28f79318421d3c` — **unchanged** |
| vs Stage 02 reported baseline | **MATCHES** `fd4fb10` — no divergence to report |
| Pre-existing work | Preserved: Stage 01's 3 modified files + 1 test, both audit documents, all 5 Stage 02 documents |

**Stage 01 security changes confirmed still present** [SOURCE]: the `not_configured` fail-closed branch, `timingSafeEqual`, `ALLOWED_PATHS`, the runner skip-guard, the 21-test security suite, and **zero occurrences** of the removed hardcoded literal in `app/` or `lib/`.

**Test configuration** [SOURCE] `vitest.config.ts`: `environment: 'node'`, `fileParallelism: false`, `server-only` stubbed, and `decideTestDatabase()` which throws on a refused database and blanks `DATABASE_URL` unless an isolated one is approved. **The guard was preserved and relied upon throughout.**

**Pre-existing source-text assertion debt, measured** [EXECUTED]: 26 of 84 test files read product source; 49 tests in those files have names claiming a rendering outcome. Captured as the Task H baseline.

---

## C. Security Findings

Stage 03 introduced no security changes and weakened nothing. Three observations:

1. **Draft isolation is now behaviourally proven across all 15 page keys** (Task C) — previously asserted only in source text. This hardens the guarantee that unpublished editorial content cannot reach visitors.
2. **The indexing policy is proven non-wideneable** (Task E) — with content-based `noindex` set, an editor's `noindex: false` cannot force indexing. This protects the engine's most important safeguard.
3. **The observability fix does not leak credentials.** A test asserts the error log message does not contain a connection string, using a deliberately credential-bearing error.

RBAC, authentication, draft-mode gating, fixture exclusion and the SEO indexing policy were not modified.

---

## D. Implementation Details

**8 tracked files modified · 8 new test files · no schema change · no migration authored · no dependency change.**

[EXECUTED] `git diff --stat HEAD`:

```
 apps/web/.env.example                         | 14 ++++++    (Stage 01)
 apps/web/app/api/internal/revalidate/route.ts | 30 +++++++++  (Stage 01)
 apps/web/lib/cms/scheduledPublishRunner.ts    | 12 +++--      (Stage 01)
 apps/web/lib/cms/pageLayoutService.ts         | 66 +++++----   (Stage 03 Task G)
 apps/web/vitest.config.ts                     |  3 ++         (Stage 03 — @/ alias)
 apps/web/tests/batch-c-revisions.test.ts      | 21 ++++---     (Stage 03 — legacy follow-up)
 apps/web/tests/batch-d-scheduling.test.ts     | 27 ++++----    (Stage 03 — legacy follow-up)
 apps/web/tests/batch-i-hardening.test.ts      | 19 ++++---     (Stage 03 — legacy follow-up)
 8 files changed, 146 insertions(+), 46 deletions(-)
```

### D-1 `lib/cms/pageLayoutService.ts` — Task G, the only product change

Both retrieval functions previously caught every error and returned family defaults with **no log**, so a database outage was indistinguishable from "this page has no customised layout".

**Change:** both now route through a shared `resolveSections(pageKey, column)` which returns an explicit outcome:

| `SectionSource` | Meaning |
|---|---|
| `stored` | stored sections found and returned |
| `default-no-layout` | no row exists; family defaults |
| `default-empty` | row exists, section array empty; family defaults |
| `default-db-error` | the query threw; defaults returned **and the error logged** |

The catch branch calls `log.error` with `pageKey` and `column`, and `report('database', …)`.

**Why necessary:** a silent fallback would have masked regressions throughout Stages 04–10, presenting any Stage 04 mistake as "the layout reset itself". That is why this was in scope for a testing stage.

**Behaviour preserved:** the fallback still serves family defaults, so a public page renders during an outage. The public signatures are unchanged — callers still receive `SectionSlot[]`. Two diagnostic variants (`getPublishedSectionsResolved`, `getDraftSectionsResolved`) expose the outcome for tests and future callers.

### D-2 `vitest.config.ts` — `@/` path alias

Added `'@': ./` to `resolve.alias`, mirroring `tsconfig.json`'s `@/* → ./*`. **Required**, not cosmetic: the real block components import via `@/components/...`, and without the alias they cannot be loaded under Vitest — so no behavioural rendering test was possible. Existing tests used only relative imports, which is why the gap had never surfaced.

### D-3 Three legacy test files — follow-up to Task G

Six pre-existing tests failed after the Task G refactor. **Not behaviour regressions** — each sliced the source text of the two functions and asserted on substrings that moved into the shared helper:

| File | Tests | Was asserting |
|---|---|---|
| `batch-c-revisions.test.ts` | 2 | the sliced function bodies contained `layout.publishedSections` / `layout.draftSections` |
| `batch-d-scheduling.test.ts` | 2 | the sliced bodies did not contain `scheduledSections` |
| `batch-i-hardening.test.ts` | 2 | the sliced body contained `buildDefaultSlots(getPageFamily(pageKey))` |

Each was retargeted to the new structure — asserting the retrieval call sites and that the shared resolver reads exactly its requested column and never consults `scheduledSections` — with a comment pointing to the Stage 03 test that now proves the behaviour directly.

**This is itself a finding worth recording:** six tests broke because the code improved, while behaviour was preserved and strictly better. That fragility is exactly what the Task H gate exists to stop accumulating.

### D-4 New test files

| File | Tests | Task |
|---|---|---|
| `tests/stage03-registry-contract.test.ts` | 123 | A |
| `tests/stage03-draft-publish-causation.test.ts` | 28 | B, C, F |
| `tests/stage03-seo-causation.test.ts` | 11 | E |
| `tests/stage03-layout-observability.test.ts` | 8 | G |
| `tests/stage03-test-quality-gate.test.ts` | 8 | H |
| `tests/stage03-dedup-invariant.test.ts` | 5 (1 intended fail) | D |
| `tests/support/stage03BlockFixtures.ts` | — | fixtures + exemption register |
| `tests/support/stage03LegacyStructuralTests.json` | — | 49-entry baseline |

---

## E. Testing Evidence

### E-1 Commands executed

| Command | Status | Result |
|---|---|---|
| `npx vitest run` | **[EXECUTED]** | **84 files · 1732 tests · 1731 passed · 1 failed (intended KD-01) · 0 skipped · 129.76s** |
| `npx tsc --noEmit` | **[EXECUTED]** | **0 errors** |
| `npx vitest run tests/stage03-registry-contract.test.ts` | **[EXECUTED]** | 123/123 |
| `npx vitest run tests/stage03-draft-publish-causation.test.ts` | **[EXECUTED]** | 28/28 |
| `npx vitest run tests/stage03-seo-causation.test.ts` | **[EXECUTED]** | 11/11 |
| `npx vitest run tests/stage03-layout-observability.test.ts` | **[EXECUTED]** | 8/8 |
| `npx vitest run tests/stage03-test-quality-gate.test.ts` | **[EXECUTED]** | 8/8 |
| `npx vitest run tests/stage03-dedup-invariant.test.ts` | **[EXECUTED]** | 4 passed, **1 failed (intended)** |
| Mutations M1, M2, M3 | **[EXECUTED]** | each red, then restored green |
| `prisma migrate deploy` → `nfrguide_test` | **[EXECUTED]** | 3 migrations applied, with owner approval (§F) |
| `prisma migrate status` → `nfrguide_dev` | **[EXECUTED]** | "Database schema is up to date" — **dev untouched** |
| `npm run test:routes` | **[BLOCKED]** | needs a running server + isolated **seeded** DB (asserts on `fixture-` records). No server running. Read-only. |
| `npm run test:cache` | **[BLOCKED]** | needs a running server **and writes to the DB** — mints an ephemeral admin, creates and promotes a throwaway article |
| `npm run test:e2e` | **[BLOCKED]** | `playwright.config.ts:39-40` requires `webServer: npx next start` — production build + seeded DB + admin-login fixtures; mutates admin session state |
| `npm run test:migration` | **[BLOCKED]** | creates a throwaway database for a from-zero replay |
| `npm run build` | **[NOT EXECUTED]** | not required for this stage; `tsc --noEmit` covers the changed surface |

### E-2 Behaviour covered

Full matrix in `STAGE_03_BEHAVIORAL_TEST_MATRIX.md`. The assertions that matter most:

- **An admin edit reaches the rendered page.** 105 properties across 27 block types, each proven with a unique sentinel *and* a second render confirming the sentinel is absent when unset — so no assertion can pass on unrelated static markup.
- **An unpublished draft never reaches the public page.** Proven on `homepage` and independently on all 15 page keys.
- **Publishing creates a revision.** `PageLayoutRevision` count increments by exactly 1.
- **Old layouts keep working.** A row written before a property existed renders with the documented default; an unknown `sectionType` degrades without throwing.
- **An editor cannot widen the indexing policy.** With content-based `noindex`, an editor's `noindex: false` leaves indexing off.
- **A database fault is attributable.** Identical slots, different outcomes — the negative control fails if they collapse together.

### E-3 Mutation verification

Detail in `STAGE_03_MUTATION_VERIFICATION.md`. Summary:

| Mutation | Defect reintroduced | Result | Restored |
|---|---|---|---|
| **M1** | `RichTextBlock` stops rendering its `title` prop | **2 failed / 121 passed** | 123/123 |
| **M2** | DB error reported as a missing layout | **2 failed / 6 passed** | 8/8 |
| **M3** | An `INERT` exemption entry removed | **2 failed / 121 passed** | 123/123 |

M3 is the important one: it proves the exemption register is **enforcement, not documentation**. Removing an entry does not quietly drop the property from coverage — the suite immediately tries to prove it works and fails because it does not. The inverse is enforced on every run: the stale-entry test renders every `INERT` property and **fails if one starts working**, so the register is forced to shrink as Stage 04 fixes them.

Repo-wide scan for mutation markers after restoration: **none — clean.**

### E-4 Expected failure and blocked checks — stated plainly

- **1 expected failure:** `stage03-dedup-invariant.test.ts`. Not skipped, not weakened, not annotated away.
- **4 blocked harnesses:** `test:routes`, `test:cache`, `test:e2e`, `test:migration` — each with its prerequisite named above. **None is reported as passing.**
- **Production build not executed**, with the reason stated.

---

## F. Database, Environment & Git Safety

| Restriction | Status |
|---|---|
| No production database writes | **CONFIRMED** — no production credentials used; `CLOUD_DATABASE_URL` never targeted |
| No destructive database operation | **CONFIRMED** — see the migration gate below |
| No Prisma schema migration authored | **CONFIRMED** — `prisma/migrations/` unchanged at 19; no `migrate dev`, `db push` or `migrate reset` |
| Development database unmodified | **CONFIRMED** — `migrate status` reported it already current |
| No deployment | **CONFIRMED** |
| No Docker | **CONFIRMED** |
| Test DB isolation guard preserved | **CONFIRMED** — `vitest.config.ts` and `testDbGuard.ts` untouched and relied upon |
| No secrets printed | **CONFIRMED** — env checks emitted hostname, database name and booleans only |
| Editorial content unchanged | **CONFIRMED** — no article, page or entity record modified |
| No commit / push / merge / branch | **CONFIRMED** — HEAD identical at start and end |
| Pre-existing work preserved | **CONFIRMED** |

### The one database operation, and the gate it passed

The isolated test database was 3 migrations behind the Prisma schema, blocking 27 tests. **The owner was asked and approved applying the existing migrations.** Before running anything, every check the owner specified was verified:

| Check | Result |
|---|---|
| `TEST_DATABASE_URL` host | `localhost` |
| Database name | **exactly `nfrguide_test`** |
| Identical to `DATABASE_URL` (dev = `nfrguide_dev`) | **no** |
| Identical to `CLOUD_DATABASE_URL` (configured) | **no** |
| All 3 pending migrations committed at HEAD | **yes** — verified via `git ls-tree` |
| Uncommitted changes to any migration file | **none** |
| Destructive SQL (`DROP` / `TRUNCATE` / `DELETE` / `RENAME` / type change / `SET NOT NULL`) | **zero occurrences** |
| Statement inventory | 4 `CREATE TABLE`, 2 `CREATE TYPE`, 1 `CREATE INDEX`, 1 `CREATE UNIQUE INDEX`, 5 `ALTER TABLE` — all `ADD COLUMN` / `ADD CONSTRAINT`, the one `NOT NULL` carrying a default |

An initial check **failed and I stopped** — `TEST_DATABASE_URL` was unset in the shell. That was a false alarm from reading shell env rather than `.env` (which Vitest loads via `@next/env`); re-running against the real configuration passed every check. Reported here because a safety gate that fails should be visible, not quietly retried.

Applied with `prisma migrate deploy` against that database only: `20261107160000_batch33_site_experience`, `20261108120000_phase_d_scheduled_publishing`, `20261108130000_phase_c_page_layout_revisions`.

**Test data cleanup verified** [EXECUTED] after the full run: 0 `stage03test-` users, 0 `homepage` layout rows, 0 revision rows — the suites restored the database exactly as found.

---

## G. Acceptance Criteria Matrix

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Registry contract coverage generated from the current registry | **PASS** | Both the registry and renderer map are read at run time; a shape test pins 29/27/23 so drift is deliberate |
| 2 | All known inert properties explicitly tracked | **PASS** | 16-entry register; `INERT` pinned at exactly 3 by an integrity test; unregistered exemptions fail the suite |
| 3 | At least one working property mutation demonstrably fails its test | **PASS** | **M1** — 2 failed / 121 passed, then restored. Plus **M2** and **M3** |
| 4 | Draft/publish/public-render causation verified | **PASS** | 9 tests, B1–B6, executed against the isolated DB through the real services |
| 5 | Draft isolation covered for all 15 page keys | **PASS** | 16 tests; each key uses a block type valid for its own family |
| 6 | Duplicate-content defect captured without silent suppression | **PASS** | Failing test, 7 duplicates reported with root cause. Not skipped or weakened |
| 7 | SEO metadata causation has an executable test pattern | **PASS** | 11 tests, incl. the additive-only indexing guarantee |
| 8 | Backward compatibility verified | **PASS** | 3 tests — missing property, unknown `sectionType`, empty `props` |
| 9 | Layout retrieval errors observable | **PASS** | 8 tests; 3 outcomes distinguished; mutation-verified (M2); fallback preserved |
| 10 | CI/harness execution status honestly documented | **PASS** | §E-1 — 4 BLOCKED with precise prerequisites; none reported as passing |
| 11 | No unauthorized product behavior, database, deployment or Git changes | **PASS** | §F. One database operation, owner-approved, gated and verified |

**11 of 11 PASS.** Criterion 6 passes *because* a test fails — that is the intended semantics.

---

## H. Stage 04 Handover

Full detail in `STAGE_03_HANDOVER.md`. The essentials:

**Blocking prerequisite — P1: inventory stored layout values before wiring any inert property.** Wiring a previously-ignored property changes a live page on the next publish for any owner who already saved a value. Deferred from Stage 02 (code-read-only) and Stage 03 (no product changes); a query is provided.

**Resolved by the owner's Option C approval:** D-15, D-01, **D-02 as Option B**, D-03 — recorded in the Stage 02 Decision Register with the original analysis preserved. Option B confirms `detail-hero`, `detail-body` and `detail-faq` for **removal**, retiring 5 of 9 `NO_RENDERER` exemptions.

**Recommended Stage 04 order:** `helpText` in shared field chrome → single definition per block type → clamp + validate → resolve the 3 `INERT` properties → declare or remove the 2 synthetic slots → express conditional property dependencies (NF-01) → delete each exemption as its property starts working.

**Still requiring owner approval:** **D-04 blocks Stage 05.** Also open: D-05, D-06, D-07, D-09, D-11, D-12, D-13, D-14.

**New Stage 03 findings:** **NF-01** — several properties have undeclared conditional dependencies (`heroImageAlt` needs `heroImageUrl`; `ctaUrl` needs `ctaText`; stats and FAQ pairs need each other), so an admin setting only one sees nothing happen. A plausible source of "this control is broken" reports that are *not* inert properties. **NF-02** — `next/link` normalises trailing slashes in hrefs.

---

## I. Final Verdict

**STAGE 03: COMPLETE**

The project can now tell a fix from a no-op. 183 behavioural tests were added, every one asserting observable output rather than source text; coverage derives from the live registry so it cannot be outgrown; and three mutations proved the suite can fail. The one product change — layout-retrieval observability — was in scope precisely because its silence would have masked everything Stages 04–10 do, and it preserves the existing fallback.

The homepage duplication defect is left **failing on purpose**. Stage 05 owns it. Marking it green would be the one outcome that undermines the whole stage.

Four harnesses remain BLOCKED on environment and are documented as such, with none reported as passing. The test database was migrated once, with explicit owner approval, after passing every safety check the owner specified; development and production were untouched.

No commit, push, merge or branch was created. HEAD is unchanged at `fd4fb10`, and all pre-existing work is preserved.

**Stage 04 has not been started.** Awaiting independent review and explicit authorization.
