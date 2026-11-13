# NFRGuide.com — Final Controlled Release Preflight Audit

**Stage:** PROD-RELEASE-PREFLIGHT-01 · **Priority:** P0 · **Mode:** read-only audit
**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `54fe6dd28a77ba5da54452e66b8c3a78b9752f68`
**Verdict: READY WITH EXPLICIT CONDITIONS** (§12)

Nothing was committed, pushed, deployed, restarted or configured. No live Render setting was
read or changed. No production database was contacted. No migration ran. No R2 setting was
touched. Step 03 was not started.

---

## 1. Executive summary

The three changes under audit — BLD-01, IDX-02 and the IDX-02 configuration correction — are
**internally consistent, fully covered by tests, and locally verified against the real
compiled build**. I re-measured everything rather than restating the earlier reports, and the
re-measurement agreed with them.

The audit also produced **five findings the previous reports did not contain**. One of them
changes the post-deployment verification plan:

1. **Public HTML is shared-cacheable** (`Cache-Control: s-maxage=300`, measured). The noindex
   decision is keyed on `Host`, which is part of a conformant cache's primary key — but
   **Render's CDN cache key has not been independently verified**. If it ignored the hostname,
   a staging response carrying `noindex` could be served on nfrguide.com for up to 300
   seconds. A dedicated interleaved cache probe and a stop condition now exist for this (§10
   step 10, §11). **This is the single most important new item in this audit.**
2. **Configuration-level 308 redirects carry no `X-Robots-Tag` on either hostname** (measured).
   Assessed as acceptable, with the reasoning stated (§4.4) — the destination *is* protected,
   measured.
3. **`/api/ready/` exists and returns 200.** The previous report hedged on this; it is
   resolved.
4. **`/ADMIN/` and `/administration/` both return 404** (App Router is case-sensitive), so the
   admin guard's case sensitivity is not an exposure — and one IDX-02 test guards intent
   rather than an existing route. Disclosed (§4.3).
5. **17 prerendered pages contain `https://nfrguide.com` inside their data payload** while
   emitting a build-origin canonical. Investigated and **explained, not a defect** (§6.1).

**What blocks the release is not code.** It is two production environment values that cannot
be confirmed from the repository, plus the rebuild requirement they imply (§8, §9).

---

## 2. Release scope

### In scope

| Change | Files | Purpose |
|---|---|---|
| **BLD-01** | `app/admin/(dashboard)/website/preview/route.ts` + 22 tests | Builder preview redirected to `http://localhost:10000`; now emits a relative `Location` |
| **IDX-02** | `middleware.ts`, `lib/seo/productionHosts.ts` + 76 tests, 2 updated | Per-request hostname-aware `noindex`; both hostnames share one service |
| **IDX-02 config** | `render.yaml` + 20 tests | `STAGING_NOINDEX: "true"` → `"false"`; it would have de-indexed nfrguide.com |

### Explicitly out of scope

No new feature, no schema change, no migration, no dependency change, no canonical-logic
change, no media change, no taxonomy or Discipline change, no public template change, no SEO
module change. Verified in §3.

### Unresolved items from earlier reports, and whether each blocks *this* release

| Item | Blocks this release? | Reasoning |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` still set to the Render origin | **YES** | Production pages would advertise canonicals and a sitemap on a hostname this release deliberately noindexes — the two changes would actively contradict each other |
| `STAGING_NOINDEX` live value unknown | **YES** | If it is `true`, this release de-indexes nfrguide.com. Unknowable from the repository (§5.4) |
| Render `Host` forwarding unobserved | **NO** — but it is a stop condition | §10 steps 1–2 settle it within a minute of deploying; if wrong, roll back |
| Render CDN cache key unverified | **NO** — but it is a stop condition | §10 step 10 settles it |
| **MED-01** media upload failure | **NO** | Pre-existing, unaffected by this change set, and this release makes it *diagnosable* (`c03e233` error reporting). Separately tracked operational risk |
| **BKP-01** backup/PITR unproven | **NO** | This release adds no migration and writes no data, so rollback needs no database restore. Remains a standing operational risk, not a gate for this change set |
| Production canonical-override rows | **NO** — verify during release | Data quality, not code. Local evidence suggests the feature is unused (§6.2); the read-only check is §9 step 6 |
| DISC-01/02, TAX-01/02, SEO-01, deprecated `middleware` convention | **NO** | Future development tasks, not release blockers |

---

## 3. Git working-tree audit

| Check | Result |
|---|---|
| Branch | `main` |
| HEAD | `54fe6dd28a77ba5da54452e66b8c3a78b9752f68` |
| Upstream | `origin/main` — **ahead 0, behind 0** |
| Stashes | **0** |
| Dependency / lockfile changes | **NONE** |
| `schema.prisma` or migration changes | **NONE** |
| Build artifacts (`.next/`, `dist/`, `node_modules`) in the change set | **NONE** |
| `.env` files added or modified | **NONE** |
| Secrets, credentials or long tokens in release files | **NONE** — 8 files scanned, clean |
| Unrelated feature changes | **NONE** — every changed file maps to a scoped item in §2 |
| Prior uncommitted work preserved | **YES** — Step 01's route fix and tests, and all six reports, intact |

**Tracked diff:** 4 files, +189 / −25.

### Proposed staging manifest for a future, explicitly authorized commit

**Not executed.** No `git add`, commit, push, reset, clean, stash, checkout or merge was run.

```
# code + configuration (4 files)
apps/web/app/admin/(dashboard)/website/preview/route.ts     M
apps/web/middleware.ts                                      M
apps/web/lib/seo/productionHosts.ts                         new
render.yaml                                                 M

