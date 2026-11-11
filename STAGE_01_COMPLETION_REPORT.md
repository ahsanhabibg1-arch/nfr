# NFRGuide.com — Stage 01 Completion Report
## Security Hardening & Development Baseline Verification

**Stage:** 01 of a maximum 12
**Date:** 2026-11-09
**Scope:** Security and baseline reliability only
**Written for:** the project owner and the independent reviewer authorizing Stage 02

### Evidence convention

- **[EXECUTED]** — a command was run in this stage; the result is reported as returned.
- **[RUNTIME]** — observed over HTTP against the running application.
- **[SOURCE]** — read from the file at the stated line.
- **[NOT EXECUTED]** — not run, with the reason stated. Never reported as passing.

---

## A. Executive Summary

**Status: COMPLETE.**

The critical finding carried forward from the Deep Architecture Audit was **independently re-verified against the current source and found still present at HEAD**. It has been corrected, and the correction is backed by behavioral tests that were proven to detect the original defect.

**What was accomplished**

1. **Repository baseline established and documented** — branch, HEAD, working tree, versions, test configuration, database safety guards. The two pre-existing untracked audit reports were preserved untouched.
2. **The `/api/internal/revalidate` vulnerability was independently verified and fixed.** Verification was not taken on the audit's authority: the handler was read at HEAD, and the exploit was reproduced over HTTP before the fix. **Four** distinct weaknesses were found in the single handler — one more than the audit reported.
3. **The endpoint now fails closed.** With no configured secret it returns `503` and performs no cache invalidation. Confirmed over HTTP: the previously-working hardcoded constant now returns `503`.
4. **21 behavioral regression tests** were added that invoke the real route handler, not its source text. A controlled mutation test (reinstating the original vulnerable code) made **13 of the 21 fail**, proving the suite detects the defect class. The fix was restored and re-verified immediately.
5. **Authentication, RBAC, draft-preview and draft-isolation controls were reviewed and confirmed intact** after the change, including over HTTP.
6. **Baseline verification re-run from scratch** — `tsc --noEmit` 0 errors; full suite **78 files / 1549 tests / 0 failures**. The audit's historical 1528 figure was *not* carried forward; it was re-measured.

**Remaining blockers for Stage 01: none.**

**One operational action is required of the owner** (§F): `INTERNAL_REVALIDATE_SECRET` is not configured in any environment file. Because the endpoint now correctly refuses to operate without it, **scheduled-publish cache revalidation will skip (with a warning) until the variable is set**. Scheduled publishing itself still executes; only the automatic public-cache flush is deferred. This is the intended fail-closed trade-off, not a regression, and it must be configured before deployment.

---

## B. Repository Baseline

[EXECUTED] `git rev-parse`, `git log -1`, `git status --porcelain`, `git diff --stat HEAD`

| Item | Value |
|---|---|
| Branch | `office-sync-2026-11-08` |
| HEAD at stage start | `fd4fb1008e28cd99fa578a154d28f79318421d3c` |
| HEAD subject | `feat: CMS Block Management — Phases C-G + Tasks 1-4` (moynulhasan4044, Sun Nov 8 17:33:52 2026 +0600) |
| HEAD at stage end | `fd4fb10` — **unchanged; no commit created** |
| Modified tracked files at start | **0** |
| Untracked files at start | 2 — `docs/NFRGUIDE-FULL-ADMIN-CONTROL-AUDIT.md`, `docs/NFRGUIDE-SITE-BUILDER-DEEP-ARCHITECTURE-AND-GAP-AUDIT.md` |

**The audit's reported baseline matched the live repository exactly.** No divergence to document.

**Pre-existing work preserved.** Both untracked audit reports are present and unmodified at stage end. Nothing was reset, checked out, stashed or discarded. No branch switch occurred.

**Stack** [SOURCE] `apps/web/package.json`: Next 16.4.3 (App Router) · React 19.2.0 · TypeScript ^7.0.2 · Prisma 6.19.3 · Tailwind ^4.3.3 · Vitest ^3.2.4 · Zod ^4.6.7. 83 Prisma models, 19 migrations.

**Security-sensitive surfaces located** [SOURCE]:

| Surface | Location |
|---|---|
| Internal revalidation endpoint | `app/api/internal/revalidate/route.ts` |
| Its only production caller | `lib/cms/scheduledPublishRunner.ts:11-24` (`triggerRevalidation`) |
| Draft preview authorization | `lib/cms/previewGuard.ts:5-9` (`isStaffDraftPreview`) |
| Draft Mode enablement | `app/admin/(dashboard)/website/preview/route.ts:38` |
| RBAC | `lib/auth/rbac.ts`, `lib/auth/permissions.ts` |
| Session model | `prisma/schema.prisma:726` (`Session`) |
| Builder mutating actions | `app/admin/page-layout-actions.ts:12,17,22,27` |
| Test DB isolation guard | `vitest.config.ts:9-20` → `tests/support/testDbGuard.ts` |

**Test configuration** [SOURCE] `vitest.config.ts`: `environment: 'node'`, `fileParallelism: false`, 30s timeouts, `server-only` aliased to a stub, and `decideTestDatabase()` which throws on a refused database and blanks `DATABASE_URL` unless an isolated test DB is present.

---

## C. Security Findings

### C-1 — `/api/internal/revalidate` accepted a predictable fallback secret — **VERIFIED, FIXED**

**Independently verified before any change.** The audit's claim was confirmed by reading the handler at HEAD and by reproducing the exploit over HTTP.

Pre-fix code [SOURCE] `app/api/internal/revalidate/route.ts` (original lines):

```ts
7:  const INTERNAL_SECRET = process.env.INTERNAL_REVALIDATE_SECRET || '__scheduled_publish_revalidate__';
11: if (body.secret !== INTERNAL_SECRET) { ... 403 }
15: const path = typeof body.path === 'string' ? body.path : '/';
16: revalidatePath(path, 'layout');
```

**Four distinct weaknesses** — the audit reported the first three; the fourth was found in this stage:

| # | Weakness | Pre-fix line | Consequence |
|---|---|---|---|
| W1 | Hardcoded fallback secret, active because the env var is unset, in a **public** repository | `:7` | Unauthenticated access by anyone reading the repo |
| W2 | Non-constant-time comparison (`!==`) | `:11` | Timing side channel against a configured secret |
| W3 | `path` caller-supplied with **no allowlist** | `:15-16` | Arbitrary-path cache invalidation |
| W4 | **No type check on `body.secret`** — found in this stage | `:11` | A non-string payload reached the comparison; an object with a crafted `toString` is a plausible abuse vector against looser comparisons, and the unchecked path was latent risk |

Also noted: the secret was captured at **module load** (`:7`), so the process had to restart for a configuration change to take effect, and the value was fixed for the lifetime of the module.

**Pre-fix exploit, reproduced** [RUNTIME] — before any code change:

```
POST /api/internal/revalidate/  {"secret":"__scheduled_publish_revalidate__","path":"/"}
  → 200  {"ok":true,"revalidated":"/"}
POST /api/internal/revalidate/  {"secret":"wrong","path":"/"}
  → 403  {"error":"forbidden"}
```

[RUNTIME] `INTERNAL_REVALIDATE_SECRET` is absent from `apps/web/.env` **and** from `apps/web/.env.example`, so the fallback was live rather than theoretical.

**Post-fix behaviour, verified** [RUNTIME] against the running server with the secret still unconfigured:

```
POST {"secret":"__scheduled_publish_revalidate__","path":"/"}  → 503  {"error":"not_configured"}
POST {"secret":"guess","path":"/"}                             → 503  {"error":"not_configured"}
POST {}                                                        → 503  {"error":"not_configured"}
```

The previously-working constant no longer authenticates. **The exploit is closed.**

### C-2 — Authentication, authorization and preview controls — **REVIEWED, INTACT, NO CHANGE NEEDED**

