# Stage 08 — Handover to Stage 09

**Stage:** 08 of 10 · **Date:** 2026-11-11 · **Branch:** `office-sync-2026-11-08` · **HEAD:** `fd4fb10` (unchanged — no commit created)

**Stage 09 scope (from the Stage 02 roadmap):** SEO and legal-content boundaries — D-09 (info-page publication workflow), D-13 (legal content approval), D-14 (sitewide `Organization` / `WebSite` JSON-LD), and the KD-13 / KD-14 SEO gaps.

---

## 1. Working baseline

**110 files · 2,439 tests · 2,439 passing · 0 failed · 0 skipped** · `tsc` 0 errors · `next build` succeeds (69/69) · Chromium **49/49** · route harness **37/37** · cache harness **10/10** · 19 migrations unchanged.

> **Verify these yourself before your first edit.** `cd apps/web && npx vitest run`. Stage 06's handover was wrong by 2 files and 33 tests; Stage 07's was right; Stage 08 checked both. If yours differ, record the discrepancy rather than trusting this page.

**There is still no known-failing test.** One known **flake** — see §6.

---

## 2. What Stage 09 inherits

| Asset | Where | Use |
|---|---|---|
| **The concurrency token** | `lib/cms/pageLayoutService.ts` | `ExpectedVersion = number \| 'unchecked'`, a **required** field. §4.1 |
| **Atomic publish + revision** | same, `publishWithRevision` | any new publish path must go through it, not around it. §4.2 |
| **The cache map** | `lib/cms/layoutCachePaths.ts` | `publishedPathsFor(pageKey)`; all 15 keys covered and a test enforces it. §4.3 |
| **Two cache tiers** | `app/admin/page-layout-actions.ts` | `revalidateDraft()` / `revalidatePublish(pageKey)`. **Never** `revalidatePath('/', 'layout')` again |
| **`touched` vs `dirty`** | `views/admin/AdminPageLayoutEditor.tsx` | two different questions; do not collapse them. §4.4 |
| **The conflict banner** | same | `data-nfr-conflict="1"` is the test hook; `role="alert"` alone is ambiguous |
| **A wired cache harness** | `scripts/cache-invalidation.mts` | 10/10 on a **production** server. The recipe is in §5 |
| **173 Stage 08 tests** | `tests/stage08-*.test.ts`, `e2e/stage08-publishing.spec.ts` | regression net for concurrency, recovery, cache, scheduler, hero links, global controls |
| **A self-testing quality gate** | `tests/stage08-quality-gate-enforcement.test.ts` | plants real bad files and proves they are blocked. Carried-forward gap 2, closed |
| **Mutation runner** | recorded in the stage working directory | 13 mutations, 11 killed, 2 explained survivors |

---

## 3. Recommended Stage 09 sequence

1. **Get D-13 and D-14 answered first.** Both need owner input (legal sign-off; publisher identity facts), and both gate visible output. Nothing engineering-side unblocks them.
2. **D-09's engineering half can start immediately.** `InfoPage` has no draft/published pair, and `saveInfoPageDraft` instructs the editor to "create a new draft revision" when **no such mechanism exists** — so editing a live legal page degrades or removes it. That is a correctness defect independent of the publication-policy decision. **It needs schema change S-1**, so request approval with the exact SQL before writing a migration.
3. **Reuse the Stage 08 patterns, do not re-invent them.** If `InfoPage` gains draft/published columns, it gains the same concurrency question `PageLayout` just answered — use `ExpectedVersion`, the row-guarded `updateMany`, and `publishWithRevision`'s shape rather than a second dialect.
4. **Add info-page paths to the cache map** when info pages gain a publish action. `publishedPathsFor` returns `[]` for an unknown key by design, so a new key that publishes nothing will look like it worked.
5. **Clear S08-5 while you are in the scheduler area** (§7).

---

## 4. The five things that will break if you ignore them

### 4.1 `expectedVersion` is required, and that is deliberate

