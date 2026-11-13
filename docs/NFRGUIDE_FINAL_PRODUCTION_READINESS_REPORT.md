# NFRGuide.com — Final Production Readiness Report

## VERDICT: `CONDITIONALLY READY — BLOCKERS REMAIN`

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`
**Databases touched:** `localhost:5433` only (dev, test, and two disposable rehearsal databases, both dropped).
**No production access existed in this session.** No production write, migration, deployment or Git operation occurred.

---

## 1. Executive summary

Five of the six tasks are complete and evidenced. One — BKP-01 — is blocked on
owner-side access and nothing else.

| # | Task | Status |
|---|---|---|
| 01 | BKP-01 backup & restore | **`AWAITING_OWNER_APPROVAL / ACCESS`** — restore *procedure* rehearsed and proven locally; the **production** backup remains unverified |
| 02 | Legacy Subcategory mapping | **`READY_FOR_OWNER_APPROVAL`** — 11/11 rows validated, **0 risks**, dry run clean |
| 03 | Pending migration readiness | **VERIFIED READY** — both rehearsed on a production-shaped clone (21 → 23 migrations, 11 articles unchanged) |
| 04 | Browser end-to-end UAT | **VERIFIED — 149/149 Chromium tests passing** |
| 05 | Integrated regression | **VERIFIED — 139 files / 3,241 tests / 0 skipped**, TypeScript clean, build succeeded |
| 06 | Production release plan | **PREPARED** — §8 |

**Two findings that change previously reported facts**, both corrected here:

1. **Browser UAT was always possible.** My Stage 02 and Stage 03 reports said
   "no automated browser driver is available". That was **wrong**: Playwright
   1.64.1 with Chromium, 18 spec files and a `test:e2e` script were already in
   the repository. Running them surfaced a stale expectation that the vitest
   suite could not see (§6).
2. **A pre-existing flaky browser test** was diagnosed and fixed properly rather
   than retried until green (§6).

---

## 2. Baseline established (§2 of the brief)

Verified by inspecting the repository and connecting to the databases, not from
prior reports:

| Item | Value |
|---|---|
| Branch / HEAD | `main` / `aafdad2` — unchanged all session |
| Stashes | 0 |
| Working tree at start | 38 modified + 36 untracked |
| Migrations on disk | **23** |
| Dev database | `nfrguide_dev` — 11 articles, 5 categories, 23 article types |
| Test database | `nfrguide_test` — 17 articles, 5 categories |
| Database identity | verified by `current_database()` + `inet_server_addr()` = loopback, PostgreSQL 18.6 |
| Production credentials | **absent** from `.env`; `render.yaml` supplies `DATABASE_URL` as `sync: false` |
| Test baseline | 139 files / 3,241 tests |
| Deployment architecture | Render web service + managed PostgreSQL (Aiven) + Cloudflare R2 |

No credential, connection string or token appears anywhere in this report.

---

## 3. Task 01 — BKP-01 backup & restore

### Status: `BKP-01: AWAITING_OWNER_APPROVAL / ACCESS`

### What was established

| Question | Answer |
|---|---|
| Where are backups configured? | **Not in this repository.** No backup job, disk or cron exists in `render.yaml` or the codebase. Backups belong entirely to the managed database provider (Aiven) and are a control-plane concern |
| Is the mechanism operational? | **Not verifiable here.** A prior, separately-authorized session observed WAL archiving active (58 segments, 0 failures) — quoted, **not re-verified** |
| Are backup artifacts available? | **No.** No production access path exists in this session |
| Retention / access controls documented? | **No.** Retention remains unknown — an Aiven console setting |
| Is a restore target isolated? | No production-linked target exists or was created |

### What WAS proven: the restore procedure itself

The runbook's mechanics were rehearsed end to end against a **disposable local
database**, because the client tooling (`pg_dump`, `pg_restore`, `psql`,
`createdb`, `dropdb`) is available:

```
source   : localhost/nfrguide_dev     target : nfr_bkp01_rehearsal (disposable)
1. artifact captured      249,418 bytes, custom format
2. readable WITHOUT restoring   526 TOC entries · 87 TABLE DATA sections
3. isolated target created
4. restore                exit status 0
5. integrity              tables=87 · foreign_keys=88 · migrations=23 · unfinished=0
                          articles=11 · categories=5 · articleTypes=23 · tags=42
