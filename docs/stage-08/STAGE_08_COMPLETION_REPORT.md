# Stage 08 — Completion Report

**Programme:** Controlled Hybrid Website Builder, CMS & SEO Remediation
**Stage:** 08 of 10 — Publishing, Revisions, Concurrency, Cache Integrity & Global Controls
**Date:** 2026-11-11 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` (unchanged — no commit created)

---

# STAGE 08 — PARTIAL / OWNER DECISION REQUIRED

**Every mandatory, authorized task is complete.** Four tasks are gated on owner decisions that the decision register still records as unapproved, so the features behind them were **audited and proposed, not implemented**. Per §18, the blocked work is listed separately in §4 rather than buried.

| | |
|---|---|
| **Completed** | Tasks A, B, C, D, H, I, J, K in full; Task G's correctness half |
| **Blocked on an owner decision** | Task E (**D-05**), Task F implementation (**D-06**), retention in Task C (**D-07**), Task G's operational half (**D-12**) |
| **Nothing was approved by implication, and no default was invented** | no retention duration, deletion policy, footer owner, brand identity, scheduler frequency, deployment provider or publication policy was chosen |

---

## 1. The decision gate came first

§3 required the exact current wording and approval status of D-05, D-06, D-07 and D-12 **before work was planned**. Checked in `docs/stage-02/STAGE_02_DECISION_REGISTER.md`:

**The register has exactly two approval rounds, both 2026-11-09.** They cover D-15, D-01, D-02, D-03, D-04 and D-11. The register's own closing line after the second round lists **D-05, D-06, D-07, D-09, D-12, D-13 and D-14 as still requiring owner approval**, and no later round exists in the register or in any Stage 03–07 handover.

One decision in Stage 08's scope is explicitly **not** gated: **D-08** (draft-save cache behaviour) reads *"Approval required: **NO** — this is an engineering correction of a defect, within approved scope."* That is why KD-08 was fixed.

Full audits and decision-ready proposals: **`STAGE_08_GLOBAL_CONTROLS_AND_DECISIONS.md`**.

---

## 2. Verified baseline

Run to completion before the first edit; no overlapping runs.

| Item | Expected | **Measured** |
|---|---|---|
| Vitest | 103 files / 2,283 tests / 0 failed / 0 skipped | **103 / 2,283 / 0 / 0** |
| TypeScript | 0 errors | **0** |
| `next build` | success, 69/69 | **success, 69/69** |
| Migrations / schema | 19, unchanged | **19, unmodified** |
| Branch / HEAD | `office-sync-2026-11-08` / `fd4fb10` | **match** |
| Production DB | not contacted | **not contacted** |
| Uncommitted work | intact | **96 entries, nothing reset** |

**No discrepancy.** Stage 07's reported numbers were accurate — unlike Stage 06's, which Stage 07 had to correct by 2 files and 33 tests.

---

## 3. Completed work

### Task A — audit, produced before any code changed

A full state-transition and persistence matrix across eight transitions, then the eight capability questions answered honestly — **three came back PARTIAL**, not YES. The directive's warning ("do not claim a feature exists merely because a table or button exists") earned its place: revision snapshots really were immutable and ordering really was deterministic, but attribution, permission enforcement and malformed-snapshot handling each had a gap.

Nine defects were confirmed, including the three carried forward (KD-08/09/10) and six new ones. **No schema change was needed** — `PageLayout.version` and `@@unique([pageKey, revisionNo])` both already existed and were simply unused — so no approval request was raised.

### Task B — optimistic concurrency and atomic revision numbering

**KD-09.** `saveDraft` accepted no version, never read one, never incremented one — and `LayoutRow`, the payload the editor receives, did not even carry the field. Two editors on one page meant **last write wins, silently**.

Now a version-guarded `updateMany` lets the **database** decide, in the same statement that writes, so no concurrency can slip between check and write. `expectedVersion` is a **required** field whose only escape must be spelled `'unchecked'` — a caller cannot forget it, which is how the hole was created. The interactive action has no escape at all. `version` is now maintained on **six** transitions instead of one; a token only some writes advance is not a token.

A refused save explains itself (both versions, who, when), keeps the operator's unsaved work on screen, and is **audited** as `page_layout.draft_save_conflict` — so "where did my changes go?" finally has an answer.

**KD-10.** `publishLayout` awaited `nextRevisionNo` while *building* its `$transaction` array, so the read happened before the transaction opened; `executeScheduledPublish` wrote its revision outside any transaction at all. Both now go through one interactive transaction with the read inside it.

Proven by **real concurrent operations** against the isolated test database: two and five simultaneous saves from one version yield exactly one winner and one increment; five overlapping publishes yield five distinct contiguous revision numbers.

> **An honest caveat, reported rather than buried.** Mutations M3 and M4 — and both together — **survive**. PostgreSQL's row lock on `pageLayout.update` already serialises same-key publishes, so the duplicate-number race appears unreachable through `publishLayout` and the retry loop is defensive rather than proven. The **atomicity** half is a different matter and is genuinely load-bearing: mutation **M9** kills it. Test report §4.1.

### Task C — revision recovery

Every policy-independent guarantee is now implemented and asserted: restore writes the **draft** and never `publishedSections`; it creates no revision of its own; the restored draft reaches the public site only after an explicit publish; history is ordered by `revisionNo`; a failed restore changes nothing; restore and publish are separately auditable; history reads are paginated.

**S08-1 fixed:** a restore was the only write path into a draft with **no validation**, so a malformed stored snapshot became the operator's working draft and then failed confusingly on the *next* save. It is now validated first and refused with the revision number and an explicit assurance that the draft is untouched.

**Retention is absent by design.** D-07 is unapproved, so Stage 08 enforces none and **asserts** it: twelve publishes leave twelve revisions, and the service exports no `prune|purge|deleteRevision|trimRevision|cleanup` function.

### Task D — cache invalidation (KD-08)

**First, the harness was wired.** D-08 recorded `test:cache` as never executed. Running it showed it could not pass on **either** server — 7/10 on production because it bypasses the Server Action that revalidates, 8/10 on dev because dev does not 404 for `notFound()`. Its own header documented behaviour it did not have. Fixed by having it call the application's existing authenticated revalidation endpoint, the same mechanism the scheduler uses. **Now 10/10 on a real production server.**

**Then the defect.** `rev()` called `revalidatePath('/', 'layout')` — the entire public site — and **`saveDraftAction` called it**, so saving an unpublished draft flushed the published version of the page being drafted. Two tiers now, chosen by what a mutation **writes**: the admin route alone for the six draft-writing actions, and the admin route plus that key's own paths for publish. A draft write needs no public invalidation at all, because the staff preview reads `draftMode()` and is therefore dynamic.

Proven by intercepting `revalidatePath` and driving the **real Server Actions**: every draft-tier action makes exactly one call, and none touches `/`.

### Task G — scheduler correctness

Fourteen properties verified, all deployment-independent: authorization, past/now rejection, empty-draft rejection, snapshot-at-scheduling-time, absolute-time due-ness, idempotent repeat execution, **five concurrent runners**, attribution, auditing, fail-closed secret handling, and per-page failure isolation. The atomicity defect is fixed. A deployment-neutral contract — `runDuePublications()` — is documented and tested, so any trigger is a safe caller.

### Task H — EditorialHero accessibility and crawlability

The defect Stage 07 found and deliberately deferred. Secondary stories were `<article onClick>`: not focusable, not keyboard-reachable, not announced as links, and carrying **no `href`** — invisible to crawlers, impossible to open in a new tab. The lead CTA was a `<button>` with the same consequences.

Now real `next/link` anchors, **one per article**, with no nested interactive elements, accessible names that include the article title, and visible focus rings. `onSelectArticle` is gone, which also removes `useRouter` from `EditorialHeroBlock` — one of the four client dependencies Stage 07 measured when it declined the server-component conversion — and `EditorialHero` no longer needs `'use client'` at all.

Verified in Chromium at **1280 / 768 / 390** with Tab, focus, Enter-to-navigate, one-anchor-per-card, and no horizontal overflow.

### Task I — Builder save/publish UX

The whole sequence was walked. A version conflict now produces a **persistent banner**, not a toast — a message saying "your work was not saved" that then vanishes is worse than none — naming both versions, who last edited and when, with an explicit reload button and a "keep editing" option. **The unsaved edits are deliberately preserved**; discarding them would turn a recoverable conflict into data loss.

**S08-7 fixed, found by the browser:** the Builder prompted *"You have unsaved changes. Discard them?"* on every first page switch of every session, before the operator had touched anything, because every page starts with no stored layout. `touched` was introduced alongside `dirty` — only a real edit sets it — so the prompt and the `beforeunload` guard stop crying wolf while Save Draft stays enabled for unsaved defaults.

No autosave, no second renderer, no undo/redo controls; all three asserted in the browser.

### Task J — test quality and both mutation gaps

The Stage 07 assertion-level gate is **preserved**, and its baseline is **unchanged at 53**. Stage 08's own two violations were fixed at source, not grandfathered. Nine source-text assertions in revision and scheduling code were converted or re-targeted, each with its reason inline.

**Both carried-forward mutation gaps are closed:**

- **Gap 1 — draft isolation.** Mutation M13 makes the public resolver serve `draftSections`. It **kills 19 tests**. Run against the isolated test database only, reverted immediately, suites re-confirmed green; no unpublished content reached any real public environment.
- **Gap 2 — gate enforcement.** `stage08-quality-gate-enforcement.test.ts` **writes real test files** into `tests/`, runs the real detection, and asserts the outcome: four bad-file shapes blocked, four good-file shapes passed, three controls. Every prior test of the gate fed it strings.

### Task K — verification

| Gate | Result |
|---|---|
| Full Vitest | **110 files · 2,439 tests · 0 failed · 0 skipped** |
| TypeScript | **0 errors** |
| `next build` | **succeeds**, 69/69 |
| Chromium | **49 passed · 0 failed** |
| Route harness | **37 passed · 0 failed** |
| Cache harness | **10 passed · 0 failed** |
| Mutations | **13 applied · 11 killed · 2 explained survivors** |

**First-run failures are reported, not hidden.** The first browser run was 7 failed / 42 passed. Four were bugs in Stage 08's own test code, two were ambiguous selectors, and **one exposed a real product defect** (S08-7) plus the fact that three Stage 07 tests had only ever passed because of a leftover database row. Full account: test report §6.

---

## 4. BLOCKED — owner decisions required

Listed separately, as §18 requires. Each is audited; none is implemented; none is guessed.

### 4.1 D-07 — revision retention · **blocks retention only**

**The question:** what retention policy applies, and may the first pruning run delete existing history?

| Option | Consequence |
|---|---|
| **(a) 50 per page key, prune on publish** ← recommended | Matches the existing `listRevisions` default, so no UI change. **The first run is an irreversible delete** |
| (b) By age (e.g. 180 days) | A rarely-edited page loses its only history while a busy page keeps dozens |
| (c) Keep everything | No deletion risk; unbounded growth of full JSON snapshots |
| (d) Count plus a floor | (a)'s predictability with a guard against an aggressive count |

**Recommendation: (a)**, on two conditions — the first run **logs what it removes**, and a dry-run mode exists.
**Blocks Stage 08 completion?** Recovery is complete. **Retention is BLOCKED.**

### 4.2 D-05 — footer ownership · **blocks footer implementation**

**The question:** which store owns the footer's menu columns, and what happens to the loser's data? Secondarily: should `DIRECTORY_LINKS` remain uneditable?

Re-verified and pinned by test: `SiteConfig.footer.columns` **replaces** the nav-driven columns when configured, so editing footer links under Header & Nav produces **no public change**. `DIRECTORY_LINKS` is force-merged regardless of admin nav.

**Recommendation: (a) `SiteConfig` owns columns — but the data migration of existing nav footer rows is a prerequisite, not a follow-up.**
**Blocks Stage 08 completion?** **No.** The footer renders correctly; the defect is an editing surprise. **It blocks all footer implementation, so none was done.**

### 4.3 D-06 — Appearance scope · **blocks Appearance implementation, including the rename**

**The question:** what is the Appearance screen for, and is real site-wide theming (logo, colours, fonts) wanted?

All **21** fields are `introBanner*`, re-verified by parsing the interface. The tab name implies site-wide control it does not have; the logo is not editable at all.

**Recommendation: (a) rename now, (b) retire-and-migrate when the migration can be verified, (c) only if asked.** Even (a) is a D-06 sub-option, so Stage 08 did not do it.

**One policy-independent defect was fixed inside this area:** `introBannerMobileFocalX/Y` had a slider, a schema and persistence, and were read by **nothing**. That is a broken existing control, not an implementation of D-06 — no theme, token, palette, typography option or brand rule was introduced. The mobile values default to the desktop values, so stored configurations render exactly as before.

**Blocks Stage 08 completion?** **No** for the audit, which is complete. **Yes** for any Appearance implementation.

### 4.4 D-12 — scheduler deployment target · **blocks operational integration**

**The question:** how is scheduled publication triggered in production — and is it wanted at all, given it was a deferred open question that was built anyway?

**Recommendation: (a) external cron hitting an authenticated route; remove the in-process timer.** Needs a platform cron entry, `INTERNAL_REVALIDATE_SECRET` configured, and the revalidation target changed from `localhost` to the public base URL.

**Blocks Stage 08 completion?** **No** for correctness — verified and fixed. **Yes** for operational integration, which is **BLOCKED** and not claimed as done.

---

## 5. Ownership model — preserved

| Domain | Owns | Stage 08 |
|---|---|---|
| **Structured CMS** | authoritative entity records and publication states | **untouched.** No schema change, no migration, no factual field moved into layout JSON |
| **Visual Builder** | approved composition, order, visibility, presentation | publishing **reliability** improved; the composition model unchanged |
| **SEO Intelligence** | metadata, canonicals, robots, structured data, indexing | **untouched.** No `lib/seo/*` module modified; no JSON-LD added; no publisher identity changed |

The 15 page keys and their composition levels are unchanged. No second renderer, parallel content engine, per-entity override or unrestricted editor was created. **`lib/cms/slotSelection.ts` — Stage 07's authoritative contract — was not modified.**

---

## 6. Defects found by Stage 08

Ten fixed, three reported. Full table in the test report §8.

| Fixed | |
|---|---|
| **KD-09** | no concurrency token at all; silent last-write-wins |
| **KD-10** (atomicity) | a scheduled publish could publish with no history |
| **KD-08** | a draft save flushed the entire public site |
| **S08-1** | a restore wrote an unvalidated snapshot into the draft |
| **S08-2** | `version` maintained by one of eight transitions |
| **S08-3** | revision reads had no service-level authorization |
| **S08-6** | the mobile focal-point control saved and rendered nothing |
| **S08-7** | the Builder prompted about unsaved changes before any edit |
| **S08-8** | `test:cache` had never run and could not pass on either server |
| **S08-9** | the e2e page switch depended on a leftover database row |

| Reported, not fixed | Why |
|---|---|
| **S08-4** | `getRevision` takes no `pageKey`; no action exposes it, and the signature change buys nothing today |
| **S08-5** | the due-ness JSON-null filter does not exclude a database NULL. **Bounded — nothing is published.** Fixing it means choosing Prisma `DbNull` vs `JsonNull` semantics, which changes which rows a production query returns → Stage 09 |
| **KD-10** (duplicate numbers) | appears **unreachable** through `publishLayout`; the row lock already serialises. Reported with the mutation evidence rather than claimed as fixed-and-proven |

---

## 7. Completion criteria

| Criterion | Status |
|---|---|
| Revision and publication state machine documented and verified | **MET** |
| Optimistic concurrency implemented; no silent destructive overwrite | **MET** — M1, M2 killed |
| Revision numbering atomic and retry-safe | **MET for atomicity** (M9); retry is defensive, with the survivors reported |
| Revision recovery: restore as draft, publish after restore, auditable, failure-safe | **MET** — M5, M6 killed |
| Retention policy | **BLOCKED — D-07** |
| Cache harness wired and verified | **MET** — 10/10 |
| KD-08 fixed; draft saves do not invalidate published content | **MET** — M7, M8 killed |
| Footer ownership resolved | **BLOCKED — D-05** (audited and pinned) |
| Appearance controls proven end to end | **MET for the one broken control**; scope **BLOCKED — D-06** |
| Scheduler safety | **MET**; operational integration **BLOCKED — D-12** |
| EditorialHero accessibility and crawlability | **MET** — M10 killed; browser-verified at three widths |
| Builder save/conflict/recovery feedback | **MET** |
| Quality gate preserved; mutation gaps investigated | **MET** — both gaps **closed** |
| Security regressions | **MET** — RBAC strengthened, audit extended, secret handling and allow-list unchanged |
| Browser tests pass | **MET** — 49/49, with first-run failures reported |
| No unexplained test failures | **MET** — 0 failed, 0 skipped; all 11 changed assertions justified individually |

---

## 8. Repository and environment state

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` — unchanged |
| HEAD | `fd4fb10` — **unchanged; no commit, push, merge, reset or branch created** |
| Prisma migrations | **19 — unchanged**; none authored or applied |
| Schema | **unmodified**; `db push` / `migrate reset` never run |
| Production database | **never contacted** |
| Development database | **never written to** |
| Isolated test database | left clean; every DB suite removes its own rows, and the e2e teardown clears `PageLayout` / `PageLayoutRevision` |
| Isolation guard · RBAC · audit logging · revalidation secret | **none weakened** — two were strengthened |
| Legacy block types · revision history | **nothing deleted** |
| Dev servers | terminated; ports 3000 and 3100 free |
| Prior stages' work | **fully preserved** |

Git finalization remains deferred until the owner explicitly requests it. **Stage 09 was not started.**

---

## 9. Deliverables

| Document | Contents |
|---|---|
| `STAGE_08_COMPLETION_REPORT.md` | this document |
| `STAGE_08_PUBLISHING_AND_REVISION_ARCHITECTURE.md` | the audit matrix, state machine, and the concurrency / recovery / cache contracts |
| `STAGE_08_GLOBAL_CONTROLS_AND_DECISIONS.md` | footer, Appearance and scheduler audits; a decision-ready proposal for each of the four blocked decisions |
| `STAGE_08_TEST_AND_MUTATION_REPORT.md` | baseline, every gate, every changed test with its reason, 13 mutations with both survivors explained, the cache-harness diagnosis, first-run browser failures, 13 defects |
| `STAGE_08_HANDOVER.md` | what Stage 09 inherits, the five traps, harness recipes, carried-forward items |