# tests (4 files)
apps/web/tests/builder-preview-redirect.test.ts             new
apps/web/tests/idx02-hostname-seo.test.ts                   new
apps/web/tests/deploy-config.test.ts                        new
apps/web/tests/seo-robots.test.ts                           M

# documentation (6 files)
docs/NFRGUIDE_PRODUCTION_EDITORIAL_READINESS_AUDIT.md       new
docs/PRODUCTION_STABILIZATION_STEP_01_BUILDER_PREVIEW.md    new
docs/PRODUCTION_STABILIZATION_STEP_02_RELEASE_READINESS.md  new
docs/PRODUCTION_STABILIZATION_IDX_01_REPORT.md              new
docs/PRODUCTION_STABILIZATION_IDX_02_HOSTNAME_SEO.md        new
docs/PRODUCTION_STABILIZATION_IDX_02_RELEASE_PREP.md        new
docs/PRODUCTION_STABILIZATION_FINAL_RELEASE_PREFLIGHT.md    new  (this file)
```

Suggested message for the owner to approve or replace:

```
fix(seo,builder): same-origin preview redirect and hostname-aware indexing

BLD-01: the Builder preview redirected to the container's internal address, so
the browser reported "localhost refused to connect". Location is now relative,
which is same-origin by construction on every hostname.

IDX-02: nfrguide.com and the Render hostname now resolve to one service, so a
single STAGING_NOINDEX switch could only de-index production or leak staging.
The noindex decision is made per request from the Host header, failing closed
on anything unrecognised. X-Forwarded-Host is deliberately not read: it is not
part of a cache key, so trusting it would allow a forged request to poison a
shared cache into de-indexing the production site.

render.yaml declared STAGING_NOINDEX="true", which on the shared service would
remove nfrguide.com from search results. It is now explicitly "false", pinned
by a test that feeds the declared value to the real middleware.