6. referential integrity  orphan_category_refs=0 · orphan_author_refs=0
7. cleanup                target_still_exists=0
8. source untouched       source_articles=11
```

The script refuses to run if the source is non-local, if the source name looks
like production, or if the target would overwrite `nfrguide_dev` /
`nfrguide_test`.

> **This is NOT a verified production backup restore, and is not represented as
> one.** It proves the procedure and the tooling work, and that the verification
> steps are meaningful. It says nothing about whether Aiven's production backup
> restores.

### Exact minimum access required to close BKP-01

| Need | Why |
|---|---|
| Aiven console or API access to the production service | Backup listing, retention and PITR window are control-plane data, unreachable from a PostgreSQL connection |
| Approval to create one **point-in-time fork** (`nfr-restore-rehearsal-<date>`) | A fork is a **paid** service while it runs; the database is ~13 MB, so the smallest plan suffices and it is expected to live under two hours |
| A second approval before the production migration itself | Separate decision |

**Acceptance criteria:** the fork reports *running*; the §3 integrity fingerprint
is reproduced on it; both pending migrations apply cleanly with output recorded;
the fork is then deleted and its credential rotated.

---

## 4. Task 02 — Legacy Subcategory mapping

### Status: `READY_FOR_OWNER_APPROVAL`

File: `apps/web/prisma/taxonomy/subcategory-mapping.json` —
`approval.status: "PENDING_OWNER_APPROVAL"`, `approvedBy: null`, 11 entries.
**Not modified by this workflow.**

| # | Legacy label | Parent category | Action | Target name / slug | Articles | Risk |
|---|---|---|---|---|---|---|
| 1 | Championship Analysis | nfr-competition | RETAIN | — | 1 | none |
| 2 | Discipline Deep Dive | nfr-competition | RETAIN | — | 1 | none |
| 3 | Scoring & Tactics | nfr-competition | CREATE | Scoring & Tactics / `scoring-tactics` | 1 | none |
| 4 | Concerts & Nightlife | nfr-entertainment | CREATE | Concerts & Nightlife / `concerts-nightlife` | 1 | none |
| 5 | Exhibition & Tack | nfr-events-shopping | CREATE | Exhibition & Tack / `exhibition-tack` | 1 | none |
| 6 | Accommodations | nfr-plan-watch | CREATE | Accommodations / `accommodations` | 1 | none |
| 7 | Broadcast Intelligence | nfr-plan-watch | CREATE | **Watching & Broadcast** / `watching-broadcast` | 1 | none (a **rename**) |
| 8 | Spectator Strategy | nfr-plan-watch | MERGE | → `visiting-las-vegas` | 1 | none |
| 9 | Tickets | nfr-plan-watch | CREATE | Tickets / `tickets` | 1 | none |
| 10 | Venue Navigation | nfr-plan-watch | CREATE | **Visiting Las Vegas** / `visiting-las-vegas` | 1 | none (a **rename**; row 8 merges into it) |
| 11 | Global Rodeo Hubs | more-rodeo | RETAIN | — | 1 | none |

**Totals:** 7 CREATE · 1 MERGE · 3 RETAIN · 11 articles covered, all PUBLISHED.

### Validation results

| Check | Result |
|---|---|
| Every (section, label) pair in the database is mapped | ✅ **none unmapped** |
| Cross-category consistency | ✅ 0 articles whose subcategory is in another section |
| Duplicate destination names/slugs | ✅ none — rows 8 and 10 share a slug **by design** (the merge) |
| Orphan / invalid references | ✅ 0 articles with a `subcategoryId` pointing nowhere |
| Legacy text preservation | ✅ the backfill never writes `Article.subcategory` |
| Foreign key compatibility | ✅ composite FK rehearsed; 0 violations |
| Idempotency | ✅ second run: created 0, attached 0, already-attached 8 |
| Rollback feasibility | ✅ detach then delete, rehearsed and reverted |
| Publication / SEO impact | **none** — no public subcategory route exists; canonicals, slugs and publication state are untouched |

### Ambiguities the owner must settle

Not blockers, but **judgement calls, not facts**:

1. **Row 7 renames** *Broadcast Intelligence* → *Watching & Broadcast* and
   **row 10 renames** *Venue Navigation* → *Visiting Las Vegas*. The legacy text
   stays on the article either way, but the visible kicker changes.
2. **Every target starts with 1–2 articles**, below the approved ≥3 indexability
   threshold, so **no SEO benefit accrues on day one**. That is designed
   behaviour, not a defect.
3. The [Combined Final Review](PRODUCTION_STABILIZATION_COMBINED_FINAL_REVIEW.md)
   recommended a **narrower** 2 CREATE / 9 RETAIN alternative, on the grounds
   that six Article Types already name these topics. **Both options remain on the
   table**; this matrix validates the file as it stands.

> A correction worth recording: my first risk pass flagged row 10 as a
> SLUG-COLLISION. That was **my detector's error**, not the mapping's — it
> counted MERGE rows as competing CREATEs. Corrected, re-run, and the matrix
> above is the corrected output.

**The backfill was not executed.** Approval and execution remain owner-controlled.

---

## 5. Task 03 — Pending production migration readiness

### Verdict: **VERIFIED READY** (gated on BKP-01 only)

| Migration | Statements | Destructive? | `Article` impact |
|---|---|---|---|
| `20261113071524_add_managed_subcategory` (04-B) | 1 CREATE TABLE, 3 ALTER TABLE, 6 indexes | **No** | one **nullable** `ADD COLUMN "subcategoryId" TEXT` + one FK |
| `20261113090000_add_managed_article_type` (04-E) | 1 CREATE TYPE, 1 CREATE TABLE, 4 indexes | **No** | **none** — no `ALTER TABLE` at all |

No `DROP`, `DELETE`, `TRUNCATE` or `UPDATE` statement exists in either file. The
only grep hits were the words `ON DELETE RESTRICT` / `ON UPDATE CASCADE` **inside
foreign-key definitions**, which are clause text, not statements.

### Rehearsal on a production-shaped clone

A disposable database was restored from the dump, then reduced to **production's
exact reported state** (21 migrations, real data, the new objects absent):

```
migrations_before = 21        articles_before = 11
  → prisma migrate deploy: both migrations applied, "All migrations have been successfully applied."