| Control | Verdict | Evidence |
|---|---|---|
| Admin authentication with DB-backed sessions | **INTACT** | `prisma/schema.prisma:726-732` — `Session` stores `tokenHash @unique` (hashed opaque token, never the raw token) with `expiresAt`. No session signing secret is required, consistent with `.env.example:51-53` |
| Default-deny RBAC | **INTACT** | `lib/auth/permissions.ts:43` `visibleModuleIds` filters by held permission; a module whose permission no role holds is absent rather than hidden |
| Draft preview authorization | **INTACT — unchanged by this stage** | `lib/cms/previewGuard.ts:5-9` requires `draftMode().isEnabled` **AND** `userHasPermission(..., 'system.config')`. The two checks are independent, so a forged `__prerender_bypass` cookie alone is insufficient |
| Draft Mode access | **INTACT** | `app/admin/(dashboard)/website/preview/route.ts:38` enables draft mode only after a permission check |
| Builder draft/published separation | **INTACT** | `PageLayout.draftSections` vs `publishedSections` (`schema.prisma:1599-1600`); resolvers branch on the guard |
| Internal-only endpoint | **FIXED** | C-1 |
| Public exposure of unpublished content | **NONE FOUND** | [RUNTIME] `GET /?_preview=draft` as an anonymous client returned **0** draft markers; `/admin/website/`, `/admin/info-pages/` and the preview route all resolve anonymous requests to `/admin/login/` |
| Builder mutating actions gated | **INTACT** | `app/admin/page-layout-actions.ts:12,17,22,27` — every action calls `requireActor('system.config')` |

All regression checks above were re-run **after** the fix. No control was weakened.

### C-3 — Remaining security-adjacent risks — **DOCUMENTED AS FOLLOW-UPS, NOT FIXED**

Each was assessed against the stage's rule — fix only if narrowly scoped and safely testable in the revalidation execution path — and deliberately deferred with a reason.

| ID | Risk | Why deferred |
|---|---|---|
| FU-1 | **Draft save triggers a full-site cache flush.** `app/admin/page-layout-actions.ts:9` `rev()` calls `revalidatePath('/', 'layout')` and is invoked by `saveDraftAction` (`:12`), so saving a draft for one page key invalidates the entire public site | A behaviour change to the Builder's save path. The safe fix needs `npm run test:cache` (`scripts/cache-invalidation.mts`) as its harness, which was **[NOT EXECUTED]** in this stage because it requires a running server. Fixing it blind would risk the admin list view no longer reflecting saved drafts. Recommended for Stage 02 with the harness wired in |
| FU-2 | **Scheduler revalidates `http://localhost:${PORT}`** (`lib/cms/scheduledPublishRunner.ts:12-13`) — in a multi-instance deployment only the publishing replica's cache is flushed | Reliability, not security, and the correct target is deployment-dependent. Out of Stage 01 scope |
| FU-3 | **Scheduler is a single in-process `setInterval`** (`:53-60`) with `timer.unref()` (`:59`) — never fires on serverless/scale-to-zero, duplicates on multi-instance | Deployment-shaped. Optimistic locking (`pageLayoutService.ts:282-297`) already prevents double-publish, so the race is contained |
| FU-4 | **Preview responses carry no `X-Robots-Tag: noindex`** | Mitigated today by `Disallow: /admin/` in `robots.txt` [RUNTIME]. Belongs with the SEO stage |
| FU-5 | **Block prop validation is string-only**; the XSS check is `/<script/i` alone and there is no prop whitelist (`lib/cms/pageLayoutService.ts:29-53`) | Outside the revalidation execution path, and a strict whitelist would reject existing stored rows. Requires a stored-data audit first |
| FU-6 | **No optimistic concurrency on interactive Builder saves** (`pageLayoutService.ts:130-141`) | Data-integrity, not security. Needs a conflict UI, which is Stage 02+ |

---

## D. Implementation Details

**3 tracked files modified, 1 test file added. No schema change, no migration, no dependency change.**

[EXECUTED] `git diff --stat HEAD`:

```
 apps/web/.env.example                         | 14 ++++++++++++
 apps/web/app/api/internal/revalidate/route.ts | 30 ++++++++++++++++++++++---
 apps/web/lib/cms/scheduledPublishRunner.ts    | 12 +++++++---
 3 files changed, 51 insertions(+), 5 deletions(-)
```

### D-1 `apps/web/app/api/internal/revalidate/route.ts` — the fix

