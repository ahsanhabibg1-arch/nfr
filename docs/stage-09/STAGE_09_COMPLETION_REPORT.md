# Stage 09 — Completion Report

**Final status: PARTIAL — OWNER DECISION REQUIRED.**
Authorized engineering is complete and verified; three mandatory approval gates
(D-09/S-1, D-13, D-14) are unresolved, and one pre-existing accessibility failure is open.

| | |
|---|---|
| Branch | `main` |
| Checkpoint | `f24af32594e353319987353b184d6eb3733b7206` (= `origin/main` at start; tree clean) |
| Continuation changes | **uncommitted** working-tree changes (listed in §3); no commit, push, merge, rebase, reset, stash or branch switch |
| Companion documents | `STAGE_09_SEO_AND_STRUCTURED_DATA_ARCHITECTURE.md`, `STAGE_09_LEGAL_AND_INFO_PAGE_DECISIONS.md` (Packages 1–3), `STAGE_09_TEST_AND_MUTATION_REPORT.md`, `STAGE_09_HANDOVER.md` |

## 1. Requirement-by-requirement matrix

Statuses: COMPLETE (verified in code and by tests run this session) · PARTIAL · FAILING ·
BLOCKED (needs owner approval) · NEEDS REVERIFICATION.

| # | Workstream / requirement | Status | Evidence / reason |
|---|---|---|---|
| 1 | SEO Intelligence single ownership | COMPLETE | `stage09-seo-integrity` Task A; no Builder SEO keys; one builder/normalizer/robots/sitemap |
| 2 | Metadata persistence and public rendering | COMPLETE | Route `generateMetadata` tests; one canonical + one robots; drafts never reach metadata |
| 2a | `ArticleSeo.robots` editing surface | **PARTIAL** (by decision) | Read side honoured; editor now **shows** stored directive and public status truthfully; no write control (new editorial capability → Stage 10) |
| 2b | Stored SEO title/description indistinguishable from fallback | PARTIAL (recorded) | Fallback applied at write time (`articleService`); rendering correct, reporting misleading; Stage 10 |
| 3 | Canonical and robots directives | COMPLETE | Same normalizer on save, render, sitemap, audit; filtered views noindex; M19 |
| 4 | Open Graph / Twitter | COMPLETE | Derived from the same title/description/canonical; no invented handles |
| 4a | `ogImage` URL validation | PARTIAL (low) | Length-bounded only; not an injection vector; Stage 10 |
| 5 | Structured data integrity | COMPLETE | **Fixed this session:** venue/competitor `url` absolute; no empty `PostalAddress`. M11–M14 |
| 5a | Sitewide Organization/WebSite, publisher logo | **BLOCKED — D-14** | Package 3 |
| 5b | Nested hardcoded `publisher` in article/discipline JSON-LD | **BLOCKED — D-14** | Pre-existing claim; not changed; Package 3 |
| 6 | Sitemap and robots.txt eligibility | COMPLETE | Only published/indexable/self-canonical; fixtures excluded in production; **fixed this session:** sitemap revalidated on InfoPage publish/unpublish and entity-SEO save (M20, M21) |
| 7 | InfoPage draft/publication safety (policy-independent) | COMPLETE | Service safeguards (earlier) + **admin UI honesty this session** (M06, M18) |
| 7a | Separate draft/published InfoPage content | **BLOCKED — D-09/S-1** | Package 1 (schema, SQL, backfill, rollback, tests) — not created or applied |
| 8 | Legal content architecture and affiliate transparency | PARTIAL → **BLOCKED — D-13** | rel policy correct; seven pages pending; Privacy contradiction and banner over-claim **not edited** (Package 2) |
| 9 | SEO Admin UX (Task H) | COMPLETE | Fake robots status removed; canonical/title/image previews use the public functions; labels associated; server bounds enforced client-side; effective-canonical preview; honest save/unpublish/error feedback |
| 10 | Scheduler JSON-null handling | COMPLETE | `scheduledSections Json?`; writes `Prisma.DbNull`, reads `{ not: Prisma.AnyNull }`; `stage08-scheduler` green; M01–M03; stale tests corrected |
| 11 | 12 Stage 08 publishing guarantees | COMPLETE | All re-run green; mapping in test report §7; M04 gap closed |
| 12 | Security, privacy, RBAC, draft/public isolation | COMPLETE (engineering) | Headers/CSP/frame directives unchanged; `system.config` on every InfoPage transition; sanitizer on write (M07); JSON-LD escaping (M14); revalidation secret fails closed (`stage08-cache-scope`); no credentials in artefacts |
| 12a | CSP enforcement | PARTIAL (standing) | Report-only; `'unsafe-inline'`; Stage 10 |
| 12b | Privacy claims match product | **BLOCKED — D-13** | Package 2 §2.2 |
| 13 | Behavioural tests | COMPLETE | 30 new Vitest tests (rendered/computed/DB/action-level) |
| 14 | Browser tests | **PARTIAL** | 117/119 full suite + 5/5 new Stage 09 spec; **a11y homepage h1→h3 failing (pre-existing)**; one Builder width flake |
| 15 | Mutation testing | COMPLETE | 21/21 killed |
| 16 | Full regression gate | PARTIAL | tsc, Vitest 2560/2560, build, routes 37/37, cache 10/10 green; Chromium has the pre-existing a11y failure |
| 17 | Documentation and approval packages | COMPLETE | Five deliverables + Packages 1–3 |

