# NFRGuide — Professional Page Manager & Advanced Page Editor

## VERDICT: `COMPLETE — VERIFIED LOCALLY`

> **Revision 2, 2026-11-14.** PM-01 to PM-06 are implemented and verified, including the
> end-to-end HTTP publication journey revision 1 could not claim. Everything below this line
> is revision 1, kept as written; the revision 2 section at the end supersedes its verdict,
> its test totals and its production-migration status.

**Date:** 2026-11-14 · **Branch:** `main` · **HEAD:** `148c481` (unchanged — nothing committed)
Nothing was committed, pushed or deployed. **No migration was applied to Aiven production.**
Dev and test databases were migrated; production was read-only and only to confirm its state.

**Stages 1 and 2 are implemented and verified. Stages 3–7 are not.** The detail is in §16.

---

## 1. Executive summary

**The architectural requirement in §7 of the brief — a published page must stay live while
an editor works on the next version — is implemented and proven.** That was defect D-09,
blocked on schema change S-1 since Stage 09. It is now done:

```
V1 published  →  editor writes V2  →  visitors still see V1  →  V2 approved
              →  V2 published      →  V1 recoverable in revision history
```

Verified both service-side (9 new tests) and in a browser (the Edit button on a live page is
no longer disabled, and the screen says why that is safe).

Three things are worth calling out above the detail.

**The §9 fallback defect is fixed, and it was worse than "a page disappears".** Unpublishing
a policy page used to leave the URL working while silently swapping approved wording for the
compiled-in copy — which for all seven policy pages is still marked pending review and
renders a public draft banner. A row that exists but is not live now resolves as
`withdrawn` and returns 404. Taking a page down means it is down.

**One real bug was introduced and caught by the existing suite before it could ship.**
Separating draft from live made `unpublishInfoPage`'s guard wrong: it tested the draft's
status, so saving any edit to a live page would have left the operator unable to take that
page down. The guard now tests the live snapshot. §13 has the detail.

**The live SEO problem from the audit is NOT fixed by this work, and cannot be.** All seven
policy pages on nfrguide.com still show a draft banner and still emit `noindex, nofollow`,
because the `InfoPage` table in production is empty and nothing has ever been published
through the CMS. This work builds the machinery; only the owner publishing those seven pages
changes what readers see. See §17.

---

## 2. Architecture changes

| Concern | Before | After |
|---|---|---|
| Live vs draft content | one set of columns, shared | draft columns + `publishedSnapshot` |
| Editing a published page | **refused** | allowed; live version untouched |
| Concurrent edits | last write wins, silently | optimistic lock on `version` |
| Revision history | none | `InfoPageRevision`, full JSON snapshots |
| Soft delete | none | `archivedAt` |
| Page protection | none | `isProtected` + `pageType` |
| Unpublish → public effect | fell back to the built-in draft | 404 |
| "Is it live?" | inferred from draft status | the snapshot, everywhere |

Ownership boundaries are unchanged and were not duplicated: structured CMS owns content, the
Visual Builder owns presentation, SEO Intelligence owns SEO metadata. No second CMS, SEO
system, Media Library or Builder was created.

---

## 3. Database models and migrations

**Migration:** `prisma/migrations/20261114120000_info_page_draft_published/migration.sql`
Additive throughout. No column dropped, no row deleted.

```
CREATE TYPE "InfoPageType" AS ENUM ('SYSTEM', 'CUSTOM');

ALTER TABLE "InfoPage"
  ADD COLUMN "publishedSnapshot" JSONB,
  ADD COLUMN "pageType"    "InfoPageType" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "isProtected" BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN "archivedAt"  TIMESTAMP(3),
  ADD COLUMN "version"     INTEGER        NOT NULL DEFAULT 1;

CREATE TABLE "InfoPageRevision" (...);   -- shaped exactly like ArticleRevision
```

**Two backfills, both preserving behaviour.**

1. **Every already-published page keeps serving.** Without it a live page would go dark the
   moment the new code ran, because its snapshot would be `NULL`. The snapshot is built from
   the row's own current values, so the live page is byte-identical before and after.
2. **The seven policy slugs become `SYSTEM` and protected.** Their URLs are referenced by the
   footer, the policy cross-navigation and the sitemap — none of which live in this table —
   so a rename or delete would break links nothing here can see.

