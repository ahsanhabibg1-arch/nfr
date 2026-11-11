# NFRGuide — Owner Decisions Required

**Date:** 2026-11-11 · **Branch:** `main` · **HEAD:** `f24af32`
**Every item here needs a business, legal or identity fact that engineering cannot supply.**
Nothing in this document has been implemented. No legal, company, publisher, partner or
social-profile information has been invented.

Decide these eight items and Stage 09 closes. Items marked **blocks staging** must be
answered before a staging deployment; the rest can follow.

| ID | Decision | Blocks staging? |
|---|---|---|
| [OD-1](#od-1) | Commit + push authorisation | **Yes** |
| [OD-2](#od-2) | D-13 privacy wording + reader-data commitments | **Yes** (risk call) |
| [OD-3](#od-3) | D-09 / S-1 information-page schema change | No |
| [OD-4](#od-4) | D-13 affiliate disclosure wording | No |
| [OD-5](#od-5) | D-14 publisher identity + sitewide structured data | No |
| [OD-6](#od-6) | D-A1 autosave: requirements vs implementation | No |
| [OD-7](#od-7) | D-12 scheduled publishing host | No |
| [OD-8](#od-8) | D-A8 per-article noindex control, and D-10 dead column | No |

---

## OD-1 — Authorise the commit and push {#od-1}

**Situation.** All Stage 09 and audit work is uncommitted. `origin/main` is still
`f24af32`, and `render.yaml` deploys `branch: main` with `autoDeploy: false`. A deploy
triggered today would ship **none** of it. The programme's no-commit rule was lifted only
for the earlier `bce3b1c` push, so I have not committed.

**Decision:** may I commit the working tree as one Stage 09 + pre-deployment commit and push
it to `main`? (No force, no rebase, no branch switch.)

☐ Approved  ☐ Approved, but review the diff first  ☐ Not yet

---

## OD-2 — Privacy policy wording and reader-data commitments {#od-2}

**The contradiction, verified in code.** `config/legalPages.ts` → Privacy → "Readers" says:

> "NFRGuide does not ask readers to create accounts and does not set advertising or
> analytics cookies."

The first clause is false as shipped. `/register/` ("Create your reader account"),
`/login/`, `/account/`, `/forgot-password/` and `/reset-password/` are live behind no
feature flag. `lib/auth/reader.ts` creates real `User` rows; a signed-in reader receives
the `nfrguide_session` cookie, which the policy discloses only under "Staff accounts"; and
`ArticleComment` stores reader-authored text with a moderation trail. Registration also
requires ticking acceptance of the Terms **and** this Privacy Policy
(`components/account/forms.tsx`), so readers are consenting to a document that denies the
feature they are using.

The cookie clause **is** accurate: analytics is cookie-free and off by default, and the
session cookie is neither advertising nor analytics.

**What is stored for a reader:** email address, display name, bcrypt password hash,
hashed single-use verification/reset tokens (24 h / 1 h), session rows, and comment text.
**No self-service account deletion exists** (`app/api/account/` exposes only `GET me`), and
no email provider is configured, so verification and reset emails are not sent.

**Proposed replacement — DRAFT — NOT LEGALLY APPROVED:**

> Reading NFRGuide does not require an account. Readers who choose to register (to comment
> on articles) provide an email address, a display name and a password; we store the email
> address and display name, and only a one-way hash of the password. Signing in sets a
> session cookie that is necessary for the account to work. Comments you submit are stored
> with your account and are published only after moderation. NFRGuide does not set
> advertising or analytics cookies.
> **[Owner to supply: how a reader requests deletion of their account and comments, and the
> retention period.]**

**Decisions:**
1. Approve, amend, or reject the wording above. ☐
2. The deletion/retention commitment. Options: (a) state a manual process and a contact
   channel — needs OD-2.4; (b) commission self-service deletion as new work; (c) state that
   accounts cannot yet be self-deleted. ☐
3. Data controller identity and contact (required by the page's own open-items list). ☐
4. The public contact channel, which the Contact and Corrections pages also need.
   `SiteIdentity` already has optional `contactEmail` / `editorialEmail` fields in
   Admin → Settings; confirm whether either may be published. ☐
5. **Staging risk call.** The pages are `noindex` and sitemap-excluded, but reachable by
   anyone with the URL. Choose: (a) deploy staging as-is and accept it on a noindex URL;
   (b) resolve the wording first; (c) gate the reader-account routes behind a flag — a
   product change needing approval. ☐

---

## OD-3 — D-09 / S-1: information-page draft/published separation {#od-3}

**Current limitation, proved by test.** `InfoPage` holds one `body` and one `status`, so a
draft cannot exist beside a published version. `saveInfoPageDraft` therefore **refuses** to
edit a PUBLISHED page — correct, since it prevents silent rewrites of live legal text — but
the only way forward is `unpublishInfoPage`, which removes the page from the public site. For
one of the seven built-in slugs the URL keeps working and silently serves the hardcoded
fallback, which is itself still pending review. There is no revision history for InfoPage.

**Proposed model.** Keep the existing columns as the working copy; add a published copy that
only `publish` writes and only the public read uses, plus an append-only revision table and
an `expectedVersion` concurrency guard matching Stage 08's `PageLayout` contract.

**Exact migration (additive; no column dropped, no row deleted) — NOT CREATED, NOT APPLIED:**

```sql
ALTER TABLE "InfoPage"
  ADD COLUMN "isPublished"              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishedTitle"           TEXT,
  ADD COLUMN "publishedBody"            TEXT,
  ADD COLUMN "publishedSeoTitle"        TEXT,
  ADD COLUMN "publishedMetaDescription" TEXT,
  ADD COLUMN "publishedById"            TEXT,
  ADD COLUMN "version"                  INTEGER NOT NULL DEFAULT 1;

UPDATE "InfoPage"
   SET "isPublished" = true, "publishedTitle" = "title", "publishedBody" = "body",
       "publishedSeoTitle" = "seoTitle", "publishedMetaDescription" = "metaDescription",
       "publishedById" = "updatedById"
 WHERE "status" = 'PUBLISHED';

CREATE TABLE "InfoPageRevision" (
    "id" TEXT NOT NULL, "infoPageId" TEXT NOT NULL, "revisionNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL, "body" TEXT NOT NULL, "seoTitle" TEXT, "metaDescription" TEXT,
    "approvedById" TEXT, "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InfoPageRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InfoPageRevision_infoPageId_revisionNo_key" ON "InfoPageRevision"("infoPageId","revisionNo");
CREATE INDEX "InfoPageRevision_infoPageId_createdAt_idx" ON "InfoPageRevision"("infoPageId","createdAt");
ALTER TABLE "InfoPageRevision" ADD CONSTRAINT "InfoPageRevision_infoPageId_fkey"
  FOREIGN KEY ("infoPageId") REFERENCES "InfoPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

**Data preservation.** Purely additive. Every PUBLISHED row keeps serving byte-identical
text, copied in the same migration before any code reads the new columns. Unpublished rows
are untouched. Pre-flight on a **restored copy** of the target, never the live one:
`SELECT status, count(*) FROM "InfoPage" GROUP BY status;` before and after — the PUBLISHED
count must equal `count(*) WHERE "isPublished"`.

**Publish / unpublish behaviour after the change.** Saving a draft never alters public text;
`publish` copies working → published and appends a revision in one transaction; `unpublish`
clears `isPublished` but retains the content; restoring a revision overwrites the working
copy only and forces re-approval.

**Rollback.** Prepared down-migration preserves any working draft that differs from the live
text into `InfoPage_s1_rollback_drafts`, restores the live text into the single-copy columns,
then drops the new table and columns.

**Tests required.** Eight, listed in `docs/stage-09/STAGE_09_LEGAL_AND_INFO_PAGE_DECISIONS.md`
§1.12 — including draft-over-published isolation, atomic publish+revision, two concurrent
saves, sitemap membership, migration replay and three mutation tests.

**Decision:** ☐ Approve as specified  ☐ Approve with amendments  ☐ Decline (then the
"unpublish to edit" limitation stands and the admin UI keeps warning about it).

---

## OD-4 — Affiliate disclosure wording {#od-4}

`components/editorial/DisclosureBanner.tsx` renders this when an editor sets the disclosure
type to "affiliate" and leaves the note blank:

> "NFRGuide participates in select affiliate programs for hotel accommodations and verified
> secondary ticket platforms. We may earn a modest commission on qualified purchases at no
> additional cost to readers."

It asserts active participation, two named categories and a "verified" status, and is **not**
derived from the monetization database — it renders identically whether or not a single
affiliate partner exists. The reviewable seeded text is hedged: *"Some outbound links are
affiliate links; we may earn a commission on qualifying purchases."*

**Proposed replacement — DRAFT — NOT LEGALLY APPROVED:**

> "This article may contain affiliate links. If you buy through one, NFRGuide may earn a
> commission at no extra cost to you. Commissions do not determine our coverage."

**Decision:** ☐ Approve this hedged fallback (a one-line code change plus one test update)
☐ Confirm the specific active programmes so the current claim becomes true ☐ Other wording.

No affiliate relationship has been fabricated, and the editorial-independence banner — which
correctly *disclaims* affiliation with the PRCA, WPRA, NFR and Las Vegas Events — was left
untouched.

---

## OD-5 — Publisher identity and sitewide structured data {#od-5}

**Already being published, unverified.** `articleJsonLd` and `disciplineJsonLd` in
`lib/seo.tsx` each hardcode `publisher: { '@type': 'Organization', name: 'NFRGuide', url: SITE_URL }`.
So every article and discipline page already asserts an organization identity. It is not read
from `SiteConfig`, has **no `logo`**, and is duplicated across two builders. No sitewide
`Organization`/`WebSite` markup exists. The existing valid markup was deliberately left in
place pending this decision.

| Field | Status | Owner response |
|---|---|---|
| Publisher display name | brand string "NFRGuide", unverified | ☐ confirm / correct: ____________ |
| Legal publisher name | missing (needed for Terms/Privacy, not JSON-LD) | ☐ ____________ |
| Website URL | `https://nfrguide.com` | ☐ confirm apex vs www |
| Logo URL | **none** | ☐ URL: ____________ ☐ no suitable logo exists |
| Social profiles | fields exist in Settings; values unread | ☐ list only genuinely owned URLs: ____________ |
| Organization type | missing | ☐ `Organization` ☐ `NewsMediaOrganization` |
| Contact point / address | optional | ☐ publish ____________ ☐ omit |

**If approved,** one builder keyed by `@id` would replace both hardcoded copies, and a
homepage `Organization` + `WebSite` node would be emitted using confirmed fields only.
`potentialAction` (sitelinks search) is **not** proposed, because `/search/` is `noindex`.

**Decision:** ☐ Approve sitewide markup with the confirmed fields ☐ Correct the name only
☐ Decline (markup stays as it is today).

---

## OD-6 — Autosave: approved requirement vs approved implementation {#od-6}

**The conflict.** Master Requirements v2.0 §12 acceptance test **ADM-03** reads *"Article
create/**autosave** persists; status accurate."* But the article editor has **no autosave**,
`e2e/stage08-publishing.spec.ts` asserts that none was introduced ("nothing saves without the
button"), and the Stage 09 rules explicitly forbid introducing one. The editor instead warns
about unsaved changes via `useUnsavedChangesWarning`. Two approved artefacts disagree, and
this execution changed neither side.

**Option A — amend ADM-03 to manual save (recommended).** Matches the shipped product and
several deliberate decisions across Stages 08–09. Autosave on an editorial CMS risks writing
half-finished text into a record that has an approval workflow and optimistic-concurrency
guards; the unsaved-changes warning already covers accidental loss. Cost: a one-line change
to the acceptance criteria.

**Option B — approve autosave as new work.** Needs draft-safety design, interaction with
`expectedVersion` concurrency, a visible save-state indicator, and new tests — plus removing
the test that currently forbids it. This is Stage 10 scope.

**Recommendation: Option A.** **Decision:** ☐ A ☐ B

---

## OD-7 — Scheduled publishing host (D-12) {#od-7}

**Current behaviour.** `instrumentation.ts` starts an in-process scheduler on every boot
(`lib/cms/scheduledPublishRunner.ts`, 60-second interval). It claims each due schedule with a
guarded atomic update, so repeated or concurrent runs cannot double-publish, and it then calls
the authenticated `POST /api/internal/revalidate` so public pages refresh. That endpoint fails
**closed** without `INTERNAL_REVALIDATE_SECRET`, which is now declared in `render.yaml`.

**The limitation.** Render Free spins the instance down after ~15 minutes idle. While asleep,
**no scheduled publish can run.** There is no catch-up worker: the schedule stays due and
executes on the first tick after some request wakes the instance — which may be hours late, or
not at all if nobody visits. **Scheduled publishing therefore cannot be called reliable on
Render Free**, and this report does not claim it.

| Option | Effect | Cost |
|---|---|---|
| (a) External cron pings the service every N minutes | Keeps it awake enough to fire schedules; also burns free instance-hours (750/month cap) | free-ish, needs an external scheduler |
| (b) Paid always-on instance | Scheduler behaves as designed | paid plan |
| (c) Accept best-effort on staging | Fine for staging; **do not promise scheduled publishing to editors** | free |

**Recommendation for staging: (c), with editors told that scheduling is best-effort.** For
production, (b). **Decision:** ☐ a ☐ b ☐ c

---

## OD-8 — Per-article noindex control (D-A8) and the dead column (D-10) {#od-8}

**D-A8.** `ArticleSeo.robots` is fully honoured on the read side — `lib/seo/articleMeta.ts`
turns it into the page's robots metadata and `lib/seo/sitemapEntries.ts` uses it to decide
sitemap membership — but **nothing writes it.** `articleService` is the only writer of that
table and sets just four columns, so every row keeps the schema default `"index, follow"` and
no editor can noindex a single article except by direct database access.

Engineering is ready: the permission model, the editor form architecture and the central SEO
policy all support it, and the editor now *displays* the stored directive truthfully. What is
missing is **policy**, which is yours: deindexing an article is a publication decision, not a
formatting one.

Proposed policy, for approval rather than invention: the control appears in the article
editor's SEO panel; it is restricted to the permission that already governs publication
(`content.publish`), not to any author; it offers only `index, follow` and `noindex, follow`
(never `nofollow`, so internal links keep being crawled); it writes through the existing
`ArticleSeo` upsert; and each change is audit-logged. It must stay inside the central policy —
no second indexability rule.

**Decision:** ☐ Approve this policy and build the control ☐ Approve with a different
permission ☐ Leave the field read-only.

**D-10.** `ArticleSeo.structuredDataType` has **zero consumers** (re-verified this execution).
Its declared values include `'Guide'` and `'BreadcrumbList'`, which would be invalid as an
Article `@type`, and wiring it up would create a second owner competing with the authoritative
`article.articleType`. **Recommendation: leave it inert now, drop it in a later approved
migration** — no column was dropped and no schema change was made. ☐ Keep inert ☐ Schedule a
drop migration.

---

## How to respond

Answering **OD-1** alone unblocks the path to staging. **OD-2.5** is the one risk call that
should be made before a staging URL is shared. The rest can be answered in any order; each
has a concrete next engineering action recorded in
`docs/audits/NFRGUIDE_FINAL_BLOCKER_REGISTER.md`.
