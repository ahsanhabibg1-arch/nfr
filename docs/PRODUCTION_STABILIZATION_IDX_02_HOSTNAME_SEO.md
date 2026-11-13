# Production Stabilization — IDX-02: Hostname-Aware SEO Protection

**Status: COMPLETE — implemented and verified locally.**
**Not deployed. The live site still runs `abc0da5`, so no claim is made about production behaviour.**

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `54fe6dd` (unchanged) · **Issue:** IDX-02 (P0)
No commit, no push, no deployment, no environment change, no database contact.

---

## 1. Summary

`nfrguide.com` and `nfr-qadd.onrender.com` now resolve to the **same Render service**. One
process therefore serves both the public site and a staging URL, and the previous control —
a single `STAGING_NOINDEX` environment variable — can no longer express the requirement:

| `STAGING_NOINDEX` on the shared service | Result |
|---|---|
| `true` | **de-indexes nfrguide.com** — the real site disappears from search |
| unset | the Render hostname is indexed as a duplicate of the real site |

Neither is acceptable, so the decision had to move from deployment configuration to the
request itself. The middleware now sets `X-Robots-Tag: noindex, nofollow` on every response
that did **not** arrive on an official production hostname. No new environment variable was
introduced, and the protection works with no configuration at all.

**This reverses the central recommendation of the IDX-01 report. See §7 — it matters.**

---

## 2. Changed files

| File | Change |
|---|---|
| `apps/web/lib/seo/productionHosts.ts` | **new**, 108 lines — the hostname allow-list and the `Host`-header parser |
| `apps/web/middleware.ts` | **modified**, +68 / −12 — the noindex decision is now per request |
| `apps/web/tests/idx02-hostname-seo.test.ts` | **new**, 358 lines — 76 regression tests |
| `apps/web/tests/seo-robots.test.ts` | **modified**, +20 / −6 — two existing cases updated to the changed contract (§6) |

Nothing else was touched: no schema, no migration, no database, no deployment configuration,
no environment variable, no canonical logic, no page metadata, no `robots.ts`, no
`sitemap.ts`, no media code, and no Step 01 work.

The effective logic is four lines:

```ts
const noindex =
  NOINDEX_ALL_HOSTS ||                              // explicit site-wide kill switch
  isAlwaysNoindexPath(request.nextUrl.pathname) ||  // /admin, on every hostname
  !isIndexableHost(request.headers.get('host'));    // anything but the official domain
```

---

## 3. Which header is trusted, and why

**`Host`, and only `Host`. `X-Forwarded-Host` is never read.**

The brief's instruction not to assume `X-Forwarded-Host` is trustworthy is not a formality —
using it here would have created a worse bug than the one being fixed:

- **It is client-settable.** It carries whatever the previous hop put there. The application
  cannot verify from inside the container that the platform overwrites it rather than
  appending to it.
- **It is not part of a cache key.** This is the decisive point. A cache keys on the
  effective request URI; `X-Forwarded-Host` is invisible to it. A single request carrying a
  forged `X-Forwarded-Host` could therefore produce a `noindex` response that a shared cache
  stores and then serves to ordinary visitors and crawlers — **cache-poisoning the production
  site into de-indexing itself**. Keying off a header that is *already* part of the cache key
  removes that class of attack rather than mitigating it.

`Host` is client-supplied too, but it is part of the effective request URI, so one hostname's
response can never be served for another. Render also routes by it, so a request reaches this
service only when it carries a hostname pointed at it.

**Consequence for `Vary`:** none is needed, and none is added. The decision depends on nothing
outside the primary cache key. Test group 15 proves this by holding the URL and `Host` fixed
while varying `X-Forwarded-Host`, `X-Forwarded-Proto`, `Cookie`, `Accept-Language`,
`User-Agent` and `Cache-Control` — seven variations, one answer.

---

## 4. The rules, and why each one points the way it does

**Indexable:** `nfrguide.com` and `www.nfrguide.com`, on no port or an explicitly written
default port, case-insensitive, with or without the trailing-dot FQDN form.