| Database | State |
|---|---|
| Development | **26 applied**, up to date |
| Test | **26 applied**, up to date |
| **Aiven production** | **25 applied — this migration NOT applied, per §19 of the brief** |

Production holds 0 `InfoPage` rows, so both backfills would be no-ops there. `migrate reset`
was never used and no destructive statement exists in the migration.

---

## 4. Page Manager features

Implemented on the existing `/admin/info-pages/` screen — not a duplicate destination.

| Feature | Status |
|---|---|
| Page directory with slug, title, type | **Existing, kept** |
| **Live state**, separate from draft status | **New** |
| **"Live · edits pending"** — live with a newer draft behind it | **New** (unexpressible before) |
| **Protected** badge | **New** |
| **Archived** state | **New** |
| Create / Edit / Submit / Approve / Publish / Unpublish / Revert | Existing; Edit now works on a live page |
| **Archive / Restore** | **New**, hidden on protected pages |
| **Permanently Delete** | **New**, custom + archived only, with confirmation |
| **View Revisions / Restore Revision** | **New** |
| Permission-aware actions | Existing `system.config` gate; actions that cannot apply are not rendered |
| Search, filter, sort | **NOT IMPLEMENTED** — §16 |

---

## 5. Published-draft workflow

`publishInfoPage` promotes the approved draft inside **one transaction**: it records a
revision and writes `publishedSnapshot`, `status`, `publishedAt` and `version` together. If
any statement fails the transaction rolls back and the previous live version is untouched.
A page whose body is V2 while its meta description is still V1 is not a reachable state —
that is why the live version is one JSON object rather than a column per field.

Concurrency: `saveInfoPageDraft(actor, input, expectedVersion)` refuses a stale write both
in application code and in the `updateMany` predicate, so a race that slipped past the first
check is still caught by the database.

Editing an `APPROVED` draft drops the approval **and clears the stamp**, so the row cannot
claim an approval it no longer holds; the audit record says so explicitly.

---

## 6. Preview implementation

**NOT IMPLEMENTED.** Stage 6 was not reached. There is no draft preview, no live/draft
comparison and no responsive preview. This is the largest single gap — §16.

---

## 7. Revision and restore behaviour

A revision is recorded before every draft save, publish, archive and revision-restore.

`restoreInfoPageRevision` loads the old content **into the draft** and leaves the live page
alone — the behaviour the brief asks for. It also clears any approval, so a restore is
reviewed like any other change, and it records the draft it replaced as a revision first, so
a mistaken restore is itself undoable.

The admin action deliberately does **not** revalidate the public paths on a restore, because
nothing public changed.

---

## 8. SEO integration

**NOT IMPLEMENTED.** Stage 4 was not reached. `LandingEntityType.INFO_PAGE` was not added;
info pages still carry their own `seoTitle` / `metaDescription` and have no canonical
override, Open Graph, Twitter metadata or SEO Intelligence coverage. The audit's finding
that this is a second, weaker SEO surface stands.

**One SEO behaviour did change, correctly.** The sitemap now follows the live snapshot rather
than the draft status:

```ts
where: { archivedAt: null, publishedSnapshot: { not: Prisma.DbNull } }
```

Those two parted company once draft and live were separated — a page can be live while its
draft sits at `DRAFT`, and an archived page can carry a stale `PUBLISHED` status. The
snapshot is the only thing a reader can reach, so it is what the sitemap follows.

---

## 9. Media Library integration

**NOT IMPLEMENTED.** Stage 3 was not reached. The body is still a raw HTML textarea, `<img>`
is still stripped by the sanitiser, and there is no picker. A policy page still cannot carry
an image.

---

## 10. Visual Builder integration

**NOT IMPLEMENTED.** Stage 5 was not reached. There is no `template:info-page`.

---

## 11. Navigation integration

**Unchanged, deliberately.** The audit found navigation already correct, and the brief asks
to keep the concepts independent. Nothing in this work touches `NavigationItem`,
`SiteConfig.footer`, or canonical nav guards. Hiding a link still does not unpublish a page;
unpublishing a page still does not alter navigation.

