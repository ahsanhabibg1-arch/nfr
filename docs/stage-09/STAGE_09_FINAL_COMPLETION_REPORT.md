# Stage 09 — Final Completion Report

Prepared 2026-11-11, ~22:40 local (UTC+6). The 22:00 target passed during this session;
nothing below is deferred because of it, but the deployment itself was never reachable
today — see §F and §H for exactly why.

---

## A. Executive status

**PARTIAL — OWNER DECISION REQUIRED. Not deployable today.**

All technically fixable Stage 09 work is complete and verified, including the
accessibility defect that the previous report left open. Stage 09 cannot be closed, and
Render cannot be deployed, for four reasons that are not engineering work:

| Blocker | Kind | Who closes it |
|---|---|---|
| D-09 / S-1 — InfoPage draft/published separation | Schema change, unapproved | Owner |
| D-13 — legal/privacy/affiliate wording (0 of 7 pages approved) | Policy + legal | Owner (+ counsel) |
| D-14 — publisher identity facts | Missing facts | Owner |
| Deploy gate — work is uncommitted; `origin/main` is still `f24af32`; Aiven/Render/R2 resources do not exist; credential rotation (Batch 23 §5 P0) not done | Process + infrastructure | Owner |

Code quality is not the constraint: TypeScript clean, **2564/2564** Vitest, production
build succeeds, **37/37** routes, **10/10** cache, **123/124** Chromium (the one failure is
a load-related flake that passes in isolation, twice).

---

## B. Completed work

### B1. Completed in this final session

| Task | Implementation | Evidence |
|---|---|---|
| **Accessibility defect (homepage heading hierarchy)** | `apps/web/components/sections/EditorialHero.tsx` — secondary story headline `h3` → `h2` (2 markup lines + comment) | 4 new regression tests in `tests/stage08-hero-links.test.ts` (26 passed); `e2e/a11y.spec.ts › home (/)` now **passes** in the full suite; live HTML heading order verified `h1 h2 h2 h2 h3 h4…` with no skipped level |
| **Missing deployment secret declaration** | `render.yaml` — added `INTERNAL_REVALIDATE_SECRET` (`sync: false`, no value committed) | Code requires it at `app/api/internal/revalidate/route.ts:25` and `lib/cms/scheduledPublishRunner.ts:12`; without it the scheduler publishes to the database and **never revalidates the public site** (fails closed, silently) |
| Independent re-verification of all three gates | — | §C; verified against the working tree, not from the previous report |
| Restored a test-regenerated artefact | `docs/batches/batch-25/seo-assistant-panel.png` | Rewritten on every run by `e2e/seo-assistant.spec.ts:45`; 1-byte re-render, restored so the handover diff holds only intentional changes |

### B2. Completed earlier in the continuation (re-verified green here)

| Task | Implementation |
|---|---|
| Task H — SEO admin UX honesty | `SearchAppearancePreview.tsx` (real robots directive + public status, shared canonical/title/image), `AdminArticleEditorShell.tsx`, `AdminLandingSeoPage.tsx` (associated labels, server-matched bounds, live effective-canonical, honest save text), `AdminInfoPagesPage.tsx` (disabled-Edit explanation, unpublish consequence, approval-reset warning, error styling) |
| Task C — structured data | `lib/seo.tsx` — absolute `url` on venue/competitor nodes; no empty `PostalAddress`; `brandedTitle()` extracted |
| Sitemap cache correctness | `app/admin/info-page-actions.ts`, `app/admin/landing-seo-actions.ts` — publication and SEO changes revalidate `/sitemap.xml` |
| Task I / S08-5 scheduler | Verified `Prisma.DbNull` / `Prisma.AnyNull` against `scheduledSections Json?`; 7 stale assertions corrected to pin the fixed form and reject the regression |
| Tasks A–G, K | Re-verified by the full suite |

Full detail: `STAGE_09_COMPLETION_REPORT.md`, `STAGE_09_SEO_AND_STRUCTURED_DATA_ARCHITECTURE.md`,
`STAGE_09_TEST_AND_MUTATION_REPORT.md`.

---

## C. Owner decisions

Each state below was re-verified by direct inspection in this session.

### D-09 / S-1 — **BLOCKED, cannot proceed without approval**
Verified: `prisma/schema.prisma` has no `publishedBody` / `draftBody` / `isPublished`
column; `PUBLISHED_EDIT_REFUSAL` still fires (`lib/cms/infoPageService.ts:81,93`). So a
published legal page still cannot be edited in place, and the only way to edit it is to
unpublish it (removing it from the public site).

