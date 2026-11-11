# NFRGuide — Final Pre-Deployment Handover

**Date:** 2026-11-11 · **Branch:** `main` · **HEAD:** `f24af32594e353319987353b184d6eb3733b7206`
**Status: B — READY FOR STAGING DEPLOYMENT REVIEW — OWNER DECISIONS REQUIRED.**

Engineering in scope is complete and verified on the runtime Render pins. Nothing was
committed, pushed or deployed, and no cloud infrastructure or production database was
touched. This is **not** an authorisation to deploy, and passing local tests does not make
the project production-ready.

The next task after this handover is **deployment preparation** — not another audit and not
feature development.

Read with: `NFRGUIDE_OWNER_DECISIONS_REQUIRED.md` (the eight decisions),
`NFRGUIDE_FINAL_BLOCKER_REGISTER.md` (reconciled blockers),
`NFRGUIDE_RENDER_FREE_DEPLOYMENT_READINESS.md` (deployment detail),
`NFRGUIDE_FULL_PROJECT_AUDIT.md` (architecture and method).

---

## 1. Working-tree inventory

| | |
|---|---|
| Branch / HEAD | `main` / `f24af32`, level with `origin/main` (0 ahead, 0 behind) |
| Modified | **21** files · **Untracked** 16 · **Staged** 0 · **Deleted** 0 · **Stashes** 0 |
| Diff size | 509 insertions, 98 deletions |
| Commits created | **none** |

**File-count reconciliation.** Earlier reports quoted "13 modified + 10 untracked" and later
"18 modified + 14 new". Both were accurate at their own moment, and nothing was lost:

| Point in time | Modified | Untracked | What changed |
|---|---|---|---|
| Start of the full-project audit | 13 | 10 | Stage 09 continuation work only |
| End of that audit | 18 | 14 | +5 modified (`ArticleBody`, `ContentEmptyState`, `TableOfContents`, `CategoryArchiveView`, `e2e/a11y.spec.ts`), +4 new (`audit-heading-hierarchy.test.ts` + 3 audit docs) |
| End of this execution | **21** | **16** | +3 modified (`app/not-found.tsx`, `components/ImageWithCredit.tsx`, `e2e/stage06-visual-builder.spec.ts`), +2 new (`audit-image-fallback.test.ts`, `NFRGUIDE_OWNER_DECISIONS_REQUIRED.md`) — this file makes 17 once written |

Modified (21): `app/admin/info-page-actions.ts`, `app/admin/landing-seo-actions.ts`,
`app/not-found.tsx`, `components/ImageWithCredit.tsx`,
`components/admin/editor/SearchAppearancePreview.tsx`, `components/editorial/ArticleBody.tsx`,
`components/editorial/ContentEmptyState.tsx`, `components/editorial/TableOfContents.tsx`,
`components/sections/EditorialHero.tsx`, `e2e/a11y.spec.ts`,
`e2e/stage06-visual-builder.spec.ts`, `lib/seo.tsx`, `tests/batch-c-revisions.test.ts`,
`tests/batch-d-scheduling.test.ts`, `tests/stage08-hero-links.test.ts`,
`tests/stage09-seo-integrity.test.ts`, `views/CategoryArchiveView.tsx`,
`views/admin/AdminArticleEditorShell.tsx`, `views/admin/AdminInfoPagesPage.tsx`,
`views/admin/AdminLandingSeoPage.tsx`, `render.yaml`.

Untracked (16): 6 test/spec files, 6 `docs/stage-09/*.md`, 4–5 `docs/audits/*.md`.

---

## 2. Changes made in this execution

| ID | Change | Files | Coverage |
|---|---|---|---|
| **A-08** | A missing hero image rendered an `<img>` with **no `src`** (a permanently broken image). Fixed at the one shared seam every card, feed, related-articles and coverage block already uses: a blank `src` now takes the same path as a failed load and reuses the component's existing "Image unavailable" panel. The two raw `<img>` tags in the hero were guarded; the other five raw image sites were already guarded. No placeholder artwork invented, real alt text kept | `components/ImageWithCredit.tsx`, `components/sections/EditorialHero.tsx` | 9 tests (`tests/audit-image-fallback.test.ts`); live: **6 broken images → 0** |
| **A-09** | The global 404 inherited the homepage title, so a missing page announced itself as the publication's front page. Now has its own title, description and `noindex, follow` | `app/not-found.tsx` | live: `title=Page not found — NFRGuide` |
| **D-A6** | Flaky Builder viewport test: `boundingBox()` was read mid-CSS-transition. Now waits in-browser, sampling on animation frames, until the width is unchanged for three consecutive frames. No sleep, no weakened assertion, not skipped | `e2e/stage06-visual-builder.spec.ts` | **125/125 Chromium, 0 flaky** |
| **D-A7** | Runtime mismatch resolved: the entire final regression ran on **Node 22.23.4**, the version `render.yaml` pins and `engines` requires. The declared `engines` range was not altered | — | see §4 |
| — | Reconciled every prior blocker against the source; corrected two of this audit's own findings (§3) | `docs/audits/*` | — |