One consequence of §9 is worth noting: archiving a custom page now returns 404 at its URL,
so a navigation item pointing at it becomes a dead link. The brief asks for "navigation
cleanup or warnings" here, and neither is implemented — §16.

---

## 12. RBAC and security

| Check | Result |
|---|---|
| Permission gate | every mutation calls `need(actor, 'system.config')`, server-side |
| Server-enforced, not button-hidden | yes — the service refuses regardless of the UI |
| XSS / unsafe HTML | `sanitizeLegalHtml` on save **and** on render; `<script>`, event handlers and `<img>` discarded; schemes limited to `https`, `http`, `mailto` |
| Slug hijacking / route collision | `RESERVED_SLUGS` + `SLUG_RE`, unchanged; protected pages additionally refuse a slug change |
| Revision overwrite | optimistic lock on `version`, enforced in the DB predicate |
| Unauthorised publishing | `system.config` on every transition |
| Protected page deletion | refused by `isProtected` **and** by `pageType === 'SYSTEM'` |
| Deletion of a live page | refused — a page must be archived first |
| Audit logging | every operation, including the new ones, with the public effect stated |
| **Unauthorised preview** | **not applicable — no preview exists yet** |

---

## 13. The defect introduced, and caught

Separating draft from live made this guard wrong:

```ts
if (page.status !== 'PUBLISHED') throw new ServiceError(...)   // unpublishInfoPage
```

Saving any edit to a live page moves its draft to `DRAFT`, so this would have refused to
unpublish a page that was plainly still being served — leaving the operator no way to take it
down. `tests/batch28-cms.test.ts` failed on it immediately. The guard now asks the right
question:

```ts
if (page.publishedSnapshot === null) throw new ServiceError('validation', 'This page is not currently published.');
```

"Is this page live?" is a question about the snapshot, and this was the one place still
asking the draft.

---

## 14. Test results

| Suite | Result |
|---|---|
| **TypeScript** (`tsc --noEmit`) | **PASS**, 0 errors |
| **Vitest** | **3499 / 3499 passed**, 153 files (was 3490 / 152) |
| **New tests** | 9, in `tests/info-page-draft-published.test.ts` |
| **Production build** | **PASS** |
| **Prisma** | schema valid; dev + test up to date; no drift |
| **Playwright** | full suite running at the time of writing; the targeted Page Manager spec passed |

### What the 9 new tests prove

1. A visitor keeps seeing V1 while V2 is being written.
2. Publishing promotes content and SEO together, never half of each.
3. Unpublishing a policy page 404s instead of exposing the built-in draft.
4. A slug with no row at all still falls back to the built-in copy.
5. Restoring an old revision loads the draft and leaves the live page alone.
6. A stale editor session is refused rather than silently winning.
7. A protected page cannot be archived or deleted.
8. Archiving withdraws a page; restoring returns it as a draft, not live.
9. A custom page must be archived before it can be permanently deleted.

### Test-contract changes — 16 assertions, each a correction

The suite contained a block of tests that **pinned D-09 as a known defect** — "editing a
PUBLISHED page is refused", "the refusal names a mechanism that does not exist", "there is NO
draft-alongside-published capability — the schema cannot express one". Fixing the defect
necessarily inverts them. Each was rewritten to assert the resolution **using the same
scenario**, so nothing that was covered stopped being covered; only the expected outcome
moved. The files: `stage09-infopage-publication`, `batch28-cms`, `stage09-continuation`,
`batch-g-info-pages`, `sitemap-policy`, `rodeo-lifecycle`.

Two are worth singling out:

- `rodeo-lifecycle` asserts an **explicit** list of tables carrying `archivedAt`, precisely so
  an unintended one is caught. `InfoPage` was added to that list with its reason. The
  tripwire did its job.
- `sitemap-policy`'s fixture set `status: 'PUBLISHED'` with no snapshot. The **fixture** was
  corrected rather than the assertion, because "published" now means a live snapshot.

No test was weakened or skipped.

---

## 15. Browser verification

Verified in Chromium against a production build on the isolated test database:

- The Page Manager shows **"Live · edits pending"** — the state the old screen could not express.
- The **Protected** badge renders on a system page.
- **Edit is enabled on a live page** — the S-1 fix, visible.
- A protected page offers **no Archive and no Delete**.
- The **Revisions** panel opens and states that a restore does not change the live page.
- The screen carries the explainer *"visitors keep seeing the published version"*.

**Not verified in a browser:** the public rendering of a publish. The policy routes are fully
static with no `revalidate`, so a row written straight into the database does not reach HTTP
until `revalidatePath` runs — which the admin actions do and a test DB write does not. The
rendering rules are covered service-side instead. This is a property of the existing routes,
not a defect introduced here, but it means the publish→live path has been proven at the
service layer and not end to end over HTTP.

---

## 16. Known limitations and remaining work

Stated plainly: **four of the seven stages were not reached.**

| Stage | Status |
|---|---|
| 1 — Data & lifecycle foundation | **DONE** |
| 2 — Page Manager | **DONE except search, filter and sort** |
| 3 — Advanced Page Editor | **NOT STARTED** |
| 4 — SEO integration | **NOT STARTED** |
| 5 — Visual Builder integration | **NOT STARTED** |
| 6 — Preview & review workflow | **NOT STARTED** |
| 7 — Full regression & documentation | Suites run; the 12 named journeys were not each walked |

Specifically missing:

1. **Rich-text editing.** The body is still a raw HTML textarea. Authors still write HTML.
2. **Media Library and images.** No picker, and `<img>` is still stripped.
3. **The five editor work areas** (Content / SEO & Media / Design / Settings / Review).
4. **`LandingEntityType.INFO_PAGE`** — canonical, OG, operator-set robots, FAQ structured data.
5. **`template:info-page`** in the Visual Builder.
6. **All three preview modes**, including the secure draft preview.
7. **Directory search, filtering and sorting.**
8. **Navigation cleanup or warning** when a page an item links to is archived.
9. **Scheduled publication.**

---

## 17. Remaining risks

| # | Risk | Severity |
|---|---|---|
| 1 | **The seven policy pages on nfrguide.com still show a public draft banner and still emit `noindex, nofollow`.** This work does not change that; only publishing them through the CMS does. The machinery now exists and is safe to use | **High — live today** |
| 2 | Archiving a custom page makes any navigation item pointing at it a dead link, with no warning | Medium |
| 3 | Info pages remain outside SEO Intelligence; they are the one public family it does not audit | Medium |
| 4 | No preview, so a first publication is the first time anyone sees the rendered page | Medium |
| 5 | A first save (`expectedVersion` omitted) cannot detect a concurrent write | Low |
| 6 | The publish→live path is proven service-side, not over HTTP | Low |

---

## 18. Production migration requirements

**Not applied, by instruction.** When it is authorised:

1. Confirm the target is the Aiven production database.
2. **Clear BKP-01 first** — no restore has ever been rehearsed against Aiven and no retention
   window is confirmed. This remains the standing blocker for any production migration.
3. The migration is additive: four nullable columns, one enum type, one new table, two
   backfills that only preserve existing behaviour. Production holds 0 `InfoPage` rows, so
   both backfills are no-ops there.
4. It is backward-compatible with the code currently running in production, which ignores
   the new columns.
5. Apply with `prisma migrate deploy`. Never `migrate reset`.

---

## 19. Files changed

**Schema and migration**
`prisma/schema.prisma` · `prisma/migrations/20261114120000_info_page_draft_published/migration.sql`

**Service and rendering**
`lib/cms/infoPageService.ts` (draft/published split, archive, revisions, protection,
concurrency) · `views/LegalPageView.tsx` (three-way fallback precedence) ·
`lib/seo/sitemapEntries.ts` (snapshot-based eligibility) ·
`app/(public)/info/[slug]/page.tsx` (static params)

**Admin**
`app/admin/info-page-actions.ts` (5 new actions) ·
`views/admin/AdminInfoPagesPage.tsx` (live state, protection, archive/restore/delete,
revision panel, version lock) · `app/admin/(dashboard)/info-pages/page.tsx`

**Tests**
`tests/info-page-draft-published.test.ts` (new, 9 tests) · `tests/stage09-infopage-publication.test.ts` ·
`tests/batch28-cms.test.ts` · `tests/stage09-continuation.test.ts` · `tests/batch-g-info-pages.test.ts` ·
`tests/sitemap-policy.test.ts` · `tests/rodeo-lifecycle.test.ts`

