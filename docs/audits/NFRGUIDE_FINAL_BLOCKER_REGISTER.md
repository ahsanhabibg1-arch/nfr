# NFRGuide — Final Blocker Register

**Date:** 2026-11-11 · **Branch:** `main` · **HEAD:** `f24af32`
**Reconciled after the final pre-deployment execution** — every item below was re-checked
against the source, not carried over from an earlier report. Owner-only items are
consolidated with tick-boxes in `NFRGUIDE_OWNER_DECISIONS_REQUIRED.md`; the single
consolidated handover is `NFRGUIDE_FINAL_PRE_DEPLOYMENT_HANDOVER.md`.
Companions: `NFRGUIDE_FULL_PROJECT_AUDIT.md`, `NFRGUIDE_RENDER_FREE_DEPLOYMENT_READINESS.md`,
`docs/stage-09/STAGE_09_FINAL_COMPLETION_REPORT.md`.

### What changed in the final execution

| Item | Previous state | Reconciled state |
|---|---|---|
| **D-A3** image fallback | open, "11 components, risky refactor" | **RESOLVED** — there was one shared seam (`ImageWithCredit`), not 11 call sites |
| **D-A5** not-found headings | open, "no `h1`" | **PARTLY FALSE, remainder RESOLVED** — browser-verified: the discipline 404 does render an `h1` and returns 404. Only the global 404's inherited title was real, and it is fixed |
| **D-A4** `/account/` | open, "no `h1`, returns 200" | **RECLASSIFIED, accepted** — browser-verified: the user is actually delivered to `/login/`. Only the first document's status is 200 (streamed headers). No data exposed, page is noindex |
| **D-A6** flaky Builder test | open | **RESOLVED** — waits for a settled width, sampling on animation frames |
| **D-A7** Node mismatch | open | **RESOLVED** — final regression executed on Node 22.23.4, the version Render pins |
| **SEC-01** CSP | open | **still open, now quantified** — 9 framework-generated inline scripts on the homepage alone |
| **D-A8**, **D-10**, **D-09/S-1**, **D-13**, **D-14**, **D-A1**, **D-12** | open | **still open — owner-dependent**, each with a concrete proposal |
| **DEP-02/03/04** | open | **still open — infrastructure, explicitly excluded from this execution by the owner** |

**Severity:** P0 critical security / data-integrity / deployment blocker · P1 major
functionality · P2 important UI, accessibility, SEO or performance · P3 minor.
**Responsibility:** OWNER (a decision or fact only the owner can supply) or ENGINEERING.

---

## 1. Open blockers