| Change | Addresses | Why necessary |
|---|---|---|
| Removed the `|| '__scheduled_publish_revalidate__'` fallback; the secret is read per-request and an unset/empty value returns `503 not_configured` before the body is parsed | W1 | An authentication boundary must never have a default. Failing closed is the only safe behaviour when the secret is absent, and returning early means an unconfigured endpoint does no work at all |
| `secretMatches()` hashes both sides with SHA-256 and compares the fixed-length digests via `timingSafeEqual` | W2 | Constant-time comparison. Hashing first makes both operands exactly 32 bytes, so neither the secret's **value** nor its **length** leaks — a plain `timingSafeEqual` on raw strings would either throw or leak length on mismatch |
| `typeof supplied !== 'string'` guard before comparison | W4 | Prevents any non-string payload reaching the comparison path; no type coercion |
| `ALLOWED_PATHS = new Set(['/'])`; a non-permitted `path` returns `400 invalid_target` **before** `revalidatePath` | W3 | Restricts invalidation to the one target the sole caller actually uses. Rejection happens before any cache work, so an authorized-but-malformed request cannot flush anything |
| Secret is read inside the handler rather than at module scope | latent | Configuration changes take effect without a module reload, and the handler becomes directly testable by mutating `process.env` between cases |

Error responses are deliberately uniform: a wrong secret and an absent secret both return an identical `403 {"error":"forbidden"}` body, so the response does not reveal which input was wrong. No response path emits the secret.

### D-2 `apps/web/lib/cms/scheduledPublishRunner.ts` — caller alignment

Removed the module-level fallback constant (`:9`), which held the **same** hardcoded literal. `triggerRevalidation()` now reads the secret per call and, when it is unset, logs `skipping revalidation: INTERNAL_REVALIDATE_SECRET is not configured` and returns **without issuing a request**.

Necessary because the two files had to change together: leaving the runner's fallback in place while hardening the route would make the runner send a request that can only ever be rejected, converting a silent weakness into a silent failure. Scheduled publishing itself is unaffected — `runDuePublications()` still executes publications and only the subsequent revalidation is skipped.

### D-3 `apps/web/.env.example` — required-variable documentation

Added an "Internal endpoints (Stage 01 security)" block documenting `INTERNAL_REVALIDATE_SECRET`: that it is required wherever scheduled publishing runs, that there is deliberately **no fallback**, the exact behaviour when unset (503 from the endpoint, skip-with-warning in the runner), and a generation command. **The variable is documented by name with an empty placeholder — no value was invented, and no real secret appears anywhere.**

### D-4 `apps/web/tests/stage01-revalidate-security.test.ts` — new, 21 tests

Invokes the real exported `POST` handler. `next/cache` is mocked via `vi.hoisted` + `vi.mock` for two reasons: `revalidatePath()` throws outside a request context, and the mock is what allows the security-critical assertion that unauthorized requests **never reach cache invalidation at all**. The request is a minimal stand-in exposing only `json()`, which is all the handler consumes. `process.env.INTERNAL_REVALIDATE_SECRET` is saved in `beforeEach` and restored in `afterAll`, so no global state leaks to other suites.

---

## E. Testing Evidence

### E-1 Commands executed

| Command | Status | Result |
|---|---|---|
| `npx vitest run tests/stage01-revalidate-security.test.ts` | **[EXECUTED]** | **21 passed, 0 failed** (73 ms) |
| `npx vitest run` (full suite) | **[EXECUTED]** | **78 files · 1549 tests · 1549 passed · 0 failed · 0 skipped · 123.18s** |
| `npx tsc --noEmit` | **[EXECUTED]** | **0 errors** (exit 0) |
| Mutation test (vulnerable code reinstated, suite re-run, fix restored) | **[EXECUTED]** | **13 of 21 failed** against the original code — see E-3 |
| HTTP verification of fail-closed behaviour | **[RUNTIME]** | 3/3 unauthorized payloads → `503 not_configured` |
| HTTP regression check on auth/preview/draft isolation | **[RUNTIME]** | admin + preview → `/admin/login/`; 0 draft markers anonymously; homepage `200` |
| `npx playwright test` (9 specs) | **[NOT EXECUTED]** | `playwright.config.ts:39-40` requires `webServer: npx next start` — a production build, a seeded database and admin-login fixtures; the specs authenticate into `/admin/login/` and would mutate admin session state |
| `npm run build` (production build) | **[NOT EXECUTED]** | Not required to validate this change, and it would contend with the running dev server for `.next` output. `tsc --noEmit` passing plus a hot-reloaded runtime check covers the changed surface |
| `npm run test:cache`, `test:routes`, `test:migration` (`scripts/*.mts`) | **[NOT EXECUTED]** | Require a running server, cloud credentials, or migration replay against a database. `test:migration` would create a throwaway database — out of bounds without owner approval |

