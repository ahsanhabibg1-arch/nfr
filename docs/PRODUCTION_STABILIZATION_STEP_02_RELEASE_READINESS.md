# Production Stabilization — Step 02: Cloud Database & Render Release Readiness

**Status: COMPLETE — all accessible read-only checks performed; limitations documented in §12.**

**Date:** 2026-11-12 · **Branch:** `main` · **HEAD:** `54fe6dd` · **Step:** 02 of 08
**Type:** READ-ONLY verification. No migration applied, no deployment, no database write, no
code change, no commit, no push. The cloud session was forced
`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` before any query.

Throughout, findings are labelled **[CONFIRMED]** (directly measured), **[INFERRED]**
(reasoned from measured evidence) or **[UNVERIFIED]** (not checkable from here).

---

## 1. Executive summary

Two assumptions carried from earlier reports are **wrong**, and one new problem was found.

| | Finding |
|---|---|
| ✅ **Correction 1** | **DB-01 is already resolved.** Both migrations previously reported as pending are **APPLIED** to the cloud database, with 0 failed or incomplete entries. The audit inferred "pending" from commit dates; direct measurement disproves it. **No migration approval is needed.** |
| ✅ **Correction 2** | **The deployed build already runs against the migrated schema.** Live `/api/ready/` returns `database: ok`, so old-code/new-schema coexistence is not a theory — it is observed in production right now. |
| 🚨 **New P0** | **The staging site is publicly indexable.** `X-Robots-Tag` is **absent** on HTML pages and `robots.txt` says `Allow: /` while advertising a sitemap. `render.yaml` declares `STAGING_NOINDEX=true`, so the declared protection is **not in effect**. |
| ⚠️ | **Backup readiness is an indicator, not a verified restorable backup.** WAL archiving is on and healthy, but no backup artefact was listed and no restore has been evidenced. |

The new P0 matters beyond SEO: the audit's OD-2 reasoning assumed `noindex` limited exposure
of the reader-account/privacy contradiction to "anyone with the URL". That mitigation does
not currently exist — the pages are crawlable.

**Net effect on the release:** the database blocker is gone, so deploying Step 01 is now a
much smaller operation than the audit implied. The indexing problem should be fixed in the
same release.

---

## 2. Repository baseline **[CONFIRMED]**

| | |
|---|---|
| Branch / HEAD | `main` / `54fe6dd28a77ba5da54452e66b8c3a78b9752f68`, level with `origin/main` (0/0) |
| Modified | `apps/web/app/admin/(dashboard)/website/preview/route.ts` (Step 01) |
| Untracked | `apps/web/tests/builder-preview-redirect.test.ts`, three `docs/*.md` (audit, Step 01, this report) |
| Staged / stashes | 0 / 0 |
| Migration inventory | **21** directories, newest `20261112000000_add_rodeo_archived_at`, `20261112010000_add_seed_tombstone` — names verified against the repository, matching the brief |
| Node (local build/test) | **22.23.4** — the version `render.yaml` pins; `engines` requires `>=22.23.4 <23` |
| Prisma | CLI **6.19.3**, `@prisma/client` **6.19.3** |
| Next.js | **16.4.3** |
| Build config | `experimental.cpus: 1`, `staticGenerationMaxConcurrency: 1`, `trailingSlash: true`, `serverExternalPackages: ['@aws-sdk/client-s3']` |
| Render config | `rootDir: apps/web`, build `npm ci && npx prisma generate && npm run build`, start `npm run start`, health `/api/health/`, `autoDeploy: false`, `plan: free` |

Required environment variable **names** (values never read or printed): `NODE_VERSION`,
`NODE_ENV`, `APP_ENV`, `MEDIA_STORAGE_PROVIDER`, `LOG_LEVEL`, `STAGING_NOINDEX`,
`NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `INTERNAL_REVALIDATE_SECRET`, `MEDIA_S3_ENDPOINT`,
`MEDIA_S3_BUCKET`, `MEDIA_S3_REGION`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY`,
optional `APP_VERSION`, `APP_COMMIT`.