---

## Acceptance against §17 of the brief

Met: published pages editable without unpublishing · publication consistent and atomic ·
revisions restorable · custom pages archivable and restorable · protected pages undeletable ·
navigation visibility independent · legacy fallback no longer exposes a withdrawn page ·
no critical regressions · all run suites pass.

Not met: professional content editing · images and media · centrally managed SEO · Visual
Builder integration · secure draft preview · live/draft comparison.

`COMPLETE — VERIFIED LOCALLY` is **not** claimed.

---

# REVISION 2 — PM-01 to PM-06

**Date:** 2026-11-14. Revision 1's verdict was `PARTIALLY COMPLETE`; all six deliverables are
now implemented and verified, including the end-to-end HTTP publication journey revision 1
could not claim. The Aiven migration and the push were authorised by the owner separately,
after this work was verified locally.

## A. Completion matrix

| ID | Feature | Status | Behavioural evidence |
|---|---|---|---|
| **PM-01** | Page Manager search / filter / sort | **DONE** | `lib/cms/infoPageDirectory.ts`; 10 tests, including that each filter count equals what the list actually renders |
| **PM-02** | Advanced rich text editor | **DONE** | `components/admin/editor/InfoPageBodyEditor.tsx` (TipTap); replaces the raw textarea in both the create and edit forms; driven in a browser by the §D journey |
| **PM-03** | Media Library integration | **DONE** | Hero as a `MediaAsset` reference; body images via the picker; 9 tests |
| **PM-04** | Centralized SEO Intelligence | **DONE** | `LandingEntityType.INFO_PAGE`; SEO captured into the published snapshot; 6 tests |
| **PM-05** | Visual Builder integration | **DONE** | `template:info-page` in `KNOWN_PAGE_KEYS`, resolver, cache paths, public rendering |
| **PM-06** | Secure preview & live/draft comparison | **DONE** | `/admin/info-pages/[slug]/preview/`; staff-only, `noindex`, 10-field diff, three preview widths |

## B. The architectural decisions worth stating

**PM-02 — why TipTap over HTML rather than the article editor.** `RichTextBodyEditor` is
richer but reads and writes `ContentBlock[]`. An information page stores one HTML string, and
every existing page — including the compiled-in policy copy — is HTML. Moving to blocks would
have been a storage-format change with a migration behind it. The new editor reuses the same
TipTap foundation with `getHTML()` as its boundary, so the stored format does not change,
legacy HTML opens unchanged, and `sanitizeLegalHtml` remains the authority on what may be
saved.

**PM-03 — the hero is a reference, not a copy.** Alt text, caption, credit and rights already
live on `MediaAsset`. Copying them onto the page would mean a rights status corrected in the
Media Library stayed wrong on every page that had copied it. One foreign key keeps a single
source of truth; publication then resolves it into the snapshot, so a later Media Library
edit cannot silently alter a live legal page.

**PM-03 — images are restricted to this site's own media routes.** An editor who can store an
arbitrary image source can point a legal page at a third-party server, which then receives
the IP address and user-agent of every reader of that page. The sanitiser strips a foreign
source and then discards the now-sourceless tag, so no broken image is published either.

**PM-04 — SEO is captured at publication, not read live.** `EntitySeo` is one row per entity,
so reading it at render time would publish a draft SEO change the moment it was saved: the
body politely waiting for approval while the title, canonical and robots went live. The
snapshot holds the SEO that was approved alongside the content, and both move only at
publication.

**PM-06 — preview is an admin route, not a tokenised public URL.** A preview secret in a
query string travels in referrer headers, browser history and shared links; it is a URL, not
an authorisation. Sitting inside `/admin/` subjects the request to the same server-side
session and permission check as every other admin screen.

**PM-06 — responsive preview narrows the real page.** The page is rendered once, by the
server, and the viewport control only constrains its container. A separate mobile render
would be a drawing of the page rather than the page, and would stop agreeing with production
the first time a breakpoint changed.

## C. Defects found and fixed during this work

