# Issue 04 — Combined Finalization: 04-C mapping, BKP-01, 04-D backfill, Integration Verification

**Status: ENGINEERING PREPARATION COMPLETE.**
**Issue 04 is NOT production-complete: BKP-01 is NOT VERIFIED and the mapping is unapproved.**

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`

No commit, push, deploy, production migration, production write or backfill. The production
database was read **only**, inside a forced `READ ONLY` session, under the owner's explicit
authorization given for this task.

---

## 0. Local run, as requested

`next dev` on **port 3000** (`localhost:3000`), still serving at the time of writing.

| Check | Result |
|---|---|
| 14 public routes | all **200** (`/`, five section pages, two discipline guides, a category archive, an article, `/search/`, `robots.txt`, `sitemap.xml`, `/api/health/`) |
| 6 admin routes | all **307 → login** (the auth gate is intact) |
| **Issue 03** — discipline guide | scoring criteria, terminology and spectator tips all render; the synthesised "*…in action at the National Finals Rodeo*" caption is **gone** |
| **04-A** — archive filter | buttons are `All Types` · `Feature (legacy)` · `Analysis (legacy)` — derived from the data, with the hardcoded lowercase list gone |
| **04-B** — legacy fallback | `Broadcast Intelligence` still displayed (no backfill has run) |
| **MED-01B/C** — hero | real editorial ALT, `loading="eager" fetchPriority="high"`, two lazy images below |

*(A `>feature<` string also appears on the page — it is the card's article-type chip, which
renders the stored value and is CSS-uppercased. Checked separately so it is not mistaken for the
old filter list.)*

---

## A. Issue 04-C — mapping review

Full table, rationale and consequences: **`docs/PRODUCTION_STABILIZATION_ISSUE_04C_MAPPING.md`**.
Machine-readable: **`apps/web/prisma/taxonomy/subcategory-mapping.json`**.

Summary of the proposal — **all 11 rows `PENDING_OWNER_APPROVAL`**:

| Action | Count | Labels |
|---|---|---|
| **CREATE** | 7 | Scoring & Tactics · Concerts & Nightlife · Exhibition & Tack · Accommodations · Broadcast Intelligence → *Watching & Broadcast* · Venue Navigation → *Visiting Las Vegas* · Tickets |
| **MERGE** | 1 | Spectator Strategy → `visiting-las-vegas` |
| **RETAIN** | 3 | Championship Analysis · Discipline Deep Dive · Global Rodeo Hubs |

The three RETAIN proposals share one reason: each restates an axis that **already exists and is
already managed** — Article Type for "Championship Analysis", Discipline for "Discipline Deep
Dive", Rodeo Hub for "Global Rodeo Hubs". Creating them would reintroduce exactly the
duplicate-vocabulary problem the Issue 04 audit identified.

**Production was read to confirm this transfers.** `defaultdb` holds the **same eleven labels in
the same five sections**, the same article-type distribution, and no label spans two sections.
So the analysis is not a local artefact.

**Two things the owner should weigh before approving** (both in §4 of the mapping doc):

- Six of the seven proposed subcategories would start with **one article each**. Under the
  approved indexing rule (≥3 published articles) their archives would be `noindex` and absent
  from the sitemap — so **there is no SEO gain on day one**.
- **Leaving all eleven as RETAIN is a legitimate choice.** The managed taxonomy would then serve
  new editorial work only, with zero change to existing articles. It is the lowest-risk option.

---

## B. BKP-01 — backup & restore readiness

### Verdict: **NOT VERIFIED (restore not performed).** Not BLOCKED — read-only evidence was obtainable.

Authorization was given, and used for **read-only queries only**. A restore rehearsal was **not**
possible and was not attempted, for a concrete reason: the only production credential available
here is a PostgreSQL connection string. Creating an isolated restore target on Aiven is a
**control-plane** operation needing Aiven console or API credentials, which this environment does
not have. No cloud resource was created.

### Evidence gathered (production, forced READ ONLY)

| Item | Finding |
|---|---|
| Identity | `defaultdb`, user `avnadmin`, PostgreSQL **18.6**, `pg_is_in_recovery = false` |
| `archive_mode` | **on** |
| `archive_command` | **configured** (non-empty) — stronger than `archive_mode` alone |
| `restore_command` | **configured** |
| `wal_level` | **logical** (≥ replica, so PITR-capable) |
| **WAL archiver** | **58 segments archived, 0 failures**, last archived **07:52:22 UTC today**, stats since the 03:10:54 restart |
| `last_archived_wal` | `000000030000000900000006` → **timeline 3** |
| Database size | **13 MB** (a restore would be fast) |
| `max_wal_senders` / slots | 20 / 0 |
| Extensions | `plpgsql` only |
| Role rights | `avnadmin`: not superuser; `createdb`, `createrole`, `replication` all true |
| Migration state | **21 migrations, 0 unfinished, 0 rolled back** |
| 04-B schema | **`Subcategory` absent, `Article.subcategoryId` absent** — the migration is NOT deployed |

### What this does and does not prove

**Proved:** WAL archiving is **actively working right now** — 58 segments, zero failures, the most
recent one minutes before the probe. That is materially stronger than the `archive_mode = on`
observation Step 02 recorded, and the brief was right to say `archive_mode` alone proves nothing.

**Indicated but not proved:** PITR capability. `wal_level=logical`, both `archive_command` and
`restore_command` set, and **timeline 3** — meaning this cluster has been through at least two
recovery or promotion events, so the provider's recovery machinery has been exercised at some
point. That is circumstantial, and it concerns the provider's tooling, not this data.

**Not determinable from inside PostgreSQL, and therefore still unknown:**

- backup **retention window** (an Aiven control-plane setting)
- the **latest backup's** timestamp and size
- whether a restore of **this** database has ever succeeded
- RTO / RPO expectations
- whether an isolated restore destination exists or can be provisioned

**Report status: NOT VERIFIED.** No restore was performed, so no integrity check was possible.
Claiming otherwise is exactly what §5 forbids.

### Restore rehearsal runbook (for the owner, or for an authorized session with Aiven access)

1. **Backup selection** — In the Aiven console, record: retention days, PITR earliest
   recoverable time, latest backup timestamp. Choose a target time **before** any planned
   migration.
2. **Isolated destination** — Use Aiven's *fork* / *point-in-time fork* to a **new service**.
   Never restore over the live service. Name it `nfr-restore-rehearsal-<date>`.
3. **Access controls** — Fork-only credentials; do not reuse `avnadmin`'s production password in
   any application config. Delete the fork's credentials with the fork.
4. **Restore procedure** — Create the fork, wait for it to report *running*, then connect with a
   `READ ONLY` session first and confirm identity (`current_database()`, `pg_postmaster_start_time()`).
5. **Migration rehearsal** — Point `DATABASE_URL` at the fork and run
   `prisma migrate deploy`. Record the applied list and the duration. **Read the generated SQL
   first** — §C below has already reviewed it.
6. **Integrity verification** — Capture the §C fingerprint query before and after; it must be
   byte-identical except for `subcategoryId`. Confirm 11 published articles, 11 legacy labels,
   7 disciplines with guide JSON, 42 tags / 45 links.
7. **Recovery evidence** — Save the console screenshot of the restore, the migration output, and
   both fingerprints. This is what turns BKP-01 from NOT VERIFIED to VERIFIED.
8. **Cleanup** — Power off and delete the fork. Confirm it no longer appears in the console.
   Rotate any credential that was created for it.
9. **Required approvals** — Owner approval to create the fork (it incurs cost), and a second
   approval before the production migration itself.

**Prerequisites currently missing:** Aiven console/API access, the retention policy, and a
destination for the fork. All three are owner-side.

---

## C. Issue 04-D — backfill preparation

### Files

| File | Role |
|---|---|
| `apps/web/lib/cms/subcategoryBackfill.ts` | the mechanism (single source of truth, testable) |
| `apps/web/scripts/backfill-subcategories.mjs` | CLI wrapper: target guard, dry-run default, printing |
| `apps/web/prisma/taxonomy/subcategory-mapping.json` | the reviewed mapping, `PENDING_OWNER_APPROVAL` |
| `apps/web/tests/issue04cd-backfill.test.ts` | 25 tests, synthetic fixtures |

### Safeguards, each one tested

| Safeguard | How it behaves |
|---|---|
| **Dry run is the default** | `dryRun` defaults true; the CLI needs `--execute`. A dry run runs inside a transaction that is **deliberately aborted**, so it can report an accurate plan while writing nothing |
| **Fail closed on approval** | Execution is refused unless `approval.status === "APPROVED"` **with** `approvedBy` **and** `approvedAt`. `"approved"` lower-case, or a missing approver, is still a refusal |
| **Unmapped labels stop the run** | Every (section, label) pair in the database must have an entry. The error names each missing pair. Nothing is inferred |
| **No automatic slug suffixes** | Two CREATEs targeting one slug abort with "No suffix is added automatically" |
| **Mapping slugs must already be normalised** | A non-normalised or reserved slug aborts rather than being silently rewritten |
| **Transactional** | One transaction; a later failure rolls back an earlier CREATE. Tested with a valid entry followed by a broken one |
| **Idempotent** | An attached article is skipped; an existing target is reused. A second approved run reports `created 0, attached 0, alreadyAttached 1` |
| **Cross-section integrity** | The target is resolved **within the article's own category**, so a mapping pointing at another section's slug simply finds nothing and aborts |
| **Legacy text never modified** | Asserted after CREATE, MERGE and RETAIN alike |
| **Preservation fingerprint** | Every protected article column is hashed before and after; the report carries `fingerprintUnchanged` |
| **Remote target guard** | `--execute` against a non-local host additionally requires `BACKFILL_ALLOW_REMOTE=I_HAVE_A_VERIFIED_BACKUP` |

### The dry run against real development data

```
  mapping : prisma/taxonomy/subcategory-mapping.json
  database: localhost/nfrguide_dev  (local)
  mode    : DRY RUN — nothing will be written
  approval: PENDING_OWNER_APPROVAL

  CREATE nfr-entertainment    "Concerts & Nightlife"   -> concerts-nightlife
  CREATE nfr-events-shopping  "Exhibition & Tack"      -> exhibition-tack
  CREATE nfr-plan-watch       "Accommodations"         -> accommodations
  CREATE nfr-plan-watch       "Broadcast Intelligence" -> watching-broadcast
  CREATE nfr-plan-watch       "Venue Navigation"       -> visiting-las-vegas
  CREATE nfr-competition      "Scoring & Tactics"      -> scoring-tactics
  CREATE nfr-plan-watch       "Tickets"                -> tickets
  MERGE  nfr-plan-watch       "Spectator Strategy"     -> visiting-las-vegas (existing)
  RETAIN more-rodeo           "Global Rodeo Hubs"
  RETAIN nfr-competition      "Championship Analysis"
  RETAIN nfr-competition      "Discipline Deep Dive"

  subcategories created : 7     articles attached : 8     retained : 3
  protected fields unchanged: yes
  This was a dry run. Nothing was written.
