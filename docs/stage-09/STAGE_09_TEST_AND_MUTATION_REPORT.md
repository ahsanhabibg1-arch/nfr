# Stage 09 — Test and Mutation Report

Every number below comes from a run performed in the Stage 09 continuation session on
2026-11-11, on `main` = `f24af32` plus the uncommitted continuation changes. Logs were
kept outside the repository (session scratchpad). Nothing is reported as passing that did
not run and pass.

## 1. Environment

| Item | Value |
|---|---|
| Node | v24.15.0 (package `engines` asks for `>=22.23.4 <23`; nothing failed because of it, but it is a mismatch) |
| Prisma | 6.19.3; client regenerated after the pull (`prisma generate`) |
| Test database | `localhost:5433/nfrguide_test` (isolated; passes `decideTestDatabase`) |
| Test DB migrations | 2 committed Stage 08 migrations were missing (`20261108120000_phase_d_scheduled_publishing`, `20261108130000_phase_c_page_layout_revisions`). **Applied to the test database only, with owner approval given in-session.** No new migration was created. |
| Development database | Not modified. One read-only `prisma migrate status` was run against it by mistake (a parsing error left `DATABASE_URL` unset, so Prisma read `.env`); it reads the migrations table only. It reports the same 2 migrations as not applied. |
| Production database | Never contacted. |
| Server for browser/HTTP gates | `next start -p 3100`, `APP_ENV=test`, test DB, random per-run `INTERNAL_REVALIDATE_SECRET` held only in process env. Its in-process scheduler ran against the test DB only. Stopped after the gate. |

## 2. The "exit code 4" full-Vitest run — diagnosed

Not reproducible. The baseline full run (before any continuation change) produced complete
output and exited **1**, with real failures:

```
Test Files  4 failed | 109 passed (113)
     Tests  9 failed | 2521 passed (2530)
```

So the earlier "all green" Stage 09 statement was true only per suite. The 9 failures were:

| Suite | Count | Cause | Resolution |
|---|---|---|---|
| `batch-c-revisions`, `batch-d-scheduling` | 7 | Source-text tests pinned the literal `scheduledSections: null` / `{ not: { equals: null } }` — the exact pre-Stage-09 form that **caused** S08-5. Stage 09 Task I correctly changed it to `Prisma.DbNull` / `Prisma.AnyNull`, and nobody updated these. | Assertions now pin the corrected form **and** reject a revert (`not.toMatch(/scheduledSections: null\b/)`). Behavioural proof unchanged: `stage08-scheduler`. Mutations M01–M03 confirm the pinned form is load-bearing. |
| `stage03-test-quality-gate`, `stage08-quality-gate-enforcement` | 2 | Two Stage 09 tests had behavioural verbs in their names ("is rendered", "visible") but assert on source text. | Marked `[structural]` — the gate's own documented opt-out. They are deliberately structural audit pins. |

The most likely explanation for the original silent exit 4 is the one the continuation
prompt suggested (wrong working directory / no config resolved); it did not recur.

## 3. Gate results (final)

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **exit 0** |
| Vitest, full | `APP_ENV=test npx vitest run` | **116 files passed, 2560 tests passed, 0 failed, 0 skipped, exit 0** |
| Production build | `next build` (test DB) | **exit 0** (compiled successfully) |
| Route harness | `tsx scripts/route-smoke.mts` vs :3100 | **37 passed, 0 failed** |
| Cache harness | `tsx scripts/cache-invalidation.mts` vs :3100 | **10 passed, 0 failed** |
| Chromium, full suite | `npx playwright test` (119 tests) | **117 passed, 2 failed** — see §4 |
| Chromium, re-run of the 2 + new Stage 09 spec | `npx playwright test e2e/stage09-seo-admin.spec.ts e2e/a11y.spec.ts e2e/stage06-visual-builder.spec.ts` | **40 passed, 1 failed** (a11y home) |
| Mutation testing | `run-mutations.mjs` (21 mutants) | **21 killed, 0 survived** (after one follow-up test — §5) |

DB-writing Vitest and Playwright were never run at the same time.

## 4. Browser failures — honest status

| Test | Status | Analysis |
|---|---|---|
| `a11y.spec.ts › home (/)` — "heading level jumps: h1→h3" | **FAILING, pre-existing, not fixed** | The homepage hero renders the lead story as `h1` and secondary stories as `h3` with no `h2` between (`components/sections/EditorialHero.tsx`). Identical at `feb4711`, `fd4fb10` and `bce3b1c`, so not introduced by Stage 09. It surfaced now because Stage 08's Chromium gate ran only the Stage 06–08 specs (49), never `a11y.spec.ts`. Not fixed here: it is hero structure pinned by Stage 08 Task H tests and outside Stage 09 scope. **Carried to the Stage 10 register.** |
| `stage06-visual-builder › device modes change the canvas viewport width` | **Flaky** — failed once (mobile 686px vs ≤391px), passed on isolated re-run | Timing of the canvas resize under a long run. No continuation change touches the Builder. Recorded, not masked. |

## 5. Mutation testing

Method: one mutation at a time; exact original bytes restored in a `finally` and
byte-compared; backups in the scratchpad; `git status` checked afterwards (only intended
files modified). Targeted suites only.

