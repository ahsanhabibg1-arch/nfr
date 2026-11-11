# Stage 03 — Behavioral Test Matrix

**Stage:** 03 of 10 · **Date:** 2026-11-09 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10`

Every row states **the user-visible behaviour proven**, not merely the symbol asserted. That distinction is the point of this stage: 611 pre-existing tests across 13 Builder suites described this behaviour in source-text assertions without ever traversing it.

**Executed result:** 84 files · 1732 tests · **1731 passed · 1 failed (intended, KD-01) · 0 skipped** · 129.76s. `tsc --noEmit`: 0 errors.

---

## 1. New suites at a glance

| Suite | Tests | Task | Mechanism | Behaviour proven |
|---|---|---|---|---|
| `stage03-registry-contract.test.ts` | **123** | A | `renderToStaticMarkup` on real block components | Every advertised property changes the rendered page, or is registered as an exemption with a reason |
| `stage03-draft-publish-causation.test.ts` | **28** | B, C, F | Real services + isolated database + render | A draft save reaches preview, never reaches the public page before publish, and reaches it after |
| `stage03-layout-observability.test.ts` | **8** | G | Mocked Prisma + mocked logger | A database failure is logged and distinguishable from a missing layout |
| `stage03-seo-causation.test.ts` | **11** | E | Real `mergeSeoMeta` + `buildMetadata` | A stored SEO override reaches emitted metadata, and indexing cannot be widened |
| `stage03-dedup-invariant.test.ts` | **5** (4 pass, **1 intended fail**) | D | Real homepage resolver + isolated database | No entity appears twice on a page — **currently violated, KD-01** |
| `stage03-test-quality-gate.test.ts` | **8** | H | Static scan of the test suite itself | No new test may claim a rendering outcome on source-text evidence |
| **Total new** | **183** | | | |

Baseline comparison: Stage 01 executed 78 files / 1549 tests. Stage 03 executes **84 files / 1732 tests** — **+6 files, +183 tests**, and **28 → 0 skipped**.

---

## 2. Task A — registry contract (123 tests)

Coverage is derived from the live registry at run time, so a block or property added in any later stage is covered automatically and cannot bypass the contract.

### 2.1 Shape invariants (4 tests)

| Behaviour proven | Assertion |
|---|---|
| Coverage is not a hardcoded list | both registry and renderer map are read at run time |
| Registry/renderer drift is visible | 29 definitions → 27 unique → 23 renderers; the 6 unrendered and 2 undeclared types are named explicitly |
| Duplicate definitions are surfaced | `cta-banner`, `rich-text-block` each declared twice |
| Every renderer is callable | each `blockRegistry` value is a function |

### 2.2 Property causation (105 tests)

For each declared property the suite renders the **real** component twice — once with a unique sentinel, once without — and requires the sentinel to appear only in the first. The second render is what stops an assertion passing on unrelated static markup.

| Block family | Blocks | Properties proven to reach HTML | Exempt |
|---|---|---|---|
| Homepage | 15 | 68 | 13 |
| Section landing | 6 (incl. 2 shared) | 8 | 4 |
| Detail template | 5 | 0 | 8 |
| Directory | 3 | 0 | 6 |

Non-text property types are handled on their own terms rather than skipped: `select` props assert the class or inline style they produce (`text-align:right`, `flex-row-reverse`, `bg-stone-100`), `image` props assert the emitted `src`, and `url` props assert the emitted `href`.

### 2.3 Exemption register integrity (4 tests)

The register is rigid in **both** directions, which is what prevents it becoming a dumping ground:

| Behaviour proven | Why it matters |
|---|---|
| An exemption must be registered or arise from a resolver-level property type | an unregistered exemption fails the suite — exemptions cannot silently expand |
| No register entry may be stale | if an `INERT` property starts reaching output, the suite **fails** until the entry is removed — the register must shrink as defects are fixed |
| The `INERT` set is exactly the 3 documented component-level cases | a fourth appearing is a regression, not a quiet addition |
| Every entry carries a substantive reason | a reason under 20 characters fails |

### 2.4 Negative control (3 tests)

A deliberately broken renderer that ignores its prop **must not** satisfy the contract; the real renderer **must**; an unregistered block type has no renderer. These prove the contract is capable of failing — see `STAGE_03_MUTATION_VERIFICATION.md` for the live mutations.

---

## 3. Task B — draft to public causation (9 tests)

The chain no previous test traversed. Executed against the isolated `nfrguide_test` database through the real `saveDraft` / `publishLayout` services.

| ID | Behaviour proven | Assertion |
|---|---|---|
| B1 | A draft save persists the property | the sentinel is in the `draftSections` column |
| B2 | Authorized preview resolves the **draft** value | `getDraftSections` → render contains the sentinel |
| B3 | **The public page does not expose an unpublished draft** | `getPublishedSections` → render does **not** contain it |
| B4 | Publishing copies draft → published | `publishedSections` contains the new value |
| B5 | The public page then reflects the published value | render contains the published sentinel and **not** the earlier draft-only one |
| B6 | A revision is created on publish | `PageLayoutRevision` count increments by exactly 1 |
| — | A published layout is reported as `stored`, not a default | distinguishes real content from fallback |
| — | A draft save is reported as `stored` | same, for the draft column |
| — | Resolver-level properties survive the round trip | `articleCount: 7` and `featuredIds: ['fx-a','fx-b']` read back intact — this is what closes the `VIA_RESOLVER` exemptions |

B3 is the single most valuable assertion in the stage: it proves unpublished editorial work cannot leak to visitors.

## 4. Task C — draft isolation across all 15 page keys (16 tests)

One test per key, plus a guard that the key count is still 15. Each writes a key-specific sentinel as a draft, then asserts it is present in draft resolution and **absent** from published resolution, then restores the prior row exactly.

`homepage` · `section:competition` · `section:entertainment` · `section:events-shopping` · `section:plan-watch` · `section:rodeo-events` · `template:article` · `template:rodeo-hub` · `template:rodeo-edition` · `template:discipline` · `template:category` · `template:competitor` · `template:venue` · `directory:competitors` · `directory:venues`

Each key is exercised with a block type valid for **its own** family, taken from that family's defaults — so the test respects the real per-family contract rather than assuming full composability. For the 7 `template:*` and 2 `directory:*` keys that are appendage-only, this is the actual supported contract.

## 5. Task F — backward compatibility (3 tests)

| Behaviour proven | Assertion |
|---|---|
| A layout stored **without** a later-added property still renders, using the documented default | a row carrying only `title` renders, and the absent `alignment` falls back to `text-align:left` |
| A stored slot with an **unknown** `sectionType` does not break the page | the known block renders; the retired type contributes nothing and does not throw |
| A stored slot with empty `props` renders | no throw |

This is the property that makes the whole Stage 04–10 plan safe: new properties are additive, and old rows keep working.

---

## 6. Task E — SEO metadata causation (11 tests)

The reusable pattern for Stage 09. The SEO engine was **not modified**.

| Behaviour proven | Assertion |
|---|---|
| A stored `seoTitle` replaces the derived title | override wins |
| A stored `metaDescription` replaces the derived description | override wins |
| With no override, derived values survive | no accidental blanking |
| The override reaches `buildMetadata` output | present in `title.absolute`, with the site suffix still applied |
| The override reaches Open Graph **and** Twitter blocks | social metadata is not a separate path |
| An empty-string override does **not** blank the derived value | guards against a cleared field wiping metadata |
| A stored `noindex` is honoured | `robots.index === false` |
| **`noindex` is additive only** | with `derivedNoindex: true` and editor `noindex: false`, indexing stays **off** — an editor cannot force-index content the policy withholds |
| Content-noindex is `nofollow`; editor-noindex keeps `follow` | the two exclusion sources carry different semantics by design |
| A never-stored sentinel does not appear | negative control |

---

## 7. Task G — layout retrieval observability (8 tests)

The three outcomes were previously indistinguishable and unlogged.

| Case | Behaviour proven |
|---|---|
| **Missing layout** | family defaults served, reported `default-no-layout`, **nothing logged as an error** |
| **Valid default** (row exists, empty array) | defaults served, reported `default-empty`, not an error |
| **Database failure** | defaults still served **(fallback preserved)**, reported `default-db-error`, **logged once and reported to the `database` category** |
| Log content | carries `pageKey` and `column`; the message does **not** contain the connection string |
| Stored sections | reported `stored`, not a default |
| Public signature | callers still receive a plain slot array — no contract change |
| Column separation | draft retrieval reads `draftSections`; published reads `publishedSections` |
| Negative control | a thrown query and a missing layout yield identical slots but **different** outcomes |

## 8. Task H — test quality gate (8 tests)

| Behaviour enforced |
|---|
| A **new** behaviourally-named test that reads source text fails the gate |
| 49 pre-existing violations are grandfathered in an explicit baseline |
| A baseline entry that no longer matches any test **fails** — the baseline must shrink, never linger |
| The debt figure (49) is asserted, so movement in either direction is a conscious act |
| The known false-pass case (`batch-t4` "editor renders helpText for text props") is captured |
| The detector recognises behavioural titles and ignores structural ones |
| An explicit `[structural]` marker opts a test out |
| Stage 03's own suites introduce **zero** new violations |

---

## 9. Task I — harness status (honest)

| Harness | Command | Status | Reason / prerequisites |
|---|---|---|---|
| Unit + integration suite | `npm test` | **EXECUTED** | 84 files, 1732 tests, 1 intended failure |
| TypeScript | `npm run typecheck` | **EXECUTED** | 0 errors |
| Route smoke | `npm run test:routes` | **BLOCKED** | Needs a running server (`SMOKE_BASE_URL`, default `localhost:3000`) **and** a server pointed at an isolated **seeded** database — the harness asserts on `fixture-` seed records. Read-only (GET). No server was running. |
| Cache invalidation | `npm run test:cache` | **BLOCKED** | Needs a running server **and writes to the database** — it mints an ephemeral admin, creates and promotes a throwaway article. Must point at an isolated seeded DB, never dev or production. |
| Playwright E2E | `npm run test:e2e` | **BLOCKED** | `playwright.config.ts` requires `webServer: npx next start` — a production build, a seeded database, and admin-login fixtures. The specs authenticate into `/admin/login/` and mutate admin session state. |
| Migration replay | `npm run test:migration` | **BLOCKED** | Creates a throwaway database for a from-zero replay. Out of bounds without separate approval. |
| Production build | `npm run build` | **NOT EXECUTED** | Not required to validate this stage; `tsc --noEmit` covers the changed surface. |

**No blocked harness is reported as passing.** Wiring these into CI, so Stage 10 is not their first execution, is carried forward in `STAGE_03_HANDOVER.md`.

---

## 10. What this matrix does *not* claim

- **No browser verification.** No admin credentials were available; the Builder UI was not driven. Task A proves block components render their properties; it does not prove the admin editor displays them. The `helpText` DOM assertion for the editor panel is a Stage 04 item.
- **Task D is failing, not passing.** KD-01 is captured, not fixed. Stage 05 owns the fix.
- **The dedup invariant covers the homepage only.** Section landings and detail pages are not yet covered by it.
- **Task E establishes a pattern on one path.** Per-family metadata coverage across all 30 routes is Stage 09.
- **The 49 grandfathered source-text tests still exist.** They are capped and tracked, not converted.