```

**Two real defects in the mechanism were found by running it, not by reading it:**

1. **MERGE could not resolve a target created in the same run.** The proposed mapping has
   `Venue Navigation` CREATE `visiting-las-vegas` and `Spectator Strategy` MERGE into it. The
   runner iterated database groups in arbitrary order, so the MERGE could be reached first — and
   in a dry run the CREATE writes nothing, so the target would never be found at all. Fixed by
   processing CREATE before MERGE and recording planned targets, so a dry run resolves the
   dependency honestly.
2. **The module rejected its own shipped mapping file.** The approval schema required `string`,
   while the file writes an explicit `null` for an unapproved `approvedBy`/`approvedAt`. Fixed by
   accepting `null` — which is still a refusal at the approval check.

Both were caught by the test that runs the **real** mapping file against the **real** article
rows, which is the one test a synthetic fixture could never have replaced.

### Approval requirements before any execution

1. Owner edits and approves `subcategory-mapping.json` (§5 of the mapping doc).
2. **BKP-01 VERIFIED** — this is the first operation that writes to existing production rows.
3. The production 04-B migration applied first (production is still at 21 migrations).
4. A dry run read and accepted on the production target.

---

## D. Final integration verification

### Article Type (04-A)

| Check | Result |
|---|---|
| 18 selectable types, in editorial order | pass |
| 5 legacy values recognised, not selectable, labelled "(legacy)" | pass |
| Registry-backed validation; exact (case-sensitive) | pass — `guide` accepted, `GUIDE` refused |
| Evergreen matrix matches the approved policy; covers all 23 values once | pass |
| Evergreen query returns > 0 against real data | pass |
| Archive filter derived from present types | pass — verified in the live page |
| `NewsArticle` vs `Article` JSON-LD, case-insensitive | pass; `NEWS_ARTICLE_TYPES` membership unchanged |

### Managed Subcategory (04-B)

| Check | Result |
|---|---|
| Parent relationship, per-parent slug uniqueness, same slug in two sections | pass |
| **Composite FK** rejects a cross-section assignment even when the service is bypassed | pass |
| FK does not fire when `subcategoryId` is NULL (MATCH SIMPLE) | pass |
| Admin CRUD, archive/reactivate, dependency-safe delete | pass |
| Parent move refused while articles are attached (service **and** `ON UPDATE RESTRICT`) | pass |
| Editor selection filtered to the section; section change clears with an explicit notice | pass |
| Archived assignment survives unrelated edits | pass |
| Legacy label fallback (`managed ?? legacy`) | pass — and visible on the running site |
| RBAC + audit on every mutation | pass |

### Public SEO

| Check | Result |
|---|---|
| Article URLs, canonical URLs | unchanged |
| Sitemap entries — no subcategory URLs | unchanged |
| BreadcrumbList JSON-LD — still Home → Category → Article | unchanged |
| Article structured data | unchanged |
| Publication visibility / fixture policy | unchanged |
| Category archive URLs | unchanged |

### Issue 03

Seven disciplines load and map; classification restricted to `Roughstock` / `Timed Event`; hero
ALT resolves from the Media Library with the name as fallback; a guide edit leaves the stored
JSON identical. **Unchanged.**

---

## E. Final engineering report

### Files changed in this task

| File | Change |
|---|---|
| `lib/cms/subcategoryBackfill.ts` | **new** — the backfill mechanism |
| `scripts/backfill-subcategories.mjs` | **new** — CLI, dry-run default, target guard |
| `prisma/taxonomy/subcategory-mapping.json` | **new** — reviewed mapping, PENDING |
| `tests/issue04cd-backfill.test.ts` | **new** — 25 tests |
| `apps/web/tsconfig.json` | `allowImportingTsExtensions: true` — see the note below |
| `docs/PRODUCTION_STABILIZATION_ISSUE_04C_MAPPING.md` | **new** |
| `docs/PRODUCTION_STABILIZATION_ISSUE_04_FINAL_PREPARATION.md` | **new** — this report |

**On the tsconfig change, since it is the one thing here that touches global configuration.**
The backfill library imports `./slugRules`, extensionless, which only a bundler resolves — so
plain Node could not load it and the CLI could not run. The flag permits an explicit `.ts`
specifier (used in exactly one import); it is allowed because `noEmit` is set, it forces nothing
else to change, and Turbopack and Vitest already resolve `.ts` identically. The alternatives were
a new dev dependency or duplicating the slug-validation rules — both worse.

Two further notes on that file: `server-only` was **omitted** from the backfill module
deliberately (its package exports are gated behind Next's `react-server` condition, so plain
Node cannot resolve it); and a parameter property had to become an explicit field, because
Node's strip-only TypeScript mode does not support them.

### Test and build results

| Check | Result |
|---|---|
| TypeScript — `tsc --noEmit` | **exit 0** |
| 04-C/04-D (new) | **25 passed** |
| 04-B | **34 passed** |
| 04-A | **90 passed** |
| Issue 03 | **26 passed** |
| Four focused suites together | **175 passed** |
| **Full regression** | **133 files, 3,071 tests passed, 0 failed, 0 skipped** |
| Production build | **exit 0**, `✓ Compiled successfully` |
| `git diff --check` | clean |
| Encoding sweep (33 pending files) | **no BOM, no mojibake** |

**One existing test failed during this task and was corrected, not weakened.**
`tests/batch-i-hardening.test.ts` parses `tsconfig.json` with `JSON.parse`, so the explanatory
`//` comments I first added to it broke a legitimate guard ("strict mode is on"). The comments
were removed and the explanation moved here; the flag stayed. tsconfig is strict JSON again and
`strict: true` is intact.

