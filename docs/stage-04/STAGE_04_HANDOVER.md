# Stage 04 — Handover to Stage 05

**Stage:** 04 of 10 · **Date:** 2026-11-09 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` (unchanged — no commit created)

**Stage 05 scope (from the Stage 02 roadmap):** Dynamic Content Source Engine — one coherent content-source contract, and the fix for KD-01.

---

## 1. Blocking prerequisite for Stage 05

**Decision D-04 is still unapproved, and it blocks Stage 05.**

The question: retire `lib/cms/contentSourceEngine.ts` and promote `slotUtils`, or integrate the engine?

Re-verified facts the decision rests on:

- The engine is **402 lines with zero importers**. Its only repository reference is a source-text assertion at `tests/batch33-unit.test.ts:12`.
- It is **unreachable by construction**: `parseContentSource` returns `null` without `props.sourceMode`, and `sourceMode` appears **nowhere** in the registry — count zero, re-confirmed in Stage 02.
- It **omits the fixture-exclusion filter** the live path applies at 24 call sites, so wiring it in unchanged would regress a working protection.
- Stage 04 strengthened the case for the recommended option by extending `slotUtils` with `limitList()` — the live helper now owns count limiting as well as `pickedThenAuto`, `numProp` and `idListProp`.

Stage 02's recommendation remains **retire the engine, promote `slotUtils`**. See `docs/stage-02/STAGE_02_DECISION_REGISTER.md` D-04.

**If D-04 is delayed:** Stage 06 (Visual Builder Canvas) is fully unblocked and was identified in the Stage 02 roadmap as the swap-ahead candidate. Stage 04's completion does not constrain that choice.

---

## 2. What Stage 05 inherits

| Asset | Where | Use |
|---|---|---|
| `limitList(items, props, key, max)` | `lib/cms/slotUtils.ts` | count limiting, already used by `landing-grid`. Reuse for any new content block rather than hand-rolling a slice |
| Clamp pattern | `lib/cms/detailTemplateData.ts` (`relatedCount`) | the model for bounding any resolver-side query |
| `numProp` / `idListProp` / `pickedThenAuto` | `lib/cms/slotUtils.ts` | the de-facto content-source layer the roadmap recommends promoting |
| Registry contract suite | `tests/stage03-registry-contract.test.ts` | any new `source*` prop is covered automatically; it derives from the live registry |
| Validation layer | `lib/cms/pageLayoutService.ts` `validateOneProp` | add new prop types here; it is `PropDef`-driven, so a new type needs one `case` |
| `PropField` component | `views/admin/PropField.tsx` | the Content Source panel should render through `PropFieldShell` so it inherits help text and ARIA association |
| 90 Stage 04 behavioural tests | `tests/stage04-*.test.ts` | regression safety net for the registry and validation |
| Mutation discipline | `STAGE_04_TEST_AND_MUTATION_REPORT.md` §3 | the pattern each new invariant must follow |

**Working baseline:** 87 files · 1822 tests · 1821 passed · **1 known failure (KD-01)** · 0 skipped · `tsc` 0 errors · `next build` succeeds.

---

## 3. KD-01 — Stage 05's primary deliverable

**Do not weaken, skip or alter its assertion.** It is the stage's acceptance mechanism.

```
tests/stage03-dedup-invariant.test.ts
  → 7 entities resolved into more than one homepage slot