Earlier in the same session, kept and re-verified here: the heading-hierarchy fixes across
five components (A-01/A-02), the `INTERNAL_REVALIDATE_SECRET` declaration in `render.yaml`
(A-03), the dev-database migration (A-04), and the Stage 09 SEO-admin, scheduler and
sitemap-revalidation work.

---

## 3. Corrections to earlier findings

Browser verification overturned two findings that plain HTTP had produced. Both were
artifacts of measuring the **pre-hydration shell**: `notFound()` and `redirect()` finish on
the client when the streamed shell has already been flushed.

- **The discipline not-found page was never broken.** It returns **HTTP 404** and renders
  `h1` "Arena Route Not Found", title "Discipline Not Found — NFRGuide".
- **`/account/` does deliver the visitor to `/login/`** (final URL `/login/`, `h1` "Sign in").
  Only the first document's status is 200 instead of 3xx. No account data is exposed and the
  route is `noindex`, so it is **accepted and documented** (D-A4) rather than restructured: a
  clean 3xx needs auth moved into `middleware.ts`, which today only sets headers — a new
  gating mechanism, i.e. the architecture change this scope forbids.

---

## 4. Test results — all executed, Node 22.23.4

Driven with `fnm exec --using=22.23.4`. (`fnm exec` cannot resolve Windows' `npx` shim, so
package binaries are invoked through `node` directly.)