Prisma schema consistency: `tsc --noEmit` clean and the full suite green as of Step 01
(125 files / 2,709 tests); the local client is generated from the current schema.

---

## 3. Cloud access availability **[CONFIRMED]**

**Authorized read-only access is available.** A cloud connection string exists in the local
environment file, and the owner explicitly authorised operating on this database earlier in
this workstream (a far broader authorisation than reading). The connection was opened with
the session set **read only**, which the server confirmed
(`default_transaction_read_only = on`), so no statement issued could write.

Only `SELECT` and catalog reads were used. **No** `prisma migrate deploy|dev|status`,
**no** `db push`, **no** `migrate reset`, **no** shadow database, **no** DDL, **no** change
to any user or permission.

---

## 4. Cloud database identity **[CONFIRMED]**

| Property | Value |
|---|---|
| Provider / host | Aiven managed PostgreSQL (host and port redacted — not recorded in the repository) |
| Database | `defaultdb` |
| Connecting role | `avnadmin` |
| Engine | **PostgreSQL 18.6** |
| Replica? | No (`pg_is_in_recovery = false`) — this is the primary |
| Public tables | **85** |
| Session mode during this check | **read only** |

**Environment classification — the standing caveat.** This is the owner's **existing cloud
database**, not a dedicated staging instance. Earlier in this workstream its host was shown
to match the `CLOUD_DATABASE_URL` in the local environment, and the owner chose to migrate it
in place ("Route B") rather than create a separate staging database. Batch 23 report 07 asks
for a dedicated staging database with a least-privilege role; the deployment currently reads
and writes the real data using the `avnadmin` superuser role. **[CONFIRMED]** for the role
and host; the business classification of the data remains the owner's call.

---

## 5. Verified migration state **[CONFIRMED]**

Read from `_prisma_migrations` and `information_schema`:

| Check | Result |
|---|---|
| Migrations recorded | **21** — matches the 21 in the repository |
| Failed or incomplete | **0** (no row with `finished_at IS NULL` or a `rolled_back_at`) |
| `20261112000000_add_rodeo_archived_at` | **APPLIED**, finished, 1 step |
| `20261112010000_add_seed_tombstone` | **APPLIED**, finished, 1 step |
| `archivedAt` columns | present on **5** tables — `Discipline`, `RodeoHub`, `RodeoEvent`, `RodeoEventEdition`, `Venue` |
| `SeedTombstone` table | **PRESENT** |

**This supersedes the audit (DB-01) and Step 01 §10.2.** Both documents stated the two
migrations were unapplied and that deploying would fail during static generation. That was an
**inference from commit dates**, not a measurement. Measured directly, the cloud schema is
current. The earlier claim should be read as withdrawn.

No safe drift indicator was found: every migration the repository carries is recorded as
finished, and both schema objects those two migrations create exist. A full column-by-column
drift comparison was not performed (it would require a shadow database, which is forbidden
here and unnecessary given the above).

---

## 6. Migration SQL review

Both files were read in full. Each carries its own non-destructiveness rationale and an
explicit rollback script — unusually good practice, and it checks out against the SQL.

### `20261112000000_add_rodeo_archived_at`
| | |
|---|---|
| Statements | 5 × `ALTER TABLE … ADD COLUMN "archivedAt" TIMESTAMP(3)`, 5 × `CREATE INDEX` |
| Tables | Discipline, RodeoHub, RodeoEvent, RodeoEventEdition, Venue |
| Existing data impact | **None.** Every column is nullable with **no default**, so PostgreSQL records a catalog-only change and does **not** rewrite the table. Existing rows read `NULL` = ACTIVE, preserving current behaviour |
| Locking | `ADD COLUMN` without default takes a brief `ACCESS EXCLUSIVE` lock (metadata only, no rewrite). `CREATE INDEX` (not `CONCURRENTLY`) blocks writes on each table for the duration of the build — on tables of this size (tens to low hundreds of rows) that is milliseconds |
| Operational risk | **Low** |
| Status | **Already applied** |
| Backup / maintenance window | Not required at this size. On a large table the non-concurrent index build would warrant one |