```

**Root cause** (`lib/cms/homepageData.ts`): the `shownInHero` exclusion list is passed to the `latest-coverage` slot only, and is never extended after the hero resolves. Sibling category slots therefore cannot deduplicate against the hero or against each other.

**The designed-but-unconnected fix** already exists: `contentSourceEngine.ts` contains a `DeduplicationContext` threaded through `resolveMultipleSources`. The capability was designed and never connected — which is the substance of D-04.

**Verification at fix time:** the existing test must turn green with **no change to its assertion**. The expected-failure count then becomes **0**, and the Stage 04 figure of exactly 1 becomes the regression tripwire.

**Note on visibility:** fixing dedup changes which articles appear in which homepage slots. That is intended, but it is a visible editorial change — preview before publishing, and expect the owner to want to see it.

---

## 4. Carried-forward items

| Item | Owner stage | Note |
|---|---|---|
| **D-04 content engine** | **05** | **Blocking.** See §1 |
| `landing-competition-disciplines` promotion | 07 | Renders two hardcoded headings on `/competition/` that no admin can edit. Internal-only for now |
| `detail-hero` / `detail-body` / `detail-faq` removal | 07 | Confirmed by approved Option B. **Stored-layout audit shows zero occurrences, so removal is risk-free in audited environments.** Both are `required: true` and appear in `buildDefaultSlots('detail-template')`, so removal changes the detail default layout |
| `directory-hero` / `directory-grid` renderers | 07 | `directory-grid` is `required: true` yet unrenderable — whoever removes it must drop the `required` flag in the same change, or a directory layout becomes unsavable |
| KD-08 draft-save cache flush | 08 | **Needs `test:cache` wired up first** — see §5 |
| KD-09 / KD-10 concurrency | 08 | Interactive `expectedVersion`; atomic revision numbering |
| KD-11 / KD-12 legal pages | 09 + D-13 | Engineering fix separable from the owner/legal publication decision |
| KD-13 / KD-14 SEO gaps | 09 | Task E of Stage 03 established the causation pattern |
| 49 grandfathered structural tests | opportunistic | Stage 04 retargeted 10 of them but did not convert them. Convert as each stage touches the area |
| `richtext` prop type | unscheduled | Declared in `PropType`, used by no block, and `SimplePropField` renders it as a plain textarea. Either implement rich editing or remove the type |

### Mutation gaps still open

Carried from Stage 03 and unchanged: **draft isolation** (B3 / Task C) has no mutation proving its assertion is load-bearing — the honest mutation would make published retrieval read the draft column, which leaks unpublished content and deserves a deliberate run with the owner's awareness. The **test quality gate** is self-tested against synthetic titles but no deliberately-bad test file has been added to confirm it blocks one end to end.

---

## 5. Harness plan — act on this in Stage 05 or 06

Stage 04 found the precise reason the HTTP harnesses have never run, and it is not what previous stages assumed.

**Cause:** `next start` sets `NODE_ENV=production`, which activates the project's own environment isolation guard (`lib/env.ts` / `lib/env-guard.ts`). That guard refuses to boot a production build against a local database:

```
environment INVALID: NEXT_PUBLIC_SITE_URL must be https in production;
DATABASE_URL points at localhost in production; APP_ENV=production but
DATABASE_URL targets a local database
```

**This guard is correct and must not be relaxed.** The fix is to run the harnesses against `next dev`, which does not trip it.

**Concrete steps:**

```bash
# 1. ensure no other dev server is running — Next refuses a second instance and
#    the symptom is a confusing 500, not a clear port error
netstat -ano | grep -E ":3000|:3100" | grep LISTENING

# 2. dev server against the ISOLATED test database
DATABASE_URL=$TEST_DATABASE_URL APP_ENV=development npx next dev -p 3100

