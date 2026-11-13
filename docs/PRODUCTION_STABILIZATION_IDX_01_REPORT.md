# Production Stabilization — IDX-01: Staging Indexing Protection

**Status: PARTIAL — ROOT CAUSE ESTABLISHED, CONFIGURATION CHANGE NOT APPLIED (no Render dashboard access).**

**Date:** 2026-11-12 · **Branch:** `main` · **HEAD:** `54fe6dd` · **Issue:** IDX-01 (P0)
**Type:** investigation + local verification. No application code changed, no configuration
changed, no commit, no push, no deployment. Live checks were read-only `GET` requests.

---

## 1. Summary

The code is **correct**. `X-Robots-Tag` is missing from the deployed staging site because
`STAGING_NOINDEX` is not reaching the running service with the exact value `true`.

I set out to prove a specific code defect — that the module-scope `process.env` read is
inlined into the edge bundle at build time, which would have meant the variable could never
work without a rebuild. **I tested that hypothesis and it is wrong.** The compiled bundle
performs a genuine runtime read. The remaining explanation is configuration, and the fix
needs no code change.

One correction to my own Step 02 report is also recorded in §7: I overstated the privacy
exposure there.

---

## 2. Confirmed root cause

**Configuration, not code.** `STAGING_NOINDEX` is absent from the running Render service's
environment, or set to something other than the exact string `true`.

Three independent pieces of evidence:

### (a) The condition is a runtime read, not a build-time constant

`middleware.ts:12` reads the variable at module scope:

```ts
const STAGING_NOINDEX = process.env.STAGING_NOINDEX === 'true';
```

Edge bundles often have `process.env.X` statically replaced at build time, which would make
the variable unusable without a rebuild. **That is not what happened here.** The compiled
edge chunk still contains the lookup:

```js
process.env.STAGING_NOINDEX;  …  return r$ && t.headers.set("X-Robots-Tag","noindex, nofollow"), t
```

The build manifest's baked-in `env` block lists only Next's own internal keys
(`__NEXT_BUILD_ID`, the preview-mode keys, the server-actions key) — **`STAGING_NOINDEX` is
not among them**, confirming it was not inlined.

**Operational consequence:** the value is read once when the middleware module initialises,
so it takes effect from the next process start. A Render environment change restarts the
service, so setting the variable is sufficient; a rebuild is not required.

### (b) The same build emits the header when the variable is present

Using the **existing local build artifacts** — no rebuild, no code change — and starting the
server with `STAGING_NOINDEX=true`:

| Route | Status | `X-Robots-Tag` |
|---|---|---|
| `/` | 200 | **noindex, nofollow** |
| `/about/` | 200 | **noindex, nofollow** |
| `/register/` | 200 | **noindex, nofollow** |
| `/robots.txt` | 200 | **noindex, nofollow** |
| `/sitemap.xml` | 200 | **noindex, nofollow** |
| `/api/health/` | 200 | *(absent — correct; the matcher excludes `api/` by design)* |

This isolates the fault to the deployed environment: identical code, identical build, one
environment variable, opposite result.

### (c) The deployed service emits nothing

Live, same moment (§4): the header is absent on all five routes.

### What I could not determine

**Whether the variable is missing, misspelled, or set to a different value.** That requires
reading the Render service's environment, and **no Render dashboard access is available to
me**. The comparison is strict (`=== 'true'`), so `True`, `TRUE`, `1`, `yes` or a trailing
space would all produce exactly the observed behaviour.

`render.yaml` does declare it (`key: STAGING_NOINDEX`, `value: "true"`), so a service created
from the Blueprint would have it. A service created or edited outside the Blueprint would
not inherit it — which is the most likely history here, given the service was first created
manually during this workstream.

---

## 3. Configuration findings

| Item | Finding |
|---|---|
| `middleware.ts` condition | `process.env.STAGING_NOINDEX === 'true'` — strict, case-sensitive |
| Matcher | `/((?!_next/static|_next/image|favicon\.ico|api/).*)` — deliberately excludes `api/`, so API routes never carry the header |
| `proxy.ts` (Next 16 convention) | not present; `middleware.ts` is in use and **is** deployed (build output lists `ƒ Proxy (Middleware)`) |
| Declared in `render.yaml` | yes, `value: "true"` (non-secret) |
| Other readers of the variable | none in application code; two unit tests in `tests/seo-robots.test.ts` cover set/unset |
| Effective value in the running service | **not `true`** — inferred from behaviour; the actual value was not readable |

No secret value was read or printed. `STAGING_NOINDEX` is itself non-secret.

---

## 4. Live HTTP evidence

`https://nfr-qadd.onrender.com`, read-only `GET`, 2026-11-12:

| Route | Status | `X-Robots-Tag` | In-page `<meta name="robots">` |
|---|---|---|---|
| `/` | 200 | **ABSENT** | **`index, follow`** |
| `/about/` | 200 | **ABSENT** | `noindex, nofollow` |
| `/register/` | 200 | **ABSENT** | `noindex, nofollow` |
| `/robots.txt` | 200 | **ABSENT** | — |
| `/sitemap.xml` | 200 | **ABSENT** | — |