### `20261112010000_add_seed_tombstone`
| | |
|---|---|
| Statements | `CREATE TABLE "SeedTombstone"`, `CREATE UNIQUE INDEX` on `(kind, key)` |
| Existing data impact | **None** — touches no existing table, reads and writes no existing row |
| Locking | None on existing objects |
| Operational risk | **Low** |
| Status | **Already applied** |
| Backup / maintenance window | Not required |

**On the brief's caution — "do not assume a migration is safe merely because it adds nullable
columns":** the genuine risks in this class are (a) `ADD COLUMN` *with* a volatile default,
which rewrites the table, and (b) non-concurrent index builds blocking writes. Neither
migration uses a default, and the index builds are on very small tables. Both are also **now
historical** — they are applied, so the remaining question is correctness of the result, which
§5 confirms.

**Prisma model compatibility [CONFIRMED]:** the schema's `archivedAt DateTime?` and the
`SeedTombstone` model correspond to the columns and table observed in the database.

---

## 7. Backup and recovery assessment **[INDICATOR ONLY — NOT VERIFIED]**

Measured from inside the database:

| Signal | Value |
|---|---|
| `archive_mode` | **on** |
| WAL segments archived | **271** |
| Last archived | 2026-11-12 23:38 |
| Archiver failures | **0** |

**What this does and does not prove.** Continuous WAL archiving is running and healthy, which
is the mechanism Aiven's point-in-time recovery is built on — so PITR is **plausibly**
available. It is **not** evidence of a specific restorable backup, of a retention window, or
of a tested restore. Those live in the Aiven console, which I cannot reach.

**Not verified:** backup existence and timestamps, PITR window, retention policy, restore
procedure, and whether any restore has ever been exercised. **No backup or restore was
initiated**, as instructed.

**Assessment:** because both migrations are already applied, no *new* backup is required for
them. Before any **future** schema change the owner should confirm, in the Aiven console,
that a recoverable backup exists and that the restore path is understood.

---

## 8. Render deployment assessment

| Item | Finding | Label |
|---|---|---|
| Service reachable | `https://nfr-qadd.onrender.com/api/health/` → **200** `{"status":"ok"}` | CONFIRMED |
| Readiness | `/api/ready/` → **200** `{"database":"ok","environment":"ok"}` | CONFIRMED |
| Deployed commit | **Not verifiable from here.** No public endpoint exposes `APP_COMMIT`; Settings requires authentication. Last known is **`abc0da5`** from the deploy log the owner supplied on 2026-11-12 03:08 | UNVERIFIED |
| Security headers (live) | HSTS `max-age=63072000; includeSubDomains`, `X-Frame-Options: SAMEORIGIN`, CSP **report-only** present | CONFIRMED |
| **`X-Robots-Tag` on HTML** | **ABSENT** on `/` and `/about/` | **CONFIRMED** |
| `robots.txt` (live) | `User-Agent: * / Allow: / / Disallow: /admin/` + `Sitemap:` advertised | CONFIRMED |
| Build/start/runtime | per `render.yaml`; Node pinned 22.23.4 | CONFIRMED (config) |
| Build-time DB access | Required — 8 routes pre-render via `generateStaticParams`, and the public layout queries the search index | CONFIRMED (code) |
| Connection ceiling | `max_connections` **20**, **14** in use → ~3–4 free | CONFIRMED |

### 🚨 New P0 — staging is indexable

`middleware.ts` emits `X-Robots-Tag: noindex, nofollow` **only** when
`process.env.STAGING_NOINDEX === 'true'` (a strict string comparison), and its matcher
deliberately excludes `api/`. I therefore checked **HTML** routes, where the header should
appear — and it is **absent on both**. `robots.txt` additionally serves `Allow: /` with a
sitemap reference, so crawlers are invited in.