**Baseline comparison.** The audit's historical figures (1528 tests, clean TypeScript) were **not** carried forward. Re-measured in this stage: **77 → 78 files, 1528 → 1549 tests** (+1 file, +21 tests, exactly this stage's additions). **No pre-existing test regressed**, including the four source-text assertions in `tests/batch-d-scheduling.test.ts:468-485` that inspect this very route and runner.

### E-2 Regression test coverage against the stage's ten required cases

| # | Required case | Covered by | Behavioural? |
|---|---|---|---|
| 1 | Missing environment secret | `returns 503 and does not revalidate when the env secret is MISSING` | Yes — real handler |
| 2 | Empty environment secret | `... when the env secret is EMPTY` | Yes |
| 3 | Invalid supplied secret | `returns 403 for an incorrect secret`; `a correct-prefix but truncated secret is rejected` | Yes |
| 4 | Correct authorized secret | `returns 200 and revalidates for a correct secret and permitted path` | Yes |
| 5 | Missing authentication input | `returns 403 when the secret field is absent`; `returns 403 for an empty body` | Yes |
| 6 | Malformed authentication input | `returns 403 for a non-string secret (no type coercion)` (5 payload shapes incl. a crafted `toString`); `returns 403 for a malformed (non-JSON) body` | Yes |
| 7 | Invalid / unsupported targets | `returns 400 and does not revalidate for a non-permitted path` (10 paths incl. traversal, absolute URL, empty string) | Yes |
| 8 | Valid authorized target | `returns 200 ...`; `a non-string path falls back to the permitted default rather than being coerced` | Yes |
| 9 | Unauthorized requests do not invoke cache invalidation | `revalidatePath is not called across the full unauthorized matrix` (8 combinations of body × env state) | Yes — asserts the mock was never called |
| 10 | Legitimate authorized callers remain compatible | `remains compatible with the exact payload the scheduled-publish runner sends` | Yes — mirrors `triggerRevalidation()`'s payload |

Additional coverage beyond the minimum: the removed fallback is rejected both with and without a configured secret · `Cache-Control: no-store` on success · **no response body or header contains the secret** across four payload shapes · the `403` body for "wrong secret" is byte-identical to "no secret supplied" · a repo-wide negative-existence check that the literal `__scheduled_publish_revalidate__` appears in **no** source file · neither changed file uses an `|| ` fallback for the variable · the route uses `timingSafeEqual`.

The last three are **structural (negative-existence) invariants**, labelled as such in the test file. They are not a substitute for behaviour — the eighteen behavioural tests stand on their own — and a negative-existence assertion is the correct tool for "this literal must never reappear".

### E-3 Mutation test — proof the tests detect the defect

The prior audit's central methodological finding was that 1528 passing tests coexisted with real defects, because assertions targeted source text rather than behaviour. To demonstrate that this stage's tests are not vulnerable to the same failure, the **original vulnerable handler was temporarily reinstated verbatim** and the suite re-run.

[EXECUTED] Result: **13 of 21 tests failed.** The fix was restored from a scratchpad backup immediately afterwards and the suite re-verified at **21/21 passing**, with the fail-closed, timing-safe and allowlist constructs confirmed present by inspection.

A test suite that cannot fail proves nothing. This one fails against the exact code it was written to catch.

---

## F. Database, Environment & Git Safety