| ID | Mutation | Killed by | Result |
|---|---|---|---|
| M01 | `cancelSchedule` writes bare `null` (S08-5) | `stage08-scheduler` | KILLED |
| M02 | `executeScheduledPublish` writes bare `null` on consume | `stage08-scheduler` | KILLED |
| M03 | `getDueSchedules` back to `{ not: { equals: null } }` | `stage08-scheduler` | KILLED |
| M04 | claim guard drops `scheduledAt: { not: null }` | `stage09-scheduler-claim-guard` (new) | **SURVIVED first run → KILLED** after the new test |
| M05 | `saveDraft` ignores `expectedVersion` | `stage08-concurrency` (8 failures) | KILLED |
| M06 | published InfoPage editable in place | `stage09-infopage-publication` | KILLED |
| M07 | InfoPage body unsanitized | `stage09-infopage-publication`, `stage09-ownership-and-privacy` | KILLED |
| M08 | pending legal page rendered indexable | `stage09-seo-integrity` | KILLED |
| M09 | pending legal page listed in sitemap | `stage09-seo-integrity`, `sitemap-policy` | KILLED |
| M10 | FAQ JSON-LD keeps incomplete pairs | `stage09-seo-integrity` | KILLED |
| M11 | venue JSON-LD `url` relative | `stage09-continuation` | KILLED |
| M12 | competitor JSON-LD `url` relative | `stage09-continuation` | KILLED |
| M13 | Event emits empty `PostalAddress` | `stage09-continuation` | KILLED |
| M14 | JSON-LD serializer stops escaping `<` | `batchA`, `batch17-sanitization` | KILLED |
| M15 | article preview: draft reported indexable | `stage09-continuation` | KILLED |
| M16 | article preview: robots hardcoded again | `stage09-continuation` | KILLED |
| M17 | landing canonical preview accepts off-site override | `stage09-continuation` | KILLED |
| M18 | InfoPage save message hides approval reset | `stage09-continuation` | KILLED |
| M19 | filtered directory view indexable | `stage09-seo-integrity` | KILLED |
| M20 | InfoPage unpublish stops revalidating `/sitemap.xml` | `stage09-sitemap-revalidation` | KILLED |
| M21 | entity-SEO save stops revalidating `/sitemap.xml` | `stage09-sitemap-revalidation` | KILLED |

**M04 finding:** the claim guard has two halves and every service write clears both columns
together, so the `scheduledAt` half was unproven. The new test reaches the one state that
separates them (stale runner; time cleared, sections left) and proves an un-timed schedule
is never published.

## 6. Tests added or changed in the continuation

| File | Change | Count |
|---|---|---|
| `tests/stage09-continuation.test.ts` | **new** — rendered/computed tests for Task C JSON-LD and Task H admin screens | 25 |
| `tests/stage09-scheduler-claim-guard.test.ts` | **new** — DB test for the M04 gap | 1 |
| `tests/stage09-sitemap-revalidation.test.ts` | **new** — calls the real Server Actions | 4 |
| `e2e/stage09-seo-admin.spec.ts` | **new** — Chromium: Event JSON-LD, sitemap, article/landing/info admin screens (read-only) | 5 |
| `tests/batch-c-revisions.test.ts`, `tests/batch-d-scheduling.test.ts` | 7 stale assertions → corrected form + anti-revert | — |
| `tests/stage09-seo-integrity.test.ts` | 2 tests marked `[structural]`; canonical-literal test updated to assert the fix | — |

No assertion was weakened to make an implementation pass; every changed assertion now
pins **stricter** behaviour than before (the corrected form plus a ban on the old one).

## 7. Stage 08 publishing guarantees — re-verified by running

| # | Guarantee | Evidence (all green in the final full run) |
|---|---|---|
| 1 | Required `expectedVersion` | Zod union in `pageLayoutService` (no optional form); `stage08-concurrency`; M05 |
| 2 | Optimistic concurrency | `stage08-concurrency` (stale save refused, 2- and 5-way races); e2e `stage08-publishing` |
| 3 | DB-side guarded updates | `updateMany` with version/claim predicates; M04, M05 |
| 4 | Version-conflict auditing | `stage08-concurrency › audits the refusal` |
| 5 | Atomic publish + revision | `stage08-concurrency › a publish and its revision are all-or-nothing`; KD-10 race |
| 6 | Revision recovery validation | `stage08-revision-recovery` (malformed snapshot refused, state unchanged) |
| 7 | Revision authorization | `stage08-concurrency › refuses … without system.config` (list/read/restore) |
| 8 | Draft/public isolation | `stage08-revision-recovery › restore is not live`; `stage08-cache-scope › saving a draft does not invalidate…`; cache harness checks 1 and 7 |
| 9 | Targeted cache invalidation | `stage08-cache-scope` (15 page keys, no root fallback) |
| 10 | Scheduler idempotence | `stage08-scheduler › repeated and concurrent execution is safe`; M01–M04 |
| 11 | Stable Builder slot identity | `batch32-unit` (`ensureSlotIds`); e2e `stage08-publishing › stable slot ids` |
| 12 | Saved-draft preview | `stage06-builder-dom`; e2e `stage06-visual-builder`, `stage08-publishing` |

No regression found. Stage 09 did not weaken any of them.

## 8. Limitations

- The original Stage 09 directive (sections 12–19) is not in the repository; the test-area
  list used is Part 6 of the owner's continuation instructions.
- The a11y homepage failure and the Builder width flake remain (§4).
- Browser tests are Chromium only, as configured.
- Live development/production `InfoPage` contents were not inspected (by rule).