| ID | Description | Sev | Affected | Root cause | Required action | Resp. | Stage |
|---|---|---|---|---|---|---|---|
| **DEP-01** | All Stage 09 + audit work is uncommitted; `origin/main` is still `f24af32` while the blueprint deploys `branch: main` | **P0** | repo, `render.yaml` | The programme's no-commit rule was lifted only for the earlier `bce3b1c` push | Authorise a commit + push to `main`; without it a deploy ships none of this work | OWNER | 09 |
| **DEP-03** | Previously exposed Admin / Aiven / R2 credentials not yet rotated (Batch 23 §5 P0) | **P0** | Aiven, R2, admin account | Historic exposure recorded in Batch 23 | Rotate all three, then set them in the Render dashboard | OWNER | 09 |
| **DEP-05** | Privacy Policy states readers are not asked to create accounts, while `/register/`, `/login/`, `/account/` are live and `ArticleComment` stores reader text | **P0** | `config/legalPages.ts`, `app/(public)/register/` | Policy text written before reader accounts shipped | Decide: accept on a noindex staging URL, resolve D-13 first, or gate the reader routes (product change). Proposed wording is drafted, marked NOT LEGALLY APPROVED | OWNER | 09 |
| **DEP-02** | Aiven staging database does not exist; 19 migrations are owner-run and not in the Render build | **P1** | deployment | Deliberate approval gate | Create the DB + least-privilege role, enable backups, then `prisma migrate deploy` with the target confirmed | OWNER | 09 |
| **DEP-04** | No Render / Aiven / R2 resource exists; deployment is owner-executed | **P1** | deployment | Approval gate; no credentials held by the engineer | Execute checklist steps 1–11 | OWNER | 09 |
| **D-09 / S-1** | A published information page cannot be edited in place; the only path (`unpublish`) removes it from the public site. `InfoPage` has one `body`/`status`, so no draft can exist beside a published version | **P1** | `prisma/schema.prisma`, `lib/cms/infoPageService.ts` | Single-copy schema; separation needs a migration | Approve the schema + exact SQL in `STAGE_09_LEGAL_AND_INFO_PAGE_DECISIONS.md` §1.3–1.4, or amend. **Cannot be implemented without approval** (unapproved migration) | OWNER | 09 |
| **D-13** | Seven legal pages unapproved (0 of 7); privacy contradiction (DEP-05); affiliate banner hardcodes "participates in select affiliate programs…" unsupported by any partner record; no self-service account deletion | **P1** | `config/legalPages.ts`, `components/editorial/DisclosureBanner.tsx` | Policy and legal facts, not code | Approve wording per page; decide deletion/retention commitment; approve the hedged affiliate fallback. **No technical fix remains — every change here is published wording** | OWNER | 09 |
| **D-14** | Every article and discipline page already asserts `publisher: Organization "NFRGuide"`, hardcoded in two builders, unverified, with no `logo`. No sitewide `Organization`/`WebSite` markup exists | **P2** | `lib/seo.tsx` | Identity facts never confirmed | Confirm/correct the publisher name; supply a logo URL or confirm none; list owned social profiles; approve or decline sitewide markup | OWNER | 09 |
| **D-A1** | **Requirements divergence:** approved acceptance test ADM-03 expects article **autosave**; the implementation deliberately has none, and `e2e/stage08-publishing.spec.ts` asserts none was introduced | **P2** | `views/admin/AdminArticleEditorShell.tsx`, acceptance criteria | Approved criteria and approved implementation disagree | Sign off one side: amend ADM-03, or authorise autosave as new work. Neither side was changed by this audit | OWNER | 10 |
| **D-10** | `ArticleSeo.structuredDataType` is dead storage (zero consumers); wiring it up would create a second owner for the JSON-LD `@type` | P3 | `prisma/schema.prisma` | Column added, never consumed | Approve dropping it (a schema change) or keep it inert | OWNER | 10 |
| **SEC-01** | CSP is served **report-only**, and `script-src` permits inline script, so it enforces nothing | P2 | `next.config.mjs` | Staged rollout never completed. **Measured this execution:** the homepage alone emits **9 inline `<script>` tags** (23 total), all generated by Next for the RSC payload and hydration. Enforcing without a nonce pipeline would break hydration and take the site down | Keep report-only. To enforce: generate a nonce in `middleware.ts`, thread it through every framework inline script, verify in Chromium, then switch the header. **Not attempted** — it cannot be done safely as a minimal pre-deployment change. `/api/csp-report/` already exists to collect violations | ENGINEERING | 10 |
| **D-A4** | `/account/` returns **200** for the first document instead of a 3xx when unauthenticated | P3 | `app/(public)/account/page.tsx` | `redirect()` runs after the streamed shell has been flushed, so Next completes the redirect client-side | **ACCEPTED, documented.** Browser-verified this execution: the visitor genuinely ends on `/login/` (final URL `/login/`, `h1` "Sign in"). No account data is exposed and the route is `noindex`. A clean 3xx needs the auth check moved into `middleware.ts`, which today only sets headers — a new gating mechanism, i.e. an architecture change this scope forbids | OWNER (accept or commission) | 10 |
| **D-05 / D-06** | Authorized Stage 08 work explicitly excluded from Stage 09 scope: the D-06 tab rename ("Homepage Intro Banner") and the D-05 footer-ownership migration | P3 | Builder settings, footer | Deferred by Stage 09 scope rules | Schedule in Stage 10 | ENGINEERING | 10 |
| **D-12** | Scheduled publishing cannot be reliable on Render Free: the scheduler runs in-process and the instance sleeps after ~15 min idle | P2 | `lib/cms/scheduledPublishRunner.ts`, `instrumentation.ts` | Free-tier spin-down + in-process cron | Choose a scheduler host: external cron hitting the service, or a paid always-on instance. Do not promise reliable scheduling until then | OWNER | 10 |
| **D-A8** | `ArticleSeo.robots` decides metadata **and** sitemap membership but has no editor control — no one can noindex a single article through the CMS | P2 | `lib/cms/articleService.ts` | Read side built, write side never attached | Decide the publication policy (who may noindex an article), then add the control | OWNER | 10 |

---

## 2. Resolved during this work (no action required)