**Everything else is noindexed.** Unknown domains, the Render hostname, lookalikes
(`nfrguide.com.evil.example`, `notnfrguide.com`), forged or malformed values, a missing
header, `localhost`, loopback addresses, and unexpected ports.

| Decision | Reasoning |
|---|---|
| **Fail closed on anything unrecognised** | The two failure directions are not symmetric. Wrongly noindexing a hostname nobody publishes costs nothing; wrongly indexing a staging hostname is the defect being fixed. |
| **`www.` is indexable** | A visitor or a crawler following an old link can arrive on it, and an apex redirect is not guaranteed to exist at the DNS or platform layer. Serving it `noindex` would suppress real pages. |
| **`:443` and `:80` accepted; other ports not** | A non-default port means the request did not come through the published origin — a tunnel, a port-forward, a preview proxy. Both defaults are accepted rather than 443 alone so that an unexpected-but-harmless `:80` can never de-index the real site. |
| **The allow-list is derived, not retyped** | It is computed from the existing `PRODUCTION_SITE_URL` constant, so the hostname cannot drift away from the canonical origin. A test pins the derivation. |
| **`/admin` is noindexed on every hostname** | A modest addition beyond the brief, disclosed here: admin is already `Disallow`-ed in `robots.txt` and carries `noindex` in its layout metadata, and this is the response-header backstop for both. Matched as a path segment, so a public `/administration/` route is not caught — a case the tests pin. |
| **IPv6 literals rejected** | No official hostname is an IP address, so refusing them costs nothing and keeps the parser small. |

`STAGING_NOINDEX` is retained as a deliberate site-wide kill switch that noindexes **every**
hostname, production included. It is no longer what protects the Render hostname. The strict
`=== 'true'` comparison is unchanged.

---

## 5. Verification

All on **Node 22.23.4** (the version `render.yaml` pins).

| Check | Command | Result |
|---|---|---|
| TypeScript | `tsc --noEmit` | **exit 0** |
| New suite | `vitest run tests/idx02-hostname-seo.test.ts` | **76 passed** |
| Focused SEO suites | `+ tests/seo-robots.test.ts` | **117 passed** |
| Full regression | `vitest run` | **126 files, 2,785 tests passed, 0 failed, 0 skipped** |
| Production build | `next build` | **exit 0**; `ƒ Proxy (Middleware)` present |

Baseline before this step was 125 files / 2,709 tests. The 76 new tests account for the whole
difference, and no previously passing test changed state.

### Live HTTP evidence (the built artifact, locally)

`next start` on port 10000 — the same internal binding the deploy log shows — with
`STAGING_NOINDEX` **unset**, so the hostname rule is working on its own. **Every request below
also carried a forged `X-Forwarded-Host: nfrguide.com`, and it changed nothing.**

| `Host` sent | `/` | `/robots.txt` | `/sitemap.xml` |
|---|---|---|---|
| `nfrguide.com` | *(absent)* | *(absent)* | *(absent)* |
| `www.nfrguide.com` | *(absent)* | *(absent)* | *(absent)* |
| `NFRGuide.com` | *(absent)* | *(absent)* | *(absent)* |
| `nfrguide.com:443` | *(absent)* | *(absent)* | *(absent)* |
| `nfrguide.com:8443` | **noindex, nofollow** | **noindex, nofollow** | **noindex, nofollow** |
| `nfr-qadd.onrender.com` | **noindex, nofollow** | **noindex, nofollow** | **noindex, nofollow** |
| `evil.example` | **noindex, nofollow** | **noindex, nofollow** | **noindex, nofollow** |
| `localhost:10000` | **noindex, nofollow** | **noindex, nofollow** | **noindex, nofollow** |

Also on `Host: nfrguide.com`: `/admin/` → 307 with **noindex, nofollow**; `/api/health/` →
200 with the header **absent** (the matcher excludes `api/` by design, unchanged).

### Mutation testing

Four deliberate defects were introduced one at a time and the suite re-run:

| Mutation | Outcome |
|---|---|
| `/admin` matched as a bare prefix instead of a path segment | **KILLED** (1 failure) |
| unexpected-port rejection removed | **KILLED** (2 failures) |
| allow-list membership replaced with a suffix match | **KILLED** (1 failure) |
| unparsable `Host` treated as indexable (fail-open) | **KILLED** (4 failures) |

**A correction to my own method, recorded because it nearly produced a false result.** The
fail-open mutation first reported **SURVIVED**. It had not actually been applied: the patch
script matched on CRLF line endings and the file uses LF, so the replacement silently did
nothing and the suite passed on unmutated code. Re-run with an explicit assertion that the
file changed, it was killed by four tests. A mutation that "survives" without proof that it
was applied is not evidence of anything.

### Required regression cases

All fifteen are covered, by the group numbers in `tests/idx02-hostname-seo.test.ts`:

| # | Case | Group |
|---|---|---|
| 1 | Official production hostname | (1) |
| 2 | `www` variant | (2) |
| 3 | Render staging hostname | (3) |
| 4 | Unknown / missing hostname | (4) |
| 5 | Unexpected port numbers | (5) |
| 6 | Malicious forwarded-host header | (6) |
| 7 | HTTPS reverse-proxy request | (7) |
| 8 | HTML page responses | (8) |
| 9 | `robots.txt` | (9) |
| 10 | `sitemap.xml` | (10) |
| 11 | Page-level noindex preserved | (11) |
| 12 | Admin and preview routes | (12) |
| 13 | Local development | (13) |
| 14 | `STAGING_NOINDEX` compatibility | (14) |
| 15 | CDN / cache variation | (15) |

---

## 6. The two existing tests I changed

`tests/seo-robots.test.ts` contained two cases asserting the old contract, written against a
request object with **no headers at all**:

- `STAGING_NOINDEX=true → X-Robots-Tag: noindex, nofollow`
- `STAGING_NOINDEX unset → no X-Robots-Tag header`

The second one asserted exactly the behaviour this step deliberately removes: with the
variable unset, an unrecognised host now *is* noindexed. Both were updated to supply a `Host`
header, as every real request does, and both still assert the kill switch's own contract — now
against the production hostname, where "unset → no header" remains true and meaningful.

**No assertion was weakened to make the new code pass, and no test was skipped.** The
hostname behaviour the old tests did not cover is pinned by 76 new tests.

---

## 7. Correction to the IDX-01 report — read this before changing anything

IDX-01 §6 instructed the owner to **set `STAGING_NOINDEX=true` on the Render service**. That
advice was correct for the situation as understood then — a staging-only service with no
production domain attached, and IDX-01 §8 explicitly recorded "no production domain is
configured; none was noindexed".

**That is no longer true, and the advice is now actively harmful.** The production domain now
resolves to that same service, so setting `STAGING_NOINDEX=true` there would de-index
**nfrguide.com**.

**With this change deployed, `STAGING_NOINDEX` must be left unset (or any value other than
`true`) on the shared service.** The hostname rule provides the protection IDX-01 was trying
to obtain, and it needs no configuration.

**Latent hazard left in place deliberately.** `render.yaml` still declares
`STAGING_NOINDEX: "true"`. It is inert today because the live service was created manually
rather than from the Blueprint, so it never read that file. But a future Blueprint deploy
*would* apply it and de-index the production domain. Modifying deployment configuration is
outside this step's authorisation, so the line is unchanged and flagged here as an owner
action (§9).

---

## 8. What this change does **not** fix — a deployment prerequisite

**Canonical URLs and the advertised sitemap still point at the Render hostname.**

`SITE_URL` comes from `NEXT_PUBLIC_SITE_URL`, which on the deployed service is currently
`https://nfr-qadd.onrender.com` — measured in IDX-01 §4, where `robots.txt` was observed
advertising `Sitemap: https://nfr-qadd.onrender.com/sitemap.xml`. `app/robots.ts` uses that
value for both `sitemap` and `host`, and `lib/seo.tsx` uses it for every rendered canonical.

So once `nfrguide.com` serves from this service, its pages would emit **staging-domain
canonicals** — telling search engines the real pages live at a URL that is now `noindex`.

