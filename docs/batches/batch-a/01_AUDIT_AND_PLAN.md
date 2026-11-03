# NFRGuide — Batch A "Truth and Test Reliability": Phase 1 Audit and Plan

**Date:** 2026-11-03
**Mode:** read-only. No project files were changed, nothing was written to any database, and nothing was committed, pushed or deployed. This report lives in the session scratchpad, outside the repository.
**Authority:** Requirements v2.0 and the Gap Audit of 2026-11-03.

**Evidence labels:**
- **[F]** verified fact (command output, or file and line)
- **[I]** inference
- **[U]** unknown; needs more evidence

---

## 1. Executive summary

All seven Batch A workstreams can be done **without schema changes or new infrastructure**. Investigating them confirmed the known issues and surfaced **five additional truthfulness and safety defects**.

**Confirmed issues:**
- **A1:**
  - The Calgary purse figure travels mock data → seed → `RodeoEventEdition.purseBenchmark` → `views/RodeoViews.tsx:197`, and is rendered with no verification field.
  - **New:** re-running `db:seed` overwrites CMS edits and **forces demo articles back to PUBLISHED** (`prisma/seed.ts:245-252`). That would undo any content clean-up.
- **A2:** Schedule is a misleading no-op. It is also **broken as a UI**: the date field appears only *after* the status is already scheduled, so the first click sends no date and is rejected.
- **A3:** the two unrouted mock views are dead code. Additional live problems:
  - **New, live:** the admin notification bell shows **hard-coded fake operational notifications** (SEO audits, sitemap verification, purse reminders) with a permanent unread dot. This conflicts with ADM-23 and §8.1.
  - **New, live:** the editor's "attach existing source" picker lists **mock sources** with invented verification dates and counts, and attaching one writes it into the real `Source` table.
  - **New:** the editor labels a checklist pass rate as "**% Score**" under "SEO Gates".
- **A4:**
  - `NewsArticle` is never emitted, because `lib/seo.tsx:88` compares against `'news'` while the editor stores `'News'` and the seed stores `analysis/feature/guide`.
  - **New:** the discipline JSON-LD headline claims "**Official** NFR Championship Guide".
  - **New (security):** `JsonLd` writes CMS-editable text into a `<script>` tag without escaping `<`.
- **A5:** no test depends on specific demo slugs. They depend only on seed **shape**, so a neutral synthetic seed is feasible. `scripts/route-smoke.mts` does hard-code 4 demo slugs.
- **A6:** CI runs migrations but **never seeds**, while the suites need seeded reference data. There is no check that fails the run when DB tests are skipped, and Node is 22 in CI vs 24 locally.
- **A7:** no browser or accessibility tooling exists. `route-smoke.mts` is GET-only and safe, but it isn't run in CI. **`admin-auth-smoke.mts`, `cache-invalidation.mts` and `media-http-check.mts` write to whatever `DATABASE_URL` resolves to, and default to the dev DB through `.env`.**

**Recommendation: GO**, once the owner answers decisions D1–D8 (§19), especially D5 (adding Playwright dev dependencies) and D7 (resetting the local dev DB).

---

## 2. Verified Git baseline [F]

| Item | Value |
|---|---|
| Branch | `feature/nfr-phase2-foundation-public-fixes` (no upstream) |
| HEAD / `main` / `origin/main` | `4ad0ae4` / `4ad0ae4` / `4ad0ae4` (0 ahead, 0 behind, after `git fetch`) |
| Working tree | 30 files modified or deleted, 16 untracked. Identical to the post-Phase-2 state; no unexpected files |
| `package-lock.json`, `package.json` | No diff against HEAD |
| `prisma/` (schema and migrations) | No diff, no untracked files |
| `.github/` | No diff |

---

## 3. Phase 2 implementation verification [F]

All Phase 2 files and symbols are present:
- `tests/support/testDbGuard.ts`
- `config/legalPages.ts`
- `views/LegalPageView.tsx`
- `lib/cms/relationshipTypes.ts`
- `articleService.ts`: `assertPublishable`, `resolveRelationships`, `syncSlugRedirect`, `claimArticlePath`, `persistArticle`, `SNAPSHOT_VERSION = 2`
- `lib/content.ts`: `resolveArticleRedirect`
- `components/AdSlot.tsx` is deleted

The earlier gap audit re-ran the unit tests, typecheck, validation and build, and all passed. I did not re-run them in this phase, because nothing has changed since (identical Git status).

---

## 4. A1: public content truthfulness

### 4.1 Calgary purse ($2,150,000) — full chain [F]