118 new tests; full suite 127 files / 2,805 tests green.
```

---

## 4. SEO indexing safety matrix

### 4.1 Measured, against the real compiled build

`next start` on port 10000 (the deployment's internal binding), `STAGING_NOINDEX` **unset**,
and **a forged `X-Forwarded-Host: nfrguide.com` sent on every request**:

| Hostname | `/` | `/robots.txt` | `/sitemap.xml` | Required | Verdict |
|---|---|---|---|---|---|
| `nfrguide.com` | *(absent)* | *(absent)* | *(absent)* | no global noindex | **PASS** |
| `www.nfrguide.com` | *(absent)* | *(absent)* | *(absent)* | no global noindex | **PASS** |
| `NFRGuide.com` (mixed case) | *(absent)* | *(absent)* | *(absent)* | no global noindex | **PASS** |
| `nfrguide.com:443` | *(absent)* | *(absent)* | *(absent)* | no global noindex | **PASS** |
| `nfrguide.com:8443` | noindex, nofollow | noindex, nofollow | noindex, nofollow | fail closed | **PASS** |
| `nfr-qadd.onrender.com` | **noindex, nofollow** | **noindex, nofollow** | **noindex, nofollow** | protected | **PASS** |
| `evil.example` | noindex, nofollow | noindex, nofollow | noindex, nofollow | fail closed | **PASS** |
| `localhost:10000` | noindex, nofollow | noindex, nofollow | noindex, nofollow | fail closed | **PASS** |

The forged forwarded header changed nothing in any row — the trust boundary holds in the
compiled artifact, not only in unit tests.

### 4.2 Per-surface audit

| Surface | Finding |
|---|---|
| **Middleware decision** | `STAGING_NOINDEX === 'true'` ‖ `/admin` path ‖ `!isIndexableHost(Host)`. Allow-list derived from `PRODUCTION_SITE_URL`, so it cannot drift from the canonical origin |
| **Host parsing / trust** | Only `Host` is read. Rejected: comma/space injection, scheme or path in the value, non-numeric and non-default ports, empty labels, over-length names, IPv6 literals, missing header. Normalised: case, surrounding whitespace, one trailing FQDN dot |
| **`X-Robots-Tag`** | Present on exactly the hostnames above; **absent on `/api/…`** (matcher excludes `api/` by design — verified: `/api/health/` 200, no header) |
| **`robots.txt`** | `User-Agent: *`, `Allow: /`, `Disallow: /admin/`. `Allow: /` on staging is correct: a crawler must be able to fetch a page to see its `noindex` |
| **Sitemap** | Eligibility unchanged (published, indexable, self-canonical only). Origin comes from `SITE_URL` — see §5 |
| **Canonical URLs** | Stable across both hostnames by construction: `SITE_URL` is a build-time constant and never reads the request. Request-host-dependent canonicals were **not** implemented |
| **Open Graph** | `og:url` and `og:image` derive from the same `SITE_URL`; measured identical in origin to the page's canonical |
| **Article structured data** | JSON-LD `url` derives from the same `SITE_URL`. Measured consistent with canonical and `og:url` |
| **Public article indexability** | Measured `<meta name="robots" content="index, follow">` on a published article — editorial content stays indexable |
| **Page-level `noindex`** | Untouched. Admin layout still `{index:false, follow:false}`; `/register/`, `/login/`, pending legal pages keep their own directives; the production host adds no header, so page metadata remains authoritative |
| **Admin / preview** | `/admin/` → 307 to login, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store, max-age=0`. Preview route still sets its own `no-store` + `noindex` |
| **Cache behaviour** | No `Vary` added; the decision depends only on `Host`. **But public HTML carries `s-maxage=300` — see §4.5** |

### 4.3 Case sensitivity of the admin guard — checked, and harmless

`isAlwaysNoindexPath()` matches `/admin` and `/admin/…` case-sensitively. Measured:

| Path | Status | `X-Robots-Tag` |
|---|---|---|
| `/admin/` | 307 → `/admin/login/` | noindex, nofollow |
| `/ADMIN/` | **404** | absent |
| `/administration/` | **404** | absent |

App Router routing is case-sensitive, so `/ADMIN/` is not an alternate entry to the admin area
— it does not exist. A 404 is not indexable content, so the absent header is not an exposure.

**Disclosure about one of my own tests:** the IDX-02 case asserting that `/administration/` is
*not* caught by the admin guard refers to a route that does not exist today. It still pins a
real property — the guard is segment-scoped rather than a bare prefix, and the mutation test
proved it fails if that changes — but it documents intent rather than protecting a live route.
Stating it plainly so the coverage is not over-read.

### 4.4 Configuration-level redirects carry no `X-Robots-Tag` — measured, and accepted

| Request | Status | `Location` | `X-Robots-Tag` |
|---|---|---|---|
| `nfrguide.com/nfr-competition` | 308 | `/nfr-competition/` | **absent** |
| `nfr-qadd.onrender.com/nfr-competition` | 308 | `/nfr-competition/` | **absent** |
| `nfr-qadd.onrender.com/about` | 308 | `/about/` | **absent** |
| `nfr-qadd.onrender.com/competition/` *(the destination)* | 200 | — | **noindex, nofollow** |

`next.config.mjs` redirects and trailing-slash normalisation are handled before the middleware
runs, so those 308 responses do not receive the header.

**Assessed as acceptable, not papered over.** A 308 is not indexable content: a crawler
follows it and indexes the destination, and the destination **is** protected on the staging
hostname (last row, measured). Adding redirect coverage would mean moving the redirect rules
into the middleware — a larger change than this release justifies, and one that would make
the SEO guard responsible for routing. Recorded as a known limitation rather than a defect.

*(Noted in passing: `/nfr-competition` takes two hops — trailing slash first, then the rule.
Only the first hop was measured. A chain is mild SEO hygiene, pre-existing, and unrelated to
this release.)*

### 4.5 Shared-cache exposure — the new finding

Measured on public HTML, on **both** hostnames:

```
Cache-Control: s-maxage=300, stale-while-revalidate=31535700
```