```ts
saveDraft(actor, { pageKey, sections, expectedVersion: number | 'unchecked' })
```

A caller **cannot forget** it: TypeScript and Zod both demand the field. `expectedVersion?: number` would let any future action silently reopen KD-09, which is exactly how the hole was created. The opt-out must be spelled `'unchecked'`, so it is visible in review.

`saveDraftAction` takes a plain `number` — **no opt-out on the interactive path**. If you add another editor-facing save action, give it the same signature.

### 4.2 Any new publish path must go through `publishWithRevision`

It puts the layout write and the revision insert in **one** interactive transaction. The bug it fixes is real and was live: `executeScheduledPublish` wrote them as two separate statements outside any transaction, so a failure between them published content with **no history**. Mutation **M9** kills that.

**Read §4.1 of `STAGE_08_TEST_AND_MUTATION_REPORT.md` before you touch it.** Two mutations on this function survive, and the reason matters: the layout row lock already serialises same-key publishes, so the duplicate-revision-number race appears unreachable and the retry loop is defensive rather than proven. Do not remove it on that basis — the argument depends on how the layout happens to be updated — but do not claim a test proves it either.

### 4.3 Never call `revalidatePath('/', 'layout')` from an admin action

That single line was KD-08: it invalidates the root layout and therefore **every page on the site**, and `saveDraftAction` called it, so saving an unpublished draft flushed the whole public cache.

Two tiers now, chosen by what a mutation **writes**, not by what it is called:

- **draft tier** — `revalidateDraft()`, the admin route only. Used by save, reset, restore-defaults, **restore-revision**, schedule and cancel, because all six write draft or schedule columns only.
- **publish tier** — `revalidatePublish(pageKey)`, the admin route plus that key's paths.

`tests/stage08-cache-scope.test.ts` intercepts `revalidatePath` and asserts the exact calls each action makes, including that **no** draft-tier action ever touches `/`. Mutation **M7** kills a regression here.

A draft write needs no public invalidation at all, because the staff preview reads `draftMode()` and is therefore dynamically rendered. That reasoning lives in `draftWriteNeedsPublicRevalidation()` so it has one home.

### 4.4 `touched` and `dirty` answer different questions

| State | Means | Drives |
|---|---|---|
| `dirty` | the stored layout differs from what is on screen — **true on load** for a page with no stored layout | Save Draft enablement |
| `touched` | the **operator** has actually edited something | the page-switch confirmation and `beforeunload` |

Collapsing them reintroduces a spurious "You have unsaved changes. Discard them?" on the first page switch of every session, before anyone has changed anything — and a confirmation that cries wolf is one an operator learns to dismiss reflexively, which is how real unsaved work eventually gets lost.

This was found by **browser verification**, not by a unit test: the prompt was silently cancelling the Stage 07 spec's page switch. See §6.

### 4.5 The e2e Builder specs need the dialog handled

Playwright **auto-dismisses** dialogs. With the editor dirty, a page switch fires `window.confirm` and is therefore silently cancelled, with no error — the canvas just stays on the previous page. `acceptDialogs(page)` is called in `openBuilder` in both the Stage 07 and Stage 08 specs. Keep it in any new Builder spec.

**The cautionary tale:** the Stage 07 directory-canvas tests passed in Stage 07 **only because a leftover `homepage` PageLayout row** made the editor clean. Stage 07's own teardown fix removed that row, and Stage 08 inherited three silently-broken tests. A test that passes because of residue is not a passing test.

---

## 5. Harness recipes

### 5.1 Full gate

```bash
cd apps/web
npx vitest run                 # 110 files, 2439 tests
npx tsc --noEmit               # 0 errors

export DATABASE_URL="$(grep -E '^TEST_DATABASE_URL=' .env | head -1 | sed 's/^TEST_DATABASE_URL=//' | tr -d '"\r')"
export APP_ENV=test            # satisfies the isolation guard — never weaken it instead
npx next build                 # 69/69
npx playwright test e2e/stage06-visual-builder.spec.ts e2e/stage07-templates.spec.ts e2e/stage08-publishing.spec.ts
```

