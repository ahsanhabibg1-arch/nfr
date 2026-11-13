# Production Stabilization — IDX-02 Release Preparation & Configuration Safety Gate

**Status: COMPLETE — configuration hazard closed, release prerequisites established, nothing released.**

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `54fe6dd` (unchanged) · **Priority:** P0
No commit, no push, no branch change, no deployment, no Render restart, no live environment
change, no migration, no database write, no R2 change. Step 03 not started.

---

## 1. Executive summary

IDX-02 was not re-implemented. It was re-verified (§5) and left alone: no defect was found in
it. This step closed the configuration hazards around it, and one of them turned out to be
materially worse than the previous report described.

**Three outcomes:**

1. **The `render.yaml` hazard is closed.** The Blueprint declared `STAGING_NOINDEX: "true"`,
   which on this shared service means "noindex every hostname, production included". It is now
   declared explicitly as `"false"`, with 20 new deployment-configuration tests pinning it —
   including one that feeds the Blueprint's own declared value to the real middleware and
   fails if nfrguide.com would come back noindexed.

2. **A build-time finding that changes the release procedure.** `NEXT_PUBLIC_SITE_URL` is
   **inlined into the build**, not read at runtime. The compiled chunk contains
   `let f="http://localhost:3000".replace(/\/$/,"")` — the `process.env` read is gone
   entirely. 47 prerendered pages, `robots.txt` and every sitemap `<loc>` carry the baked
   origin. **Setting this variable in the Render dashboard and restarting does nothing. A full
   rebuild is mandatory.** This corrects my own IDX-02 §9 checklist, which implied an
   environment change plus a deploy without stating that a restart is insufficient (§5.3).

3. **No canonical code defect exists**, so no canonical code was changed. The fix is the
   owner-side environment value, and the release procedure now reflects what that value
   actually requires.

**The release is blocked on two owner-side values**, both in §8: `NEXT_PUBLIC_SITE_URL` and
`STAGING_NOINDEX`. Nothing in the repository can substitute for either.

---

## 2. Files inspected

| File | Why |
|---|---|
| `docs/PRODUCTION_STABILIZATION_STEP_01_BUILDER_PREVIEW.md` | prior work to preserve |
| `docs/PRODUCTION_STABILIZATION_STEP_02_RELEASE_READINESS.md` | prior release findings |
| `docs/PRODUCTION_STABILIZATION_IDX_01_REPORT.md` | the superseded `STAGING_NOINDEX` advice |
| `docs/PRODUCTION_STABILIZATION_IDX_02_HOSTNAME_SEO.md` | the behaviour being released |
| `render.yaml` | the Blueprint hazard |
| `apps/web/middleware.ts` | the hostname rule |
| `apps/web/lib/seo/productionHosts.ts` | the allow-list and `Host` parser |
| `apps/web/lib/seo.tsx`, `lib/seo/canonical.ts` | `SITE_URL` / `PRODUCTION_SITE_URL` derivation |
| `apps/web/app/robots.ts`, `app/sitemap.ts`, `app/layout.tsx` | the three SEO surfaces that consume `SITE_URL` |
| `apps/web/lib/env.ts` | the environment guard's rules for the origin |
| `apps/web/lib/seo/sitemapEntries.ts`, `lib/seo/articleMeta.ts`, `lib/cms/entitySeoService.ts`, `lib/seo-intel/*` | the remaining `SITE_URL` consumers |
| `apps/web/lib/cms/scheduledPublishRunner.ts`, `lib/cms/mediaService.ts` | origin-independence of internal routing and media |
| `.next/server/**` (built artifacts) | build-time inlining evidence |
| `.nvmrc`, `.github/workflows/ci.yml` | runtime pinning cross-check |
| `apps/web/tests/seo-robots.test.ts`, `tests/idx02-hostname-seo.test.ts`, `tests/builder-preview-redirect.test.ts`, `tests/batch13-infra.test.ts` | existing coverage |

**Baseline verified before any change:** branch `main`, HEAD `54fe6dd`, 0 stashes, and the
Step 01 + IDX-02 working-tree changes present and intact.

---

## 3. Exact changes made

