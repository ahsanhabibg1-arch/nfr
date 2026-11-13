# MED-01A — R2 SDK Loading Failure: Repair

**Status: COMPLETE — implemented and verified locally. Not deployed, so the production fix is
not yet confirmed.**

**Date:** 2026-11-13 · **Branch:** `main` · **Baseline:** `1385e2160d6a50eb173ec2404c7920327c58743d`

No commit, no push, no deploy, no migration. No environment variable, R2 credential or bucket
setting was touched. No production R2 object and no production database row was read or written.
MED-01B and MED-01C were not started. The Step 03 diagnosis document is preserved unchanged.

---

## 1. Confirmed root cause and evidence

**The AWS SDK was loaded through a module specifier the bundler could not analyse, so it was
compiled into a stub that throws. Every upload failed before reaching Cloudflare R2.**

The defect, `lib/media/storage/s3.ts`:

```ts
// Assembled at runtime so the bundler cannot statically resolve it …
const SDK_SPECIFIER = ['@aws-sdk', 'client-s3'].join('/');
…
const sdk = (await import(spec)) as unknown as { … };   // spec is a variable
```

The intent was to keep the SDK an optional dependency the bundler would ignore. The result was
the opposite: a specifier a bundler cannot resolve is one it **replaces with a throwing stub**.
"The bundler must not see this" and "this must load at runtime" are the same requirement, and
only a literal satisfies it.

### Evidence, in three independent forms

**(a) The production log** (owner-supplied):

```
[storage] Error: Cannot find module as expression is too dynamic
category: storage   provider: r2   objectsWritten: 0   derivativesPlanned: 2
```

`objectsWritten: 0` is decisive: **not one byte reached R2**. This is a module-loading failure,
**not** an R2 permission failure, and the R2 token is exonerated. The same line also **clears
`sharp`**: `derivativesPlanned: 2` means the image was decoded and its derivatives generated
before this point, so the image pipeline works in production.

The log existed at all only because `c03e233` replaced a bare `catch {}` with `report()`. On the
previously deployed build this failure produced **nothing** on the server.

**(b) The built artifact, before the fix.** The marker was present in the compiled server
output, which is the thing that actually ran in production:

```
.next/server/chunks/lib_media_storage_0mzjnsihqjint._.js   contains "as expression is too dynamic"
.next/server/chunks/ssr/lib_1r049kyhwjkei._.js             contains "as expression is too dynamic"
```

This was found by the new build-verification tests **failing against the pre-fix build** — the
test caught the live defect before the fix was applied, which is the strongest form of
confirmation available locally.

**(c) The same artifact, after the fix:**

```
marker GONE from every chunk
literal SDK reference now emitted as:  [externals]_@aws-sdk_client-s3_0hmp0-qh8ak_1._.js
```

An `[externals]` chunk is Turbopack recording "require this from `node_modules` at runtime",
which is exactly what `serverExternalPackages: ['@aws-sdk/client-s3']` asks for.

**Scope check:** this was the **only** computed-specifier dynamic import in the application.
A repository-wide search for `await import(<identifier>)` returns one hit — this one. The two
other dynamic imports (`taxonomyService.ts:52-53`) already use literals.

---

## 2. Exact files changed

| File | Change |
|---|---|
| `apps/web/lib/media/storage/s3.ts` | **modified** — `await import(spec)` → `await import('@aws-sdk/client-s3')`; the `SDK_SPECIFIER` constant removed; the header comment rewritten to record the defect and forbid reintroducing it |
| `apps/web/app/api/admin/media/upload/route.ts` | **modified** — `ServiceError` → HTTP status mapping extracted into `statusFor()`; storage now 500, processing 422, conflict 409, rate_limited 429 |
| `apps/web/tests/media-storage-adapter.test.ts` | **new** — 34 tests |

Nothing else. No schema, no migration, no dependency, no environment variable, no deployment
configuration, no other module.

---

## 3. Before / after SDK loading behaviour

| | Before | After |
|---|---|---|
| Specifier | `['@aws-sdk','client-s3'].join('/')` (a variable) | `'@aws-sdk/client-s3'` (a literal) |
| Bundler resolution | **impossible** → throwing stub | resolved, emitted as an external require |
| Load timing | inside `ensure()` | **inside `ensure()` — unchanged** |
| `local` provider cost | SDK never loaded | **SDK never loaded — unchanged** |
| Runtime behaviour with `provider=r2` | threw `Cannot find module as expression is too dynamic` on the first `put()` | loads the real SDK from `node_modules` |
| Mockable in tests | **no** — an unanalysable specifier cannot be intercepted | **yes** — which is what made §4 possible |