`s-maxage` targets **shared** caches, so a CDN in front of the service may hold a public page
for 300 seconds. That is precisely why the implementation keys on `Host` rather than
`X-Forwarded-Host`: `Host` is part of the effective request URI, which every conformant cache
includes in its primary key, so one hostname's response cannot be served for another.

**What I could not verify: Render's CDN cache key.** Nothing in the repository or in a local
`next start` can establish it — a local server has no shared cache, so the local probe
validates the commands, not the platform. If that cache keyed on path alone, a staging
response carrying `noindex` could be served to a visitor on nfrguide.com for up to five
minutes.

Standard CDN behaviour makes this unlikely, and this release does not make it worse — the
header previously came from an environment variable and would have had the same cache
characteristics. But it is unverified, it is the one way production could receive a `noindex`
it should not, and it is cheap to test. §10 step 10 is the interleaved probe, and §11 makes it
a stop condition.

---

## 5. Environment configuration findings

### 5.1 `NEXT_PUBLIC_SITE_URL` is embedded at build time — confirmed

| Evidence (local build, `.env` = `http://localhost:3000`) | Result |
|---|---|
| Compiled SSR chunk for `lib/seo.tsx` | `let f="http://localhost:3000".replace(/\/$/,"")` — **the `process.env` read is gone** |
| Prerendered pages with a baked canonical | **47** |
| `.next/server/app/robots.txt.body` | `Host: http://localhost:3000` · `Sitemap: http://localhost:3000/sitemap.xml` |
| `.next/server/app/sitemap.xml.body` | `<loc>http://localhost:3000/…</loc>` |

**Confirmations requested in the brief:**

1. Embedded at build time — **YES**, four independent pieces of evidence.
2. A full Render rebuild is required — **YES**.
3. A restart alone is insufficient — **YES**. A restart re-runs the server against artifacts
   that already contain the old origin.
4. `STAGING_NOINDEX=true` would be unsafe on the shared service — **YES**. The service answers
   on both hostnames, so it noindexes production too. Proven by test, not by reasoning alone:
   the deployment-config suite feeds the Blueprint's declared value to the real middleware.
5. `render.yaml` declares a safe value — **YES**, `value: "false"`, with the hazard documented
   in the file.
6. No conflicting origin configuration in the repository — **CONFIRMED**. `render.yaml` carries
   `sync: false` with no value; `.github/workflows/ci.yml` sets `http://localhost:3000` for CI
   only; the application default is `PRODUCTION_SITE_URL` = `https://nfrguide.com`, which is
   already correct.
7. Production values cannot be confirmed from repository files alone — **CORRECT, and this is
   the basis of the conditional verdict.** `NEXT_PUBLIC_SITE_URL` and all secrets are
   `sync: false`, i.e. dashboard-only. The live service was created manually rather than from
   the Blueprint, so it does not inherit `render.yaml` at all. The last measured live value
   (`https://nfr-qadd.onrender.com`, IDX-01 §4) is from an earlier deploy and may have changed.

### 5.2 Runtime vs build-time, side by side

| Variable | Read at | Change takes effect on |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | **build time (inlined)** | **a full rebuild** |
| `STAGING_NOINDEX` | runtime (`process.env` lookup verified present in the new edge chunk) | a restart |

The two behave differently. Treating them alike is how an owner would change the origin, see
the service restart, and find `/robots.txt` still naming the old hostname.

### 5.3 Exact dashboard instructions for the owner

> **Render → the service → Environment**
>
> 1. `NEXT_PUBLIC_SITE_URL` → `https://nfrguide.com`
>    (exactly that: `https`, no trailing slash, not the onrender hostname)
> 2. `STAGING_NOINDEX` → **delete the variable, or set it to `false`.**
>    **Never `true` on this service** — it would de-index nfrguide.com.
> 3. Leave every other variable unchanged.
> 4. **Save**, then **Manual Deploy → Deploy latest commit** — a *rebuild*, not a restart.
>    (`autoDeploy: false`, so nothing deploys on its own.)
> 5. In the deploy log, confirm `✓ Compiled successfully` and the startup line
>    `NEXT_PUBLIC_SITE_URL: https://nfrguide.com`.

---

## 6. Canonical override findings

### 6.1 Stored vs rendered origins — investigated and explained

A prerendered article page emits a build-origin canonical, `og:url` and JSON-LD `url`, yet
**17 prerendered pages also contain the string `https://nfrguide.com`**. Traced to the
serialized data payload:

```
"canonicalUrl":"https://nfrguide.com/articles/the-anatomy-of-the-10-round-average/"
```