| Restriction | Status | Note |
|---|---|---|
| No production database connection or mutation | **CONFIRMED** | No production credentials present or used. Tests ran against the isolated DB — `vitest.config.ts` reported `[tests] isolated DB: localhost:5432/nfrguide_test` |
| No destructive migrations | **CONFIRMED** | No migration created or run. `prisma/migrations/` unchanged at 19 |
| No database reset or seed | **CONFIRMED** | No `db:reset`, `db:seed` or `db:migrate` executed |
| No production environment variables or deployed secrets changed | **CONFIRMED** | Only `.env.example` (a committed template) was edited, adding a variable **name** with an empty placeholder |
| No credentials or `.env` values exposed | **CONFIRMED** | `.env` was never printed. Its presence was probed only with a name-only `grep -q`, output limited to "present/absent" |
| No Docker | **CONFIRMED** | None introduced |
| Test DB isolation guards preserved | **CONFIRMED** | `vitest.config.ts` and `tests/support/testDbGuard.ts` untouched |
| No commit | **CONFIRMED** | HEAD is `fd4fb10` at stage end, identical to stage start |
| No push / PR / force push | **CONFIRMED** | No network Git operation performed |
| No branch switch | **CONFIRMED** | Still on `office-sync-2026-11-08` |
| No pre-existing local work discarded | **CONFIRMED** | Both untracked audit reports present and unmodified |

### Required environment variable — owner action

**`INTERNAL_REVALIDATE_SECRET`** must be set in every environment that runs scheduled publishing. It is currently **unset in `apps/web/.env`**, and was absent from `.env.example` until this stage documented it.

Documented behaviour while unset — intentional, and the point of the fix:

- `POST /api/internal/revalidate` returns `503 not_configured` and performs **no** cache invalidation.
- `scheduledPublishRunner.triggerRevalidation()` logs a warning and skips.
- **Scheduled publishing still executes.** Layouts are published and revisions recorded; only the automatic public-cache flush is deferred until the next revalidation trigger.

This is the one environment assumption this stage introduces, and it is a deliberate fail-closed trade-off. No value was invented. Generate a unique high-entropy value per environment, as documented in `.env.example`.

### Environmental limitations encountered

1. No admin credentials were available, so no authenticated browser session was established; admin-side verification was HTTP-level (unauthenticated redirect behaviour) and handler-level (tests).
2. **HTTP-level verification of the *authorized* path was not performed.** Doing so would require either editing `.env` (prohibited) or starting a second server instance sharing `.next` with the running one (risking corruption of that instance). The authorized path is instead proven at handler level against the real `POST` export using the runner's exact payload, and by the mutation test. Stated plainly rather than implied.
3. Playwright, the production build and the `scripts/*.mts` harnesses were not executed, each for the reason given in E-1.

---

## G. Acceptance Criteria Matrix

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Actual repository baseline documented | **PASS** | §B — branch, HEAD, clean tree, 2 untracked files preserved, stack, test config, security surfaces |
| 2 | Revalidation vulnerability verified and corrected if present | **PASS** | §C-1 — independently verified at HEAD and reproduced over HTTP pre-fix; 4 weaknesses fixed; post-fix `503` confirmed [RUNTIME] |
| 3 | Unauthorized cache revalidation prevented by behavioral tests | **PASS** | §E-2 case 9 — 8-combination matrix asserting `revalidatePath` is never called; §E-3 mutation test, 13/21 fail against the vulnerable code |
| 4 | Authorized internal revalidation remains functional | **PASS** *(qualified)* | §E-2 cases 4, 8, 10 — real handler, runner's exact payload, asserts `revalidatePath('/', 'layout')`. **Verified at handler level, not over HTTP with a configured secret** — reason in §F limitation 2 |
| 5 | Relevant authentication and preview security controls reviewed | **PASS** | §C-2 — eight controls reviewed, all intact, re-checked after the change including [RUNTIME] |
| 6 | TypeScript and relevant tests pass, or blockers documented | **PASS** | §E-1 — `tsc --noEmit` 0 errors; 78 files / 1549 tests / 0 failures. Non-executed commands each documented with a reason |
| 7 | No unauthorized database, deployment or Git operations | **PASS** | §F — full matrix confirmed; HEAD unchanged |
| 8 | All changes limited to approved Stage 01 scope | **PASS** | §D — 3 tracked files + 1 test file. No Builder canvas, block registry, content engine, templates, SEO redesign, legal publication, schema change or theme work. Six adjacent risks documented as follow-ups rather than fixed (§C-3) |

**8 of 8 PASS.** Criterion 4 passes on handler-level rather than HTTP-level evidence; the limitation is stated rather than papered over.

---

## H. Stage 02 Handover

**No Stage 02 work was performed.** Observations only.

### H-1 Architecture observations relevant to Hybrid Builder planning