**[INFERRED]** the most likely cause is that `STAGING_NOINDEX` is not set to exactly `"true"`
in the Render environment (it is declared in `render.yaml`, but a service created or edited
outside the Blueprint would not inherit it). I cannot read Render's environment to confirm.
Middleware itself is deployed — the build output lists `ƒ Proxy (Middleware)`.

**Why this is more than an SEO nuisance:** the audit's OD-2 analysis treated `noindex` as the
control limiting exposure of the Privacy-Policy contradiction (the policy denies reader
accounts while `/register/` is live). That control is **not currently in effect**, so the
contradictory pages are crawlable, not merely reachable.

### Connection-ceiling note
The 20-connection ceiling with ~14 held by Aiven's own agents remains the tightest runtime
constraint. It is mitigated in code (`lib/db.ts` bounds the pool in production;
`experimental.cpus: 1` bounds build workers). No change needed for this release.

---

## 9. Build / schema compatibility

**Can the current production build coexist with the migrated schema? — YES [CONFIRMED].**
Not by argument but by observation: the cloud schema already carries both migrations, and the
deployed build is serving `/api/ready/` with `database: ok` right now. Mechanically this is
expected — Prisma emits explicit column lists, so columns the deployed client does not know
about are simply never selected.

**Can the proposed new build run before all required migrations? — Not applicable
[CONFIRMED].** There are no pending migrations: the repository's 21 and the database's 21
match. `54fe6dd` plus Step 01 introduces **no** schema change, so ordering between migration
and deployment is not a constraint for this release.

**Rollback compatibility [INFERRED]:** redeploying an earlier commit stays safe for the same
reason — older clients ignore the additive columns. Rolling the *schema* back is documented
inside each migration file, and would only lose which records were archived and which seeded
entities were deleted.

---

## 10. Media logging release dependency **[CONFIRMED]**

`c03e233` — *fix(media): report the real cause when an upload fails* — **is an ancestor of
`54fe6dd`**, so it is included in the revision planned for release. It replaces three bare
`catch` blocks in `lib/cms/mediaService.ts` with `report()` calls.

**How the next media step uses it without exposing credentials.** Once deployed, a single
failed upload writes one structured line to the Render log naming the error class and the
non-secret context — for example `[storage] AccessDenied: … provider=r2 objectKey=… objectsWritten=0`.
Storage SDK errors carry a code and message (`AccessDenied`, `InvalidAccessKeyId`,
`NoSuchBucket`, endpoint/signature errors) but never the key material, and the logger
independently redacts password-, token-, key- and connection-string-shaped values. So the
diagnosis comes from the error class alone: no credential needs to be read, printed or
pasted anywhere. R2 credentials were **not** investigated in this step and **no media was
uploaded**, as instructed.

---

## 11. Step 01 preservation **[CONFIRMED]**

| Check | Result |
|---|---|
| Preview route still modified | yes — the only tracked modification in the tree |
| `sameOriginRedirect` / `assertSameOriginPath` | **7** references present |
| Residual `NextResponse.redirect` **calls** | **0** — the two textual matches are inside the explanatory comment (lines 13, 29); both live redirects are `sameOriginRedirect` (lines 86, 136) |
| Regression tests present | `apps/web/tests/builder-preview-redirect.test.ts` |
| Tests still passing | **22 / 22** re-run in this step |
| Authenticated preview behaviour | unchanged — `requireUser` + `system.config` still gate the route ahead of everything else |
| Work discarded | none |

The Builder preview implementation was **not** rewritten or touched in this step.

---

## 12. Risks, blockers and limitations

