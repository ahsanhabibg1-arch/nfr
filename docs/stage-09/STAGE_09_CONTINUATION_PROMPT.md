# Stage 09 — Continuation Prompt

Paste the block below into a fresh Claude Code session in this repository to resume
Stage 09. Everything it needs to know about the current state is in it, or reachable
from the paths it names.

> **One-line version, if you prefer:** *"Read `docs/stage-09/STAGE_09_CONTINUATION_PROMPT.md`
> and continue Stage 09 from where it stopped."*

---

## THE PROMPT

```
Continue Stage 09 of the NFRGuide "Controlled Hybrid Website Builder, CMS & SEO
Remediation" programme. It is PARTIAL, not complete. Do not restart it and do not
redo the parts that are already done.

## Where things stand

All work through Stage 08 plus the completed part of Stage 09 is committed as
`bce3b1c` and `origin/main` points at it. The working tree was clean at that commit.
The owner lifted the programme's original no-commit rule on 2026-11-11 for that one
push; ask before committing again rather than assuming it is now open.

Stage 09 covers SEO Intelligence, legal content architecture, information-page
publishing and structured-data integrity, as Tasks A-L.

### Already done — do not repeat

- Task A (SEO field ownership), B (metadata rendering), C (structured data),
  D (sitemap/indexability), E (InfoPage safeguards), F (SEO content ownership),
  G (affiliate transparency), I (scheduler fix), K (security and privacy).
- Three test suites, all green, 87 tests total:
  - `apps/web/tests/stage09-seo-integrity.test.ts` (49)
  - `apps/web/tests/stage09-ownership-and-privacy.test.ts` (20)
  - `apps/web/tests/stage09-infopage-publication.test.ts` (18)
- Product changes made: the S08-5 scheduler fix in `lib/cms/pageLayoutService.ts`
  (writes use `Prisma.DbNull`, `getDueSchedules` filters `{ not: Prisma.AnyNull }`);
  InfoPage safeguards in `lib/cms/infoPageService.ts`; `faqPageJsonLd` in `lib/seo.tsx`
  now drops incomplete question/answer pairs.
- `docs/stage-02/STAGE_02_DECISION_REGISTER.md` records D-05, D-06, D-07 and D-12 as
  APPROVED WITH LIMITATIONS.

Read those three test files first. Each finding is pinned by a test with the reasoning
in a comment, so the suites are the authoritative record of what the audit established.

### What is left

1. **Task H** — SEO Admin UX audit, and any improvement that is genuinely in scope.
2. **Task J** — re-verify that none of the 12 Stage 08 publishing guarantees regressed.
   Stage 09 edited `pageLayoutService.ts`, so this needs actually running, not assuming.
3. **Task L** — the behavioural/browser test areas and the controlled mutation tests.
   The exact enumerated list is in the original Stage 09 directive, section 13; if you
   do not have it, ask me to paste sections 12-19 again rather than inventing the list.
4. **Section 16** — the full regression gate: complete Vitest run, `tsc --noEmit`,
   production build, Chromium/Playwright, the route harness, the cache harness, and the
   mutation tests.
5. **Section 17** — three owner decision packages:
   - **Package 1 (D-09 / schema change S-1)**: exact Prisma diff and SQL, backfill plan,
     rollback plan, cache-invalidation map, tests, risk assessment. D-09 and S-1 are NOT
     approved. Do not create or apply the migration.
   - **Package 2 (D-13, legal content)**: the seven-page inventory plus an approval
     matrix. Must include the two findings below.
   - **Package 3 (D-14, publisher identity / sitewide JSON-LD)**: inventory of what is
     already claimed plus proposed markup using verified fields only.
6. **Section 18** — all five deliverables in `docs/stage-09/`, none of which exists yet:
   `STAGE_09_COMPLETION_REPORT.md`,
   `STAGE_09_SEO_AND_STRUCTURED_DATA_ARCHITECTURE.md`,
   `STAGE_09_LEGAL_AND_INFO_PAGE_DECISIONS.md`,
   `STAGE_09_TEST_AND_MUTATION_REPORT.md`,
   `STAGE_09_HANDOVER.md`.

### Start here

The last full `npx vitest run` exited with code 4 and produced no output, and was never
diagnosed. Every suite passed individually and `tsc` was clean, so it may just have been
the working-directory change. Reproduce and diagnose it before trusting any gate result.

Run DB-backed suites with `APP_ENV=test`; `TEST_DATABASE_URL` is already in
`apps/web/.env` and `vitest.config.ts` loads it. Do not run DB-writing Vitest and
Playwright at the same time against the same database.

### Findings that must reach the reports, and must NOT be silently fixed

Each is proved from code and pinned by a test. They are owner decisions, not defects to
patch:

1. **D-14 — publisher identity is already being asserted.** `articleJsonLd` and
   `disciplineJsonLd` in `lib/seo.tsx` each embed a hardcoded
   `publisher: { '@type': 'Organization', name: 'NFRGuide', url: SITE_URL }`. It is not
   read from `SiteConfig`, not owner-verified, duplicated across two builders, and has no
   `logo`. What genuinely does not exist is sitewide `Organization`/`WebSite` markup. An
   earlier pass of this audit wrongly reported that no Organization markup existed
   anywhere; the correction must appear in the report, not be quietly dropped.
2. **D-13 — the Privacy Policy contradicts the product.** `config/legalPages.ts` states
   "NFRGuide does not ask readers to create accounts and does not set advertising or
   analytics cookies" while `/register/`, `/login/` and `/account/` are live and behind no
   feature flag, and `ArticleComment` stores reader-authored text. The cookie half appears
   accurate; the account claim is false, and the reader session cookie is disclosed only
   under "Staff accounts". Propose replacement wording marked NOT LEGALLY APPROVED; do not
   publish it.
3. **D-13 — `components/editorial/DisclosureBanner.tsx`** hardcodes a stronger affiliate
   claim than the reviewable database text, asserting participation in named categories
   ("hotel accommodations and verified secondary ticket platforms") regardless of whether
   any partner record exists. Reachable whenever an editor sets the disclosure type to
   affiliate and leaves the note blank.
4. **`ArticleSeo.robots` is rendered but has no editing surface.** It is consumed by
   `lib/seo/articleMeta.ts` and by `lib/seo/sitemapEntries.ts`, where it decides sitemap
   membership, yet `articleService.ts` — the only writer of that table — never sets it, so
   no editor can noindex a single article. Carry it to the Stage 10 readiness register.
5. **`ArticleSeo.structuredDataType` is dead storage**, zero consumers. Wiring it up would
   create a second owner competing with the authoritative `article.articleType`. Dropping
   it is a schema change and therefore needs approval.
6. **The CSP is still report-only**, so it enforces nothing, and
   `script-src 'self' 'unsafe-inline'` would permit inline script even if enforcing.
   A standing limitation, not a Stage 09 regression. Stage 10 readiness register.

### Two Stage 08 documentation corrections to carry forward

- Stage 08 diagnosed S08-5 as "the predicate does not exclude a database NULL". Measured,
  that was wrong: the predicate excluded SQL NULL correctly, and the real cause was the
  write coercing to `JsonNull`. The corrected diagnosis is in the code comments in
  `pageLayoutService.ts` and `tests/stage08-scheduler.test.ts`.
- Stage 08's state-machine table wrongly claimed that T5 `schedulePublish` and T6
  `cancelSchedule` increment `version`. They do not. Only six functions do: `saveDraft`,
  `publishLayout`, `resetDraftToPublished`, `restoreDefaults`, `executeScheduledPublish`
  and `restoreRevision`. This was recorded rather than changed, because changing it would
  need editor-side token updates to avoid self-conflicts.

### Also outstanding, deliberately deferred

The D-06 tab rename ("Homepage Intro Banner") and the D-05 footer-ownership migration are
authorized Stage 08 work that Stage 09's scope rules explicitly excluded. Record them in
the Stage 10 readiness register; do not implement them in Stage 09.

A Next dev server was found on port 3000 using the DEVELOPMENT database (PID 8624,
started 2026-11-11). It was not killed. Record it as a preflight discrepancy; use port
3100 and the isolated test database.

### Safety rules still in force

Do not: access the production database; modify the development database; create or apply
unapproved migrations; use `prisma db push` or `prisma migrate reset`; delete existing
legal content; publish unapproved legal pages; invent publisher identity, organization
relationships, company registration details, addresses, licensing claims, jurisdiction
declarations, refund or privacy commitments, affiliate disclosures, cookie-consent claims
or contact details; enable unapproved indexing; remove revision history; reintroduce the
newsletter signup; change Structured CMS ownership; replace the SEO Intelligence system;
create a second page renderer; introduce autosave; weaken security headers or the
environment isolation guard; expose credentials in reports; deploy; merge, reset or switch
branches; discard uncommitted work; or start Stage 10.

Do not claim NFRGuide is an official NFR or PRCA website, or claim affiliation with an
organizer, broadcaster or ticket provider, without verified authorization. Draft legal
content may be prepared for review but must be marked NOT LEGALLY APPROVED.

Preserve all Stage 01-08 work. Do not modify `lib/cms/slotSelection.ts`.

### How to finish

Per section 19: label Stage 09 COMPLETE, PARTIAL — OWNER DECISION REQUIRED, or BLOCKED.
Do not label it COMPLETE merely because the tests pass. Do not invent approvals. Do not
hide unresolved decisions in a footnote. On current evidence it ends as PARTIAL, because
D-09/S-1, D-13 and D-14 are all unresolved and three of them block work the directive
asks for.
```

---

## Why this file exists

Stage 09 was interrupted mid-flight by a machine shutdown on 2026-11-11, with the audit
work done but none of the five deliverables written. This prompt carries the state that
would otherwise have lived only in the session transcript: what was finished, what the
audit proved, which two earlier claims turned out to be wrong, and which findings are
owner decisions rather than defects awaiting a patch.