That is a **stored data field** of related-article records, not an emitted SEO directive. It
matches the documented design (`lib/seo/canonical.ts`, `articleService.ts:332`): system
canonicals are **stored** as production URLs so the data is environment-independent, and
**re-based onto `SITE_URL` when rendered**. `sameSiteHosts()` always treats both `SITE_URL`
and `PRODUCTION_SITE_URL` as "this site", so stored `nfrguide.com` values stay valid in every
environment.

**Not a defect.** Once the origin is set to `https://nfrguide.com`, stored and rendered values
coincide.

### 6.2 Stored-URL audit

Two schema fields can hold an editor- or system-supplied absolute URL:

| Model | Field | Source |
|---|---|---|
| `EntitySeo` | `canonicalOverride`, `ogImage` | editor-supplied, validated same-site against `SITE_URL` |
| `ArticleSeo` | `canonicalUrl`, `ogImage` | system-generated via `productionCanonicalUrl()` |

**Read-only audit, local development database only** (session forced
`default_transaction_read_only = on` before any query):

| Query | Result |
|---|---|
| `ArticleSeo` rows | 11 |
| `ArticleSeo.canonicalUrl` distinct origins | **`nfrguide.com` × 11** |
| `ArticleSeo.canonicalUrl ILIKE '%onrender.com%'` | **0** |
| `ArticleSeo.ogImage ILIKE '%onrender.com%'` | **0** |
| `EntitySeo` rows | **0** |
| `EntitySeo` rows with any `canonicalOverride` | **0** |

**Status: production audit UNRESOLVED.** The local database is development data and says
nothing authoritative about production content. No production database was contacted: this
prompt did not explicitly permit it, and §6 of the brief says not to connect otherwise. What
the local run *does* establish is that the SQL is correct and runs (my first attempt used
`Article` instead of `ArticleSeo` and errored — corrected).

The validated read-only query for the owner, or for an explicitly authorized session, is §9
step 6. Expected impact if rows exist: those overrides become off-site after the origin flips
and are ignored, the page falls back to self-canonical, and the SEO audit engine reports them
— a visible, non-destructive degradation, not data loss.

---

## 7. Regression results

Re-run in this audit on **Node 22.23.4** (pinned by `.nvmrc` and `render.yaml`):

| Check | Result |
|---|---|
| TypeScript — `tsc --noEmit` | **exit 0** |
| `tests/builder-preview-redirect.test.ts` (BLD-01) | **22 passed** |
| `tests/idx02-hostname-seo.test.ts` (IDX-02) | **76 passed** |
| `tests/deploy-config.test.ts` (configuration) | **20 passed** |
| `tests/seo-robots.test.ts` (existing SEO) | **41 passed** |
| The four together | **159 passed** |
| Full regression — `vitest run` | **127 files, 2,805 tests passed, 0 failed, 0 skipped** |
| Production build — `next build` | **exit 0**, `✓ Compiled successfully`, `ƒ Proxy (Middleware)` present |
| Secret scan over the 8 release files | **CLEAN** |

**No check failed, and nothing was changed to obtain these results.**

Two things worth stating rather than leaving to interpretation:

- **`prisma:error` and `Unique constraint failed` lines appear in the full-run output.** They
  are captured stderr from negative-path tests that deliberately provoke failures and assert
  the system reports them (`stage08-revision-recovery` and neighbours). The suite reports
  **0 failed**; these are expected diagnostics, not warnings about this release.
- **One failure occurred earlier in this workstream, in my own new test, and was a test
  defect**: `autoDeploy: false` in `render.yaml` carries a trailing comment that my first
  pattern did not allow for. The pattern was corrected to tolerate a comment while still
  requiring the value `false`. No assertion was weakened — reintroducing the
  `STAGING_NOINDEX: "true"` hazard still fails 4 tests, verified by mutation.

---

## 8. Deployment prerequisites

| # | Prerequisite | Owner action | Verified by |
|---|---|---|---|
| 1 | Previous deploy ID recorded | note it in Render → Deploys **before** deploying | the rollback step in §11 depends on it |
| 2 | Previous `NEXT_PUBLIC_SITE_URL` value recorded | copy it before editing | §11 step 2 |
| 3 | `NEXT_PUBLIC_SITE_URL` = `https://nfrguide.com` | dashboard | §5.3 step 5 + §10 steps 4–6 |
| 4 | `STAGING_NOINDEX` unset or `false` | dashboard | §10 steps 1–2 |
| 5 | Git change set reviewed | §3 manifest | owner review |
| 6 | **Full rebuild** planned (not a restart) | Manual Deploy | build log |
| 7 | Health checks defined | `/api/health/`, `/api/ready/` — both measured 200 locally | §10 step 8 |
| 8 | Rollback method identified | Render "Rollback to this deploy" + restore the env value | §11 |
| 9 | No destructive database operation | **confirmed: this release adds no migration and writes no data** | §3 |
| 10 | Backup / PITR status | **NOT VERIFIED — see below** | — |