Implementation **cannot** proceed safely without approval: it is a Prisma migration, which
your rule §4.5 forbids introducing unapproved. The complete package — schema diff, exact
migration SQL, backfill, state machine, concurrency, revision history, RBAC/audit, cache
map, rollback, 8 tests, risk table — is in `STAGE_09_LEGAL_AND_INFO_PAGE_DECISIONS.md` §1.

**Decision required:** approve (or amend) the S-1 schema in §1.3–1.4, and confirm the
policy *"a published information page may be edited as a draft while the published version
stays live; public text changes only on publish."*

### D-13 — **BLOCKED, policy not technical**
Verified: `config/legalPages.ts` still contains "does not ask readers to create accounts"
while `app/(public)/register/page.tsx` is live; `DisclosureBanner.tsx` still hardcodes
"participates in select affiliate programs…"; **0 of 7** pages have `review: 'approved'`.

Technical vs policy separation — the honest answer is that **there is no remaining
technical fix here**. Every available change is to published wording, i.e. policy. The
technical surroundings are already correct and verified: pending pages render `noindex`,
are excluded from the sitemap, carry a visible draft notice; `/register/` is `noindex`;
reader passwords are hashed and tokens stored hashed, single-use, expiring.

**Decisions required:** (a) the corrected Privacy → Readers wording (draft supplied,
marked NOT LEGALLY APPROVED) plus a deletion/retention commitment — note there is
currently **no self-service account deletion**; (b) the affiliate fallback wording;
(c) approval per page; (d) confirm `system.config` holders are the legal approvers.

### D-14 — **BLOCKED, missing facts**
Verified: 2 hardcoded `'@type': 'Organization'` publisher nodes in `lib/seo.tsx`, and
**0** occurrences of `logo` or `sameAs`. So every article and discipline page already
asserts an unverified publisher identity with no logo, and no sitewide
`Organization`/`WebSite` markup exists.

Remaining technical defect: the claim is duplicated across two builders, so they can
drift. **Deliberately not refactored** — the output would be byte-identical, and a Stage 09
audit test pins the duplication as the evidence for this decision. It is resolved properly
by the single `@id` node proposed in the package.

**Decisions required:** confirm/correct the publisher name already being published; supply
a logo URL or confirm none; list genuinely owned social profiles; approve or decline
sitewide Organization/WebSite markup.

---

## D. Accessibility

**Failing test:** `e2e/a11y.spec.ts:115 › accessibility (automated subset) › home (/)`,
assertion `home: heading level jumps (skipped levels)` → `["h1→h3"]`.

**Root cause — application code, not test configuration or browser environment.** In
`EditorialHero.tsx` the homepage's single `h1` (the lead story headline) was followed
directly by `h3` secondary-story headlines, with no `h2` between: a skipped heading level
(WCAG 1.3.1 / 2.4.6). A screen-reader user navigating by heading was told of a subsection
level that does not exist. Reproduced both in the rendered markup (unit) and against the
running server (Chromium).

**Genuinely pre-existing:** the `h3` is byte-identical at `feb4711`, `fd4fb10` and
`bce3b1c`. It surfaced only now because Stage 08's Chromium gate ran the Stage 06–08 specs
(49 tests) and never executed `a11y.spec.ts`.

**Fix applied:** emit `h2` — the correct level for a story one step below the page
headline, and the level the sibling section headings ("Latest NFR Coverage") already use.
Visual size comes from the Tailwind classes, not the tag, so the homepage is unchanged on
screen. The card link still takes its accessible name from the heading (Stage 08 Task H).

**Not suppressed:** `e2e/a11y-known-issues.json` is still `[]` — no exemption was added,
and no test was skipped or deleted.

**Regression coverage added** (`tests/stage08-hero-links.test.ts`, rendered-HTML
assertions): only one `h1`; no level is skipped; the sequence is exactly `[1,2,2]`; and it
holds for one secondary story and for none.

**Verification:** unit 26/26; `e2e/a11y.spec.ts` passes inside the full suite; isolated
re-run of the a11y + Builder specs 36/36; live homepage heading order
`h1 h2 h2 h2 h3 h4 …` with zero jumps.

---