| File | Change |
|---|---|
| `render.yaml` | **modified** — `STAGING_NOINDEX` value `"true"` → `"false"` with an explanatory block; a comment-only addition on `NEXT_PUBLIC_SITE_URL` recording the build-time inlining |
| `apps/web/tests/deploy-config.test.ts` | **new**, 20 tests — deployment configuration safety |

**No application code was changed in this step.** `middleware.ts`,
`lib/seo/productionHosts.ts`, `lib/seo.tsx`, `lib/seo/canonical.ts`, `app/robots.ts`,
`app/sitemap.ts` and the Step 01 preview route are all byte-identical to how IDX-02 left
them. No unrelated environment variable, service definition, secret or infrastructure setting
was touched.

---

## 4. The `render.yaml` correction

**Before:**

```yaml
      # --- staging SEO protection (Batch 29) ---
      - key: STAGING_NOINDEX
        value: "true"              # X-Robots-Tag: noindex on all HTML responses; prevents indexing
```

**After:** `value: "false"`, preceded by a block stating that it must not be `true` on this
service, that the hostname rule now provides staging protection with no configuration, and
that an emergency site-wide noindex must be changed here *and* in the dashboard together.

### Why disabled-and-declared rather than deleted

The brief allowed either. Declaring it explicitly is the stronger of the two:

| | Delete the key | Declare `"false"` *(chosen)* |
|---|---|---|
| A Blueprint sync can enable noindex | no | no |
| A Blueprint sync **actively asserts** the safe value | no — whatever a dashboard edit left behind survives | **yes** |
| A future engineer reading the file learns the hazard | no — nothing to read | **yes** |
| An emergency dashboard `true` survives a later sync | yes | **no — it gets reset** |

**The trade-off is real and is written into the file**, not hidden: the last row is the cost
of the third. Because the kill switch is now an emergency-only control rather than the normal
staging mechanism, making the safe state self-asserting is worth more than making a rare
manual override sticky.

The middleware's site-wide kill switch is **unchanged** — same strict `=== 'true'` comparison,
still able to noindex every hostname when deliberately set.

### Regression checks added

`apps/web/tests/deploy-config.test.ts` — 20 tests:

- `STAGING_NOINDEX` is declared and is **not** `"true"`; no `NOINDEX`-shaped key is enabled;
  the raw file contains no enabled form of it outside comments.
- **The end-to-end one:** the value the Blueprint actually declares is stubbed into the
  environment, the **real middleware** is imported, and `nfrguide.com` / `www.nfrguide.com`
  must come back with no `X-Robots-Tag` while `nfr-qadd.onrender.com` must come back
  `noindex, nofollow`. This cannot drift from the middleware, because it *is* the middleware.
- `NEXT_PUBLIC_SITE_URL` is `sync: false` with no origin hardcoded in the repository, and no
  entry anywhere declares an `onrender.com` value.
- Seven secret keys are `sync: false` with no literal value; no entry looks like a connection
  string or a long credential.
- `NODE_VERSION` matches `.nvmrc` (22.23.4), `rootDir` is `apps/web` (the first deploy
  failure), `MEDIA_STORAGE_PROVIDER` is `r2` (the ephemeral-filesystem rule), `autoDeploy` is
  `false`.
- A guard on the parser itself, so a silently-empty parse can never pass as "no problems
  found".

**Mutation check.** `render.yaml` was reverted to `value: "true"` and the suite re-run:
**4 tests failed**, including the end-to-end middleware one, which reports
`render.yaml declares STAGING_NOINDEX="true", which would noindex the production site`. The
file was restored and re-verified at 20/20.

---

## 5. Canonical URL investigation

### 5.1 How the origin is derived and consumed

```
PRODUCTION_SITE_URL = 'https://nfrguide.com'          lib/seo/canonical.ts:29   (constant, never env)
SITE_URL            = NEXT_PUBLIC_SITE_URL || PRODUCTION_SITE_URL
                                                      lib/seo.tsx:18
```

Every consumer of `SITE_URL`, traced exhaustively:

| Consumer | Surface |
|---|---|
| `app/layout.tsx:6` | `metadataBase` — resolves canonical and OG URLs |
| `app/robots.ts:9-10` | `Sitemap:` and `Host:` lines |
| `lib/seo/sitemapEntries.ts` | every sitemap `<loc>` |
| `lib/seo.tsx:48-50` | absolute OG image URLs |
| `lib/seo/articleMeta.ts` | article canonical / OG |
| `app/(public)/rodeo-events/[slug]/[edition]/page.tsx:71` | JSON-LD `url` |
| `lib/cms/entitySeoService.ts:30,46` | same-site validation of editor canonical overrides |
| `lib/seo-intel/*` | the SEO audit engine's own view of "this site" |

**`SITE_URL` reaches nothing else.** Authentication, media, the Builder preview and internal
API routing are all independent of it, verified individually:

| Subsystem | Origin source | Affected by changing `NEXT_PUBLIC_SITE_URL`? |
|---|---|---|
| Builder preview redirects | relative `Location` (Step 01) | **no** — origin-independent by construction |
| Internal revalidation | `http://localhost:${port}` (`scheduledPublishRunner.ts:19`) | **no** |
| Media URLs | storage adapter `publicUrl()`, driven by `MEDIA_S3_*` | **no** |
| Authentication | no `SITE_URL` consumer found | **no** |
| Environment guard | `lib/env.ts:70-71` — requires `https://` in production | satisfied by `https://nfrguide.com` |

### 5.2 Are the values embedded at build time? **Yes — decisively.**

This is the finding that changes the release procedure. Evidence from the local build
(`.env` has `NEXT_PUBLIC_SITE_URL="http://localhost:3000"`):

| Evidence | Result |
|---|---|
| Compiled SSR chunk for `lib/seo.tsx` | `let f="http://localhost:3000".replace(/\/$/,"")` — **the `process.env` read is gone**, replaced by the literal |
| Prerendered pages carrying a baked canonical | **47** (`rel="canonical" href="http://localhost:3000/..."`) |
| `.next/server/app/robots.txt.body` | `Host: http://localhost:3000` / `Sitemap: http://localhost:3000/sitemap.xml` |
| `.next/server/app/sitemap.xml.body` | `<loc>http://localhost:3000/...</loc>` |

**Consequence:** changing `NEXT_PUBLIC_SITE_URL` in the dashboard and letting Render restart
the service leaves every one of those artifacts naming the old origin. **A rebuild — a manual
deploy, since `autoDeploy: false` — is mandatory.**

**Contrast with `STAGING_NOINDEX`, re-verified in the new build:** the edge chunk still
contains a genuine `process.env.STAGING_NOINDEX` lookup, so for *that* variable a restart
remains sufficient, exactly as IDX-01 §2a stated. The two variables behave differently, and
the difference is not cosmetic.

**Correction to my own IDX-02 report.** IDX-02 §8–§9 told the owner to set
`NEXT_PUBLIC_SITE_URL` and then deploy. The ordering was right, but it never said that a
restart would silently fail to take effect — and an owner who changed the value, saw the
service restart, and checked `/robots.txt` would have seen the old origin and had no
explanation. §8 of this report states the requirement explicitly.

### 5.3 Conflicts between configuration sources

| Source | Value | Conflict? |
|---|---|---|
| `render.yaml` | `sync: false` — no value in the repository | none |
| Render dashboard (live) | `https://nfr-qadd.onrender.com` (measured in IDX-01 §4) | **this is the value to change** |
| Application default | `PRODUCTION_SITE_URL` = `https://nfrguide.com`, used only when the variable is unset | none — the fallback is already correct |
| `.github/workflows/ci.yml` | `http://localhost:3000` | none — CI only |

Worth noting: if `NEXT_PUBLIC_SITE_URL` were simply **unset** on the service, `SITE_URL` would
fall back to `https://nfrguide.com` — the correct production value. Setting it explicitly is
still preferred, because `lib/env.ts:35` requires it to be a valid URL and an explicit value
is what the environment guard and the startup log report.

### 5.4 Canonical stability across both hostnames

**Stable, by construction.** `SITE_URL` is a module constant inlined at build time; it does
not read the request. The same page served on `nfrguide.com` and on the Render hostname emits
**the identical canonical**. Request-host-dependent canonicals were not implemented and must
not be — that is what IDX-02 §8 argued and this step confirms.