**This was deliberately not fixed in code.** A canonical URL must be stable and identical for
every visitor; deriving it from the request host would give the same page two different
canonicals depending on how it was reached, which defeats the purpose of having one. The
correct fix is a single environment change:

> **Set `NEXT_PUBLIC_SITE_URL=https://nfrguide.com` on the service before, or at the same
> time as, pointing the production domain at it.**

With that set, canonicals and the sitemap name the official domain in both places, which is
correct for production and harmless on the Render hostname because the hostname rule
noindexes it anyway. Environment changes are outside this step's scope, so this is recorded
as a prerequisite rather than performed.

---

## 9. Owner actions, in order

1. **Review and commit** the Step 01 and IDX-02 changes (nothing is committed; see §10).
2. **Set `NEXT_PUBLIC_SITE_URL=https://nfrguide.com`** on the service (§8).
3. **Ensure `STAGING_NOINDEX` is not set to `true`** on the service, and decide whether to
   remove the declaration from `render.yaml` (§7).
4. **Deploy**, then **verify with one read-only check per hostname** — this is the step that
   confirms the inference in §11, and it should not be skipped:

   ```
   curl -sI https://nfrguide.com/            | findstr /I "x-robots-tag"   REM expect: nothing
   curl -sI https://nfrguide.com/robots.txt  | findstr /I "x-robots-tag"   REM expect: nothing
   curl -sI https://nfr-qadd.onrender.com/   | findstr /I "x-robots-tag"   REM expect: noindex, nofollow
   curl -sI https://nfrguide.com/robots.txt                                REM Sitemap: must name nfrguide.com
   ```

   If `nfrguide.com` comes back with `noindex, nofollow`, the platform is not forwarding the
   public hostname in `Host`. **Do not leave it in that state** — that is the one failure mode
   of this design, and §11 covers it.

---

## 10. Remaining risks and limitations

| Risk | Status |
|---|---|
| **Render's `Host` forwarding is inferred, not observed** | The design assumes Render forwards the visitor's hostname in `Host`, which is standard reverse-proxy behaviour and consistent with Render routing by hostname — but it was **not** observed on the live service, because this is not deployed. The post-deploy check in §9.4 is what converts it to fact. |
| **Production is unverified** | Not deployed. No claim is made about live behaviour. |
| **Already-indexed URLs** | Unchanged and unmeasured. The header stops *future* indexing; it does **not** retroactively remove anything already in a search index. **No claim is made that any search engine has removed, or will remove, previously indexed URLs.** Removal needs the header plus a re-crawl, or an explicit removal request in the relevant webmaster console. |
| **Canonical URLs** | Still environment-driven and currently naming the Render host (§8). Not fixed here, by design. |
| **`render.yaml` still declares `STAGING_NOINDEX: "true"`** | Inert today, hazardous under a future Blueprint deploy (§7). |
| **A new official domain** | Adding one means adding it to `PRODUCTION_HOSTNAMES` — a code change, deliberately, so that what is indexable is reviewable in the repository rather than editable in a dashboard. |
| **`robots.txt` still serves `Allow: /` on the Render host** | By design: a crawler must be allowed to fetch a page to see its `noindex` header. Disallowing would hide the very directive that protects it. |
| Not addressed, by scope | MED-01 (media upload), DISC-01/02, TAX-01/02, SEO-01, the deprecated `middleware` convention warning. |

---

## 11. Final repository state

| | |
|---|---|
| Branch / HEAD | `main` / `54fe6dd` — **unchanged**, level with `origin/main` |
| Commits / pushes / deployments | **none** |
| Modified | `apps/web/middleware.ts`, `apps/web/tests/seo-robots.test.ts` |
| New | `apps/web/lib/seo/productionHosts.ts`, `apps/web/tests/idx02-hostname-seo.test.ts`, this report |
| Preserved | Step 01's route fix and its 22 tests, and all four earlier reports — untouched |
| Environment variables | **unmodified** |
| Databases | development and test schemas untouched; **no production database contacted** |
| Stashes | 0 · no reset, clean, stash, merge or branch switch |

**Media Upload Step 03 has not been started.**