**Backup status, stated accurately.** Step 02 observed Aiven reporting `archive_mode = on`
with a non-zero WAL archive count. That is an **indicator that WAL archiving is running — not
evidence that a restore has been tested, nor confirmation of a retention window or a
recoverable point-in-time position.** No backup was taken, listed or restored in any step of
this workstream. **Do not treat BKP-01 as satisfied.**

It does not block *this* release, because the release performs no migration and no data write,
so a rollback never needs a database restore. It remains a standing operational risk to close
separately, before any release that does touch data.

---

## 9. Exact owner action checklist

**Before deploying**

1. Review the §3 manifest. Confirm 8 code/test/config files + 7 docs, and nothing else.
2. Authorize the commit explicitly (nothing is committed; this audit did not commit).
3. Record the **current Render deploy ID** and the **current `NEXT_PUBLIC_SITE_URL`**.
4. Set `NEXT_PUBLIC_SITE_URL` = `https://nfrguide.com` (§5.3).
5. Confirm `STAGING_NOINDEX` is unset or `false` — **never `true`** (§5.3).
6. *(Recommended, read-only — safe to run on the production database; it only reads)*

   ```sql
   SELECT 'EntitySeo' AS src, "entityType"::text AS kind, "entityId" AS id, "canonicalOverride" AS url
   FROM "EntitySeo" WHERE "canonicalOverride" ILIKE '%onrender.com%'
   UNION ALL
   SELECT 'ArticleSeo', 'ARTICLE', "articleId"::text, "canonicalUrl"
   FROM "ArticleSeo" WHERE "canonicalUrl" ILIKE '%onrender.com%';
   ```

   Any rows returned should be re-pointed at `https://nfrguide.com` or cleared. Zero rows is
   the expected result (§6.2).
7. Confirm the Rodeo Coverage migrations are already applied (resolved earlier as DB-01).
8. **Manual Deploy → Deploy latest commit.** A rebuild, not a restart.

**After deploying** — run every command in §10, in order. Do not skip the staging-hostname
checks: verifying only the production domain would miss the exact regression IDX-02 exists to
prevent.

---

## 10. Post-deployment verification — PowerShell

Every command below was **executed in this PowerShell session against the real compiled
build** (on `127.0.0.1:10000` with `-H "Host: …"` standing in for DNS) to confirm the syntax
works. The production forms need no `Host` header because real DNS supplies it.

`curl.exe` ships with Windows 10 1803+ and behaves identically inside PowerShell;
`Select-String` is used rather than `findstr`.

```powershell
# [1] Production host must NOT carry a site-wide noindex.   EXPECT: no output
curl.exe -sI https://nfrguide.com/     | Select-String -Pattern 'x-robots-tag'
curl.exe -sI https://www.nfrguide.com/ | Select-String -Pattern 'x-robots-tag'

# [2] Render host MUST be protected.   EXPECT: x-robots-tag: noindex, nofollow
curl.exe -sI https://nfr-qadd.onrender.com/ | Select-String -Pattern 'x-robots-tag'

# [3] A published article stays indexable.   EXPECT: content="index, follow"
curl.exe -s https://nfrguide.com/articles/<slug>/ | Select-String -Pattern 'name="robots"'

# [4] Canonical must name the official origin.   EXPECT: href="https://nfrguide.com/about/"
curl.exe -s https://nfrguide.com/about/ | Select-String -Pattern 'rel="canonical"'

# [5] robots.txt must advertise the official sitemap.
#     EXPECT: Sitemap: https://nfrguide.com/sitemap.xml   (and Disallow: /admin/)
curl.exe -s https://nfrguide.com/robots.txt

# [6] No staging origin anywhere in the sitemap.   EXPECT: no output
curl.exe -s https://nfrguide.com/sitemap.xml | Select-String -Pattern 'onrender'

# [7] Admin stays protected.
#     EXPECT: HTTP/1.1 307 ... | x-robots-tag: noindex, nofollow | location: /admin/login/
curl.exe -sI https://nfrguide.com/admin/ | Select-String -Pattern '^HTTP|^x-robots-tag|^location'

# [8] Health and readiness.   EXPECT: health=200  ready=200
curl.exe -s -o NUL -w "health=%{http_code}`n" https://nfrguide.com/api/health/
curl.exe -s -o NUL -w "ready =%{http_code}`n" https://nfrguide.com/api/ready/