# 3. read-only route smoke
SMOKE_BASE_URL=http://localhost:3100 npm run test:routes
```

Prerequisites already satisfied: the test database **is** seeded (17 articles, 6 `fixture-` records) and is schema-current after the Stage 03 migration.

`test:cache` additionally **writes** to the database (ephemeral admin + throwaway article), so it needs the same isolated target plus write authorization. **Stage 08 cannot verify the cache-scoping fix without it**, so wiring it earlier is worthwhile.

`test:e2e` needs Playwright browsers downloaded in addition to the above. `test:migration` creates a throwaway database and remains unauthorized.

---

## 6. Owner decisions still required

**Resolved earlier:** D-15, D-01, D-02 (Option B), D-03 — recorded in the Stage 02 register.

**Settled by Stage 04 as engineering, no approval needed:** D-10 (property validation — implemented, with the undeclared-key whitelist deliberately warn-only).

| Priority | ID | Decision | Blocks |
|---|---|---|---|
| **1** | **D-04** | Content engine: retire or integrate | **Stage 05** |
| 2 | **D-11** | Newsletter block — see §7 | Stage 05/06 |
| 3 | D-13 | Legal content approval and indexing | Stage 09 |
| 4 | D-05 | Footer ownership | Stage 08 |
| 5 | D-06 | Appearance controls | Stage 08 |
| 6 | D-07 | Revision retention | Stage 08 |
| 7 | D-12 | Scheduler and deployment | Stage 08 |
| 8 | D-14 | Sitewide `Organization`/`WebSite` JSON-LD | Stage 09 |
| 9 | D-09 | Info-page publication workflow | Stage 09 |

---

## 7. D-11 — newsletter block: findings and recommendation

**Inspected, not changed.** Per the stage directive, no public-facing behaviour change was made and no backend was built.

**Current behaviour** (`components/blocks/PremiumBlocks.tsx:102-116`): the block renders publicly as a styled email form with a `readOnly` input and a button carrying **no handler**. A visitor can click it and nothing happens. All four declared properties (`title`, `description`, `ctaText`, `placeholderText`) are consumed and render correctly — the *form* is the problem, not the properties.

Because the input is `readOnly`, a visitor cannot even type an address, so **no personal data is collected and none is transmitted**. There is no privacy exposure today; the issue is a broken promise on a live publication.

**Context:** the Website Experience Architecture Blueprint documents this block as **hidden until a subscription backend exists** (`BLUEPRINT:126`). The deferral was decided and never enforced in the registry.

**Options**

| Option | Effect | Trade-off |
|---|---|---|
| **A — Remove from the registry** *(recommended)* | The block can no longer be added. Enforces the decision already taken. | Removes a block an owner may believe is functional. The stored-layout audit shows **zero** stored uses, so nothing breaks |
| B — Keep, visibly disabled | Replace the form with "Newsletter coming soon" | Still occupies homepage space for a feature that does not exist |
| C — Implement capture | Needs a provider, a consent model, and a data-protection position | A product expansion well outside Builder scope |

**Recommendation: A.** It enforces the existing decision, removes a dead form from a live publication, and carries no data risk. It is reversible the moment a backend exists.

**Owner approval required** before removal, because it changes what the Builder offers and removes something the owner may expect to work. Stage 04 deliberately left it in place pending that decision.

---

## 8. What Stage 05 must not do

- **Do not weaken, skip or alter the KD-01 assertion** to make the suite green. It is the stage's deliverable.
- **Do not grow the exemption register.** It stands at 15 entries with **zero `INERT`**. An unregistered exemption fails the contract suite, and a stale `INERT` entry fails it too.
- **Do not add a source-text assertion** to a test whose name claims a rendering outcome — the Stage 03 gate will fail, correctly.
- **Do not relax the environment isolation guard** to get a harness running. Use `next dev` (§5).
- **Do not wire the dead engine in unchanged** — it lacks fixture exclusion and would regress a working protection.
- **Do not build a second renderer, SEO engine or content store** — excluded by the approved Option C model.
- **Do not remove the detail-template declarations** without coordinating with Stage 07; they are `required` and shape the family's default layout.

---

## 9. Git and environment state at handover

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` |
| HEAD | `fd4fb10` — **unchanged; no commit, push, merge or branch created** |
| Modified tracked files | **18** (10 from Stage 04, 8 carried from Stages 01–03) |
| New untracked files | 4 from Stage 04 (`PropField.tsx` + 3 test suites) |
| Prisma migrations | **19 — unchanged**; no migration authored or applied in Stage 04 |
| Databases | dev and production **untouched**; test database read-only except via the test suites' own create/cleanup |
| Dev servers | all terminated; ports 3000 and 3100 confirmed free |

Git finalization remains deferred until the owner requests it.
