# Production Stabilization — Step 01: Builder Preview Redirect Origin (BLD-01)

**Status: COMPLETE — locally implemented and verified.**
**The production issue is NOT yet confirmed resolved: this has not been deployed or tested
on the live site.** See §10.

**Date:** 2026-11-12 · **Branch:** `main` · **Issue:** BLD-01 (P0) · **Step:** 01 of 08

---

## 1. Initial repository state

| | |
|---|---|
| Branch / HEAD | `main` / `54fe6dd28a77ba5da54452e66b8c3a78b9752f68`, level with `origin/main` |
| Working tree at start | one untracked file — `docs/NFRGUIDE_PRODUCTION_EDITORIAL_READINESS_AUDIT.md` (preserved, untouched) |
| Stashes | 0 |
| Baseline suite | 124 files / 2,687 tests passing on Node 22.23.4 |

The audit's line references were re-verified rather than assumed: `NextResponse.redirect` at
**line 18** and `new URL(targetUrl, req.url)` / `NextResponse.redirect(dest)` at **lines
60 and 66** — unchanged since the audit.

---

## 2. Confirmed root cause

Both redirects were built as `NextResponse.redirect(new URL(path, req.url))`.

`NextResponse.redirect` **requires an absolute URL**, and resolving `path` against `req.url`
takes the origin from the request *as the server sees it*. Behind the deployment platform's
proxy the application is bound to the container's internal address — the deploy log shows
`Local: http://localhost:10000` — so the browser received:

```
Location: http://localhost:10000/?_preview=draft&_pk=homepage&_canvas=1
```

The browser then tried to reach **its own** localhost and reported
**`localhost refused to connect`**. The Builder canvas takes the `embed=1` branch, which is
why the canvas was the visible symptom; the `?exit=1` path (line 18) carried the identical
defect, so "Exit draft preview" was broken in production for the same reason.

The iframe itself was never at fault: `views/admin/BuilderCanvas.tsx:110` already builds a
relative, same-origin `src`. It was **not** modified.

---

## 3. Exact changed files

| File | Change |
|---|---|
| `apps/web/app/admin/(dashboard)/website/preview/route.ts` | **modified** — +82 / −12. Two redirects now emit a relative `Location`; added `sameOriginRedirect()` and `assertSameOriginPath()`; the standalone preview's iframe `src` reuses the same path guard |
| `apps/web/tests/builder-preview-redirect.test.ts` | **new** — 22 response-level regression tests |

Nothing else was touched. No schema, no migration, no database, no deployment config, no
environment variable, no media code, no taxonomy, no Discipline editor, no public template,
no SEO module, no Builder content ownership.

---

## 4. Explanation of the correction

**A relative `Location` was evaluated first, as instructed, and it is sufficient.**
RFC 7231 §7.1.2 permits a relative-reference in `Location`, and browsers resolve it against
the request URL — which is the public origin the visitor actually used. That makes the
redirect same-origin *by construction*:

- nothing needs to know the deployment's hostname (no hardcoded Render host),
- no forwarded header has to be trusted,
- there is no localhost fallback to get wrong,
- the response is byte-identical regardless of which origin the request arrived on.

`NextResponse.redirect()` cannot express this, because it validates its argument as an
absolute URL. The response is therefore constructed directly:

```ts
new NextResponse(null, { status: 307, headers: { Location: assertSameOriginPath(path), ...extra } })
```

This is the same `NextResponse` type and the same **307** status the helper produces — the
helper is simply a thin wrapper over the same construction — so nothing else about the
response changes.

**Forwarded headers were deliberately not used.** `X-Forwarded-Host` is attacker-controlled
unless the proxy is known to overwrite it, and trusting it would introduce exactly the
header-trust question the relative form avoids entirely. That choice also satisfies "do not
hardcode the Render hostname" and "do not hardcode localhost as a production fallback"
without needing a trust-boundary policy.

---

## 5. Redirect security review

`assertSameOriginPath()` rejects anything that is not a plain, single-rooted path:

| Rejected | Why it matters |
|---|---|
| `//evil.example/` | protocol-relative — the browser would leave the site |
| `https://evil.example/` | absolute — same |
| `\evil.example` or any backslash | some browsers normalise `\` to `/`, re-creating `//` |
| CR / LF | would split the `Location` header |
| anything outside `[A-Za-z0-9._~\-/%?&=]` | quotes, spaces, `<`, `>` — also what makes `targetUrl` safe to interpolate into the standalone preview's HTML |
| `//` **anywhere**, not just at the start | see below |

The paths are assembled by `pageKeyToUrl()` from CMS slugs. `normalizeSlug()` only arrived
with the Rodeo Coverage work (`54fe6dd`), so rows created before it were never held to that
rule — validating the finished path covers every caller at once rather than trusting each
slug's provenance.

**One correction came out of the tests, and it is worth stating precisely.** The first draft
of the guard checked only `startsWith('//')`. The hostile-slug test showed that a slug of
`/evil.example` produces `/articles//evil.example/`, where the `//` is in the middle. That
is **not** an open redirect — it still resolves to this origin — but no legitimate path here
contains an empty segment, so the guard now rejects `//` anywhere. The test, not a review of
my own code, is what surfaced the difference.

The standalone preview's HTML also gained `&amp;` in place of a bare `&` in the iframe URL,
so the attribute is well-formed HTML.

---

## 6. Draft isolation verification

Unchanged, and covered by tests:

- `requireUser()` then `roleHasPermission(user.roles, 'system.config')` still run **before**
  anything else; a 403 returns with no draft cookie set.
- `draftMode().enable()` is still called exactly once on the embed path, and
  `draftMode().disable()` exactly once on exit — asserted, not assumed.
- The cookie still reaches the browser: `draftMode()` mutates the outgoing cookie store and
  the framework applies it to whatever response the handler returns; the response is the
  same `NextResponse` type as before.
- `Cache-Control: no-store, no-cache, must-revalidate` and `X-Robots-Tag: noindex` are still
  set on the embed redirect.
- `ADMIN_VISIBLE_PAGE_KEYS` validation, the `embed=1` behaviour (including rendering registry
  defaults when no draft is stored) and the standalone 404 are all unchanged.
- The public pages re-check `system.config` themselves before honouring draft mode, so
  visitors remain unaffected. Not modified by this step.
- `BuilderCanvasBridge` postMessage origin validation and the CSP `frame-ancestors`/
  `frame-src` restrictions were not touched.

---

## 7. Tests added

`apps/web/tests/builder-preview-redirect.test.ts` — **22 tests**. They drive the **real route
handler** and assert on the **real `Response`** (status, `Location`, cache and robots
headers), not on how a URL was assembled. Only the three things a route handler cannot reach
in a unit test are replaced: the session, the draft-mode cookie store and the database.

| Required case | Covered by |
|---|---|
| 1. Local development preview | `local development is unaffected` |
| 2. Production-style reverse-proxy request | `the same request on the public https origin behaves identically` |
| 3. Internal `localhost:10000` request origin | `REGRESSION: an embed request arriving on localhost:10000 redirects relatively` |
| 4. Public HTTPS origin | as (2), plus `the Location is byte-identical across all three origins` |
| 5. Embedded preview | `enables draft mode and carries the preview query`, `resolves a section page key…` |
| 6. Standalone preview | `still returns its HTML wrapper, not a redirect` |
| 7. Exit draft preview | `REGRESSION: exit disables draft mode and redirects relatively` |
| 8. Invalid page key | `an unknown page key is rejected before any redirect`, `a missing page key is rejected` |
| 9. Unauthenticated request | `an unauthenticated request never reaches the redirect` |
| 10. Unauthorized request | `a signed-in user without system.config gets 403 and no draft cookie` |
| 11. Open-redirect attempt | 5 hostile-slug cases + `an ordinary slug still resolves normally` |
| 12. Draft cookie preservation | `draftEnable` / `draftDisable` call assertions |
| 13. Draft/public isolation | 403 and anonymous paths set no cookie; `no stored draft` cases |
| 14. Correct redirect Location header | exact-string assertions on `/`, `/competition/`, `/articles/<slug>/`, `/admin/website/` |
| 15. No internal localhost URL in production response | `not.toContain('localhost')` + `not.toMatch(/^https?:\/\//)` on the internal-origin case |