# [9] Legacy redirect behaviour.   EXPECT: 308 with a Location on this origin
curl.exe -sI https://nfrguide.com/nfr-competition | Select-String -Pattern '^HTTP|^location'

# [10] CACHE-KEY PROBE — the new check (§4.5). Staging FIRST, then production,
#      same path, inside the 300s s-maxage window.
#      EXPECT: the first line shows noindex, the second shows NOTHING.
#      If the second also shows noindex, the shared cache is not keyed on
#      hostname -> STOP and roll back (§11).
curl.exe -sI https://nfr-qadd.onrender.com/competition/ | Select-String -Pattern 'x-robots-tag'
curl.exe -sI https://nfrguide.com/competition/          | Select-String -Pattern 'x-robots-tag'

# [10b] Repeat [1] and [2] once more after waiting past the cache window,
#       to catch a stale shared-cache entry rather than a fresh response.
curl.exe -sI https://nfrguide.com/            | Select-String -Pattern 'x-robots-tag'
curl.exe -sI https://nfr-qadd.onrender.com/   | Select-String -Pattern 'x-robots-tag'
```

**[11] Builder Preview UAT — browser, cannot be scripted.** Sign in as an operator, open
`/admin/website/`, start the Builder canvas, confirm the page renders inside it, then use
"Exit draft preview" and confirm it returns to the editor **with no "localhost refused to
connect" error**. This is the only direct confirmation that BLD-01 is fixed in production.

**[12]** Check the deploy log for unexpected server errors — specifically no `P2037 too many
clients` and no Prisma connection-pool warning.

**No production behaviour has been verified.** Nothing above has been run against the live
site; these are the commands that will verify it, with their expected output stated so a
deviation is unmistakable.

---

## 11. Rollback plan

**Stop immediately and roll back if any of these is observed:**

| Observation | Why it is a stop condition |
|---|---|
| `https://nfrguide.com/` returns `X-Robots-Tag: noindex` in any form | the production site is telling crawlers to drop it — the worst outcome of this change |
| Production canonicals, `og:url` or sitemap `<loc>` name `onrender.com` | search engines are being pointed at a hostname this release deliberately noindexes |
| `robots.txt` on the production host advertises a staging sitemap | same |
| `https://nfr-qadd.onrender.com/` returns **no** `X-Robots-Tag` | the staging hostname is indexable — the IDX-02 defect, unfixed |
| **§10 step 10's second command shows `noindex`** | the shared cache is not keyed on hostname; production is being served staging responses |
| `/admin/` reachable without authentication, or missing its noindex | an access-control regression |
| 5xx responses, a failing health check, or `P2037` in the logs | the release is unhealthy regardless of SEO |

**Procedure**

1. **Render → the service → Deploys → the deploy ID from §9 step 3 → "Rollback to this
   deploy".** This restores the previous build *including its inlined origin*.
2. **If the origin value was the trigger, also restore the previous `NEXT_PUBLIC_SITE_URL`.**
   A code rollback does not revert an environment variable, and the new value against the old
   build is a third, untested combination.
3. Re-run §10 steps 1–6 against the rolled-back deploy.
4. **If production carried a global `noindex` at any point, record the window (UTC start and
   end).** Do not assume it is harmless or self-healing: removal from an index and return to
   it are separate processes with their own timelines, and the window is what a later
   diagnosis will need.
5. **No database rollback is involved** — this release adds no migration and writes no data.

---

## 12. Go / no-go verdict

# READY WITH EXPLICIT CONDITIONS

The code, configuration and tests are release-ready: 2,805 tests green, a clean typecheck, a
successful production build, and the required behaviour measured on the real compiled artifact
across eight hostnames — including under a forged forwarded header. No defect was found in
BLD-01, IDX-02 or the configuration correction, and nothing in this audit changed any of them.

It is **not** "fully ready", for one honest reason: **the two production values that decide
whether this release helps or harms cannot be read from the repository.** The live service was
created outside the Blueprint, so it does not inherit `render.yaml`, and both values are
dashboard-only.

### Conditions