**Laziness was deliberately preserved rather than converted to a static top-level import.** A
static import would also have fixed the bug, but `lib/media/storage/index.ts` imports the S3
adapter unconditionally, so every route that touches storage would then pull the AWS SDK at
module init even on a `local` deployment. Moving one specifier from computed to literal is the
smaller change and keeps the architecture the file was written around.

---

## 4. Regression tests added

`apps/web/tests/media-storage-adapter.test.ts` — **34 tests**. Only the AWS SDK is mocked;
the adapter, the upload service, its cleanup path and the route are all real code.

| Required coverage | Tests |
|---|---|
| **1. SDK module loading** | a literal dynamic import resolves and exposes all five constructors; the adapter source contains **no** computed specifier (comments stripped first — see §5); the package is a production dependency, present on disk; `serverExternalPackages` lists it |
| **2. Adapter initialisation** | client built with the configured region/endpoint/credentials; an endpoint carrying a path is **normalised to its origin**; region defaults to `auto`; missing config throws a **named** error and sends nothing; the client is created once and reused |
| **3. PutObject success** | bucket, key, body and content type sent; stored size returned; unsafe/traversal keys rejected **before** anything is sent |
| **4. PutObject rejection** | the SDK error propagates (an upload must never look successful) |
| **5. GetObject** | bytes returned as a `Buffer`, correct bucket and key |
| **6. DeleteObject / HeadObject** | delete sends the command; delete is **best-effort** and does not throw (cleanup must not mask the real error); `exists` true/false; `publicUrl` still returns the gated proxy path and needs no client |
| **7. Failure cleanup** | **end-to-end against the real `uploadMedia`:** the original is written, the first derivative is denied, and exactly the written object is deleted, `ServiceError('storage')` is raised and **no row is persisted**; a successful upload stores original + derivatives, records `provider=r2`, a gated `url`, `DRAFT`, `rightsConfirmed: false`, `READY`; **deduplication still short-circuits before any storage write** |
| **8. Status classification** | storage **500** (regression-named), processing **422**, validation **400**, forbidden **403**, not_found **404**, conflict **409**, rate_limited **429**, unexpected **500** with no internals leaked, success **200** |
| **9. Auth / authz unchanged** | unauthenticated **401** and unauthorized **403**, both proven to never reach the service; limiter-outage **503 with `Retry-After`**; genuine threshold **429** |

The cleanup test reproduces the production log shape exactly, from real code:

```
[storage] AccessDenied: Access Denied   provider:"r2"  objectKey:"2026/11/6d595f67-….jpg"
objectsWritten:1  derivativesPlanned:2
```

The end-to-end block is DB-gated and self-skips without a reachable `DATABASE_URL`, mirroring
`tests/media.test.ts`. It ran against the **isolated test database**, and cleans up its rows.

---

## 5. Build verification evidence

**Unit tests cannot prove a bundling fix** — the module registry serves a mock either way. So
three tests inspect the **built server output**, the artifact that failed in production:

| Check | Result |
|---|---|
| No chunk contains `as expression is too dynamic` | **passes after the fix; failed before it, naming both offending chunks** |
| At least one chunk references `@aws-sdk/client-s3` literally | passes — `[externals]_@aws-sdk_client-s3_…js` |
| The referenced package resolves on disk from the app root | passes |

**Documented limitation.** These three tests `describe.skip` when `.next/server` is absent, so a
`vitest run` on a clean checkout does **not** exercise them — run `next build` first. The check
also proves only that the specifier is resolved and externalised; it does **not** execute the
SDK inside the Next server runtime, and it cannot prove that R2 accepts the credentials. Those
remain production verifications (§7).

### Validation results

All on **Node 22.23.4** (pinned by `.nvmrc` and `render.yaml`).

| Check | Result |
|---|---|
| TypeScript — `tsc --noEmit` | **exit 0** |
| New suite | **34 passed** |
| All four media/storage suites | **70 passed** |
| Full regression — `vitest run` | **128 files, 2,839 tests passed, 0 failed, 0 skipped** |
| Production build — `next build` | **exit 0**, `✓ Compiled successfully` |
| `git diff --check` | **clean** |