---

## 8. Test results

All executed on **Node 22.23.4** (the version `render.yaml` pins), against the isolated test
database.

| Check | Command | Result |
|---|---|---|
| New suite | `vitest run tests/builder-preview-redirect.test.ts` | **22 passed** |
| TypeScript | `tsc --noEmit` | **exit 0** |
| Full regression | `vitest run` | **125 files, 2,709 tests passed, 0 failed, 0 skipped** |
| Production build | `next build` | **exit 0**, compiled successfully |

Baseline was 124 files / 2,687 tests; the 22 new tests account for the whole difference, and
no previously passing test changed state. The existing preview-related suites
(`batch-f-preview`, `stage06-builder-dom`, `batch-h-integration`, `batch-i-hardening`,
`batch31-unit`, `batch-t2`, `batch-t3`) all still pass unmodified.

---

## 9. First-run failures and corrections

**One failure, in my own work, caught by the new tests.**

First run: **21 passed, 1 failed** —
`refuses a protocol-relative slug rather than redirecting off-site`. A slug of
`/evil.example` produced `Location: /articles//evil.example/`; the guard's
`startsWith('//')` check did not see the embedded `//`.

Assessment before changing anything: that Location is **not** an open redirect — it resolves
to this origin. So the guard was not insecure; the test encoded a stricter expectation than
the implementation. I tightened the implementation rather than relaxing the test, because no
legitimate path here contains an empty segment and rejecting it stops a hostile slug from
steering the preview at an unintended route. `startsWith('//')` became `includes('//')`, and
the backslash check was widened from a prefix check to `includes('\\')` for the same reason.

Re-run: **22 passed**. No assertion was weakened and no test was skipped.

---

## 10. Remaining limitations

1. **Production is unverified.** The fix has not been deployed; the live site still runs
   `abc0da5`. Per the brief, I do **not** claim the production issue is resolved. Confirming
   it requires a deploy and opening the Builder canvas on the live site.
2. **Deploying requires the cloud database first.** `54fe6dd` carries two migrations
   (`add_rodeo_archived_at`, `add_seed_tombstone`) that have not been applied to the Aiven
   database. Deploying before they are applied will fail during static generation, as the
   earlier `InfoPage` failure did. That is issue **DB-01** and needs owner authorisation.
3. **Browser-level verification was not performed** — no Playwright run was added for the
   deployed canvas, since the behaviour under test is a response header that the unit tests
   assert directly, and the relevant environment is production.
4. **`req.url` behaviour behind the proxy was inferred**, not observed: it comes from the
   deploy log's binding address plus the reported symptom. The fix does not depend on that
   inference being exact — a relative `Location` is correct on every origin, which is what
   the byte-identical-across-origins test demonstrates.
5. Not addressed here, by scope: BLD-01's neighbours in the audit (MED-01, DISC-01/02,
   TAX-01/02, SEO-01) and the deprecated `middleware` convention warning.

---

## 11. Final repository state

| | |
|---|---|
| Branch / HEAD | `main` / `54fe6dd` — **unchanged**, still level with `origin/main` |
| Commits created | **none** · pushed: **none** · deployed: **none** |
| Modified | `apps/web/app/admin/(dashboard)/website/preview/route.ts` (+82 / −12) |
| New | `apps/web/tests/builder-preview-redirect.test.ts`, this report |
| Preserved | `docs/NFRGUIDE_PRODUCTION_EDITORIAL_READINESS_AUDIT.md` untouched |
| Databases | development and test schemas untouched; no production database contacted |
| Stashes | 0 · no reset, clean, stash, merge or branch switch |

**Step 02 has not been started.** Awaiting owner review.