| # | Condition | Unresolved | Why it matters | Who | Before deploy? | Verified by |
|---|---|---|---|---|---|---|
| C1 | `NEXT_PUBLIC_SITE_URL` = `https://nfrguide.com` | the live value was last measured as the Render origin | production pages would advertise canonicals and a sitemap on a hostname this release noindexes — the two changes would contradict each other | **owner** (dashboard) | **YES** | §10 steps 4–6 |
| C2 | `STAGING_NOINDEX` is not `true` | the live value is unknown | if `true`, this release de-indexes nfrguide.com | **owner** (dashboard) | **YES** | §10 steps 1–2 |
| C3 | Deploy is a **full rebuild**, not a restart | — | C1 is inlined at build time; a restart leaves the old origin in 47 prerendered pages, `robots.txt` and the sitemap | **owner** | **YES** | build log + §10 steps 4–6 |
| C4 | Previous deploy ID and env value recorded | — | without them a rollback is guesswork under pressure | **owner** | **YES** | §9 step 3 |
| C5 | Render forwards the public hostname in `Host` | inferred from standard reverse-proxy behaviour; never observed live | the entire hostname rule rests on it | — | no — verify immediately **after** | §10 steps 1–2 |
| C6 | Render's CDN cache key includes the hostname | unverified; public HTML is `s-maxage=300` | a host-agnostic cache could serve staging's `noindex` on nfrguide.com for 5 minutes | — | no — verify immediately **after** | §10 step 10 |
| C7 | No stored canonical override names `onrender.com` | production data unaudited | such rows stop being honoured after the origin flips | **owner** (read-only query) | recommended | §9 step 6 |

**C1–C4 are blocking. C5 and C6 are verify-immediately-after with rollback triggers. C7 is
recommended and non-destructive.**

### Not blocking this release

MED-01 (pre-existing, unaffected, and made diagnosable by this release), BKP-01 (no migration
and no data write, so rollback needs no restore — but **do not record it as verified**),
DISC-01/02, TAX-01/02, SEO-01, the deprecated `middleware` convention warning, and Media
Upload Step 03.

---

## 13. Remaining risks

| Risk | Severity | Status |
|---|---|---|
| Render `Host` forwarding unobserved | **high if wrong, immediately detectable** | C5; §10 steps 1–2 settle it within a minute |
| Shared-cache key may ignore the hostname | **high if wrong, immediately detectable** | C6; §10 step 10. New in this audit |
| Production configuration unknowable from the repository | **high** | C1–C2. The reason the verdict is conditional |
| Already-indexed staging URLs | medium | Unchanged and unmeasured. The header stops *future* indexing; it does **not** retroactively remove anything. **No claim is made that any search engine has removed, or will remove, previously indexed URLs** — that needs the header plus a re-crawl, or an explicit removal request in the relevant webmaster console |
| Config-level 308s carry no `X-Robots-Tag` | low | §4.4 — destinations are protected; accepted limitation |
| An emergency `STAGING_NOINDEX=true` is reset by a Blueprint sync | low | Deliberate trade-off, documented in `render.yaml` itself |
| Production canonical-override rows | low | C7, unaudited; degradation would be visible and non-destructive |
| BKP-01 backup / PITR | medium | **Unproven.** WAL archiving was observed; a restore was never tested. Not a gate for this release |
| MED-01 media upload | medium | Open, unaffected, diagnosable after deploy |
| `robots.txt` `Host:` directive includes a scheme | cosmetic | `Host:` is a Yandex extension expecting a bare hostname; Google ignores it. Pre-existing, unrelated to this release |
| A future second official domain | low | Would need adding to `PRODUCTION_HOSTNAMES` — deliberately a code change, so what is indexable stays reviewable in the repository |

---

## 14. Final repository state

| | |
|---|---|
| Branch / HEAD | `main` / `54fe6dd` — **unchanged**, ahead 0 / behind 0 of `origin/main` |
| Commits / pushes / branches / merges | **none** |
| `git add` / reset / clean / stash / checkout | **none executed** |
| Deployments / Render restarts | **none** |
| Live environment variables | **not read, not changed** |
| Production database | **not contacted** |
| Development / test databases | read-only query only (session forced `READ ONLY`); no write |
| R2 / media configuration | **unmodified** |
| Migrations | **none run**; none added |
| Dependencies / lockfiles | **unchanged** |
| Stashes | 0 |
| Working tree | 4 modified, 4 new code/test files, 7 docs — all prior work preserved |
| New file from this audit | `docs/PRODUCTION_STABILIZATION_FINAL_RELEASE_PREFLIGHT.md` |

A temporary local server was started twice on port 10000 to measure real HTTP responses and to
verify the §10 commands; both were stopped and the port confirmed clear.

**Media Upload Step 03 has not been started. This was an audit only.**
