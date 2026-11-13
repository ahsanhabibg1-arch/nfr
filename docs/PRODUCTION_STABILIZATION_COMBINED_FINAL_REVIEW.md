# Combined Stabilization Final Review — 04-C Mapping, 04-D Backfill, BKP-01, Integrated Verification

## OUTCOME B — LOCALLY VERIFIED, PRODUCTION ROLLOUT: BLOCKED

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`
**Databases touched:** `localhost:5433/nfrguide_dev` and `localhost:5433/nfrguide_test` only.
**Companion:** [Owner decision sheet](PRODUCTION_STABILIZATION_OWNER_DECISION_SHEET.md)

---

## 1. Executive summary

Everything that could be done safely was done and evidenced. Two mandatory
production prerequisites remain outstanding, and neither is something this
session could resolve.

| Workstream | Result |
|---|---|
| **A — 04-C mapping review** | Complete. **Re-reviewed from the data, not inherited.** My recommendation **differs from 04-C's**: 2 CREATE / 0 MERGE / 9 RETAIN, against 04-C's 7/1/3. All 11 rows remain `PENDING_OWNER_APPROVAL`. |
| **B — 04-D backfill readiness** | Complete and rehearsed end-to-end on `nfrguide_test` with a synthetic approval fixture. Idempotent, conflict-safe, non-destructive. The real mapping file was never marked approved. |
| **C — BKP-01** | **BLOCKED.** No production access path exists in this session at all; no restore was performed, so no restore is verified. No cloud resource was created. |
| **D — integrated verification** | Complete. 136 test files, 3,169 passed, 0 skipped; TypeScript clean; production build succeeded; local HTTP smoke checks pass. |

**Production rollout is blocked on exactly two owner-side items:** the mapping
approval and a verified isolated restore (BKP-01). The passing test count does
not change that, and is not presented as if it did.

### A correction to an earlier report

[04-E.1 §8](PRODUCTION_STABILIZATION_ISSUE_04E1_GOVERNANCE_REFINEMENT.md)
attributed a batch of full-suite module-load failures to the Next dev server
competing for database connections and memory. **That attribution was wrong.**
The same failures recurred in this session with the dev server stopped, and the
real cause was measured: the `C:` volume had **0 MB free**, so vitest, `head`
and the harness itself could not write temporary files. Connection pressure was
9 of 100 — never a factor. After reclaiming 11.7 GB the full suite passed
136/3,169 with no code change. The earlier conclusion is retracted.

---

## 2. Workstream A — Managed Subcategory mapping review

### 2.1 The data this review is based on

Read from `nfrguide_dev` in this session: all 11 legacy labels, each article's
title, slug, workflow status, Article Type, linked Disciplines, linked Rodeo
Hubs and Tags, plus every competing taxonomy axis.

**Production was NOT read in this session** — `.env` holds only the two local
databases, verified by connecting (`current_database()` and
`inet_server_addr()` both report loopback, PostgreSQL 18.6). 04-C's production
figures are quoted from that earlier, separately-authorized session and are
**not re-confirmed here**.

**Every label has exactly one article.** That single fact governs most of what
follows.

### 2.2 The finding that changes the recommendation

Batch 04-E made the Article Type registry administrator-managed and visible.
Reading the 18 selectable types against the 11 proposed subcategories shows
something 04-C did not weigh:

> **Six of the eighteen selectable Article Types are topic-bearing, not genre-bearing:**
> `Ticket Guide`, `Venue Guide`, `How to Watch`, `Travel Guide`,
> `Entertainment Guide`, `Product Buying Guide`.

They name the very topics 04-C proposed creating subcategories for. And the
category archive **already filters by Article Type**, deriving its options from
the articles actually present (`archiveFilterOptions`). So for those topics the
reader-facing grouping already exists and already works — a subcategory would
be a second axis expressing the same idea, which is the duplication the whole
taxonomy programme exists to remove.

Two further structural facts:

- **Four of the five sections hold exactly one article.** A subcategory inside a
  one-article section produces an archive identical to its parent section — the
  textbook thin-taxonomy and self-cannibalisation case.
- **No subcategory archive would be indexable on day one.** The approved rule is
  ≥3 published articles; every candidate starts at 1. So there is **no SEO
  benefit now** from any CREATE, by design.

### 2.3 Decision table

All rows are **`PENDING_OWNER_APPROVAL`**. "04-C" is the previous proposal;
"Recommended" is this review's.

| # | Legacy label | Parent section | Articles | Article title | 04-C | **Recommended** | Editorial rationale | SEO implication | Data impact |
|---|---|---|---|---|---|---|---|---|---|
| C-1 | Championship Analysis | NFR Competition | 1 | *Inside the Chutes: Why the 8-Second Ride Remains Sport's Purest Crucible* | RETAIN | **RETAIN** | A genre, not a topic. The article's own type is `feature`; analysis-vs-feature is the Article Type axis's job | none — no archive created | none |
| C-2 | Discipline Deep Dive | NFR Competition | 1 | *Saddle Bronc Riding: The Pure Grace and Rhythmic Physics…* | RETAIN | **RETAIN** | The **Discipline** axis owns this, and this article is already linked to *Saddle Bronc Riding*. Seven disciplines have their own pages | none | none |
| C-3 | Scoring & Tactics | NFR Competition | 1 | *The Anatomy of the Average: How the Gold Buckle Is Truly Won in Round 10* | CREATE | **CREATE** *(the only one I'd create here)* | How events are judged and played. No Discipline, no Hub, no Article Type names it. The `Rules & Format` type is adjacent but describes the ruleset, not how the aggregate is won | `noindex` until ≥3 articles | 1 article attached |
| C-4 | Concerts & Nightlife | NFR Entertainment | 1 | *Country Residencies & Late Night Saloons…* | CREATE | **RETAIN** *(revised)* | The section holds **one** article, so the subcategory archive would duplicate the section archive. `Entertainment Guide` already types it | **avoids** a self-cannibalising duplicate | none |
| C-5 | Exhibition & Tack | NFR Events & Shopping | 1 | *Cowboy Christmas Curated: Finding Master Silversmiths and Custom Hatmakers* | CREATE | **RETAIN** *(revised)* | Same: a one-article section. `Product Buying Guide` types it | same | none |
| C-6 | Accommodations | NFR Plan & Watch | 1 | *The NFR Hotel Matrix: Comparing South Point, Strip Resorts, and Downtown Suites* | CREATE | **CREATE** *(weaker of the two)* | "Where to stay" is durable, plainly named and extensible, and this section has five articles so a second level genuinely subdivides. `Travel Guide` is adjacent but covers getting there too | `noindex` until ≥3 | 1 article attached |
| C-7 | Broadcast Intelligence | NFR Plan & Watch | 1 | *The Spectator's Broadcast Guide: How to Stream Every Round Live and On Demand* | CREATE + rename to *Watching & Broadcast* | **RETAIN** *(revised)* | **The clearest duplication of all.** `How to Watch` is an existing selectable Article Type, and it is evergreen. The subcategory would restate it | avoids duplicate-intent pages | none |
| C-8 | Spectator Strategy | NFR Plan & Watch | 1 | *Las Vegas in December: A Tactical Guide to the Strip's Busiest Ten Days* | MERGE → Visiting Las Vegas | **RETAIN** *(revised)* | Merging two one-article labels yields a two-article subcategory — still below the threshold — while collapsing a real distinction: this is **city** logistics, C-9 is **arena** logistics | no gain from merging | none |
| C-9 | Venue Navigation | NFR Plan & Watch | 1 | *Navigating the Thomas & Mack Center: Parking, Clear Bag Policy & Arrival Windows* | CREATE | **RETAIN** *(revised)* | `Venue Guide` is an existing selectable Article Type and names exactly this | avoids duplication | none |
| C-10 | Tickets | NFR Plan & Watch | 1 | *Ticket Advisory: Understanding Balcony vs Plaza, Seat Exchanges & Scam Warnings* | CREATE | **RETAIN** *(revised)* | `Ticket Guide` is an existing selectable Article Type | avoids duplication | none |
| C-11 | Global Rodeo Hubs | More Rodeo | 1 | *From Calgary to Cheyenne: How the World's Richest Summer Rodeos Shape the NFR Top 15* | RETAIN | **RETAIN** | The **Rodeo Hub** axis owns this; three hubs exist as first-class entities with their own pages | none | none |

**Recommended totals: 2 CREATE · 0 MERGE · 9 RETAIN** → 2 managed subcategories,
2 articles attached, 9 labels left legacy-only.
(04-C proposed 7 CREATE · 1 MERGE · 3 RETAIN → 7 subcategories, 8 attached.)

### 2.4 What RETAIN costs, stated plainly

Nothing is deleted and nothing changes. The article keeps its legacy
`subcategory` text, the public page keeps showing it (the mapper falls back to
the label), and the managed Subcategory CMS stays available for **new**
editorial work — an editor can create a subcategory the moment a real cluster of
three or more articles exists. The weakness of RETAIN is that the legacy labels
stay unmanaged text with no admin owner; the strength is that it creates no
thin archives and no duplicate axes while coverage is this thin.

**A third option remains legitimate:** RETAIN all 11 and create nothing. 04-C
listed it, and on this data it is defensible — the two CREATEs I recommend both
start below the indexability threshold.

---

## 3. Workstream B — Backfill readiness and rehearsal

### 3.1 Dry run against `nfrguide_dev` with the real mapping file

```
mapping : prisma/taxonomy/subcategory-mapping.json
database: localhost/nfrguide_dev  (local)
mode    : DRY RUN — nothing will be written
approval: PENDING_OWNER_APPROVAL