| ID | Item | Severity | Status |
|---|---|---|---|
| **IDX-01** | Staging publicly indexable — `X-Robots-Tag` absent, `robots.txt` allows all | **P0** | Open. Cause inferred (env var), not confirmed |
| **MED-01** | Media upload failing in production | P0 | Unchanged. Diagnosis unblocked once `c03e233` ships |
| **BLD-01** | Builder preview redirect | P0 | Fixed locally (Step 01), **not deployed** |
| ~~DB-01~~ | ~~Cloud migrations pending~~ | — | **WITHDRAWN — measured as applied** |
| BKP-01 | No verified restorable backup | P2 | Indicator only; console access required |
| ENV-01 | Deployed commit unverifiable | P2 | No public version endpoint |
| DB-ENV-01 | Deployment uses the real cloud DB with a superuser role, not a dedicated staging DB + least-privilege role | P2 | Owner's earlier choice; restated, not re-litigated |
| CONN-01 | 20-connection ceiling, ~3–4 free | P2 | Mitigated in code |

**Explicit limitations of this step.** No access to the Render dashboard, its environment
variables or its runtime logs; no access to the Aiven console, so backup artefacts, retention
and PITR windows are unverified; the deployed commit could not be read; no column-level drift
comparison was performed (it needs a shadow database); production behaviour of the Step 01
fix remains untested because it is not deployed.

---

## 13. Proposed migration sequence

**None required.** Both migrations are already applied and recorded as finished, with no
failed entries. The repository (21) and the database (21) agree. **No migration approval is
being requested.**

---

## 14. Proposed deployment sequence

Nothing below has been performed; each step needs the owner's go-ahead.

1. **Fix `STAGING_NOINDEX` first (IDX-01).** In the Render dashboard set it to exactly
   `true` and redeploy, or confirm why it is absent. Verify afterwards with a single
   read-only check: `X-Robots-Tag: noindex, nofollow` must be present on an **HTML** route
   (not `/api/…`, which middleware excludes by design). This needs **no code change**.
2. **Commit and push Step 01** — `route.ts` + its 22 tests. Requires commit/push approval
   (not granted in this step).
3. **Deploy.** `autoDeploy: false`, so the owner triggers it. No migration step is needed.
4. **Verify BLD-01 in production:** open the Page Builder canvas; it must render the draft
   page instead of `localhost refused to connect`. Also check "Exit draft preview".
5. **Verify MED-01's cause:** attempt one image upload, then read the Render log for the
   `[storage] …` line (§10). Do not change credentials before reading it.
6. If the logged cause is permission-related, reissue a write-scoped R2 token — a separate,
   approval-gated step.

**Rollback:** redeploy the previous commit from Render's deploy history. No schema rollback
is involved, since this release contains no migration.

---

## 15. Owner approvals required

| # | Approval | Needed for |
|---|---|---|
| 1 | Correct `STAGING_NOINDEX` in the Render environment | IDX-01 — recommended **before** anything else ships |
| 2 | Commit + push the Step 01 changes to `main` | getting BLD-01 into a deployable revision |
| 3 | Trigger the Render deployment | BLD-01 and the media logging reaching production |
| 4 | *(none for migrations)* | — database is current |
| 5 | Confirm whether the deployment should keep using the real cloud database with `avnadmin`, or move to a dedicated staging database with a least-privilege role | DB-ENV-01 |
| 6 | Confirm Aiven backup/PITR availability before the next schema change | BKP-01 |

---

## 16. Final repository state **[CONFIRMED]**

| | |
|---|---|
| Branch / HEAD | `main` / `54fe6dd` — unchanged, level with `origin/main` |
| Commits / pushes / deployments | **none** |
| Database writes | **none** — cloud session was read-only; development and test databases untouched |
| Application code / schema / migrations | **unmodified**; none created or applied |
| Environment variables, storage permissions, media | **untouched** |
| Step 01 work | **intact**, 22/22 tests passing |
| New file | `docs/PRODUCTION_STABILIZATION_STEP_02_RELEASE_READINESS.md` (this report) |

**Step 03 has not been started.** Awaiting owner review.