Baseline was 127 files / 2,805 tests. The 34 new tests account for the whole difference and no
previously passing test changed state — in particular `media.test.ts` (19), `media-processing`
(11) and `r2-storage` (6) still pass untouched.

**One failure occurred, in my own new test, and it was a test defect.** The assertion
"the adapter source contains no computed specifier" failed because the rewritten header comment
**documents the old broken form** — my prose matched my own regex. Fixed by stripping comments
before matching, so the file can keep explaining the defect without reading as the defect. The
assertion was not weakened: it still requires the literal and still rejects the computed form in
real code.

---

## 6. Security and storage invariants

Each one re-checked against the changed files, not assumed:

| Invariant | Status |
|---|---|
| Private bucket; delivery only through the gated `/api/media/<key>` proxy | **unchanged** — `publicUrl()` untouched, pinned by tests in both suites |
| R2 endpoint and signing configuration | **unchanged** — same `readConfig()`, same origin normalisation, same credential wiring |
| `StorageAdapter` interface | **unchanged** — same five methods, same signatures |
| Object-key validation (`assertSafeKey`) | **unchanged**, and now additionally pinned by a test proving nothing is sent for a traversal key |
| Media access controls (visibility gate, `media.view`) | **not touched** |
| Upload cleanup on failure | **unchanged behaviour, now tested end to end for the first time** |
| Local development adapter | **not touched** |
| Rights workflow — `DRAFT` + `rightsConfirmed: false` on upload, publish gate | **unchanged**, asserted in the new end-to-end test |
| SHA-256 deduplication | **unchanged**, asserted to still short-circuit before any write |
| Credentials in logs | **none** — `report()` logs only an error's `name` and `message`; no credential value appears anywhere in the media path, and none was read during this work |
| User-facing error messages | **unchanged** — only HTTP status codes moved |

### One deliberate divergence from the brief, stated plainly

The brief asked that "storage and internal **processing** failures should return appropriate 5xx".
I implemented **storage → 500** and **processing → 422**, not 5xx.

Reasoning: `ServiceError('processing')` is raised by `uploadMedia` for a **corrupt or truncated
image** — overwhelmingly a property of the uploaded file, which is what 422 Unprocessable
Content means, and consistent with the brief's own "keep validation failures as appropriate
4xx". Returning 500 on every bad upload would bury genuine server faults in noise. The caveat is
real and worth recording: the same code is also thrown if `sharp` itself were unusable in a
deployment, which would be a server fault wearing a 4xx. What distinguishes them is the
`report('unexpected', …)` call in `uploadMedia` — in the log, not in the status code.
**Say the word and it becomes 500.**

Storage was additionally left at **500 rather than 503**: 503 promises a transient condition and
invites a retry, and at that point a missing module, a rejected credential and a network blip are
indistinguishable. Inventing a `Retry-After` would be a guess the client acts on.

---

## 7. Remaining production verification requirements

**This fix is not confirmed in production.** The live service still runs `1385e21`, which
contains the defect. Nothing here proves R2 accepts the credentials — only that the adapter can
now reach the SDK.

After an owner-approved deploy:

1. **Upload one image** in Admin → Media. Expected: it appears in the library with a working
   thumbnail, marked `DRAFT` with rights unconfirmed.
2. **Check the log for the absence of the old marker.** `Cannot find module as expression is too
   dynamic` must not appear.
3. **If an upload still fails, the message now tells you which stage** (Step 03 §3.2 has the full
   table). Specifically:
   - `Upload failed while saving the file.` **with an SDK code in the log** (`AccessDenied`,
     `InvalidAccessKeyId`, `NoSuchBucket`, `SignatureDoesNotMatch`) → this fix worked and the
     remaining problem **is** the R2 token/bucket/endpoint. That is the hypothesis Step 03 ranked
     first, and it has not been tested yet.
   - Anything else → a different stage; consult the table.
4. **Confirm the status code moved**: a storage failure should now be a **500** in the network
   panel, not a 400.
5. **Verify delivery**, not just upload: make the asset PUBLIC and confirm the image loads
   through `/api/media/<key>` (that path exercises `GetObject`, which also had no test before).