1. **A central renderer already exists** — `components/blocks/PageRenderer.tsx:12`, used by all four page families. The Blueprint's complaint about "four copied `getSlot`/`slotProp` helpers" and a homepage-only `renderPremiumBlock` is **stale**: both return zero matches repo-wide. Stage 02 inherits a better starting point than the planning document describes.
2. **But that renderer is `'use client'`** (`:1`) and applies **neither** visibility filtering nor order sorting — those live in four separate resolvers. It also returns `null` silently for an unknown slot type (`:17`) where the Blueprint's invariant R1 requires "skipped **and logged**".
3. **The preview iframe already renders real draft pages** for all 15 page keys (`app/admin/(dashboard)/website/preview/route.ts:38-64`). It is simply mounted on a separate route rather than in the Builder canvas. This is the highest-value reuse opportunity for a visual canvas — **mount it, do not rebuild it**.
4. **Published layout configurations are forward-compatible.** `SectionSlot` (`lib/cms/sectionRegistry.ts:9-15`) carries an open `props` record, so new props are additive and existing rows fall back to defaults. No layout-JSON migration is needed for the planned work.
5. **The verification methodology is the real prerequisite.** Approximately 93% of the suite's substring assertions target source text, and no pre-existing test proves an admin edit reaches public HTML. The pattern used in this stage — mock the boundary, invoke the real handler, assert the side effect was *not* performed, then mutation-test the suite — is directly reusable as the registry contract test the Blueprint mandates (its ARCH-08 / TEST-01) and never built. **Recommend establishing it before any Builder remediation ships**, otherwise the next fix will be reported complete on the same evidence that has already failed twice.

### H-2 Product decisions requiring owner approval

1. **"Hybrid Management (Option C)"** is undefined anywhere in the repository — no content match across 274 markdown files, and no enumeration of three management options. The definition must be supplied before any stage can be assessed against it.
2. **Detail-template target state** — promote `detail-hero` / `detail-body` / `detail-faq` to real blocks, or formally adopt appendage-only rendering and delete the three dead markers? The Blueprint is silent, and six entity page families depend on the answer.
3. **FU-1 (draft-save cache flush)** — confirm the intended behaviour before it is changed, since it affects how quickly admin edits appear.
4. **The Blueprint's ten open questions Q1–Q8** remain open, including revision retention and site-wide appearance tokens. Note that scheduled publishing was listed as deferred (Q8) yet is already implemented.
5. **Legal-page publication** requires owner/legal sign-off, not engineering — the seven policy pages currently serve `noindex` with a visitor-facing draft banner. Explicitly out of Stage 01 scope and flagged for its own stage.

### H-3 Risks and dependencies for Stage 02

1. `INTERNAL_REVALIDATE_SECRET` must be configured before deployment, or scheduled publishing will publish without flushing the public cache (§F).
2. FU-1 should be fixed with `npm run test:cache` wired in as its harness; it was not executable in this stage.
3. The Blueprint is explicitly **"PLANNING ONLY — awaiting owner approval"** on a baseline four commits behind HEAD. Per this stage's directive it was **not** treated as approved requirements, and Stage 02 should treat it the same way.
4. Any work touching block props must first query stored `PageLayout.draftSections` / `publishedSections`, because wiring a previously-ignored prop will change live pages for anyone who already saved a value.

---

## I. Final Verdict

**STAGE 01: COMPLETE**

The reported vulnerability was independently verified rather than assumed, found still present at HEAD, and corrected along with one additional weakness discovered during verification. The endpoint now fails closed, compares secrets in constant time, restricts revalidation targets, and rejects unauthorized requests before performing any cache work — confirmed over HTTP. Twenty-one behavioral tests guard the behaviour, and a mutation test proves they detect the original defect. Authentication, RBAC and draft-isolation controls were reviewed and are intact. The baseline was re-measured rather than quoted: TypeScript clean, 78 files / 1549 tests passing, no regressions.

No database, deployment or Git operation was performed. HEAD is unchanged, no commit was created, and all pre-existing local work is preserved.

**One owner action carries forward:** configure `INTERNAL_REVALIDATE_SECRET` before deployment.

**Stage 02 has not been started.** Awaiting independent review and explicit authorization.