`sameSiteHosts()` (`canonical.ts:47-53`) always treats **both** `SITE_URL` and
`PRODUCTION_SITE_URL` as "this site", so stored canonicals naming `nfrguide.com` remain valid
in every environment.

**One consequence to check before release.** After the origin flips, any *stored* editor
canonical override naming the `onrender.com` host becomes off-site and will be ignored (the
page falls back to self-canonical, and the SEO audit engine reports it rather than silently
dropping it). **I did not query the database for such rows** — no production database was
contacted in this step. The read-only check is in §8, step 5.

### 5.5 Verdict

**No code defect proven, so no code was changed.** The required correction is entirely
owner-side configuration, plus the rebuild requirement that §5.2 established.

---

## 6. Environment configuration matrix

For the shared Render service that will answer on both hostnames:

| Variable | In `render.yaml` | Read at | Required value | Changing it requires |
|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `sync: false` | **build time (inlined)** | `https://nfrguide.com` | **full rebuild / manual deploy** |
| `STAGING_NOINDEX` | `value: "false"` | runtime (module init) | unset or `false` — **never `true`** | restart only |
| `DATABASE_URL` | `sync: false` | runtime | the managed cloud database; pool bound (`connection_limit`) | restart |
| `NODE_VERSION` | `22.23.4` | build | match `.nvmrc` | rebuild |
| `NODE_ENV` / `APP_ENV` | `production` | both | unchanged | rebuild / restart |
| `MEDIA_STORAGE_PROVIDER` | `r2` | runtime | `r2` — never `local` (ephemeral filesystem) | restart |
| `MEDIA_S3_*` (5 keys) | `sync: false` | runtime | bucket-scoped R2 token with **write** permission (MED-01 is still open) | restart |
| `INTERNAL_REVALIDATE_SECRET` | `sync: false` | runtime | any long random value; fails closed if absent | restart |
| `LOG_LEVEL`, `APP_VERSION`, `APP_COMMIT` | declared | runtime | unchanged | restart |

---

## 7. Regression test results

All on **Node 22.23.4** (the version `render.yaml` and `.nvmrc` pin).

| Check | Command | Result |
|---|---|---|
| TypeScript | `tsc --noEmit` | **exit 0** |
| Deployment config (new) | `vitest run tests/deploy-config.test.ts` | **20 passed** |
| IDX-02 hostname SEO | `vitest run tests/idx02-hostname-seo.test.ts` | **76 passed** |
| Existing SEO | `vitest run tests/seo-robots.test.ts` | **41 passed** |
| Step 01 Builder Preview | `vitest run tests/builder-preview-redirect.test.ts` | **22 passed** |
| Four focused suites together | — | **159 passed** |
| Full regression | `vitest run` | **127 files, 2,805 tests passed, 0 failed, 0 skipped** |
| Production build | `next build` | **exit 0**, `✓ Compiled successfully`, `ƒ Proxy (Middleware)` present |
| Secret scan | changed + untracked files | **no literal credential, connection string or long token found**; no `.env` file added or modified |

Previous baseline was 127 tests short of this: 126 files / 2,785 tests. The 20 new
deployment-configuration tests account for the whole difference, and **no previously passing
test changed state**.

**One failure occurred during this step, in my own new test, and was a test defect — not a
configuration problem.** `autoDeploy: false` in `render.yaml` carries a trailing comment, and
my first pattern (`/^\s*autoDeploy:\s*false\s*$/m`) did not allow for one. The pattern was
corrected to tolerate a trailing comment. **No assertion was weakened to obtain a pass**: the
corrected pattern still requires the value to be `false`, and the mutation check in §4 proves
the file's guards fail when the hazard is reintroduced.

---

## 8. Production release checklist — before deployment

Execute in order. Steps 1–4 are the release-blocking ones.

1. **Review the working tree.** Eight files are in scope (§12). Confirm no `.env` file and no
   generated artifact is included. Re-run the secret scan.

2. **Set `NEXT_PUBLIC_SITE_URL` = `https://nfrguide.com`** in the Render dashboard.
   *Not* the onrender.com hostname. The environment guard rejects a non-`https` value in
   production.