### 5.2 Route harness — needs a PRODUCTION server

```bash
npx next start -p 3100 &       # dev returns 200 for notFound(), so dev is useless here
SMOKE_BASE_URL=http://localhost:3100 npx tsx scripts/route-smoke.mts   # 37/37
```

### 5.3 Cache harness — **also needs production, plus the secret**

```bash
export TEST_DATABASE_URL="<from .env>"; export DATABASE_URL="$TEST_DATABASE_URL"
export APP_ENV=test
export INTERNAL_REVALIDATE_SECRET="<any value, same for server and script>"
npx next build && npx next start -p 3100 &
SMOKE_BASE_URL=http://localhost:3100 npm run test:cache               # 10/10
```

Stage 08 wired this for the first time; D-08 had recorded it as never executed. It could not pass on **either** server as found — the full diagnosis is in the test report §5. Without the secret it skips the revalidation step and says so, because the endpoint fails closed by design.

### 5.4 Two things that will waste your time

- **Do not run DB-writing Vitest and Playwright at once.** Both use the same isolated database.
- **Overlapping interactive transactions starve the pool.** Stage 08's concurrency suite made `phase2-editorial` fail twice with P2028 "Transaction already closed", and it passed in isolation. The Stage 08 suites now `drainPool()` in `afterAll`. If you add a concurrency suite, do the same — and do not mistake a P2028 for a product defect.
- **`taskkill` on the Next dev server often misses.** Kill by every PID on the port with `//T`, then poll `netstat` until it is free. Stage 08 measured a "production" server for several minutes that was actually the dev server still holding 3100, which inverted two conclusions.

---

## 6. Known flake

| Test | Symptom | Status |
|---|---|---|
| `e2e/stage06-visual-builder.spec.ts` → *device modes change the canvas viewport width* | mobile measured **686px** instead of 390px during a three-spec run | **Flake, not a regression.** Passes 13/13 in isolation and passed in the final combined run. A measurement race while the browser was busy. If it recurs, make the assertion wait for the iframe width to settle rather than relaxing the bound |

---

## 7. Carried-forward items

| Item | Priority | Note |
|---|---|---|
| **D-07 revision retention** | **owner** | Unapproved. Stage 08 enforces **no** retention and asserts it (12 publishes → 12 revisions; no prune/purge function exists). Decision-ready proposal: `STAGE_08_GLOBAL_CONTROLS_AND_DECISIONS.md` §5. **The first pruning run is an irreversible delete** |
| **D-05 footer ownership** | **owner** | Unapproved. Current behaviour **pinned** by test: `SiteConfig.footer.columns` silently replaces the nav-driven columns, and `DIRECTORY_LINKS` is force-merged and uneditable. Option (a) **requires a data migration first** |
| **D-06 Appearance scope** | **owner** | Unapproved. All 21 fields are `introBanner*`; the tab name implies site-wide control it does not have. Even the **rename** is a D-06 sub-option, so Stage 08 did not do it. Option (b) needs a data migration |
| **D-12 scheduler deployment** | **owner** | Unapproved. Correctness is done and tested; **operational integration is BLOCKED**. The deployment-neutral contract is `runDuePublications()` — any trigger can call it safely |
| **S08-5 — the due-ness JSON-null filter** | **09** | `getDueSchedules`'s `scheduledSections: { not: { equals: null } }` does not exclude a database NULL in a `Json` column, so an empty schedule is returned as due. Bounded: execution declines it and nothing is published. Fixing it means choosing between Prisma's `DbNull` and `JsonNull` semantics, which changes which rows a production query returns |
| **S08-4 — `getRevision(revisionId)` takes no `pageKey`** | opportunistic | It can read any revision by id. No action exposes it; adding the parameter changes a public signature for no current benefit |
| **Scheduler revalidation target is `localhost`** | **blocked on D-12** | On multiple instances only the publishing replica's cache is flushed. Must become the public base URL |
| **KD-10's duplicate-number half** | informational | Appears **unreachable** through `publishLayout`: the layout row lock serialises same-key publishes. Mutations M3 and M4 survive for this reason. The retry loop is kept as defence |
| **D-09 / D-13 / D-14** | **09** | Reviewed for boundaries only. Stage 08 published no legal content, changed no publisher identity, and added no `Organization`/`WebSite` JSON-LD |
| **Schema change S-1** (`InfoPage` draft/published) | **09** | Needed by D-09's engineering half. **Request approval with exact SQL before writing a migration** |
| **Quality gate: 53 grandfathered** | opportunistic | Unchanged. Stage 08 fixed its own two violations at source rather than grandfathering them. The cheapest remaining win is still the 11 preview-URL tests — export `pageKeyToUrl` as a test seam (Stage 07 handover §6) |
| **Canvas fidelity vs. live editing** | unscheduled | The canvas still shows the last **saved** draft and says so. Closing the gap needs autosave or a second renderer; both remain forbidden |
| **Undo/redo** | unscheduled | Still absent, and still **no buttons** — asserted in the browser spec. Revision history is the recovery path |
| **Newsletter component** | when D-11 is revisited | `NewsletterSignup` remains unreachable in `PremiumBlocks.tsx`. **Do not re-register** |