| Check | Command | Result |
|---|---|---|
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` | **PASS** (exit 0) |
| Vitest (unit + integration + PostgreSQL) | `node node_modules/vitest/vitest.mjs run` | **PASS — 118 files, 2580 tests, 0 failed, 0 skipped** |
| Production build | `node node_modules/next/dist/bin/next build` | **PASS** |
| Route smoke | `scripts/route-smoke.mts` | **PASS — 37/37** |
| Cache invalidation | `scripts/cache-invalidation.mts` | **PASS — 10/10** |
| Playwright / Chromium | `node node_modules/@playwright/test/cli.js test` | **PASS — 125/125, 0 failed, 0 flaky** |
| Accessibility | `a11y.spec.ts`, 24 tests inside the Chromium run | **PASS** |
| Migration replay | `scripts/migration-replay.mts` | **PASS — 8/8** on a fresh disposable database, then dropped |
| Public HTTP audit | 68 URLs / 62 HTML pages | heading jumps **0** · broken links **0/67** · invalid JSON-LD **0** · images without `alt` **0** |
| Responsive + console | 11 templates × 3 viewports | **no findings** |
| **ESLint** | — | **NOT CONFIGURED / NOT RUN.** No config, no dependency, no `lint` script. A dependency was **not** added to claim a pass |
| Mutation testing | 21 mutants, Stage 09 tooling | **PASS — 21 killed** (run earlier on Node 24; it mutates source, not runtime behaviour) |

**Nothing was skipped, suppressed or weakened. No failing test remains.**

---

## 5. Current state of the system

**Local development:** running at **http://localhost:3000** (`npm run dev`, Node 22.23.4)
against `localhost:5433/nfrguide_dev` with real content. `/api/health/` 200,
`/api/ready/` 200 `{database: ok, environment: ok}`, homepage renders the real lead article,
`/admin/` correctly 307s to login. Admin at `/admin/login/`.

**Production build:** verified locally on the isolated test database — build succeeds, server
starts, both probes 200, all security headers present, `robots.txt` and `/sitemap.xml` 200.

**Database:** local dev and test databases hold all **19** migrations, and all 19 replay
cleanly onto a brand-new database with full-text search intact. The two previously pending
migrations were applied **to the development database only**, with the owner's approval,
behind a guard that aborts on any non-local host. **No remote migration was run.**

**Security:** no unsafe raw SQL variants; bcrypt cost 12; session cookie `httpOnly` +
`secure` in production + `sameSite=lax`, storing only a hash; rate limiting present; all
security headers served; no secrets in `render.yaml`; `.env` git-ignored; `DATABASE_URL`
redacted in logs. **Limitation:** CSP is **report-only** — the homepage alone emits 9
framework-generated inline scripts, so enforcement needs a nonce pipeline and is not a
minimal pre-deployment change (SEC-01).

**Legal / privacy:** all seven legal pages are unapproved, `noindex` and sitemap-excluded.
The Privacy Policy still contradicts the live reader-account feature; proposed wording is
drafted and marked **NOT LEGALLY APPROVED**. Nothing was published or fabricated (OD-2, OD-4).

**SEO:** unique titles, descriptions present, canonical consistency, no sitemap/robots
contradiction, valid JSON-LD matching page type, staging `noindex` enforced by middleware
when `STAGING_NOINDEX=true`. Publisher identity remains unverified (OD-5).

**Render configuration:** `render.yaml` is complete for staging, including the
`INTERNAL_REVALIDATE_SECRET` declaration added during this work. **R2 is configured but
unverified** — every local run used the `local` provider, so an upload round-trip must be
smoke-tested after the first deploy. **Scheduled publishing is not reliable on Render Free**:
the scheduler runs in-process and the instance sleeps after ~15 minutes idle, with no
catch-up worker (OD-7).

---

## 6. Owner decisions required

Eight, with tick-boxes and draft wording, in `NFRGUIDE_OWNER_DECISIONS_REQUIRED.md`:

| ID | Decision | Blocks staging? |
|---|---|---|
| OD-1 | Authorise the commit + push to `main` | **Yes** |
| OD-2 | Privacy wording, reader-data retention/deletion, controller identity, contact channel, and the staging risk call | **Yes** (OD-2.5 is the risk call) |
| OD-3 | D-09 / S-1 information-page schema change (exact SQL supplied) | No |
| OD-4 | Affiliate disclosure wording | No |
| OD-5 | Publisher identity + sitewide `Organization`/`WebSite` markup | No |
| OD-6 | Autosave: amend ADM-03 (recommended) or commission autosave | No |
| OD-7 | Scheduled publishing host on Free | No |
| OD-8 | Per-article noindex control policy; dead `structuredDataType` column | No |

---

## 7. Deliberately excluded from this execution

At the owner's explicit instruction, **no infrastructure preparation was performed**: no
Aiven, Cloudflare R2, Render or DNS resource was created, modified or contacted; no
credentials were rotated, requested or exposed; no remote migration was run; nothing was
deployed. Also untouched: Stage 10 feature development, the D-05 footer-ownership migration
and the D-06 tab rename (both recorded as deferred scope), and any unapproved schema change.

---

## 8. Next deployment operation

1. **OD-1** — authorise the commit + push to `main` (nothing reaches Render until
   `origin/main` carries this work).
2. **OD-2.5** — make the privacy risk call before any staging URL is shared.
3. Rotate the Admin / Aiven / R2 credentials (Batch 23 §5 P0).
4. Create the Aiven **staging** database + least-privilege runtime role, plus a separate DDL
   role; **enable backups before migrating**.
5. `DATABASE_URL=<staging> prisma migrate deploy` — confirm the target first; expect **19**
   migrations. Optionally seed and `bootstrap:admin`.
6. Create the Render service from `render.yaml`; set every `sync: false` variable in the
   dashboard **including `INTERNAL_REVALIDATE_SECRET`**; point `NEXT_PUBLIC_SITE_URL` at the
   staging https URL.
7. Trigger the first deploy manually (`autoDeploy: false`); watch the build and
   `/api/health/`.
8. Post-deploy smoke: homepage, five sections, both directories, an article, admin login,
   `/api/ready/`, security headers, **an R2 upload round-trip** (unverified locally), and a
   concurrent-edit conflict.
9. Confirm `X-Robots-Tag: noindex, nofollow` on staging HTML before sharing the URL.
10. Tell editors that scheduled publishing is **best-effort** on Free until OD-7 is settled.

---

## 9. Final status

**B — READY FOR STAGING DEPLOYMENT REVIEW — OWNER DECISIONS REQUIRED.**

Not status A, because two decisions (OD-1 authorisation and the OD-2.5 privacy risk call)
must be answered before staging can proceed, and they are the owner's to make. Not status C:
no engineering, security, data-integrity or regression blocker remains — every gate passes on
the Render-pinned runtime, and every engineering-owned defect found across this programme's
audits is either fixed with regression coverage or recorded with a measured reason for
remaining open.