3. **Confirm `STAGING_NOINDEX` is unset, or set to `false`** on the service. **It must not be
   `true`** — on this service that de-indexes nfrguide.com (§4). The Blueprint now declares
   `false`, but a service created outside the Blueprint does not inherit it, so the dashboard
   must be checked directly.

4. **Trigger a manual deploy — a full rebuild.** A restart is *not* sufficient: step 2's value
   is inlined at build time (§5.2). `autoDeploy: false`, so this is an explicit action.
   Verify the build log shows `✓ Compiled successfully` and the startup log line reports
   `NEXT_PUBLIC_SITE_URL: https://nfrguide.com`.

5. **Read-only database check for stale canonical overrides** (optional but recommended; not
   run in this step):

   ```sql
   SELECT "entityType", "entityId", "canonicalOverride"
   FROM "EntitySeo"
   WHERE "canonicalOverride" ILIKE '%onrender.com%';
   ```

   Any rows returned will stop being honoured once the origin flips (§5.4) and should be
   re-pointed at `https://nfrguide.com` or cleared.

6. **Confirm the database migration state** is current for `54fe6dd` plus these changes — this
   release adds no migration, but the two migrations from the Rodeo Coverage work must already
   be applied (DB-01, resolved earlier in this workstream).

7. **Rollback prerequisites, confirmed before deploying, not after:**
   - Note the **current deploy ID** in Render so "Rollback to this deploy" is one click away.
   - Note the **current value** of `NEXT_PUBLIC_SITE_URL` so it can be restored.
   - Confirm a database backup/restore position exists (BKP-01 — still unresolved; see §11).
   - Confirm there is no in-flight scheduled publish depending on the instance staying awake.

---

## 9. Post-deployment verification

Run every command. Expected results are stated; anything else means stop (§10).

```bat
REM 1. The production hostname must NOT carry a site-wide noindex.
curl -sI https://nfrguide.com/            | findstr /I "x-robots-tag"   REM expect: NO OUTPUT
curl -sI https://www.nfrguide.com/        | findstr /I "x-robots-tag"   REM expect: NO OUTPUT

REM 2. The Render hostname MUST be protected.
curl -sI https://nfr-qadd.onrender.com/   | findstr /I "x-robots-tag"   REM expect: noindex, nofollow

REM 3. Canonicals must name the official origin.
curl -s  https://nfrguide.com/about/      | findstr /I "canonical"      REM expect: https://nfrguide.com/about/

REM 4. robots.txt must advertise the official sitemap.
curl -s  https://nfrguide.com/robots.txt                                REM expect: Sitemap: https://nfrguide.com/sitemap.xml

REM 5. Sitemap <loc> URLs must name the official origin.
curl -s  https://nfrguide.com/sitemap.xml | findstr /I "onrender"       REM expect: NO OUTPUT

REM 6. Restricted pages stay protected.
curl -s  https://nfrguide.com/register/   | findstr /I "robots"         REM expect: noindex, nofollow (page-level)
curl -sI https://nfrguide.com/admin/      | findstr /I "x-robots-tag"   REM expect: noindex, nofollow
curl -sI https://nfrguide.com/admin/                                    REM expect: 307 to the login route

REM 7. Health endpoints.
curl -sI https://nfrguide.com/api/health/                               REM expect: 200
curl -sI https://nfrguide.com/api/ready/                                REM expect: 200 (404 => route not present; record, do not treat as failure)

REM 8. Builder preview (signed in as an operator, in the browser):
REM    open /admin/website/, start the canvas, confirm it renders and that
REM    "Exit draft preview" returns to the editor with NO localhost error.
```

Also confirm the deploy log shows no unexpected server errors, and specifically no
`P2037 too many clients` and no Prisma connection-pool warning.

**Both hostnames must be checked.** Checking only the production domain would miss a
regression where the Render hostname became indexable, which is the defect IDX-02 exists to
prevent.

---

## 10. Rollback and stop conditions

**Stop immediately and roll back if any of these is observed:**