migrations_after  = 23        unfinished = 0        articles_after = 11
subcategory_table = 1         articletype_table = 1
article_subcategoryId_nulls = 11      ← no data rewrite
article_types_seeded = 0              ← bootstrap is a separate step, as designed
rollback rehearsal: objects dropped → articles_after_rollback = 11
cleanup: rehearsal_db_remaining = 0
```

### Lock and downtime assessment

- `ADD COLUMN … TEXT` **nullable, no default** → catalog-only in PostgreSQL 11+,
  an instantaneous `ACCESS EXCLUSIVE` lock. No table rewrite.
- The composite FK validates against `Article` — **11 rows**.
- 04-E touches no existing table at all.

**No application downtime is required.** The application tolerates the tables
being absent (every surface falls back to the compiled-in registry), so the code
may be deployed before or after the migrations.

### Ordering and dependencies

The two are **independent** — neither references the other's objects — so either
order applies cleanly; the timestamps keep history linear. The **backfill depends
on 04-B** (the columns must exist) and on mapping approval.

### Verification limitation

The rehearsal used a clone of the **development** database shaped to production's
migration state, not a clone of production itself (no access). Production holds
the same 11 articles and 21 migrations per the last authorized read, so the shape
matches — but that is **quoted, not re-verified**.

---

## 6. Task 04 — Browser end-to-end UAT

### Status: **VERIFIED — 149/149 passing (Chromium, 8.9 min)**

Playwright 1.64.1 + Chromium, 18 spec files, run against a **production build**
(`next start`) on the isolated test database with seeded fixtures.

**Covered:** admin login/logout and RBAC, admin navigation, Category and
Subcategory management, Article Type management, the Article Editor
(draft/save/reload), review and approval workflow, publication, SEO Intelligence
screens, Visual Builder, Settings, Navigation CMS, the homepage, the five
canonical sections, category archives, article detail pages, breadcrumbs and
breadcrumb JSON-LD, canonical metadata, sitemap, robots, search, account menu,
analytics collection, rodeo lifecycle and slug redirects, plus an automated
accessibility subset (`@axe-core/playwright`).

### Two failures on the first run — both diagnosed, both fixed

| Failure | Diagnosis | Fix |
|---|---|---|
| `a11y › every editor input and select is reachable by its visible label` | The spec expected a label **`"Article Type (18 Typologies)"`**. Batch 04-E made the vocabulary administrator-managed and the label correctly dropped the hardcoded count — **a stale expectation from before 04-E that the vitest suite could not see** | Expectation updated to `"Article Type"`. The assertion still requires the control to be reachable by its visible label; nothing was weakened |
| `admin-hydration › the Rodeo Coverage table renders identically after hydration` | **Flaky, 1 of 3 repeats.** It sampled `innerText` "immediately", which is CSS-dependent, so the same unchanged DOM read `Active` before styles applied and `ACTIVE` after | Switched to `textContent`, which is CSS-independent and still carries every rendered string — so the Date-formatting mismatch the test exists to catch is detected exactly as before. **5/5 repeats stable afterwards** |

Neither failure was caused by Stages 01-03. Both are recorded because the first
one is a real gap in how this programme has been verified: **the browser suite
was never run during Batches 04-A…04-E**, which is why a stale label expectation
survived.

### Viewport note

The configured project is `Desktop Chrome`. **Mobile-viewport verification was
not performed** — the config defines no mobile project, and adding one is a test
change outside this workflow's scope. Recorded as a limitation, not a pass.

---

## 7. Task 05 — Integrated final regression

| Check | Result |
|---|---|
| Vitest full suite | **139 files · 3,241 passed · 0 skipped** — identical to baseline |
| Playwright | **149 passed** |
| `npx tsc --noEmit` | **clean** |
| `npm run build` | **succeeded** — `BUILD_ID = AzSm0RqQyJco_a6dj09oC` |
| `git diff --check` | clean |
| Encoding scan (76 files) | **no BOM, no mojibake** |
| Prisma schema drift | `migrate diff` → **"This is an empty migration"** |

Stage 01, Stage 02, Stage 03, category/taxonomy, Article Editor, workflow/RBAC,
SEO/structured-data, sitemap, navigation, Visual Builder and database-integrity
suites are all inside those totals and all pass. **No test was weakened.**

### Database preservation

| | `nfrguide_dev` | `nfrguide_test` |
|---|---|---|
| Articles | **11** — unchanged | **17** — unchanged |
| Categories | **5** | **5** |
| Subcategories | 0 | 0 |
| Article types | 23 | 0 (its suites manage their own) |
| Users | 1 | 1 — the e2e ephemeral admin was torn down |
| Leftover rehearsal databases | **0** | — |
| Production database | **never connected to** | — |

---

## 8. Production release checklist

Each step is marked **Verified**, **Ready but not executed**, **Awaiting owner
approval**, **Blocked** or **Not verified**.

| # | Step | Status |
|---|---|---|
| 1 | **Verified production backup + restore (BKP-01)** | **BLOCKED** — needs Aiven access + fork approval (§3) |
| 2 | Take a fresh pre-migration backup / note the PITR timestamp | Awaiting owner approval |
| 3 | Apply `20261113071524_add_managed_subcategory` | **Ready but not executed** — rehearsed, additive, no rewrite |
| 4 | Apply `20261113090000_add_managed_article_type` | **Ready but not executed** — rehearsed, additive |
| 5 | Bootstrap the Article Type registry (`npm run bootstrap:article-types -- --execute`, with `BOOTSTRAP_ALLOW_REMOTE=I_HAVE_A_VERIFIED_BACKUP`) | Ready but not executed |
| 6 | `-- --verify` must print `complete: YES` | Ready but not executed |
| 7 | Confirm env config: `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `MEDIA_S3_*`, `STAGING_NOINDEX` — all `sync: false` in Render | **Verified** present in `render.yaml`; values are owner-held |
| 8 | Deploy the application | Awaiting owner approval. Safe before **or** after steps 3-4 — every surface falls back when the tables are absent |
| 9 | Maintenance window | **Not required** — no downtime; locks are catalog-only at this data size |
| 10 | Post-deploy smoke: Article Types tab lists 23 with no "not initialised" panel; an article's JSON-LD `@type` unchanged; homepage evergreen surface shows its six articles; the five canonical archives `index, follow`; an unknown category slug `noindex` | Ready but not executed |
| 11 | SEO validation: sitemap lists the five canonical archives (plus any eligible managed one); robots unchanged; canonicals unchanged | Ready but not executed |
| 12 | **Mapping approval**, then backfill dry run → read → execute | **Awaiting owner approval** (§4) |
| 13 | Rollback: `DROP TABLE "Subcategory"/"ArticleType"; DROP TYPE "ArticleSchemaType";` — restores the prior schema exactly, and **needs no code rollback** | **Verified** by rehearsal |
| 14 | Incident recovery: PITR to the step-2 timestamp | **Not verified** — depends on BKP-01 |
| 15 | Final owner sign-off | Awaiting owner |

