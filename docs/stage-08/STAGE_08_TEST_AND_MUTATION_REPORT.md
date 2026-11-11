# Stage 08 — Test and Mutation Report

**Stage:** 08 of 10 · **Date:** 2026-11-11 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10`
**Database:** the isolated test database only (`TEST_DATABASE_URL` → `localhost:5432/nfrguide_test`). **Production was never contacted.**

---

## 1. Baseline verification

Run to completion before the first edit, as §1 requires. The directive warned: *"Do not trust reported numbers without verification. Record any discrepancy."*

| Item | Directive expected | **Measured** | Match |
|---|---|---|---|
| Branch | `office-sync-2026-11-08` | `office-sync-2026-11-08` | ✓ |
| HEAD | `fd4fb10` | `fd4fb1008e28cd99fa578a154d28f79318421d3c` | ✓ |
| Vitest files | 103 | **103** | ✓ |
| Tests | 2,283 passing | **2,283** | ✓ |
| Failed / skipped | 0 / 0 | **0 / 0** | ✓ |
| TypeScript | 0 errors | **0** | ✓ |
| `next build` | success, 69/69 | **success, 69/69** | ✓ |
| Prisma migrations | 19, schema unchanged | **19, `git status prisma/` empty** | ✓ |
| Production DB | not contacted | **not contacted** | ✓ |
| `TEST_DATABASE_URL` | isolated test DB only | `localhost:5432/nfrguide_test` | ✓ |
| Running servers | none unexpected | ports 3000 and 3100 free | ✓ |
| Existing uncommitted work | intact | 96 entries, nothing reset or discarded | ✓ |

**No discrepancy.** Stage 07's reported numbers were accurate — unlike Stage 06's, which Stage 07 had to correct. Chromium (32/32), the route harness (37/37) and the Stage 07 mutation result (10/10) were re-verified during Stage 08's own gates rather than at baseline, and all held.

---

## 2. Final regression gates

| Gate | Result |
|---|---|
| **Full Vitest** | **110 files · 2,439 tests · 2,439 passed · 0 failed · 0 skipped** |
| **TypeScript** | **0 errors** |
| **Next.js production build** | **succeeds** — 69/69 static pages |
| **Chromium browser** | **49 passed · 0 failed** (Stage 06: 13 · Stage 07: 19 · Stage 08: 17) |
| **Route harness** (production server) | **37 passed · 0 failed** |
| **Cache harness** (`test:cache`) | **10 passed · 0 failed** — wired and verified for the first time |
| **Mutation tests** | **13 applied · 11 killed · 2 survived**, both explained in §4 |

Growth: **2,283 → 2,439 tests (+156)**; **103 → 110 files (+7)**.

No test was deleted, skipped, weakened or marked `.todo`. Every changed assertion is listed in §3 with its reason.

### 2.1 A correction to the Stage 07 test report

Stage 07's report gave the browser split as **Stage 06: 14 · Stage 07: 18**. Counted from the files, the Stage 06 spec contains **13** tests and has since it was written, and the Stage 07 spec contains **19** after the test Stage 07 added during its own fix round. Stage 07's **total of 32 was correct**; only the split was wrong.

Recorded here rather than edited into a delivered document, which is how Stage 07 handled Stage 06's baseline error. It changes no result.

---

## 3. New and changed tests

### 3.1 New Stage 08 suites

| File | Tests | What it proves |
|---|---|---|
| `tests/stage08-concurrency.test.ts` | 23 | the version token moves on every write; stale saves are refused with usable detail and are audited; the other editor's content survives; a reload-and-retry succeeds; **real** overlapping saves and publishes; service-level authorization for save, publish, list, read and restore |
| `tests/stage08-revision-recovery.test.ts` | 18 | snapshot immutability and ordering; restore writes the draft and never `publishedSections`; restore creates no revision; publish-after-restore records one; failed restore (missing id, foreign page key, malformed snapshot) changes nothing; no retention is enforced; history is paginated |
| `tests/stage08-cache-scope.test.ts` | 28 | the path map covers all 15 keys and never targets the root for a non-homepage key; **the real Server Actions' actual `revalidatePath` calls**, per tier; the internal endpoint still fails closed |
| `tests/stage08-scheduler.test.ts` | 28 | scheduling eligibility and authorization; past/now rejection; empty-draft rejection; snapshot-at-scheduling-time; absolute-time due-ness; idempotent repeat execution; five concurrent runners; atomic revision; attribution; cancellation between capture and execution |
| `tests/stage08-hero-links.test.ts` | 22 | real crawlable hrefs; one link per article; no nested interactives; accessible names; focus rings; and that nothing else about the hero changed |
| `tests/stage08-global-controls.test.ts` | 24 | footer ownership pinned (D-05); the Appearance inventory (D-06); the mobile focal-point fix proven end to end; global controls stay global |
| `tests/stage08-quality-gate-enforcement.test.ts` | 13 | **carried-forward mutation gap 2** — the gate blocks real planted bad files and passes real good ones |
| `e2e/stage08-publishing.spec.ts` | 17 | Chromium: hero links at 1280/768/390 with keyboard navigation; the two-session conflict path; no autosave; no undo/redo; canvas contract intact |

**173 new tests.** Every one calls real code and asserts a computed outcome, real rendered HTML, or a real HTTP response.

### 3.2 Changed existing tests, each with its reason

Eleven assertions failed as a direct consequence of deliberate Stage 08 changes. All were **rewritten or re-targeted**, none removed.

| File | Count | Was | Now |
|---|---|---|---|
| `batch-c-revisions` | 7 | `expect(fnBody).toContain('prisma.pageLayout.updateMany')`, `toContain('snapshot: sections')`, `toContain('draftSections: revision.snapshot')`, `toContain('rev()')` | the same claims against the new implementation: `publishWithRevision`, `draftSections: parsed.data`, `revalidateDraft()`. Each carries the reason inline, and the behavioural proof is named |
| `batch-d-scheduling` | 2 | `toContain('prisma.pageLayout.updateMany')`, `toContain('rev()')` | `updateMany` + `publishWithRevision`; `revalidateDraft()` |
| `stage03-draft-publish-causation` | 4 call sites | `saveDraft(ACTOR, { pageKey, sections })` | `expectedVersion: 'unchecked'` — the explicit opt-out, which documents intent at the call site |
| `stage04-property-validation` | 1 + mock | same, plus a prisma mock modelling `upsert` | `expectedVersion: 'unchecked'`; mock now models `findUnique` / `create` / `updateMany`, the client the service actually uses; one write assertion retargeted from `upsertMock` to `createMock` |
| `stage05-registry-retirement` | 1 + mock | same | same |

Six of the nine updated source-text assertions were in revision and scheduling code — exactly where Task J asks for conversion when Stage 08 touches it.

### 3.3 Two of my own test titles the quality gate rejected

Worth recording, because the gate caught the author rather than the code. On the first full run, `stage03-test-quality-gate` flagged:

- `stage08-global-controls :: is gated OUTSIDE the component, so an image-only configuration **shows** nothing` — a behavioural verb over a body that asserted on `expect(homeView)`, a source read. **Correctly flagged.** Split into a `[structural]` test for the gate's location and a behavioural test for what the component renders.
- `stage08-global-controls :: proves the full chain for the fixed control: schema, editor, **render**` — same problem. Renamed to `wires the fixed control through schema and editor [structural]`, with the rendering half left to the behavioural tests above it.

And the enforcement suite tripped the gate on its own planted fixtures: the gate scans every `tests/*.test.ts` for `it('…')`, so writing planted bodies as literal template strings made their titles look like real violations in that file. The planted bodies are now assembled from a runtime-composed token, so they are invisible to the scan until they exist as their own file. **The gate was right every time.**

---

## 4. Mutation testing — 13 applied, 11 killed, **2 survived**

Each mutation is one deliberate change to **product** code; only the suites claiming to protect that guarantee are run; they must fail. Code was fully restored and re-confirmed green after every mutation, against the isolated test database.

| # | Guarantee attacked | Result | Tests failed |
|---|---|---|---|
| **M1** | the version guard in `saveDraft` | **KILLED** | 8 |
| **M2** | `version` increments on a draft save | **KILLED** | 8 |
| **M3** | the revision number is read **inside** the transaction | **SURVIVED** | 0 |
| **M4** | the transaction is retried on contention | **SURVIVED** | 0 |
| **M5** | a restore validates the snapshot first | **KILLED** | 1 |
| **M6** | a restore writes the draft, never `publishedSections` | **KILLED** | 2 |
| **M7** | a draft save does not flush the public site | **KILLED** | 12 |
| **M8** | an unmapped page key does not fall back to `/` | **KILLED** | 1 |
| **M9** | a scheduled publish is idempotent and consumes its schedule | **KILLED** | 3 |
| **M10** | the hero CTA has a crawlable `href` | **KILLED** | 22 |
| **M11** | the mobile focal-point control renders | **KILLED** | 1 |
| **M12** | revision reads require `system.config` | **KILLED** | 1 |
| **M13** | **carried-forward gap 1** — the public resolver serves published, not draft, content | **KILLED** | 19 |

### 4.1 The two survivors, and what they actually mean

**M3 (revision read moved outside the transaction) and M4 (retry removed) both survive — and so does applying both together.** I checked the combination explicitly rather than assume the two were masking each other.

**Why.** `publishLayout`'s own `pageLayout.update` takes a **row lock** on the layout. Concurrent publishes of the same page key therefore serialise on that lock, and by the time the second transaction reads the maximum `revisionNo`, the first has already committed. The read-modify-write race never happens.

**What follows, stated plainly:**

- The **duplicate-revision-number** half of KD-10, as described in the carried-forward notes, appears **unreachable in practice** through `publishLayout`. Stage 08 did not reproduce it even with both protections removed.
- The retry loop is therefore **defensive, not demonstrably load-bearing**. It is kept — it costs nothing and the row-lock argument depends on an implementation detail of how the layout is updated — but Stage 08 does not claim a test proves it.
- The **atomicity** half of KD-10 is a different matter and is genuinely load-bearing: `executeScheduledPublish` really did write the layout and its revision as two separate statements outside any transaction, so a failure between them published content with **no history**. That is real, it is fixed, and **M9 kills it**.

The test that asserts five concurrent publishes produce five distinct contiguous revision numbers still earns its place — it pins the observable outcome — but its comment now says it does not isolate the fix, and this report says the same. Claiming 13/13 would have been easy and wrong.

### 4.2 Carried-forward mutation gap 1 — **CLOSED**

Stages 03, 05 and 07 all recorded: *"draft isolation has no mutation proving its assertion is load-bearing (the honest mutation leaks unpublished content and deserves a deliberate run with the owner's awareness)."*

**M13** is that mutation: `getPublishedSections` reads `draftSections` instead of `publishedSections`, so every public read serves unpublished content. It **kills 19 tests** across `stage03-draft-publish-causation`, `stage07-renderer-consolidation` and `stage08-revision-recovery`. Draft isolation is load-bearing and now proven so.

Run safely, as §13 requires: against the **isolated test database only**, with the mutation reverted and the suites re-confirmed green immediately afterwards. No unpublished content was exposed to any real public environment, no production database was contacted, and the environment isolation guard was not weakened.

### 4.3 Carried-forward mutation gap 2 — **CLOSED**

Stages 03 and 07 recorded: *"the test quality gate is self-tested against synthetic titles but no deliberately-bad test file has proved it blocks one end to end."*

`tests/stage08-quality-gate-enforcement.test.ts` closes it by **writing real test files into `tests/`**, running the real detection over the real directory, and asserting the outcome — then removing them in `afterEach`, including on failure.

| Planted file | Expected | Result |
|---|---|---|
| rendering claim proved by a source substring | blocked | **blocked** |
| three behaviour claims (`clamps`, `handles`, `supports`) | blocked ×3 | **blocked ×3** |
| `expect(src)` and `expect(editor)` — the shapes Stage 07's first detector missed | blocked ×2 | **blocked ×2** |
| direct `expect(read(...))` with no variable | blocked | **blocked** |
| behaviourally named, asserts rendered output | **passed** | **passed** |
| honestly named structural claim | **passed** | **passed** |
| rendering claim with the `[structural]` opt-out | **passed** | **passed** |
| file that never reads product source | **passed** | **passed** |

Plus three control tests: no planted file is left behind, the un-planted directory has no unexcused violations, and the baseline is still **53**.

**One finding from building it.** The first "legitimate" fixture asserted `expect(src.length).toBeGreaterThan(0)` and was **blocked** — correctly, because that *is* an assertion on source text. A legitimate test may *read* source; it may not *assert* on it. The fixture was corrected rather than the gate.

### 4.4 Quality gate baseline — unchanged at 53

**The baseline was not regenerated.** Stage 08's new violations were fixed at source (§3.3), not grandfathered. `BASELINE.size === 53` is asserted in two suites.

---

## 5. The cache harness — wired and verified for the first time

Task D begins: *"First wire and verify the existing `test:cache` harness."* D-08 records it as *"not executed in Stage 01 or 02"*. Running it showed **it could not pass on either server**, for two independent reasons:

| Server | Result | Why |
|---|---|---|
| `next start` (production), as found | **7 / 10** | checks 4/5/6 failed. The harness promotes the article by calling `transitionWorkflow` **directly**, bypassing the Server Action that calls `revalidatePath` — so the ISR cache was never busted and the newly published article stayed invisible |
| `next dev` | **8 / 10** | checks 1/7 failed. The dev server does not return 404 for `notFound()`, so "a draft is not public" cannot be observed |

The harness's own header asserted the production case worked *"by the publish Server Action's `revalidatePath()` calls"* — but the harness never invokes that action. The note was wrong, and had been for two stages because nobody ran it.

**The fix.** An out-of-process script cannot call `revalidatePath`. The application already exposes exactly one mechanism for an external caller, and the scheduled-publish runner already uses it: the authenticated `POST /api/internal/revalidate`. The harness now calls it after each transition that changes publicness — the same thing the deployed system does for a scheduled publish. No new mechanism, no widened allow-list, no weakened guard. Without `INTERNAL_REVALIDATE_SECRET` it says so and skips, because the endpoint fails closed by design.

A second, smaller fix was needed: the allow-list permits only `/`, revalidated as a layout, so a production server regenerates all 69 static pages — each querying the database. The harness's **next** interactive transaction then competed for the connection pool and expired at Prisma's 5s default with P2028, which looks like a product failure and is not one. The harness now waits for the server to settle, capped, before continuing.

**Result on a real production server: 10 / 10.**

```bash
cd apps/web
export TEST_DATABASE_URL="<from .env>"; export DATABASE_URL="$TEST_DATABASE_URL"
export APP_ENV=test
export INTERNAL_REVALIDATE_SECRET="<any value, same for server and script>"
npx next build && npx next start -p 3100 &
SMOKE_BASE_URL=http://localhost:3100 npm run test:cache
```

---

## 6. Browser verification — 49 passed, and the first run's failures

§14 requires first-run failures and their causes to be reported, not only the final green.

**First run: 7 failed / 42 passed.** Second: 5 failed / 44 passed. Third: **49 passed / 0 failed.**

| Failure | Cause | Resolution |
|---|---|---|
| 4 × Stage 08 conflict tests timing out in `makeDirty` | **my test bug, twice over.** It clicked the FIRST "Hide" button — and the first homepage block is `editorial-hero`, which is `required: true`, so the editor correctly refuses and no "Show" button appears. It then clicked "Show" to toggle back, which restores the original JSON — and the editor computes `dirty` by comparing JSON, so the net effect was **not dirty** | walk the Hide buttons from the end, where the non-required blocks are, and leave one hidden. **The same latent flaw existed in the Stage 06 spec**, introduced by Stage 07, and was fixed there too |
| `a hero card contains exactly one interactive element` | **my test bug.** `article.group` also matches cards from other homepage sections, which have their own link structure | scoped to `article.group:has(> a[href^="/articles/"])` |
| 3 × Stage 07 directory-canvas tests | **a real finding, and an indictment of my own Stage 07 verification.** The Builder starts `dirty` when a page has no stored layout (a deliberate Stage 06 fix so Save Draft is enabled for unsaved defaults). Switching pages therefore fires `window.confirm('You have unsaved changes…')`, which Playwright **auto-dismisses** — so the page switch was silently cancelled and the canvas stayed on the homepage. These tests passed in Stage 07 **only because a leftover `homepage` PageLayout row made the editor clean**; Stage 07's own teardown fix removed that row and exposed the dependency | two fixes: the specs accept the dialog, and — more importantly — the **product** was corrected. See §6.1 |
| 2 × conflict-banner selector | **my test bug.** `getByRole('alert')` also matches the success toast and Next's `__next-route-announcer__`. Strict mode rejected the ambiguity. **The banner itself worked**: the failure output shows its exact text | gave the banner `data-nfr-conflict="1"` and scoped the assertions to it |
| `device modes change the canvas viewport width` (Stage 06) | **a flake under load.** Mobile measured 686px instead of 390px during a three-spec run; the spec passes 13/13 in isolation and passed in the final combined run. A measurement race while the browser was busy | no change. Recorded as a known flake |

### 6.1 A product fix that came out of the browser run

The dirty-on-load behaviour was producing a **spurious confirmation**: every first page switch of every session asked "You have unsaved changes. Discard them?" before the operator had touched anything, because every page starts with no stored layout. A confirmation that cries wolf is one an operator learns to dismiss reflexively — which is precisely how real unsaved work eventually gets lost, and the opposite of Task I's "avoid accidental loss of unsaved editor changes".

`touched` was introduced alongside `dirty`: only a real edit through `updateSlots` sets it, and the page-switch prompt and the `beforeunload` guard now key off it. Save enablement still keys off `dirty`, so the Stage 06 fix that made Save Draft available for unsaved defaults is preserved exactly.

**This was found only because the browser disagreed with the unit tests** — the same lesson Stage 06 recorded when `X-Frame-Options: DENY` blanked the canvas while every unit test passed.

---

## 7. Coverage against the §14 required list

| Area | Where | Kind |
|---|---|---|
| Optimistic concurrency | `stage08-concurrency` (23), `e2e/stage08-publishing` | DB + browser |
| Stale editor versions | `stage08-concurrency`, browser two-session test | DB + browser |
| Atomic revision numbering | `stage08-concurrency`; **caveat in §4.1** | DB |
| Restore as draft | `stage08-revision-recovery` | DB |
| Publish after restore | `stage08-revision-recovery` | DB |
| Revision authorization | `stage08-concurrency` (5 service-level refusals) | DB |
| Revision history ordering | `stage08-revision-recovery` | DB |
| Cache invalidation | `stage08-cache-scope` (28), `test:cache` (10/10) | action-level + HTTP |
| Draft isolation | `stage03-draft-publish-causation`, **mutation M13** | DB + mutation |
| Scheduler idempotence | `stage08-scheduler` (repeat + five concurrent runners) | DB |
| Unauthorized scheduling | `stage08-scheduler` | DB |
| Footer ownership | `stage08-global-controls` — **pinned, D-05 unapproved** | rendered HTML |
| Appearance persistence and public output | `stage08-global-controls` — audit + the one fix proven end to end | rendered HTML |
| Homepage semantic links | `stage08-hero-links` (22), `e2e/stage08-publishing` | HTML + browser |
| Keyboard accessibility | browser: focus, Tab, Enter-to-navigate, focus ring, three widths | **browser** |
| Saved-draft canvas behaviour | `e2e/stage08-publishing`, `e2e/stage06-visual-builder` | browser |
| Registry and page capability consistency | `stage06-page-capability`, `stage03-registry-contract` (unchanged, passing) | behavioural |

---

## 8. Defects found by Stage 08

| # | Defect | Severity | Status |
|---|---|---|---|
| 1 | **KD-09** — `saveDraft` had no concurrency token at all; `LayoutRow` did not even carry `version`. Two editors: last write wins, silently | **High** | **FIXED** — M1, M2 killed |
| 2 | **KD-10 (atomicity half)** — `executeScheduledPublish` wrote the layout and its revision as two statements outside any transaction, so a failure between them published content with no history | **High** | **FIXED** — M9 killed |
| 3 | **KD-08** — `rev()` flushed the entire public site, and `saveDraftAction` called it | **Medium** | **FIXED** — M7, M8 killed |
| 4 | **S08-1** — `restoreRevision` wrote the snapshot into the draft with no validation; the only unvalidated write path into a draft | Medium | **FIXED** — M5 killed |
| 5 | **S08-2** — `version` was maintained by one of eight transitions | Medium | **FIXED** — now six |
| 6 | **S08-3** — `listRevisions` / `getRevision` had no service-level authorization; snapshots contain unpublished content | Low | **FIXED** — M12 killed |
| 7 | **S08-6** — the Appearance screen's `introBannerMobileFocalX/Y` had a slider, a schema and persistence, and were read by nothing | Medium | **FIXED** — M11 killed |
| 8 | **S08-7** — the Builder prompted "You have unsaved changes" on every first page switch, before any edit | Medium | **FIXED** — `touched` vs `dirty` |
| 9 | **S08-8** — `test:cache` had never been run and could not pass on either server; its header documented behaviour it did not have | Medium | **FIXED** — 10/10 |
| 10 | **S08-9** — the e2e Builder specs' page switch depended on a leftover `PageLayout` row; Stage 07's own teardown fix broke it | Medium | **FIXED** — product fix + dialog handling |
| 11 | **S08-4** — `getRevision(revisionId)` takes no `pageKey`, so it can read any revision by id | Low | **REPORTED.** No action exposes it; adding the parameter changes a public signature for no current benefit |
| 12 | **S08-5** — `getDueSchedules`'s `scheduledSections: { not: { equals: null } }` does not exclude a database NULL in a `Json` column | Low | **REPORTED, NOT FIXED.** Bounded by the execution guard: nothing is published. Fixing it means choosing between Prisma's `DbNull` and `JsonNull` semantics, which changes which rows a production query returns — Stage 09 |
| 13 | **KD-10 (duplicate-number half)** — appears **unreachable** through `publishLayout` because the layout row lock serialises same-key publishes | Informational | **REPORTED** — §4.1 |

---

## 9. Repository and environment state

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` — unchanged |
| HEAD | `fd4fb10` — **unchanged; no commit, push, merge, reset or branch created** |
| Prisma migrations | **19 — unchanged**; none authored or applied |
| `prisma/schema.prisma` | **unmodified** |
| `prisma db push` / `migrate reset` | **never run** |
| Production database | **never contacted.** No credentials used, no query issued |
| Development database | **never written to** — every server and script ran with `DATABASE_URL` pointed at the isolated test database |
| Isolated test database | written by the Stage 08 DB suites under reserved page keys, each removed in `afterAll`; by the e2e harness, whose teardown clears `PageLayout` / `PageLayoutRevision`; and by the cache harness, which removes its own ephemeral admin and article |
| Environment isolation guard | **not weakened**. `APP_ENV=test` with the isolated database satisfies it |
| RBAC / publication permissions | **not weakened** — strengthened at two service functions |
| Audit logging | **not disabled** — extended with a conflict event |
| `INTERNAL_REVALIDATE_SECRET` requirement | **not weakened**; still fails closed, still allow-listed to `/` |
| Legacy block types | **none deleted** |
| Revision history | **none deleted** (D-07 unapproved) |
| Credentials in reports | **none** — the harness secret shown in §5 is a local placeholder, not a configured value |
| `.next` | holds a test-database build; harmless for `npm run dev`, overwritten by the next build |
| Dev / test servers | terminated; ports 3000 and 3100 confirmed free |
| Prior stages' work | **fully preserved** |