## 2. Findings D-13, D-14 and the robots gap — re-verified, not assumed

- **D-14 publisher identity:** still true. `articleJsonLd` and `disciplineJsonLd` each
  hardcode `publisher: { '@type': 'Organization', name: 'NFRGuide', url: SITE_URL }`, no
  logo, not from `SiteIdentity`. Correction carried: an earlier pass wrongly said no
  Organization markup existed.
- **D-13 privacy:** still true, and extended. Registration additionally requires ticking
  acceptance of the draft Terms and the Privacy Policy that says accounts do not exist, and
  there is no self-service account deletion.
- **D-13 affiliate banner:** still true; text unchanged, pending approval of the proposed
  hedged fallback.
- **`ArticleSeo.robots`:** still has no writer; now displayed truthfully.

## 3. Changed during this continuation (uncommitted)

Product code:

| File | Change |
|---|---|
| `apps/web/lib/seo.tsx` | `brandedTitle()` extracted and exported (used by `buildMetadata` and the admin preview); `DEFAULT_OG_IMAGE` exported; venue/competitor JSON-LD `url` absolute; Event omits empty `PostalAddress` |
| `apps/web/components/admin/editor/SearchAppearancePreview.tsx` | Real robots directive + public status (`describeArticleIndexing`); shared canonical, brand title, OG image, description fallback |
| `apps/web/views/admin/AdminArticleEditorShell.tsx` | Passes stored robots and workflow status to the preview; two canonical host literals → `productionCanonicalUrl` |
| `apps/web/views/admin/AdminLandingSeoPage.tsx` | Associated labels; `maxLength` = server bounds; `effectiveLandingCanonical` preview with invalid warning; honest save message |
| `apps/web/views/admin/AdminInfoPagesPage.tsx` | Disabled-Edit explanation; unpublish confirmation with real effect; approval-reset warning/message; error vs success styling with `role`; associated labels |
| `apps/web/app/admin/info-page-actions.ts` | publish/unpublish also revalidate `/sitemap.xml` |
| `apps/web/app/admin/landing-seo-actions.ts` | entity-SEO mutations also revalidate `/sitemap.xml` |

Tests and docs: see the test report §6; five files in `docs/stage-09/`.

Environment (not code): the 2 committed Stage 08 migrations applied to the **isolated test
database only**, with owner approval; Prisma client regenerated.

## 4. Previously completed and re-verified (not repeated)

Tasks A–G, I, K from the earlier Stage 09 pass, re-run in the full suite: SEO field
ownership, metadata rendering, structured data rules, sitemap/indexability, InfoPage
service safeguards, content ownership, affiliate rel policy, the S08-5 scheduler fix and
the security/privacy review. All green. The earlier "87 tests, all green" was accurate per
suite; the **full** run was not green (9 failures, now resolved — test report §2).

## 5. Still outstanding

| Item | Reason |
|---|---|
| D-09 / S-1 InfoPage draft/published separation | Owner approval (schema change) |
| D-13 seven legal pages, privacy wording, affiliate fallback, deletion/retention commitment | Owner + legal approval; facts missing |
| D-14 publisher identity, logo, sitewide JSON-LD | Owner verification |
| D-10 `structuredDataType` drop | Schema change approval |
| a11y homepage heading jump (h1→h3) | Pre-existing; outside Stage 09 scope; Stage 10 |
| Builder device-width e2e flake | Timing; Stage 10 hardening |
| `ArticleSeo.robots` editor control; `ogImage` URL check; CSP enforcement | Stage 10 register |
| D-06 tab rename, D-05 footer ownership migration | Authorized Stage 08 work deliberately excluded from Stage 09 |
| Development database lacks the 2 Stage 08 migrations | Not applied (dev DB is off limits); owner to run `migrate deploy` on dev when ready |
| Node v24 vs `engines` `<23` | Toolchain mismatch on this machine |

## 6. Safety confirmation

- Production database: never contacted.
- Development database: not modified. One read-only `prisma migrate status` against it
  (accidental; reads the migrations table only).
- Migrations: none created. Two existing committed migrations applied to the isolated test
  DB only, with explicit owner approval.
- No `prisma db push`, no `migrate reset`, no deploy, no legal text changed or published,
  no publisher identity invented, no production scheduling activated.
- No secrets in any artefact (`stage09-ownership-and-privacy` credential scan covers the
  Stage 09 tests, e2e spec and these docs).
- Git: no commit, push, merge, rebase, reset, clean, stash, branch switch or deletion.

## 7. Final status

**PARTIAL — OWNER DECISION REQUIRED.** Tests being green does not make Stage 09
complete: D-09/S-1, D-13 and D-14 are mandatory gates that only the owner can close.