### Database changes

**None in this task.** No migration created, none applied, no row written anywhere — local,
test or production. The 04-B migration `20261113071524_add_managed_subcategory` remains applied
to **dev and test only**; production is still at 21 migrations.

### Git status

22 modified · 11 untracked (the 04-B migration directory, `lib/content/`, `prisma/taxonomy/`,
`scripts/`, 4 test files, 4 docs). Nothing committed, pushed or deployed. Issue 03, 04-A and
04-B working-tree changes are all present and intact.

### Remaining blockers

| # | Blocker | Owner action |
|---|---|---|
| **1** | **BKP-01 NOT VERIFIED** — no restore performed, retention unknown | Aiven console access + the §B runbook. **Blocks the production migration**, which is the first schema change in this programme and the first thing to cost the code-only rollback |
| **2** | **Mapping unapproved** — all 11 rows PENDING | Review the §A table; edit and approve the JSON |
| **3** | Production is at 21 migrations | The 04-B migration must be applied **before** the code that reads the new columns, or every article query fails |
| **4** | Deferred: managed subcategory names are not in the search vector | Needs a generated-column migration; separate step |
| **5** | Deferred: no public subcategory route | Nested route recommended; a flat route later would need a global unique added after rows exist |

### Owner decisions needed

1. **Approve, amend or reject the 11-row mapping** (§A) — including whether "all RETAIN" is
   preferred, which is a legitimate low-risk outcome.
2. **Authorize the restore rehearsal** (it creates a billable Aiven fork) or supply the
   retention/PITR facts so BKP-01 can at least be assessed from evidence.
3. **Confirm the rename** (Broadcast Intelligence → Watching & Broadcast) and the **merge**
   (Spectator Strategy + Venue Navigation → Visiting Las Vegas).
4. Whether to commit the current working tree before any of the above.

### Production readiness assessment

| Component | Ready? |
|---|---|
| Issue 03 — Discipline CMS | **Yes** — code-only, tested, verified on the running site |
| 04-A — Article Type registry | **Yes** — code-only, no migration |
| 04-B — managed Subcategory *code* | **Yes** |
| 04-B — managed Subcategory *schema* | **Blocked on BKP-01** |
| 04-C — mapping | **Blocked on owner approval** |
| 04-D — backfill | **Mechanism ready and tested; execution blocked on both of the above** |

**Issue 04 is therefore ENGINEERING PREPARATION COMPLETE and NOT production-complete.** Nothing
above may be read as a claim that a production backup has been restored or that a mapping has
been approved.