---

## 8. What Stage 09 must not do

- **Do not add a save path without `expectedVersion`.** §4.1
- **Do not write a layout and its revision as two statements.** Use `publishWithRevision`. §4.2
- **Do not call `revalidatePath('/', 'layout')` from an admin action.** §4.3
- **Do not collapse `touched` into `dirty`.** §4.4
- **Do not implement D-05, D-06, D-07 or D-12** without an approval round recorded in the decision register. The register's last round is 2026-11-09; check for a newer one rather than assuming.
- **Do not invent** a retention duration, deletion policy, footer owner, brand identity, scheduler frequency, deployment provider or publication policy.
- **Do not delete revision history** without D-07 approval.
- **Do not create or apply a migration** without approval, and **never** `prisma db push` or `migrate reset`.
- **Do not contact the production database.** It has never been contacted in any stage.
- **Do not modify the development database.** Point every server and script at `TEST_DATABASE_URL`.
- **Do not weaken the environment isolation guard** to get a build or harness running. `APP_ENV=test` satisfies it.
- **Do not weaken the `INTERNAL_REVALIDATE_SECRET` requirement** or widen the endpoint's `['/']` allow-list.
- **Do not modify `lib/cms/slotSelection.ts`** — Stage 07's authoritative contract.
- **Do not create a second renderer, parallel content engine, per-entity layout override or unrestricted visual editor.**
- **Do not add autosave or undo/redo.**
- **Do not regenerate the quality-gate baseline to hide a new violation.** Fix it at source, as Stage 08 did with its own two.
- **Do not report a green run without reporting first-run failures.** Stage 08's first browser run was 7/42; four were its own test bugs and one exposed a real product defect.

---

## 9. Git and environment state at handover

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` |
| HEAD | `fd4fb10` — **unchanged; no commit, push, merge, reset or branch created** |
| Prisma migrations | **19 — unchanged**; none authored or applied |
| Schema | **unmodified** |
| Production database | **never contacted** in any stage |
| Development database | **never written to** |
| Isolated test database | left clean; the e2e teardown clears `PageLayout` / `PageLayoutRevision`, and every DB suite removes its own rows |
| `.next` | holds a **test-database** build from the browser run. Harmless for `npm run dev`; overwritten by the next build |
| Dev / test servers | terminated; ports 3000 and 3100 confirmed free |
| Docker / deployment | none |
| Prior stages' work | **fully preserved** — nothing reset, discarded, stashed or cleaned up |

Git finalization remains deferred until the owner explicitly requests it. **Stage 09 was not started.**