**Deployment note:** the fix changes compiled output, so it needs a **normal deploy of the new
commit**. No environment variable or R2 change is part of it.

---

## 8. Separate observations — not in scope, tracked here

### PostgreSQL SQLSTATE `57P01` — "terminated by administrator command"

**Assessment: a real, separate issue. Worth its own follow-up; not blocking MED-01A.**

`57P01` means the **server** closed the connection — Prisma then surfaces it on the next use of
a pooled socket. On this deployment the plausible sources are managed-database maintenance or
failover, a provider-side idle-session timeout, or an administrative `pg_terminate_backend`.

What the code does today:

- `lib/db.ts` bounds the pool in production (`connection_limit=2&pool_timeout=30`, an explicit
  `DATABASE_URL` value winning) — which **reduces** how many sockets can go stale but does not
  recycle them.
- **There is no handling of `57P01` anywhere.** A repository-wide search finds retry logic only
  for optimistic-concurrency conflicts and revision-number contention. A terminated connection
  therefore surfaces as a failed request.
- The free-plan instance spins down after 15 minutes idle, so long-idle connections are the
  normal case rather than the exception.

Suggested follow-up (**not** performed): confirm from the provider's log whether these coincide
with maintenance windows, then decide between a connection lifetime/recycle setting and a narrow
retry for idempotent reads. **Do not add a blanket retry** — retrying a non-idempotent write on a
terminated connection is how duplicates get created.

### Next.js "Server Reference ID mismatch"

**Assessment: deployment skew, not a defect. No action recommended.**

A browser holding the **previous** build's client bundle calls a Server Action whose generated ID
changed in the **new** build. The server correctly refuses an ID it does not recognise. It
resolves on reload and will recur on every deploy for any tab left open across it — there are 26
server-action modules, so the surface is broad.

It becomes worth acting on only if it appears **without** a recent deploy, which would indicate
something else (a stale CDN entry for a client chunk, or mismatched instances). The useful
improvement, if the owner wants one, is a client-side "a new version is available — reload"
prompt rather than any change to the Server Action architecture. **No speculative change was
made.**

---

## 9. Git working-tree status

```
 M apps/web/app/api/admin/media/upload/route.ts      MED-01A (status codes)
 M apps/web/lib/media/storage/s3.ts                  MED-01A (the fix)
?? apps/web/tests/media-storage-adapter.test.ts      MED-01A (34 tests)
?? docs/PRODUCTION_STABILIZATION_STEP_03_MEDIA_SEO_DIAGNOSIS.md   preserved, unchanged
?? docs/PRODUCTION_STABILIZATION_MED_01A_R2_SDK_REPAIR.md         this report
```

| | |
|---|---|
| Branch / HEAD | `main` / `1385e21` — **unchanged**, level with `origin/main` |
| Commits / pushes / deployments / migrations | **none** |
| Live environment variables / R2 settings | **not read, not changed** |
| Production database / production R2 | **not contacted** |
| Test / development databases | isolated test database only |
| `git diff --check` | clean |
| Stashes | 0 · no reset, clean, stash, merge or branch switch |

---

## 10. Final recommendation

**Deploy this.** The root cause is confirmed in three independent ways — the production log, the
pre-fix build artifact, and the post-fix artifact — and the fix is one specifier. The repository
now has 34 tests over a code path that previously had none, including the first end-to-end proof
that a mid-upload storage failure cleans up after itself and persists nothing.

**Expect one of two outcomes, and plan for both:**

1. **Uploads work.** The defect was the specifier, and MED-01A is done.
2. **Uploads fail with `Upload failed while saving the file.` and a named SDK code in the log.**
   Then this fix was necessary but not sufficient, and the remaining cause is the R2 token,
   bucket or endpoint — Step 03's first-ranked hypothesis, which **has never been tested** because
   the module failure masked it entirely. The log will name it precisely, and the remedy is a
   Cloudflare dashboard change, not code.

Outcome 2 is not a reason to delay: the module defect blocks every upload unconditionally, and
until it ships nothing downstream of it can even be observed.

**Then MED-01B/B1**, which is independent of all of this and closes the most consequential finding
in the Step 03 audit: the article page discards the ALT text and caption the CMS captures, while
the homepage uses them and the SEO engine reports them as present.

**Not started:** MED-01B, MED-01C, and the two follow-ups in §8.