subcategories created : 7      articles attached : 8
articles retained     : 3      already attached  : 0
protected fields unchanged: yes
```

**Coverage: all 11 labels accounted for**, every one named in the plan, none
silently skipped.

### 3.2 Guards, each verified by running it

| Guard | Evidence |
|---|---|
| Approval gate | `--execute` with the real (pending) file → `REFUSED: the mapping is not approved (status "PENDING_OWNER_APPROVAL")`. Nothing written. |
| No inference | Removing the `Tickets` entry → `REFUSED: these (section, label) pairs exist in the database but are not in the mapping`. Nothing written. |
| No automatic suffixes | Two CREATE entries pointing at slug `tickets` in the same section → `REFUSED: Two CREATE entries target the same slug "tickets" in nfr-plan-watch ("Accommodations" and "Tickets"). Use MERGE for the second, or pick a distinct slug. No suffix is added automatically.` Nothing written (`subcats=0, attached=0`). |
| Non-local target | `--execute` against a non-local database requires `BACKFILL_ALLOW_REMOTE=I_HAVE_A_VERIFIED_BACKUP`. |

> **A correction worth recording.** My first slug-collision attempt appeared to
> *pass* the collision through. It had not: my fixture-patch script wrote
> `entry.target.slug` while the entries are flat (`entry.slug`), so the patch
> silently did nothing and I was running a valid mapping. Caught by inspecting
> the rows actually created rather than trusting the outcome. The retry asserts
> the collision exists before running, and the guard then fires correctly.

### 3.3 Rehearsal on `nfrguide_test` with a synthetic approval fixture

The fixture lives in the session scratchpad, not the repository, and is labelled
`approvedBy: "SYNTHETIC-REHEARSAL-FIXTURE-NOT-AN-OWNER-APPROVAL"`.
**The real mapping file was never modified** — re-verified after every step:
`approval.status = "PENDING_OWNER_APPROVAL"`, `approvedBy = null`.

| Run | created | attached | retained | already attached |
|---|---|---|---|---|
| 1 | 7 | 8 | 3 | 0 |
| 2 | **0** | **0** | 3 | **8** |

**Idempotent.** The second run changed nothing.

Post-run verification against the captured before-snapshot:

| Check | Result |
|---|---|
| Articles | 17 → 17 — unchanged |
| Distinct legacy labels | 11 → 11 — unchanged, every string byte-identical |
| Article Type distribution | **IDENTICAL** (`Event Update:1 General Information:3 News:1 Rules & Format:1 analysis:3 feature:2 guide:6`) |
| Cross-section integrity | 8 of 8 attached articles sit in their subcategory's own section; **0 mismatches** |
| MERGE behaviour | `Visiting Las Vegas` correctly held **2** articles |
| RETAIN behaviour | all 3 RETAIN articles kept `subcategoryId = null` |
| Managed assignments | 0 → 8 · Subcategory rows 0 → 7 |

**Restored afterwards:** 8 articles detached, 7 subcategories deleted; the test
database is back to `subcategories=0, withManagedSubcat=0, articles=17, labels=11`,
and the full suite passes on it.

### 3.4 Expected production row changes

Under 04-C's mapping: **+7** `Subcategory` rows, **8** `Article.subcategoryId`
updates, **0** other column changes. Under this review's recommendation: **+2**
rows and **2** updates. No `articleType`, slug, canonical, publication state or
legacy `subcategory` text is written in either case.

### 3.5 Rollback and recovery

The backfill runs in one transaction, so a failure leaves nothing. Reversal
after a successful run is a two-step detach-then-delete, exactly as rehearsed:
set `subcategoryId = NULL` for the affected articles, then delete the created
`Subcategory` rows (the composite FK is `RESTRICT`, so the order matters).
Because legacy text is never modified, reversal restores the previous public
output exactly.

### 3.6 Production execution prerequisites

1. Owner-approved mapping (§2.3) written into the real file with `approvedBy` and `approvedAt`.
2. **BKP-01 verified** — this is the first operation in the programme that writes to existing production rows.
3. The 04-B migration applied to production first (the columns must exist).
4. A dry run read and accepted against the production target.
5. `BACKFILL_ALLOW_REMOTE=I_HAVE_A_VERIFIED_BACKUP` set deliberately for that run.

---

## 4. Workstream C — BKP-01

### Verdict: **BLOCKED**

**No production access path exists in this session.** `.env` contains only the
two local databases; `render.yaml` supplies `DATABASE_URL` as `sync: false`
(set in the Render dashboard, not in the repository). So in this session:

- no read-only production probe could be re-run;
- no restore could be attempted;
- **no cloud resource was created**, and none was going to be.

### What is known, and from where

The figures below are from the **earlier, separately-authorized read-only
session** recorded in
[ISSUE_04_FINAL_PREPARATION §B](PRODUCTION_STABILIZATION_ISSUE_04_FINAL_PREPARATION.md).
They are **quoted, not re-verified**, and may have moved since.

| Item | Prior finding |
|---|---|
| Identity | `defaultdb`, PostgreSQL **18.6**, not in recovery |
| `archive_mode` / `archive_command` / `restore_command` | on / configured / configured |
| `wal_level` | `logical` — PITR-capable |
| WAL archiver | 58 segments archived, **0 failures**, most recent minutes before the probe |
| Timeline | **3** — the cluster has been through recovery or promotion at least twice |
| Database size | 13 MB — a restore would be fast |
| Migration state | **21 migrations**, 0 unfinished |

**Still unknown, and not determinable from inside PostgreSQL:** retention
window, latest backup timestamp, whether a restore of *this* database has ever
succeeded, RTO/RPO, and whether an isolated restore destination exists.

### The distinction that matters

Working WAL archiving proves archiving works. **It does not prove a backup can
be restored.** Only a restore proves that, and no restore has been performed.

### Migration drift since the prior probe

Production was at **21** migrations. The repository now has **23**:

1. `20261113071524_add_managed_subcategory` (04-B)
2. `20261113090000_add_managed_article_type` (04-E)

Both are additive and neither touches `Article` rows, but both are pending for
production and both sit behind BKP-01.

### Approval request — stated exactly, so it can be answered yes or no

> **Requested:** create one Aiven **point-in-time fork** of the production
> PostgreSQL service, named `nfr-restore-rehearsal-2026-11-13`, for the sole
> purpose of proving the backup restores and rehearsing the two pending
> migrations on the copy.
>
> **Cost:** a fork is a **paid** Aiven service for as long as it runs. The
> database is ~13 MB, so the smallest plan suffices and the fork is expected to
> live **under two hours**. The exact figure depends on the plan chosen in the
> console; I cannot see pricing without access.
>
> **Isolation:** a new, separate service. Nothing is restored over production.
> Fork-only credentials, never reused in any application configuration.
>
> **What runs on it:** `prisma migrate deploy` (the two pending migrations), a
> before/after integrity fingerprint, and a confirmation of 11 published
> articles, 11 legacy labels, 7 disciplines with guide JSON, 42 tags.
>
> **Cleanup:** power off and delete the fork, confirm it is gone from the
> console, and rotate any credential created for it.
>
> **What is still needed from the owner:** Aiven console or API access, the
> retention policy, and approval for the cost. All three are owner-side.
>
> **Acceptance criteria for marking BKP-01 VERIFIED:** the fork reports
> *running*; the fingerprint is byte-identical to production except for the new
> nullable columns; both migrations apply cleanly with their output recorded.

---

## 5. Workstream D — Integrated verification

**Verification tiers are kept distinct, as §7 requires.**

| Tier | Performed | Notes |
|---|---|---|
| Code inspection | ✅ | all four workstreams |
| Automated tests | ✅ | 136 files, **3,169 passed, 0 skipped** |
| TypeScript | ✅ | `tsc --noEmit` clean |
| Production build | ✅ | `BUILD_ID = 3344e7BQRPxB2aIp76tF8` |
| Local HTTP smoke | ✅ | 7 routes, all 200 |
| Production read-only observation | ❌ | **no access this session** |
| **Production UAT** | ❌ | **not performed, and cannot be — the changes are not deployed** |

### Per-area results

| Area | Evidence |
|---|---|
| **Discipline CMS (Issue 03)** | `issue03-discipline-cms.test.ts` green; absent `name`/`image` still leave values unchanged while pre-existing fields clear on absence; `/disciplines/bull-riding/` → 200 |
| **Article Type CMS (04-A/E/E.1/E.2)** | 23 definitions present in dev, `--verify` → complete YES; managed + fallback; Article vs NewsArticle; evergreen; `articletype.manage` / `articletype.seo` / `system.config` all enforced server-side; transactional bootstrap with injected-failure rollback; tombstones honoured; partial-registry recovery; cache invalidation; audit entries |
| **Managed Subcategory CMS (04-B)** | parent relationships, create/edit/archive, editor selector, legacy fallback, permission checks all green; **no public subcategory route exists**, so nothing was activated |
| **SEO integration** | canonical emitted (`…/articles/<slug>/` — localhost host in dev, as configured); article JSON-LD `@type` = `Article` for the stored `guide` type, resolved through the managed registry; `publishedAt`/`dateModified` unchanged; `sitemap.xml` and `robots.txt` both 200; no URL or indexability change in the diff |
| **Builder preview / Media / R2 / workflow / authorization** | covered by their existing suites inside the 3,169; no change made to them in this stage |

### Environmental note

The full suite could not run at all until **11.7 GB** was reclaimed from the
`C:` volume (0 MB free). Nothing in the repository or the databases caused it;
the space was consumed by application caches outside this project. Recorded
because a full run and a full disk are indistinguishable from a failing test
suite if you only read the summary line.

---

## 6. Existing functionality preserved

| | |
|---|---|
| Article rows | dev **11**, test **17** — unchanged throughout |
| Stored `articleType` values | `guide` 6 · `analysis` 3 · `feature` 2 — unchanged |
| Legacy `subcategory` labels | 11 distinct, byte-identical before and after the rehearsal |
| Managed subcategory assignments | 0 in both databases (the rehearsal was reverted) |
| Article Type definitions | 23 in dev, complete; 0 in test (its suites manage their own) |
| Slugs / canonicals / publication state | untouched; compared before and after |
| Prisma schema | unchanged in this stage |
| Migrations | none created, none run |

---

## 7. Newly discovered defects

**None in the application.** Three findings, all process- or environment-level:

| # | Finding | Status |
|---|---|---|
| F-1 | 04-E.1's attribution of full-suite load failures to the dev server was wrong; the cause was disk exhaustion | **Corrected** in §1 and in the risk register |
| F-2 | My own collision-test fixture silently failed to apply, briefly suggesting a guard defect that does not exist | **Corrected**; the guard is verified working |
| F-3 | The `C:` volume reached 0 MB free, which blocks the test suite and the harness itself | **Resolved** — 11.7 GB reclaimed from caches outside this project |

---

## 8. Fixes made during this stage

**No application code was changed.** This stage was review, rehearsal and
verification only. The only mutations were to the **test** database (rehearsal,
fully reverted) and to caches outside the repository.

---

## 9. Pending owner decisions

See the [decision sheet](PRODUCTION_STABILIZATION_OWNER_DECISION_SHEET.md). In short:

1. **The mapping** — adopt this review's 2 CREATE / 9 RETAIN, 04-C's 7/1/3, all-RETAIN, or a variant. Nothing proceeds until the file says `APPROVED`.
2. **BKP-01** — approve the paid, isolated fork described in §4, or supply Aiven access so it can be done under a separate authorization.
3. **Deployment order** — confirm the sequence in §10 once 1 and 2 are settled.

---

## 10. Production migration and deployment readiness

**PRODUCTION ROLLOUT: BLOCKED**

| Prerequisite | State |
|---|---|
| Mapping approved | ❌ `PENDING_OWNER_APPROVAL` (11/11 rows) |
| Backfill approved | ❌ depends on the mapping |
| BKP-01 verified restore | ❌ **BLOCKED** — no access, no restore performed |
| Pending production migrations | ❌ 2 pending (04-B, 04-E); production last seen at 21 |
| Local verification | ✅ complete |
| Rollback plan | ✅ documented (§3.5 and each batch report) |
| Environment configuration | ✅ no new variables required by this stage |

### Sequence, once unblocked

1. BKP-01 verified on an isolated fork; fork destroyed.
2. Apply `20261113071524_add_managed_subcategory` — additive; no `Article` rewrite.
3. Apply `20261113090000_add_managed_article_type` — additive; no `Article` rewrite.
4. Bootstrap the Article Type registry (`--verify` must read `complete: YES`).
5. Deploy the application code. *(Safe from step 1 onward — every surface falls back to the compiled-in definitions when the tables are absent.)*
6. Smoke-check: admin Article Types tab lists 23 and shows no "not initialised" panel; an article's JSON-LD `@type` is unchanged; the homepage evergreen surface still shows its six articles; canonicals unchanged.
7. **Only then**, and only with the mapping approved: backfill dry run → read → execute.

### Migration ordering note

The two migrations are independent — neither references the other's objects — so
either order applies cleanly. The timestamps keep the recorded history linear.

---

## 11. Database preservation evidence

| | `nfrguide_dev` | `nfrguide_test` |
|---|---|---|
| Identity verified by connecting | `current_database()` = `nfrguide_dev`, addr `::1` | `nfrguide_test`, addr `::1` |
| Articles | 11 → **11** | 17 → **17** |
| Legacy labels | 11 → **11** | 11 → **11** |
| `articleType` distribution | unchanged | **IDENTICAL** before/after the rehearsal |
| Subcategory rows | 0 → **0** (dry run only) | 0 → 7 → **0** (reverted) |
| Managed assignments | 0 → **0** | 0 → 8 → **0** (reverted) |
| Production | **never connected to** | — |

---

## 12. Git status

```
branch : main
HEAD   : aafdad296363e4b69d3b01594540116f9b58f39d   (unchanged)
stashes: 0
tree   : 30 modified + 25 untracked
```

No commit, push, branch, stash, reset or rebase. `git diff --check` clean.
Encoding scan of all 55 changed/untracked source files: **no BOM, no mojibake**.
All uncommitted work from Issue 03 and Batches 04-A/B/C/D/E/E.1/E.2 is intact.

*(This report and the decision sheet will raise the untracked count to 27 once written.)*

---

## 13. Risk register

| # | Risk | Severity | Owner action |
|---|---|---|---|
| **1** | **BKP-01 not verified** — no restore has ever been proven for this database | **Blocking** | Approve the §4 fork, or supply Aiven access |
| **2** | **Mapping unapproved** — 11/11 rows pending | **Blocking** | Choose an option on the decision sheet |
| **3** | Production is 2 migrations behind the repository | High | Apply in the §10 order, after BKP-01 |
| 4 | Backup retention window unknown | High | Read it from the Aiven console |
| 5 | Any CREATE starts below the ≥3 indexability threshold | Medium | Accept (designed) or choose all-RETAIN |
| 6 | `restoreRevision` can restore an article type that no definition covers (R-11) | Low | None recommended; classification and evergreen both fail safe |
| 7 | No DB-level case-folded uniqueness on `ArticleType.value` (R-2) | Low | Accepted in 04-E; service-enforced |
| 8 | Managed subcategory names are not in the search vector | Low | Deferred; needs a generated-column migration |
| 9 | No public subcategory route | Low | Deferred; a nested route is recommended |
| 10 | `C:` volume filled to 0 MB and blocked all verification | Medium | Resolved here; worth monitoring |

---

## 14. Explicit next actions

**Owner:**

1. Decide the mapping (decision sheet, question 1).
2. Decide BKP-01 (decision sheet, question 2) — this is the gating item.
3. Decide whether to commit the current working tree before any production work.

**Engineering, once approved — each needing its own authorization:**

4. BKP-01 restore rehearsal on an isolated fork; destroy it afterwards.
5. Production migrations in the §10 order.
6. Article Type bootstrap + `--verify`.
7. Deploy; run the §10 step-6 smoke checks.
8. Backfill: dry run → read → execute.
9. Production UAT — **after** deployment, never before.

**Not started, as instructed:** the Full-System Hardcoding & Major Bug Audit,
Visual Builder feature work, production migration, production backfill,
deployment, and any Git commit or push.