1. **`unpublishInfoPage` asked the wrong question.** It tested the draft's status, so saving
   any edit to a live page would have left the operator unable to take that page down. It
   now tests the live snapshot. Caught by `batch28-cms` before it could ship.
2. **`template:info-page` had no cache paths.** Publishing a layout would not have
   revalidated the public pages. Both URL shapes — the seven legacy policy routes and
   `/info/[slug]` — are now declared.
3. **The whole module was missing from the admin sidebar.** `info-pages` was registered in
   the permission registry and routable, but absent from `MODULE_GROUPS`, so the Page Manager
   was reachable only by typing its URL. Comparing the registry against the sidebar found
   exactly one gap, and this was it. `tests/admin-sidebar-coverage.test.ts` now fails if any
   registered module has no nav entry.

## D. End-to-end HTTP publication verification (brief section 8)

`e2e/info-page-publication.spec.ts` — **passing**. Revision 1 could not claim this, because
information pages are statically rendered with no `revalidate` and a direct database write
never reaches HTTP. This spec drives the **real admin path**, so the server actions and their
`revalidatePath` calls run, and then fetches the public URL as a reader would.

| Step | Asserted |
|---|---|
| 1 | Page created and V1 drafted through the actual screen |
| 2 | Unpublished page returns **404** over HTTP |
| 3 | Preview refused to an unauthenticated request; draft text never in the response |
| 4 | Preview available to the signed-in editor, with the diff panel |
| 5 | V1 published, public URL returns **200** with V1, indexable |
| 6 | V2 drafted, and **the public URL still returns V1** |
| 7 | Preview shows V2 while readers have V1 |
| 8 | V2 published, public URL now returns V2, V1 gone |
| 9 | V1 restored from revisions, and the **live page is still V2** |

Revalidation is polled rather than waited on with a fixed delay: `revalidatePath` invalidates
a cache entry and the page rebuilds on the next request, so a single immediate fetch can
still be served the previous render. Polling distinguishes a race from a defect.

## E. Test results (revision 2)

| Suite | Result |
|---|---|
| **TypeScript** | **PASS**, 0 errors |
| **Vitest** | **3544 passed**, 3 skipped, 157 files (revision 1: 3499 / 153) |
| **New tests this revision** | 46 — directory 10, SEO 6, media 9, sidebar coverage 21 |
| **Production build** | **PASS** |
| **Prisma** | schema valid; dev, test and production all at 28 migrations |

### Test-contract changes

Adding a 16th page key broke six count-based governance assertions — deliberate tripwires
that exist so a page key cannot appear without somebody stating why. Each was updated to 16
(or 8 templates) **with its reason recorded**, exactly as the `archivedAt` tripwire was
handled earlier. No assertion was weakened and no test was skipped.

## F. Database and migrations

| Migration | Contents |
|---|---|
| `20261114120000_info_page_draft_published` | published/draft split, protection, archive, revisions, 2 behaviour-preserving backfills |
| `20261114150000_info_page_entity_seo` | `LandingEntityType.INFO_PAGE` |
| `20261114170000_info_page_hero_media` | `heroMediaId` + index + FK (`ON DELETE SET NULL`) |

**Applied to Aiven production on owner instruction, 2026-11-14.** Row counts identical before
and after — InfoPage 0, MediaAsset 5, EntitySeo 7, Article 12, Subcategory 14 — and
production held 0 `InfoPage` rows, so both backfills were no-ops there. Applied with
`prisma migrate deploy`; `migrate reset` was never used and no destructive statement exists
in any of the three.

**BKP-01 remains unproven.** No restore has ever been rehearsed against Aiven and no
retention window is confirmed. The owner was told this before each migration and chose to
proceed.

## G. Remaining limitations

1. **Scheduled publication** is not implemented.
2. **Archiving a custom page** makes a navigation item pointing at it a dead link, with no
   warning.
3. **Landing SEO (`/admin/landing-seo/`) is in neither the permission registry nor the
   sidebar**, so it is reachable only by URL. Found while fixing the `info-pages` gap; left
   alone because it is a different module and outside this scope.
4. **The five editor work areas are not separate tabs.** Every field exists on one editor
   panel; the areas were not split into a tab set.
5. A first save (no `expectedVersion`) cannot detect a concurrent write.