Supporting checks:

- `robots.txt` serves `User-Agent: *`, `Allow: /`, `Disallow: /admin/`, and advertises
  `Sitemap: https://nfr-qadd.onrender.com/sitemap.xml`.
- The sitemap advertises **39 URLs**.
- `/admin/` → **307** to login: authentication and route gating are unaffected.
- No unpublished content was observed to be accessible; page-level `noindex` on pending legal
  pages and on `/register/` is intact and behaving as designed.

### What is actually exposed

The exposure is **real but narrower than I stated in Step 02**. Pages that carry their own
page-level `noindex` — the seven pending legal pages and the reader auth pages — are still
protected by that metadata. What is indexable is the **editorial content**: the homepage
(`index, follow`) and the 39 URLs the sitemap advertises (sections, articles, disciplines,
competitors, venues).

The risk is therefore that a **staging deployment's content gets indexed and competes with,
or duplicates, the eventual production site** — not that private pages leak into search.

---

## 5. Changes applied

**None.** No configuration change was made, because:

1. I have no Render dashboard access, and
2. the brief authorises the change only "if configuration correction is authorized" — which
   is an owner action on infrastructure, consistent with every earlier step in this workstream.

No application code was modified: the investigation established a configuration fault, not a
code defect, and the brief permits code changes only in the latter case.

---

## 6. Exact correction, for the owner

1. In the **Render dashboard → the staging service → Environment**, set
   **`STAGING_NOINDEX`** to exactly **`true`** (lowercase, no quotes, no trailing space).
   Apply it to the **staging service only**.
2. Save. Render restarts the service; the middleware re-reads the value on module init, so
   **no rebuild or redeploy is required** (§2a).
3. Verify with one read-only check per route — the header must be present on HTML routes and
   absent on `/api/…`:

   ```
   curl -sI https://nfr-qadd.onrender.com/          | findstr /I "x-robots-tag"
   curl -sI https://nfr-qadd.onrender.com/about/    | findstr /I "x-robots-tag"
   curl -sI https://nfr-qadd.onrender.com/register/ | findstr /I "x-robots-tag"
   curl -sI https://nfr-qadd.onrender.com/robots.txt   | findstr /I "x-robots-tag"
   curl -sI https://nfr-qadd.onrender.com/sitemap.xml  | findstr /I "x-robots-tag"
   ```

   Expected: `x-robots-tag: noindex, nofollow` on all five.
4. **Do not set this variable on a production service.** It is a staging-only control; the
   production origin must stay indexable. No production domain is configured today, so there
   is nothing currently at risk — but the setting must not be copied into one later.

---

## 7. Correction to the Step 02 report

Step 02 §1 and §8 stated that the missing header left "the contradictory pages crawlable",
tying IDX-01 to the OD-2 privacy finding. **That overstated it.** Measured here,
`/register/` and `/privacy/`-class pages carry their own page-level `noindex, nofollow`, so
the specific privacy contradiction is **not** exposed to crawlers. The accurate statement is
the one in §4 above: the site's **editorial content** is indexable, and the header is the
missing site-wide backstop rather than the only control.

Step 02's core finding — that the header is absent and the declared protection is not in
effect — stands unchanged.

---

## 8. Remaining risks

| Risk | Status |
|---|---|
| Exact deployed value of `STAGING_NOINDEX` | **Unverified** — no dashboard access. Missing, misspelled and mis-valued are indistinguishable from outside |
| URLs already crawled or indexed | **Unknown and unmeasured.** Adding the header stops future indexing; it does **not** retroactively remove anything already in an index. **No claim is made that any search engine has removed, or will remove, previously indexed URLs.** Removal would need the header plus a re-crawl, or an explicit removal request in the relevant webmaster console |
| `robots.txt` still serves `Allow: /` and advertises the sitemap | By design — the header is the intended staging control. Worth revisiting only if the owner wants belt-and-braces (a staging-only `Disallow: /` would also stop the crawler from seeing the `noindex`, which is why the header is the better primary control) |
| Recurrence | Any service rebuilt outside the Blueprint can lose the variable again. Creating the service from `render.yaml`, or adding a post-deploy header check, would prevent silent regression |
| Production domain | None configured; no production origin was touched or noindexed |

---

## 9. Final status and repository state

**PARTIAL — root cause established and proven; the configuration change is the owner's to
apply.** It is not COMPLETE because the corrective setting has not been made and therefore
not verified against the live service.

| | |
|---|---|
| Branch / HEAD | `main` / `54fe6dd` — unchanged |
| Application code | **unmodified** (no code defect found) |
| Configuration | **unmodified** — no Render access |
| Commits / pushes / deployments | **none** |
| Databases | not contacted in this step |
| Step 01 work | untouched and intact |
| New file | `docs/PRODUCTION_STABILIZATION_IDX_01_REPORT.md` (this report) |

**Step 03 has not been started.**