| Step | Location |
|---|---|
| Origin | `data/mockEditorialData.ts:1069` `purseBenchmark: '$2,150,000 Invitational Total'` (also `:1084` $1,200,000 and `:1099` $650,000) |
| Seed | `prisma/seed.ts:141-145`: `rodeoEventEdition.upsert`, which writes `purseBenchmark` in both `create` **and `update`** |
| Database | `RodeoEventEdition.purseBenchmark` (local dev: all 3 editions have it set; no `startAt`) |
| Mapper | `lib/rodeoContent.ts:165` (`getPublicEditionBySlug`) |
| Render | `views/RodeoViews.tsx:197`, shown as "Purse …" whenever it is non-null; reproduced on `/rodeo-events/calgary-stampede/2026/` |
| Admin entry | `lib/cms/rodeoService.ts:107,117,119`; `views/admin/AdminRodeoCoveragePage.tsx:206` (free-text field, example placeholder "e.g. $11.5M…") |
| Not involved | No hard-coded component, API or fallback |
| JSON-LD | Not included (`rodeoEditionJsonLd` doesn't use the purse, and returns `null` without `startAt`) |

**Recommendation:**
1. Stop rendering `purseBenchmark` publicly (remove `RodeoViews.tsx:197`, or gate it behind a future verification flag).
2. Keep the admin field, relabelled "internal note, not shown publicly".
3. Remove the purse values from the seed.

A verified-fields model (`verifiedAt` plus a source) is future work (gap R4). Inventing replacement values is out of the question.

### 4.2 Claim inventory

| Claim (as displayed) | Source | Location | Public impact | Verification | Recommendation |
|---|---|---|---|---|---|
| "Purse $2,150,000 / $1,200,000 / $650,000" | Seed → DB `RodeoEventEdition.purseBenchmark` | mock `:1069/1084/1099`; seed `:143-144`; render `RodeoViews.tsx:197` | 3 edition pages | Unverified [F] | Hide publicly; remove from seed |
| "17,000 spectators" | Seed → DB Article deck, discipline guide JSON | mock `:49`, `:846`; articles `inside-the-chutes…`, `ticket-advisory…` | Article pages; bull-riding guide; **every page** via the search-index payload (`PublicChrome` → `SearchModal`) | Unverified [F] | Remove from seed; local re-seed (D7); production clean-up later (out of scope) |
| "Covering 500,000 square feet…" | Seed → Article deck | `cowboy-christmas-2026-buyers…` | Article and section cards | Unverified | Same |
| "5:45 PM (PST) grand entry / telecasts" | Seed → Article blocks / takeaways | `how-to-watch…`, `las-vegas-in-december…` | Article pages | Unverified | Same |
| "11:00 PM … Montana Silversmiths buckles" | Seed → Article content | `country-music-residencies…` | Article page | Unverified; named commercial entity | Same |
| "paying over $2 million … more than a million attendees" | Seed → `RodeoEvent.description` | mock `:1065`; seed `:132-134` | `/rodeo-events/calgary-stampede/` | Unverified | Neutral description in the seed |
| Hub descriptions ("paying millions in purse allocations", …) | Seed → `RodeoHub.description` | mock `:1026-1053`; seed `:114-124` | Hub pages and the directory (`RodeoViews.tsx:110,135`) | Unverified | Neutral text in the seed |
| Hub `annualEventsCount` 42 / 28 / 35 | Seed → DB | mock `:1034,1043,1052` | **Not rendered publicly** [F]: the directory uses the real `eventCount` (`listPublicHubs`) | Unverified, stored only | Drop it from the seed; future schema clean-up |
| `circuitType` ("PRCA Texas Circuit", "CPRA / ProRodeo Co-Sanctioned") | Seed → `RodeoHub.circuitType` | `RodeoViews.tsx:133` | Hub page | Unknown (plausible, unsourced) | Neutral or remove in the seed |
| Discipline `historicBenchmark` / `stockProfile` ("…all 17,000 spectators…") | Seed → `Discipline.guide` JSON | mock around `:846`; `DisciplineGuideView.tsx:58,62` | Discipline guides | Unverified | Neutral seed; template keeps the fields (editorial) |
| Edition `traditionalMonth`, `location` | Seed → `RodeoEvent` | `RodeoViews.tsx`; `MoreRodeoSection` | Event cards | Unknown (general knowledge, unsourced) | Neutral fixture entities in the seed (A5) |
| Mock source directory ("verificationDate: October 2026", "linkedArticleCount: 5") | Code: `data/mockAdminData.ts:243+` | `components/admin/editor/ArticleSourcesPanel.tsx:5,72` | Admin only, but writes into `Source` on attach | Fabricated | Replace with the DB source directory (§6) |
| Admin notifications ("12-Group SEO Audit Completed … 18 public pages", "24 public URLs successfully verified", "Calgary … purse confirmation") | Code: `components/admin/AdminNotificationPanel.tsx:15-45`; unread dot at `AdminTopbar.tsx:90` | Rendered by `AdminLayout.tsx:82` on every admin page | Admin; fabricated operational metrics | Fabricated [F] | Remove; show an honest empty state |
| "N% Score" | Code: `AdminArticleEditorShell.tsx:1004-1007`; `seoValidator.ts:314` | Editor | Real checklist ratio, labelled like an SEO score | Computed, not fabricated [F]; label misleading [I] | Relabel "N of M checks passed" |
| "— Official NFR Championship Guide" | Code: `lib/seo.tsx:112` (`disciplineJsonLd`) | JSON-LD on 7 discipline pages | Claims official status | Unsupported [F] | Remove "Official" |
| Legacy section redirects | Seed: `seed.ts:219-233` | DB `ArticleRedirect` (5 rows) | None (harmless mirror) | n/a | Keep |

**Code-level public copy:** clean, per the Phase 2 guard `tests/public-content.test.ts` and a rendered-HTML scan of the section and legal pages. The remaining issues are **seed-level and local-data-level** plus the admin and JSON-LD items above. **Production data level:** not inspected; assume the same corpus is there (`LOCAL_TO_CLOUD_MIGRATION_REPORT.md`) [I].

**Additional seed risk [F]:**
- `seed.ts:245-252`: the article `upsert.update` resets `workflowStatus: PUBLISHED`, `isLeadHero`, and all content fields.
- `:132-145`: event and edition `update` overwrite descriptions and purses.
- Consequence: running `npm run db:seed` (or `db:setup`) after an editor unpublishes or edits demo content **republishes and reverts it**.

---

## 5. A2: scheduling UI

| Question | Finding |
|---|---|
| Where rendered | `views/admin/AdminArticleEditorShell.tsx:519-536` (Approved state: **Schedule** button); `:538-556` (Scheduled state: **Unschedule** and **Publish Immediately**); status `<select>` at `:897-910` including "Scheduled (Embargo Date)"; date input `:914-928`, shown **only when the status is already `scheduled`** [F] |
| Roles | `article.schedule` is in `EDITOR_PERMS` (`lib/auth/rbac.ts:71`), so editor, administrator and super_admin. Not author or seo_manager [F] |
| On click | `handleWorkflowTransition('scheduled')` → `transitionArticleAction(id,'SCHEDULED',v,scheduledAt)` (`:375-379`) → `transitionWorkflow` (`articleService.ts:592-606`), which requires a future `scheduledAt` |
| Effective behaviour | The first click from Approved sends an empty `scheduledAt` (the input isn't visible yet), so it fails with "Scheduled time must be in the future" [I, from code; not exercised in this read-only phase]. If a date was set earlier, the article becomes SCHEDULED with a toast saying "Workflow state updated to SCHEDULED" (`:389`) |
| Worker / job | **None** [F]: no queue, cron or worker anywhere; no job tables |
| Operational? | **No.** SCHEDULED articles never become public automatically |
| Timezone | `datetime-local` carries no zone and is parsed with `new Date()` in the **server's** timezone [F] (§6.3 requires an explicit timezone) |
| Misleading? | Yes [I]: the status, the toast, the Overview "Scheduled" tile (`app/admin/(dashboard)/page.tsx:23`) and the list tab (`AdminArticlesPage.tsx:24`) all imply future publication |
| Current data | Local: 0 SCHEDULED articles [F]. Production: unknown [U] |
| Tests | No test transitions to SCHEDULED through the service. `content.test.ts:73` and `public-content.test.ts:133` create SCHEDULED rows directly [F] |

**Smallest safe change (no fake scheduler):**
1. **Server:** add `const SCHEDULED_PUBLISHING_ENABLED = false` in `articleService.ts`. While it is false, reject `target === 'SCHEDULED'` with `ServiceError('validation', 'Scheduled publishing is not available yet. Publish manually when ready.')`. Keep `SCHEDULED → APPROVED` and `SCHEDULED → PUBLISHED`, so existing rows can be cleared.
2. **UI:** derive `schedulingAvailable` from a server-provided permission (`buildEditorPermissions` → `canSchedule: false` while disabled) and hide the Schedule button and the select option. Show a one-line note: "Scheduled publishing is not available yet."
3. **List and Overview:** relabel "Scheduled" as "Scheduled (manual publish required)" so legacy rows aren't misread.
4. **Tests:** service rejects SCHEDULED; the permission flag is false; the editor source no longer renders the Schedule control (static).

---

## 6. A3: mock and placeholder admin inventory

| Item | Route | Navigation | Used? | Function | Removal risk | Action |
|---|---|---|---|---|---|---|
| `views/admin/AdminOverviewPage.tsx` (imports `ADMIN_ACTIVITY_LOGS`, `BACKGROUND_JOBS`, `SEO_ISSUES`, `ALL_ARTICLES`, `RECURRING_RODEO_EVENTS`) | none | none | **No importers** [F] | Phase 0 mock dashboard; the live one is `app/admin/(dashboard)/page.tsx` (DB) | None | **Remove** |
| `views/admin/AdminWebsitePage.tsx` (imports `HOMEPAGE_SECTIONS_CONFIG`, `ALL_ARTICLES`; hard-coded "December 3–12, 2026") | none | none | **No importers** [F] | Mock homepage builder; live `/admin/website/` uses `AdminWebsiteNavPage` | None | **Remove** (homepage curation is future R5) |
| `components/admin/AdminNotificationPanel.tsx` + unread dot `AdminTopbar.tsx:90` | every admin page (`AdminLayout.tsx:82`) | Topbar bell | **Live** [F] | 4+ hard-coded fake notifications | Low (UI only) | **Replace** the content with an honest empty state, "No notifications yet"; remove the permanent dot. Real notifications are future work |
| `components/admin/editor/ArticleSourcesPanel.tsx` ("attach existing" uses `ADMIN_SOURCES`) | editor | — | **Live** [F] | Lists mock sources; attaching writes a `Source` row via `writeChildren` | Medium: the editor's source attach flow | **Replace** with DB `Source` options passed from the server (same pattern as the Phase 2 relationship options), **or** hide "attach existing" (D6) |
| Editor "% Score" | editor | — | Live | Checklist ratio | None | **Relabel** |
| `data/mockAdminData.ts` | — | — | Used by the 3 items above + `prisma/seed.ts` (`MEDIA_ASSETS`, `ADMIN_SOURCES`) | — | Seed | Remove once A5 replaces the seed inputs |
| `data/mockEditorialData.ts` | — | — | `prisma/seed.ts`, `scripts/seed-rodeo-links.mts`, the two dead views; `tests/batch16.test.ts` only asserts that it *isn't* imported [F] | — | Seed and script | Remove after A5; update `seed-rodeo-links.mts` (or remove it, since the seed already creates hub links) |

All 17 routed admin views were checked: none import mock data [F]. Their sidebar entries (`AdminSidebar.tsx:40-196`) map to real routes. `/admin/landing-seo/` is routed but has no sidebar entry [F]; it's functional, so keep it and note it.

---

## 7. A4: NewsArticle structured data

**Trace [F]:**

| Stage | Value |
|---|---|
| Editor | `ALL_ARTICLE_TYPES` includes `'News'`, `'Event Update'`, … (`AdminArticleEditorShell.tsx:22-41`) |
| Service | `ArticleInputSchema.articleType` is a free string (`articleService.ts`, max 80) |
| Database | `Article.articleType` String |
| Seed | `'analysis'` ×3, `'feature'` ×2, `'guide'` ×6, none of them in the approved list |
| Mapper | `lib/mappers.ts:94` cast, no normalisation |
| Generator | `lib/seo.tsx:88` `article.articleType === 'news' ? 'NewsArticle' : 'Article'` |
| Rendered | `/articles/how-to-watch-…/` emits `Article`, `BreadcrumbList`, `Organization`, `Person` (no `NewsArticle`) |

- **Mismatch:** a case and vocabulary mismatch. **NewsArticle is never emitted** for any value the editor or seed can produce [F].
- **Eligible types:** at minimum `'News'`. Whether `'Event Update'` (and possibly `'Results & Standings'`) also count as news is an owner/editorial decision (D2). Everything else stays `Article`.
- **Other page types [F]:**
  - Disciplines: `Article`, with the unsupported "Official" headline.
  - Editions: `Event`, only when `startAt` exists (correct). The requirements mention `SportsEvent` "only when warranted"; switching is not justified without verified data.
  - Venues: `Place`. Competitors: `Person`. Breadcrumbs: everywhere. FAQ: where FAQs exist.
  - No duplicate article blocks: one `JsonLd` per page, and the layout emits none.
- **Unsupported claims:** the discipline headline "Official…" (`lib/seo.tsx:112`).
- **Safety [F]:** `JsonLd` (`lib/seo.tsx:240-247`) uses `dangerouslySetInnerHTML` with a raw `JSON.stringify`. CMS-editable strings (titles, decks, FAQ answers, author names) can contain `</script>`, which is a stored-XSS vector for anyone who can edit content.
- **Smallest fix:**
  1. A constant `NEWS_ARTICLE_TYPES = new Set(['News'])` (plus D2 additions); compare case-insensitively.
  2. Remove "Official" from the discipline headline.
  3. In `JsonLd`, use `JSON.stringify(data).replace(/</g, '\\u003c')`.
  4. Unit tests: News gives NewsArticle; Guide/General give Article; `</script>` in a title is escaped. Add a rendered-HTML check in the browser smoke test.

---

## 8. A5: seed data and test fixtures

**Seed structure [F]** (`prisma/seed.ts`):
- categories (`:62-75`, from `PRIMARY_SECTIONS`, neutral);
- authors (`:77-92`, from mock bylines);
- disciplines with guide JSON (`:94-108`);
- hubs (`:110-125`);
- events and editions with hub links (`:127-156`);
- media assets (`:158-169`, `MEDIA_ASSETS`);
- sources (`:171-184`, `ADMIN_SOURCES` and article citations);
- SEO rules (`:186-196`);
- roles and permissions (`:198-206`);
- navigation, analytics providers and monetization policies (`:208-218`, create-missing-only, neutral);
- legacy redirects (`:219-233`);
- articles (`:235-323`, 11 demo articles forced to PUBLISHED, plus tags, sources, disciplines, hubs);
- curated relations (`:325+`).

**Idempotency:** yes (upserts by deterministic ID), but **destructive to edits**, because content `update` branches overwrite them (§4).

**What tests actually need [F]:**

| Dependency | Tests |
|---|---|
| Category named `'NFR Competition'`; all 5 categories | 9 suites (`categoryName: 'NFR Competition'`); `public-content` uses `PRIMARY_SECTIONS['plan-watch']` |
| At least 1 author; at least 1 discipline | many: `findFirstOrThrow` in `rodeo-public`, `search`, `batch12`, `batch14`, `batch15`, `phase2-editorial` |
| At least 1 published article with at least 1 block, in a category; published articles in 'NFR Competition' | `content.test.ts:26,45-56,88,100,119` |
| Events with editions (at least 2 events with editions) and at least 1 hub | `phase2-editorial.test.ts:56`; `content.test.ts:113-114` |
| At least 1 SEO rule | `analytics.test.ts:252` |
| Roles and permissions | synced by the tests themselves (`roleSync`) |
| Navigation | `batch04` deletes and recreates it itself (test-owned) |
| **No test references demo slugs or IDs** | grep for demo slugs in `tests/`: 0 hits; tests use their own prefixes (`sectest-`, `p2ed-`, `itest-`, `event-seotest`, …) |
| Smoke script | **`scripts/route-smoke.mts` hard-codes** `/articles/inside-the-chutes-nfr-roughstock-intensity/`, `/rodeo-events/calgary-stampede/`, `/rodeo-events/canadian-professional-rodeo/`, `/disciplines/bull-riding/` |

**Neutral seed strategy (proposed):**
1. **Reference data (real and neutral):**
   - 5 categories;
   - the 7 discipline *identities* (names and slugs are requirement-defined), with neutral placeholder summaries and guides marked "Guide pending editorial review", or empty guide JSON;
   - roles and permissions, SEO rules, navigation, providers, policies, legacy redirects.
2. **Synthetic fixtures, clearly labelled:**
   - slug prefix `fixture-`;
   - titles starting "Fixture:" (for example, "Fixture: Sample Competition Article");
   - author "Fixture Author";
   - hub "Fixture Hub A";
   - events "Fixture Rodeo Event A/B", each with one edition `fixture-a-2099`. Use a far-future or obviously synthetic label, no dates and no purse;
   - 1–2 published articles per section with neutral lorem-style text, and one draft;
   - sources pointing to `https://example.org/...` and media using existing local images with credit "Fixture image".
   - No real organisations, venues, people, prices or statistics.
3. **Write semantics:**
   - fixture rows are upserted only by `fixture-` IDs;
   - reference rows stay create-missing or update-neutral;
   - **never force `PUBLISHED` on non-fixture rows**;
   - stop importing `data/mock*`.
4. **Demo corpus:** remove it (D3). If the owner wants to keep it, move it to an explicit opt-in script `seed:demo` that writes only DRAFT rows and is never used in CI.
5. **Smoke script:** point `route-smoke.mts` at the fixture slugs.
6. **Production impact:** `seed.ts` is not run against production by any configuration [F]. `scripts/cloud-data-import.mts` copies **local DB rows**, so a future import after re-seeding would carry the fixtures instead. Document this, and require exclusion of the `fixture-` prefix in any future import (out of scope here).
7. **Local data:** existing demo rows in `nfrguide_dev` **won't disappear** after a seed change, because upserts don't delete. Clearing them needs `npm run db:reset` (destructive, local only), which requires **owner approval (D7)**. The isolated test DB can be reset freely.

**Risks:**
- Tests that implicitly assume ≥7 published articles: none found [F].
- `getPublishedArticlesByDiscipline` falls back to 'NFR Competition' articles, so it needs at least one fixture there [F].
- Re-runs of `phase2-editorial` require at least two events with editions [F]; the fixture design provides them.

---

## 9. A6: CI pipeline

**Current `.github/workflows/ci.yml` [F]:**

| Item | Value |
|---|---|
| Postgres | `postgres:17` service (production is PG 18.6) |
| Environment | `APP_ENV=test`, `NODE_ENV=test`, `DATABASE_URL = TEST_DATABASE_URL = …/nfrguide_ci`, `MIGRATION_REPLAY_ADMIN_URL`, `MEDIA_STORAGE_PROVIDER=local` |
| Steps | `npm ci` → `prisma generate` → `prisma validate` → `prisma migrate deploy` → `tsc --noEmit` → `vitest run` → `npm run test:migration` → `next build` |

| # | Question | Answer |
|---|---|---|
| 1 | Install | `npm ci` with lockfile cache (`apps/web/package-lock.json`). Node **22** vs local 24 [F]; no `engines` field or `.nvmrc` |
| 2 | Migrations | `migrate deploy` before tests (correct order) |
| 3 | Test DB initialised | Schema only |
| 4–5 | Seed required / loaded | **Required** (§8); **never run in CI** [F]. Phase 2 evidence: on an unseeded DB, 18 tests failed with `Unknown category` [F, from the earlier session] |
| 6 | DB tests skipped? | They run (the DB is reachable) and most likely **fail** for lack of seed data [I]. If the DB were unreachable they would **skip silently**, and the job would still pass [F, from suite code] |
| 7 | Guard in CI | `nfrguide_ci` on localhost, and `DATABASE_URL === TEST_DATABASE_URL` is accepted ("CI layout"; unit test `test-db-guard.test.ts`) [F] |
| 8 | Variables | Sufficient for tests and build; `NEXT_PUBLIC_SITE_URL` is set [F] |
| 9 | Isolation and repeatability | Serial files (`fileParallelism: false`); suites clean up their own rows [F]. Analytics and monetization singleton config tests mutate shared rows (by design, serial) |
| 10 | Local-machine dependencies | None found in the tests [F]. `next build` in CI renders against the unseeded CI DB, so the homepage shows the "No published coverage" state; the build still passes [I] |
| — | Actual GitHub run status | **Unknown** [U]: run history not accessible |

**Proposed CI sequence:**
1. `actions/setup-node` with the version taken from a new `.nvmrc` (D4: 22 or 24).
2. `npm ci`
3. `npx prisma generate`
4. `npx prisma validate`
5. `npx prisma migrate deploy`. The job-level environment points only at the service container; add an explicit step asserting the host is `localhost` and the database name ends with `_ci`.
6. **`npx prisma db seed`**, which runs the neutral fixtures (A5).
7. `npx tsc --noEmit --incremental false`
8. `npx vitest run --reporter=default --reporter=json --outputFile=vitest-results.json`
9. **New skip gate:** `node scripts/assert-no-skipped-tests.mjs vitest-results.json` fails when any test is skipped (an explicit allowlist file, empty by default). Alternatively, set `REQUIRE_DB_TESTS=1`, which the guard turns into a hard failure when the DB is unreachable. The script approach needs no test edits.
10. `npm run test:migration`
11. `npx next build`
12. `npx next start -p 3000 &` → wait-on → `npm run test:routes` (GET-only) → Playwright smoke (A7).
13. Upload test artefacts.

Never reference secrets, the cloud URL or `.env` in CI. Optionally move the Postgres service to `postgres:18` to match production (D4).

---

## 10. A7: browser and accessibility testing

| Item | Finding |
|---|---|
| Playwright / Cypress / axe / pa11y / Lighthouse | **None** in either `package.json`; no binaries [F] |
| Existing HTTP smoke | `scripts/route-smoke.mts`: GET-only, about 25 checks (status, canonical, JSON-LD, 404s, legacy 308 in one hop, robots, sitemap) [F]. Not in CI |
| Writing scripts | `admin-auth-smoke.mts` (creates a super_admin user and session, then deletes the user), `cache-invalidation.mts`, `media-http-check.mts`: **write to the DB that `DATABASE_URL` resolves to, defaulting to the dev DB through `.env`, with no guard** [F]. A safety risk |
| Without Docker | Playwright runs natively on Windows and on `ubuntu-latest` (a browser download of about 150 MB, free) [I] |
| Credential isolation | No test credentials exist. Proposed: a fixture admin created **only** in the isolated test/CI DB by a guarded setup step (reusing `decideTestDatabase`), with a random password generated per run and never committed |

**Minimal plan** (needs D5: approval to add `@playwright/test` and `@axe-core/playwright` as dev dependencies):

**Public (against `next start` on the seeded test or CI DB):**
1. Homepage 200; header nav has 5 section links that each load (desktop and 390 px mobile drawer).
2. A fixture article returns 200, with one H1, a canonical tag, and JSON-LD containing no unescaped `</script>`.
3. The 7 legal pages show "Draft — pending owner and legal review" and `noindex`.
4. An unknown article returns 404; a fixture draft slug returns 404.
5. Redirect: a fixture redirect row returns 308 to a live fixture.

**Admin:**
1. `/admin/login/` loads.
2. `/admin/articles/` without a session goes to login.
3. A fixture admin logs in, the editor loads, the Schedule control is absent, and the bell shows "No notifications".
4. `/admin/website/` shows only real navigation management.

**Accessibility (basic automated checks only — this is not WCAG 2.2 AA conformance):**
1. axe on home, section, article, legal and login pages: fail on serious or critical issues.
2. Assert a single H1 and no skipped heading levels on those pages.
3. Form labels on login and search.
4. Keyboard: Tab reaches the nav and main content; focus is visible (computed outline); the mobile drawer opens and closes by keyboard.
5. All `<img>` have `alt`.
6. Contrast via axe's `color-contrast` rule.
7. Reduced motion: run one pass with `reducedMotion: 'reduce'` and assert no animation-dependent failures. A skip link and a reduced-motion stylesheet don't exist yet, so these checks will **fail** until R9. Mark them `test.fixme` with a tracking note, not silently omitted.

**Writing scripts:** add the test-DB guard to `admin-auth-smoke`, `cache-invalidation` and `media-http-check` so they refuse non-test DBs (small and in scope as test reliability).

---

## 11. Files potentially requiring changes

| Workstream | Files |
|---|---|
| A1 | `views/RodeoViews.tsx` (`:197`); `views/admin/AdminRodeoCoveragePage.tsx` (field label `:206`); `prisma/seed.ts` |
| A2 | `lib/cms/articleService.ts` (`transitionWorkflow` `:592`); `lib/auth/rbac.ts` (`buildEditorPermissions` `:153`); `views/admin/AdminArticleEditorShell.tsx` (`:519-556`, `:897-928`); `app/admin/(dashboard)/page.tsx:23`; `views/admin/AdminArticlesPage.tsx:24` (label) |
| A3 | Delete `views/admin/AdminOverviewPage.tsx` and `views/admin/AdminWebsitePage.tsx`; edit `components/admin/AdminNotificationPanel.tsx`, `components/admin/AdminTopbar.tsx`, `components/admin/editor/ArticleSourcesPanel.tsx`; possibly `lib/cms/adminQueries.ts` (source options) and the article new/edit pages (pass options); `AdminArticleEditorShell.tsx:1004-1007` (label) |
| A4 | `lib/seo.tsx` (`:88`, `:112`, `:240-247`) |
| A5 | `prisma/seed.ts`; new `prisma/fixtures/*.ts`; delete `data/mockEditorialData.ts` and `data/mockAdminData.ts` (after all importers are gone; check `types/` usage); `scripts/seed-rodeo-links.mts`; `scripts/route-smoke.mts` |
| A6 | `.github/workflows/ci.yml`; new `.nvmrc`; new `scripts/assert-no-skipped-tests.mjs` |
| A7 | `apps/web/package.json` and `package-lock.json` (dev dependencies, D5); new `playwright.config.ts`, `e2e/*.spec.ts`, `e2e/global-setup.ts` (guarded fixture admin); guard in `scripts/admin-auth-smoke.mts`, `cache-invalidation.mts`, `media-http-check.mts` |
| Tests | New `tests/batchA-*.test.ts` (schedule disabled, JSON-LD mapping and escaping, purse not rendered, notification and source panel contain no mock, seed has no `data/mock` imports and no claim strings) |

---

## 12. Proposed implementation approach

1. **A4 and A1 code** (pure code, lowest risk): JSON-LD fixes and the purse hide.
2. **A2:** disable scheduling on the server and in the UI.
3. **A3:** dead views out; notifications to an empty state; DB-backed source picker; score relabel.
4. **A5:** neutral fixtures in the seed; remove the mock data files; update `route-smoke`. Reset and re-seed the **isolated test DB**; reset the local dev DB only if D7 is approved.
5. **A6:** CI seed step, skip gate, Node pin, route smoke.
6. **A7:** Playwright and axe (after D5), the guarded fixture admin, and guards on the writing scripts.
7. **Verify:** full Vitest on the seeded test DB with 0 skips; tsc; prisma validate; build; `route-smoke` against `next start` on the test DB; Playwright locally; a rendered-HTML claim scan across all public routes.

---

## 13. Dependencies and risks

| Risk | Mitigation |
|---|---|
| Seed rewrite breaks suites that rely on seed shape | Fixture design mirrors the shape in §8; run the full suite on a freshly reset test DB |
| Local dev DB keeps demo rows until reset | D7; otherwise document that the local DB still holds demo content |
| Production still holds the demo corpus | Out of scope; separate owner-approved clean-up runbook |
| `cloud-data-import.mts` would copy fixtures if re-run | Document; add a prefix exclusion in a future batch |
| Disabling SCHEDULED: existing production SCHEDULED rows [U] | Keep the SCHEDULED→APPROVED and →PUBLISHED transitions available |
| Playwright adds dev dependencies and a browser download | D5; dev-only, free, no hosting |
| CI change can't be confirmed green without a GitHub run | Validate locally with an equivalent sequence (test DB) and `act`-free reasoning; confirm on the first push after approval (outside this batch) |
| Source picker becomes DB-backed | Reuses the existing `Source` table and Phase 2 options pattern; no schema change |

---

## 14. Acceptance criteria

**Truthfulness:**
1. No `purseBenchmark` value appears in any public HTML.
2. No public route (full crawl from the sitemap plus a fixed list) contains any string from the claim list in §4.2 on a freshly seeded DB.
3. `prisma/seed.ts` and the fixtures import nothing from `data/mock*`; fixture records are prefixed `fixture-` and titled "Fixture:"; no real-world statistics are introduced.
4. The admin bell shows an honest empty state with no permanent unread dot.
5. The source picker lists only DB sources.

**Scheduling:**
1. The service rejects →SCHEDULED with an explicit "not available yet" error (integration test).
2. The editor renders no Schedule button or "Scheduled" select option (static and Playwright).
3. Existing SCHEDULED rows can still be unscheduled or published.
4. No scheduler code, timers or job tables are added.

**Structured data:**
1. `articleType 'News'` (and D2 types) produces `NewsArticle`; other types produce `Article` (unit and rendered).
2. No "Official" claim in discipline JSON-LD.
3. `</script>` in a CMS field is emitted escaped (unit and Playwright).
4. One JSON-LD block per page; no duplicate article objects.

**CI:**
1. CI runs `migrate deploy` then `db seed` against the service DB only, and the step asserts localhost plus a `_ci` name.
2. All Vitest tests execute; **the job fails if any test is skipped** (gate script).
3. `route-smoke` and Playwright run against `next start` on the CI DB.
4. There are no references to `.env`, `CLOUD_DATABASE_URL` or secrets.

**Browser:**
1. All public and admin smoke specs pass locally and in CI on the seeded test DB.
2. Draft and unknown routes return 404.
3. axe reports no serious or critical violations on the 5 key pages, **or** each known one (skip link, reduced motion) is listed as `fixme` with an owner-visible note.
4. Results are reproducible across 2 consecutive runs.

---

## 15. Test execution strategy

- **Unit tests (no DB):** JSON-LD mapping and escaping; schedule flag; static source scans (no `data/mock` imports, no claim strings, no Schedule control in the editor source).
- **Integration tests (isolated test DB only, after `db:reset` of `nfrguide_test` and a seed):** the full suite plus the new Batch A tests; expect 0 skipped.
- **HTTP:** `next start` with `APP_ENV=test` on the test DB → `route-smoke` with fixture slugs, plus a claim-string crawl.
- **Browser:** Playwright with a guarded global setup on the test DB.
- **Never:** run against the dev DB (except a D7-approved reset), production, or Aiven.

---

## 16. Estimated complexity

| Workstream | Size |
|---|---|
| A1 code | XS |
| A2 | S |
| A3 | S–M (the DB source picker is the largest piece) |
| A4 | XS |
| A5 | **M–L** (seed rewrite, fixtures, mock-file removal, smoke update) |
| A6 | S |
| A7 | M (new tooling, guarded setup, about 12 specs) |
| **Total** | about 2–3 focused days of implementation plus verification [I] |

---

## 17. Explicitly out of scope

- production data clean-up and Aiven access;
- implementing scheduled publishing and a job worker;
- soft delete and archive;
- MFA, a distributed rate limiter, CSP;
- an edition `verifiedAt` schema change (R4);
- homepage curation (R5);
- skip link and reduced-motion implementation (R9; only *tested* here, as `fixme`);
- hosting, staging, monitoring, backups;
- credential rotation;
- the `cloud-data-import` prefix exclusion;
- the Postgres 17→18 CI image change (optional, D4).

---

## 18. Recommended implementation order

A4 → A1 (code) → A2 → A3 → A5 → A6 → A7, then full verification (§15). A5 comes before A6 and A7 because the seed defines the fixtures that CI and the browser tests depend on.

---

## 19. Unresolved owner decisions

| # | Decision | Options | Recommended |
|---|---|---|---|
| D1 | Purse field | (a) hide publicly and keep it admin-only; (b) delete the field from the UI entirely | (a) |
| D2 | NewsArticle types | (a) `News` only; (b) `News` + `Event Update`; (c) + `Results & Standings` | (a) or (b) (editorial call) |
| D3 | Demo corpus | (a) delete it; (b) keep it as an opt-in, DRAFT-only `seed:demo` | (a) |
| D4 | Node and Postgres versions | Node 22 or 24 (pin with `.nvmrc`); CI Postgres 17 or 18 | Node 22 LTS for both, **or** 24 if hosting will use 24; PG 18 to match production |
| D5 | Add `@playwright/test` and `@axe-core/playwright` dev dependencies (free) | Approve / reject | Approve |
| D6 | Source picker | (a) DB-backed directory; (b) hide "attach existing" for now | (a) |
| D7 | Reset the **local dev DB** (`npm run db:reset`, destructive, local only) to remove the demo rows | Approve / keep the demo locally | Approve, after a `pg_dump` backup |
| D8 | Scheduled labels for existing rows | Relabel "manual publish required", or leave as is | Relabel |

---

## 20. Go / no-go

**GO** for Phase 2 implementation of Batch A, conditional on D1–D8. If D5 is declined, A7 drops to the GET-only `route-smoke` in CI with no browser or axe checks, and should be reported as such. If D7 is declined, the local dev site keeps showing demo claims until reset; tests and CI are unaffected.

**Checks run in this phase (all read-only):**
- `git fetch`, `rev-parse`, `rev-list`, `status --porcelain`, and `diff --name-only` for the lockfile, `prisma`, `.github` and `package.json`;
- static `grep`/`sed` inspection of the files cited above;
- read-only Prisma SELECTs on the local dev DB (`localhost:5433`, host printed only): status counts, venue/competitor/result counts, redirect rows;
- HTTP GETs on the dev server (`/rodeo-events/calgary-stampede/2026/` JSON-LD; one article's JSON-LD types).

**Not run:** any test suite, build, migration, seed, or production query.