| Observation | Why it is a stop condition |
|---|---|
| `https://nfrguide.com/` returns `X-Robots-Tag: noindex` *(any form)* | the production site is telling crawlers to drop it — the single worst outcome of this change |
| Production canonicals or sitemap `<loc>` name `onrender.com` | search engines are being pointed at a hostname that is deliberately noindexed |
| `robots.txt` on the production host advertises a staging sitemap | same |
| `https://nfr-qadd.onrender.com/` returns **no** `X-Robots-Tag` | the staging hostname is indexable — the original IDX-02 defect, unfixed |
| `/admin/` is reachable without authentication, or lacks its noindex | an access-control regression, not an SEO one |
| 5xx responses, failed health check, or `P2037` in the logs | the release is not healthy regardless of SEO |

**Rollback procedure:**

1. **Render → the service → Deploys → the deploy ID noted in §8.7 → "Rollback to this
   deploy".** This restores the previous build, including its inlined origin.
2. If the trigger was the origin value, **also restore the previous
   `NEXT_PUBLIC_SITE_URL`** — a rollback of code does not change an environment variable, and
   leaving the new value with the old build produces a third, untested combination.
3. Re-run §9 steps 1–5 against the rolled-back deploy.
4. **If production was served with a global noindex at any point**, record the window
   (start and end, in UTC). Do not assume it is harmless and do not assume it self-heals:
   removal from an index and return to it are separate processes with their own timelines.

**No database rollback is part of this release** — it adds no migration and writes no data.

---

## 11. Remaining risks

| Risk | Status |
|---|---|
| **Render's `Host` forwarding is still inferred** | The hostname rule assumes the platform forwards the visitor's hostname in `Host`. That is standard reverse-proxy behaviour and consistent with Render routing by hostname, but it has **not** been observed on the live service. §9 steps 1–2 are what convert it to fact. This is the one failure mode of the design. |
| **Production remains unverified** | Nothing is deployed. No claim is made about live behaviour, and none should be made until §9 has actually been run. |
| **Already-indexed staging URLs** | Unchanged and unmeasured. The header stops *future* indexing; it does **not** retroactively remove anything already indexed. **No claim is made that any search engine has removed, or will remove, previously indexed URLs.** Removal needs the header plus a re-crawl, or an explicit removal request in the relevant webmaster console. |
| **An emergency `STAGING_NOINDEX=true` can be reset by a Blueprint sync** | The deliberate trade-off of §4, documented in `render.yaml` itself. |
| **Stored canonical overrides naming the Render host** | Unqueried — no production database was contacted. §8 step 5 has the read-only check. |
| **MED-01 (media upload failure)** | Still open and unaffected by this step. The likely cause remains a read-only R2 token; the improved error reporting from `c03e233` makes it diagnosable once deployed. |
| **BKP-01 (backup/restore position)** | Still unproven. §8 step 7 asks for confirmation rather than assuming it. |
| **A second official domain later** | Would need adding to `PRODUCTION_HOSTNAMES` — deliberately a code change, so what is indexable stays reviewable in the repository. |
| Not addressed, by scope | DISC-01/02, TAX-01/02, SEO-01, the deprecated `middleware` convention warning, Media Upload Step 03, Stage 10. |

---

## 12. Final Git working-tree status

```
 M apps/web/app/admin/(dashboard)/website/preview/route.ts   Step 01 (BLD-01)
 M apps/web/middleware.ts                                    IDX-02
 M apps/web/tests/seo-robots.test.ts                         IDX-02
 M render.yaml                                               THIS STEP
?? apps/web/lib/seo/productionHosts.ts                       IDX-02
?? apps/web/tests/builder-preview-redirect.test.ts           Step 01
?? apps/web/tests/idx02-hostname-seo.test.ts                 IDX-02
?? apps/web/tests/deploy-config.test.ts                      THIS STEP
?? docs/… (6 reports, including this one)
```

| | |
|---|---|
| Branch / HEAD | `main` / `54fe6dd` — **unchanged**, level with `origin/main` |
| Commits / pushes / branches / deployments | **none** |
| Live Render environment variables | **unmodified** |
| Databases | development and test schemas untouched; **no production database contacted** |
| R2 / media configuration | **unmodified** |
| Stashes | 0 · no reset, clean, stash, merge or branch switch |
| Prior work | Step 01, IDX-02 and all five earlier reports preserved intact |

**Media Upload Step 03 has not been started. Nothing has been committed, pushed or deployed.**