## E. Regression results

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **exit 0** |
| ESLint | — | **NOT RUN — cannot run.** No ESLint is configured in this project: no `.eslintrc*` / `eslint.config.*`, no `eslint` dependency, and no `lint` script in `apps/web/package.json`. The only config found is inside a transitive dependency in `node_modules`. Running ESLint would mean adding a dependency and a config, which §4.8 forbids. |
| Vitest (unit + integration + PostgreSQL) | `APP_ENV=test npx vitest run` | **116 files, 2564 passed, 0 failed, 0 skipped** |
| Production build | `npx next build` | **exit 0**, compiled successfully |
| Route harness | `scripts/route-smoke.mts` vs :3100 | **37 passed, 0 failed** (re-run after the hero change) |
| Cache harness | `scripts/cache-invalidation.mts` vs :3100 | **10 passed, 0 failed** |
| Chromium, full | `npx playwright test` (124 tests) | **123 passed, 1 failed** |
| Chromium, isolated re-run | a11y + Stage 06 Builder specs | **36 passed, 0 failed** |
| Mutation testing | 21 mutants | **21 killed, 0 survived** |

**The single failure, stated honestly:**
`e2e/stage06-visual-builder.spec.ts:143 › device modes change the canvas viewport width`
— "mobile must be narrower than tablet" (earlier run: "mobile must render at its exact
requested width", 686px vs ≤391px). A canvas-resize timing issue under full-suite load. It
**passes in isolation**, now twice, including immediately after this change. Ruled out as a
consequence of the hero edit: the assertion measures the Builder canvas iframe width, and
the isolated re-run passes with the edit in place. Recorded, not masked, and carried to the
Stage 10 register.

**Nothing skipped.** Zero skipped Vitest tests; DB suites ran against the isolated database
(all 19 migrations present). DB-writing Vitest and Playwright were never run concurrently.

---

## F. Deployment readiness (Render Free)

### Verified working
| Check | Result |
|---|---|
| Production build | Succeeds (`next build`, exit 0) |
| Start command | `npm run start` → `next start`; binds Render's `PORT`; Node runtime (required by `sharp`) |
| Health check | `/api/health/` → 200, no DB work, no secrets — correct for `healthCheckPath` |
| Readiness | `/api/ready/` → 200; bounded read-only `SELECT 1` + env-isolation check; 503 when unready; sanitized failures |
| `npm ci` compatibility | `apps/web/package-lock.json` present (v3); root `package.json` declares **no** workspaces, so `rootDir: apps/web` installs cleanly |
| Node version | `render.yaml` `NODE_VERSION=22.23.4` matches `.nvmrc` |
| Env validation | `lib/env.ts` fails fast in production: https `NEXT_PUBLIC_SITE_URL`, non-localhost `DATABASE_URL`, R2 secrets required when provider is r2 |
| Security headers (live) | X-Frame-Options SAMEORIGIN · HSTS 63072000 + includeSubDomains · nosniff · Referrer-Policy strict-origin-when-cross-origin · Permissions-Policy camera/mic/geo/topics off · CSP **report-only** |
| Public routes / SEO | 37/37 route checks; `/robots.txt` 200; `/sitemap.xml` 200 (8,098 bytes); canonical + robots verified by the Stage 09 suites |
| Secret hygiene | No secret values in `render.yaml` (all `sync: false`); `apps/web/.env` is git-ignored; no credentials in any report |
| Media on ephemeral FS | `MEDIA_STORAGE_PROVIDER=r2` set in the blueprint (local storage would lose uploads on every restart) |
| Staging SEO protection | `STAGING_NOINDEX=true` → `X-Robots-Tag: noindex, nofollow` via `middleware.ts` (absent locally because the flag is unset, as expected) |

### Deployment blockers
1. **The work is uncommitted.** `origin/main` is `f24af32`; the blueprint deploys
   `branch: main` with `autoDeploy: false`. A deploy triggered now would ship **none** of
   today's fixes. Committing and pushing needs your approval — the programme's no-commit
   rule was lifted only for the earlier `bce3b1c` push.
2. **Two migrations are unapplied.** `20261108120000_phase_d_scheduled_publishing` and
   `20261108130000_phase_c_page_layout_revisions` are required by committed code
   (`PageLayoutRevision`, `scheduledSections`). Render deliberately does not migrate during
   build, so the target database needs `prisma migrate deploy` **before** the new code
   serves traffic, or publishing/revisions/scheduling throw at runtime. Remote database
   state was not inspected (production is off limits; no staging database exists yet).
3. **No infrastructure exists.** Batch 23 §1 records that no Render / Aiven / R2 / DNS
   resource has been created or modified, and §5 lists P0 prerequisites still open —
   notably **rotating previously exposed Admin / Aiven / R2 credentials**. Deploying before
   that rotation would be a security regression.
4. **Owner-executed gate.** `docs/batches/batch-23/09_DEPLOYMENT_APPROVAL_CHECKLIST.md`
   requires your explicit approval and your execution of steps 1–8. I hold no Render,
   Aiven or R2 credentials and did not attempt any external operation.
5. **D-13 privacy risk on a public URL.** The Privacy Policy tells readers accounts are not
   offered while registration is live. `STAGING_NOINDEX` keeps it out of search results,
   but the pages are publicly reachable to anyone with the URL. Per your §6 ("do not deploy
   if unresolved decisions create a privacy risk"), this is your call, not mine — options:
   accept for a noindex staging URL, resolve D-13 first, or gate the reader-account routes
   (a product change needing approval).

### Config gap fixed, and a documentation gap found
`INTERNAL_REVALIDATE_SECRET` was missing from `render.yaml` — now declared. Batch 23 §2's
required-variable list is also incomplete for the same reason (it predates the Stage 01
revalidate endpoint); worth correcting when that checklist is next revised.

### Free-tier limitation worth your awareness
The scheduler runs **in-process** (`instrumentation.ts` → `startScheduler`, 60s interval).
Render Free spins the instance down after 15 minutes idle, so a scheduled publish fires
only while the instance happens to be awake. That is inherent to the free tier and is
owner decision **D-12** (scheduler host), still unapproved — not a defect.

---

## G. Git status

- **Branch:** `main`
- **Commit:** `f24af32594e353319987353b184d6eb3733b7206` (unchanged; level with `origin/main`)
- **Commits created:** **none.** No commit, push, merge, rebase, reset, clean, stash, branch switch or deletion.
- **Modified (13):** `apps/web/app/admin/info-page-actions.ts`,
  `apps/web/app/admin/landing-seo-actions.ts`,
  `apps/web/components/admin/editor/SearchAppearancePreview.tsx`,
  `apps/web/components/sections/EditorialHero.tsx`, `apps/web/lib/seo.tsx`,
  `apps/web/tests/batch-c-revisions.test.ts`, `apps/web/tests/batch-d-scheduling.test.ts`,
  `apps/web/tests/stage08-hero-links.test.ts`,
  `apps/web/tests/stage09-seo-integrity.test.ts`,
  `apps/web/views/admin/AdminArticleEditorShell.tsx`,
  `apps/web/views/admin/AdminInfoPagesPage.tsx`,
  `apps/web/views/admin/AdminLandingSeoPage.tsx`, `render.yaml`
- **New (10):** `apps/web/e2e/stage09-seo-admin.spec.ts`,
  `apps/web/tests/stage09-continuation.test.ts`,
  `apps/web/tests/stage09-scheduler-claim-guard.test.ts`,
  `apps/web/tests/stage09-sitemap-revalidation.test.ts`, and six `docs/stage-09/*.md`
  (this report plus the five Stage 09 deliverables)
- **Stashes:** none. **Database:** production never contacted; development database not
  modified; only the isolated `nfrguide_test` database was written, by the test suites.

---

## H. Next action

**One action unblocks everything else: approve committing and pushing the Stage 09 work.**

Nothing can reach Render until `origin/main` carries it, and I will not commit without
your word. On approval I will commit the 23 files as a single Stage 09 continuation commit
and push to `main` (no force, no rebase).

Then, in order, and only by you:

1. Rotate the exposed Admin / Aiven / R2 credentials (Batch 23 §5 P0).
2. Create the Aiven **staging** database + least-privilege role.
3. `DATABASE_URL=<staging> npx prisma migrate deploy` — all 19 migrations, target confirmed first.
4. Create the Render service from `render.yaml`; set every `sync: false` variable in the
   dashboard, **including the newly added `INTERNAL_REVALIDATE_SECRET`**, and set
   `NEXT_PUBLIC_SITE_URL` to the staging https URL.
5. Trigger the deploy (`autoDeploy: false`), then watch the build and `/api/health/`.
6. Post-deploy smoke per checklist step 7.

**Separately, to close Stage 09 itself:** answer D-09/S-1, D-13 and D-14 (§C). Until then
Stage 09 stays PARTIAL. No deployment was attempted and none occurred.