| ID | Description | Sev | Fix | Evidence |
|---|---|---|---|---|
| **A-01** | Skipped heading levels on **16 of 62** public pages (WCAG 1.3.1/2.4.6): article table of contents `h3` after `h1`, body callout `h4` between `h2`s, category grid `h3` after `h1`, empty-state `h3` | P2 | Correct levels emitted in 4 components + a screen-reader-only listing heading; no visual change | 8 new unit tests; new category case in `e2e/a11y.spec.ts`; live re-audit shows **heading jumps: 0** |
| **A-02** | Homepage hero: `h1` followed by `h3` secondary stories | P2 | `EditorialHero` emits `h2` | 4 tests in `stage08-hero-links.test.ts`; `a11y.spec.ts › home` now passes |
| **A-03** | `INTERNAL_REVALIDATE_SECRET` missing from `render.yaml` while the scheduler starts on every boot — a scheduled publish would have written to the database and never refreshed the public site | **P1** | Declared `sync: false` in `render.yaml` | Endpoint fails closed by design; mutation tests M20/M21 cover the sitemap revalidation path |
| **A-04** | Development database two migrations behind; every Page Builder page would fail because the code selects a column that did not exist | **P1** | Two **additive** migrations applied to `nfrguide_dev` **with owner approval**, behind a non-local guard | `migrate status`: "Database schema is up to date!" (19/19); dev server renders all main pages with no runtime errors |
| **A-05** | Stage 09: 7 stale assertions pinned the exact code pattern that caused the S08-5 scheduler bug; 2 tests breached the test-naming gate | P2 | Assertions now pin the corrected form and reject a revert; 2 tests marked `[structural]` | Full Vitest 2572/2572 |
| **A-06** | Stage 09: article editor displayed a hardcoded "index, follow (SSL Enforced)" regardless of stored directive or draft status; admin SEO forms had unassociated labels and no canonical preview | P2 | Real directive + public status shown; labels associated; live effective-canonical with pre-save warning | `stage09-continuation.test.ts`, `e2e/stage09-seo-admin.spec.ts` |
| **A-07** | Stage 09: venue/competitor JSON-LD emitted relative `url`; Event emitted an empty `PostalAddress`; publication changes did not revalidate `/sitemap.xml` | P2 | Absolute URLs; address omitted when unknown; sitemap revalidated on publish/unpublish and entity-SEO save | Mutations M11–M13, M20, M21 all killed |
| **D-A3** | An article published without a hero image rendered an `<img>` with **no `src`** — a permanently broken image. Reachable: `heroImage` is `z.string().optional().default('')` | P3 | `components/ImageWithCredit.tsx` (+ 2 raw tags in `EditorialHero`) | The component's "Image unavailable" fallback was reachable only via `onError`, and **a browser fires no error event for an `<img>` with no `src` at all**, so the fallback never ran | **RESOLVED.** The earlier register said "11 components, risky refactor"; re-inspection found a **single shared seam** — every card, feed, related-articles and coverage block already renders through `ImageWithCredit`. A blank `src` now takes the same path as a failed load, reusing the existing panel (no invented artwork, real alt text kept). The two raw hero tags were guarded; the other five raw image sites were **already** guarded. 9 tests in `tests/audit-image-fallback.test.ts` |
| **D-A5** | The global 404 inherited the root layout title, so a missing page announced itself as "NFRGuide — Independent Rodeo Editorial & Championship Coverage" | P3 | `app/not-found.tsx` | No `metadata` export on the not-found route | **RESOLVED** — own title, description and `noindex, follow`. **The other half of this finding was FALSE:** browser verification showed the discipline not-found page returns **HTTP 404** and renders `h1` "Arena Route Not Found" with title "Discipline Not Found — NFRGuide". The earlier `h1=0` reading came from measuring the pre-hydration shell over plain HTTP |
| **D-A6** | Flaky: `stage06-visual-builder › device modes change the canvas viewport width` | P3 | `e2e/stage06-visual-builder.spec.ts` | `boundingBox()` was read as soon as the device label appeared, which could capture a frame mid-CSS-transition — twice reporting the previous width (686) for mobile while the product was correct | **RESOLVED** — the test now waits in-browser, sampling on animation frames, until the width is unchanged for three consecutive frames. No sleep, no assertion weakened, test not skipped |
| **D-A7** | Local toolchain ran Node **24.15.0** while `engines` requires `>=22.23.4 <23` and Render pins 22.23.4 | P3 | local environment | Local Node not aligned | **RESOLVED** — Node 22.23.4 was already installed via fnm and the **entire final regression ran on it**. The declared `engines` range was left untouched. Note: `fnm exec` cannot resolve Windows' `npx` shim, so the package binaries are invoked through `node` directly |

---

## 3. Checked and found correct (no blocker)

Recorded so they are not re-investigated: all seven NFR disciplines present; no broken
internal links (67 checked); no missing titles or descriptions; no duplicate canonicals; no
`noindex` page in the sitemap; all JSON-LD valid; no images missing `alt`; one `<main>` per
page; no horizontal overflow at 1280/768/390 px; no unsafe raw SQL variants; bcrypt cost 12;
session cookie `httpOnly` + `secure` + `sameSite=lax` with only a hash stored; rate limiting
present; security headers all served; no secrets in `render.yaml`; `.env` git-ignored;
`DATABASE_URL` redacted in logs; 19 migrations replay cleanly onto a fresh database with
full-text search intact.

---

## 4. The critical path

```
DEP-03 rotate credentials
        │
DEP-01 authorise commit + push ──► DEP-02 create Aiven staging DB + migrate deploy
        │                                     │
        └──────────────► DEP-04 create Render service, set env (incl. INTERNAL_REVALIDATE_SECRET)
                                              │
                                   DEP-05 decide the D-13 privacy question
                                              │
                                      first deploy + smoke
```

D-09/S-1, D-13 wording, D-14 and D-A1 close **Stage 09** itself; they do not have to be
resolved before a noindex staging deploy, except DEP-05, which is the owner's risk call.

**Single next action:** authorise the commit and push (DEP-01). Nothing else can proceed to
Render until `origin/main` carries this work.