---

## 9. Outstanding owner decisions

1. **BKP-01** — approve the paid, isolated Aiven fork (or supply console access).
   **This is the only hard blocker.**
2. **The mapping** — approve the file as it stands (7 CREATE / 1 MERGE / 3
   RETAIN), or the narrower 2 CREATE / 9 RETAIN alternative, or all-RETAIN. Note
   the two renames in rows 7 and 10.
3. **Deployment** — authorize steps 3-8 once 1 is closed.
4. **The working tree** — 41 modified + 36 untracked files remain uncommitted.

---

## 10. Remaining risks

| # | Risk | Severity |
|---|---|---|
| 1 | **No production backup has ever been proven restorable** | **Blocking** |
| 2 | Mapping unapproved; 11 rows pending | **Blocking** for the backfill only |
| 3 | Production is 2 migrations behind; the code tolerates it, the backfill does not | High |
| 4 | Backup retention window unknown | High |
| 5 | Mobile-viewport browser UAT not performed | Medium |
| 6 | Production behaviour unverified by definition — nothing is deployed | Medium |
| 7 | Any mapping target starts below the ≥3 indexability threshold | Low |
| 8 | The browser suite is not part of the routine gate, which is how a stale expectation survived four batches | **Medium — recommend adding `test:e2e` to the standard verification set** |

---

## 11. Final readiness verdict

### `CONDITIONALLY READY — BLOCKERS REMAIN`

**The code is ready.** Every audit finding is fixed or formally deprecated;
3,241 unit/integration tests and 149 real browser tests pass; TypeScript is
clean; the production build succeeds; both pending migrations are rehearsed,
additive, reversible and need no downtime; the backfill is rehearsed, idempotent
and fail-closed.

**Production is not ready**, for one reason that no amount of local work can
resolve: **no backup of the production database has ever been proven to
restore.** The restore *procedure* is now proven; the *production backup* is not.
Everything else on the critical path is either verified or waiting on a decision.

| | |
|---|---|
| Production database writes | **none** |
| Production migration executed | **no** |
| Production backup restored | **no** |
| Legacy backfill executed | **no** |
| Production deployment | **no** |
| Git commit / push / branch / reset / stash | **none** |
| Paid infrastructure provisioned | **none** |
| Secrets exposed | **none** |
| Stage 04 or a new remediation programme | **not created** |

**Stopping here for owner review.**
