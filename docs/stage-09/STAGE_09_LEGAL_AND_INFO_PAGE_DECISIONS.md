# Stage 09 — Legal, Information-Page and Publisher-Identity Decisions

**Status of every decision in this file: NOT APPROVED — owner decision required.**
Nothing here has been implemented, migrated or published. Wording marked
**NOT LEGALLY APPROVED** is a proposal for review only and must not be copied into the
product until the owner (and legal counsel where indicated) approves it.

Evidence base: the code at `main` = `f24af32` plus the uncommitted Stage 09
continuation changes listed in `STAGE_09_COMPLETION_REPORT.md`. Every factual claim
below cites the file it was read from. The development and production databases were
**not** queried, so live row contents (for example, whether any `InfoPage` row is
currently PUBLISHED in production) are stated as **unknown**, not assumed.

Contents

1. Package 1 — D-09 / S-1: InfoPage separate draft and published content
2. Package 2 — D-13: legal content approval (seven-page matrix, privacy and affiliate findings)
3. Package 3 — D-14: publisher identity and sitewide structured data
4. Decisions requested, in one table

---

## 1. Package 1 — D-09 / S-1: InfoPage draft/published separation

### 1.1 The defect, as measured

Pinned by `apps/web/tests/stage09-infopage-publication.test.ts` (DB-backed, isolated
test database):

| # | Behaviour today | Test |
|---|---|---|
| 1 | `saveInfoPageDraft` **refuses** to touch a PUBLISHED page, so live text is never silently rewritten. | `DEFECT: editing a PUBLISHED page is refused…` |
| 2 | The only path to edit a published page is `unpublishInfoPage`, which takes it off the public site immediately. | `DEFECT: the only forward path removes the page from public view` |
| 3 | For one of the seven built-in slugs, unpublishing silently swaps in the hardcoded `config/legalPages.ts` text, which is still `pending-owner-review`. | `DEFECT: for a LEGACY slug, unpublishing silently swaps in different built-in text` |
| 4 | `InfoPage` holds one `body` and one `status`; there is no column that could hold a draft while another version stays live. | `there is NO draft-alongside-published capability` |
| 5 | There is no revision history for InfoPage at all. | `DEFECT: the refusal names a mechanism that does not exist` (asserts no revision export) |

Stage 09 safeguards already in place (no schema change): honest refusal text, the
unpublish audit record states the public effect, a save over an APPROVED page clears the
stale approval stamp and audits "approval reset". The Stage 09 continuation added the
matching **admin UI** honesty (disabled-Edit explanation, unpublish confirmation stating
the public effect, approval-reset message, failure shown as failure) — see
`AdminInfoPagesPage.tsx` and `tests/stage09-continuation.test.ts`.

### 1.2 Current schema (verbatim, `apps/web/prisma/schema.prisma`)

```prisma
model InfoPage {
  id              String         @id @default(uuid())
  slug            String         @unique
  title           String
  body            String
  seoTitle        String?
  metaDescription String?
  status          InfoPageStatus @default(DRAFT)
  approvedById    String?
  approvedAt      DateTime?
  publishedAt     DateTime?
  createdById     String?
  updatedById     String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
}

enum InfoPageStatus { DRAFT PENDING_REVIEW APPROVED PUBLISHED }
```

### 1.3 Proposed schema (S-1) — NOT APPLIED

Design principle: keep the existing columns as the **working copy** (so the editor code
path that writes them barely changes), and add a separate **published copy** that only
`publish` writes and only the public read uses. Add an immutable revision table.

```prisma
model InfoPage {
  id              String         @id @default(uuid())
  slug            String         @unique
  // ── Working copy: edited by saveDraft, reviewed, never served publicly ──
  title           String
  body            String
  seoTitle        String?
  metaDescription String?
  status          InfoPageStatus @default(DRAFT)   // review state of the WORKING copy
  approvedById    String?
  approvedAt      DateTime?
  // ── Published copy: written only by publish, read only by the public route ──
  isPublished              Boolean   @default(false)
  publishedTitle           String?
  publishedBody            String?
  publishedSeoTitle        String?
  publishedMetaDescription String?
  publishedAt              DateTime?
  publishedById            String?
  // ── Concurrency ──
  version         Int            @default(1)
  createdById     String?
  updatedById     String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  revisions       InfoPageRevision[]
}

/// Immutable snapshot of every published version (append-only).
model InfoPageRevision {
  id              String   @id @default(uuid())
  infoPageId      String
  revisionNo      Int
  title           String
  body            String
  seoTitle        String?
  metaDescription String?
  approvedById    String?
  publishedById   String?
  createdAt       DateTime @default(now())
  infoPage        InfoPage @relation(fields: [infoPageId], references: [id], onDelete: Restrict)

  @@unique([infoPageId, revisionNo])
  @@index([infoPageId, createdAt])
}
```

### 1.4 Exact migration SQL — NOT CREATED, NOT APPLIED

Proposed directory: `prisma/migrations/<timestamp>_s1_infopage_draft_published/migration.sql`.
Requires PostgreSQL ≥ 13 for `gen_random_uuid()` (built in); otherwise enable `pgcrypto`.

```sql
-- S-1: separate working and published InfoPage content (additive; no column is dropped).
ALTER TABLE "InfoPage"
  ADD COLUMN "isPublished"              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishedTitle"           TEXT,
  ADD COLUMN "publishedBody"            TEXT,
  ADD COLUMN "publishedSeoTitle"        TEXT,
  ADD COLUMN "publishedMetaDescription" TEXT,
  ADD COLUMN "publishedById"            TEXT,
  ADD COLUMN "version"                  INTEGER NOT NULL DEFAULT 1;

-- Backfill: a row that is PUBLISHED today is served exactly as it is now.
UPDATE "InfoPage"
   SET "isPublished"              = true,
       "publishedTitle"           = "title",
       "publishedBody"            = "body",
       "publishedSeoTitle"        = "seoTitle",
       "publishedMetaDescription" = "metaDescription",
       "publishedById"            = "updatedById"   -- best available; the column did not exist
 WHERE "status" = 'PUBLISHED';

CREATE TABLE "InfoPageRevision" (
    "id"              TEXT NOT NULL,
    "infoPageId"      TEXT NOT NULL,
    "revisionNo"      INTEGER NOT NULL,
    "title"           TEXT NOT NULL,
    "body"            TEXT NOT NULL,
    "seoTitle"        TEXT,
    "metaDescription" TEXT,
    "approvedById"    TEXT,
    "publishedById"   TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InfoPageRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InfoPageRevision_infoPageId_revisionNo_key" ON "InfoPageRevision"("infoPageId", "revisionNo");
CREATE INDEX "InfoPageRevision_infoPageId_createdAt_idx" ON "InfoPageRevision"("infoPageId", "createdAt");
ALTER TABLE "InfoPageRevision" ADD CONSTRAINT "InfoPageRevision_infoPageId_fkey"
  FOREIGN KEY ("infoPageId") REFERENCES "InfoPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed revision 1 for every currently published page, so history starts at the live version.
INSERT INTO "InfoPageRevision" ("id","infoPageId","revisionNo","title","body","seoTitle","metaDescription","approvedById","publishedById","createdAt")
SELECT gen_random_uuid()::text, "id", 1, "title", "body", "seoTitle", "metaDescription",
       "approvedById", "updatedById", COALESCE("publishedAt", CURRENT_TIMESTAMP)
  FROM "InfoPage" WHERE "status" = 'PUBLISHED';
```

### 1.5 Data preservation

- Purely **additive**: no column is dropped, renamed or retyped; no row is deleted.
- Every PUBLISHED row keeps serving byte-identical title/body/SEO (copied in the same
  migration, before any code reads the new columns).
- DRAFT / PENDING_REVIEW / APPROVED rows are untouched and remain unpublished
  (`isPublished = false`), which matches today's public behaviour (`getPublishedInfoPage`
  filters on `status = 'PUBLISHED'`).
- Pre-flight check to run on a **restored copy** of production, never production itself:
  `SELECT status, count(*) FROM "InfoPage" GROUP BY status;` before and after; the
  PUBLISHED count must equal `count(*) WHERE "isPublished"` and the revision count.

### 1.6 Publication state machine (working copy × published copy)

| Event | Guard | Working copy | Published copy | `version` |
|---|---|---|---|---|
| T1 saveDraft | `system.config`; `expectedVersion` match | written; `status → DRAFT`; approval cleared if it was PENDING/APPROVED | **untouched** | +1 |
| T2 submitForReview | status = DRAFT | `status → PENDING_REVIEW` | untouched | +1 |
| T3 approve | status = PENDING_REVIEW | `status → APPROVED`, stamp approver | untouched | +1 |
| T4 publish | status = APPROVED | `status → PUBLISHED` | **copied from working**; `isPublished = true`; revision row appended in the **same transaction** | +1 |
| T5 revertToDraft | status ∈ {PENDING, APPROVED} | `status → DRAFT`, approval cleared | untouched | +1 |
| T6 unpublish | `isPublished = true` | untouched | `isPublished = false` (content retained for audit) | +1 |
| T7 restoreRevision(n) | `system.config`; revision exists | overwritten from revision n; `status → DRAFT` (must be re-approved) | untouched | +1 |

Consequences: editing a live page no longer requires taking it down (fixes D-09 #1–#3);
publishing is the only way public text changes; a restore never publishes by itself.

### 1.7 Optimistic concurrency

Same contract as Stage 08 `PageLayout`: every mutating action takes `expectedVersion`
(required, not optional), and the write is a guarded
`updateMany({ where: { slug, version: expectedVersion }, data: { …, version: { increment: 1 } } })`.
`count === 0` → `ServiceError('conflict')`, audited as `info_page.version_conflict`
with expected/current versions. The admin form carries the version it loaded.

### 1.8 Revision history

Append-only `InfoPageRevision`, written only inside the T4 transaction; revision numbers
allocated with the Stage 08 retry-on-unique-violation pattern (`publishWithRevision`).
`ON DELETE RESTRICT` so history cannot be lost by deleting a page. List/restore require
`system.config`.

### 1.9 RBAC and audit

No new permission. All transitions keep requiring `system.config` (as today, pinned by
`requires system.config at every transition`). New audit actions:
`info_page.version_conflict`, `info_page.restore_revision`; `info_page.publish` gains
`revisionNo` in its detail; `info_page.unpublish` keeps its "removed from public" text.

### 1.10 Cache invalidation map

| Event | Paths to revalidate |
|---|---|
| T1/T2/T3/T5/T7 | `/admin/info-pages/` only (public output unchanged — this is the point of S-1) |
| T4 publish, T6 unpublish | `/admin/info-pages/`, `/{slug}/`, `/info/{slug}/`, **`/sitemap.xml`** (legal sitemap membership depends on publication; the Stage 09 continuation already adds this to today's actions) |

### 1.11 Rollback

Down-migration (prepared, not created). It must not silently discard a working draft that
differs from the live text, so it first preserves those drafts:

```sql
CREATE TABLE "InfoPage_s1_rollback_drafts" AS
  SELECT * FROM "InfoPage"
   WHERE "isPublished" AND ("title","body") IS DISTINCT FROM ("publishedTitle","publishedBody");
-- Restore the live text into the single-copy columns so the old code serves the same page.
UPDATE "InfoPage" SET "title" = "publishedTitle", "body" = "publishedBody",
       "seoTitle" = "publishedSeoTitle", "metaDescription" = "publishedMetaDescription",
       "status" = 'PUBLISHED'
 WHERE "isPublished";
DROP TABLE "InfoPageRevision";
ALTER TABLE "InfoPage" DROP COLUMN "isPublished", DROP COLUMN "publishedTitle",
  DROP COLUMN "publishedBody", DROP COLUMN "publishedSeoTitle",
  DROP COLUMN "publishedMetaDescription", DROP COLUMN "publishedById", DROP COLUMN "version";
```

Code rollback: revert the service/route commit; the old code reads only the original
columns, which the rollback has restored to the live text.

### 1.12 Tests that S-1 would make possible (written here, not added as red tests)

1. Saving a draft over a PUBLISHED page leaves `getPublishedInfoPage` byte-identical.
2. Publish copies working → published and appends exactly one revision, atomically
   (a forced failure after the copy leaves neither).
3. Two concurrent saves with the same `expectedVersion`: exactly one succeeds, the other
   gets `conflict` and an audit row.
4. Unpublish then republish restores the same text and increments `revisionNo`.
5. Restore never changes public output until a new publish.
6. The sitemap lists a legal slug iff `isPublished` (or its config page is approved).
7. Migration replay (`npm run test:migration`): a PUBLISHED fixture row serves the same
   body before and after the migration.
8. Mutation tests: drop the `version` guard; write published columns in saveDraft; skip the
   revision insert — each must be killed.

### 1.13 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Code path still reading `title/body` for the public page after migration | High | Single public reader (`getPublishedInfoPage`) switched in the same change; test #1 |
| Backfill mis-classifies a live row | Medium | Additive SQL + pre/post counts on a restored copy |
| Editors expect edits to go live on save | Medium | UI already states saves do not publish |
| Revision table growth | Low | Legal pages change rarely; no pruning needed |

**Decision requested:** approve S-1 as specified (or amend), and confirm D-09 policy:
*"A published information page may be edited as a draft while the published version stays
live; the public text changes only on publish."*

---

## 2. Package 2 — D-13: legal content approval

### 2.1 Seven-page matrix

Source for every row: `apps/web/config/legalPages.ts` (built-in text) and
`views/LegalPageView.tsx` / `lib/seo/sitemapEntries.ts` (visibility and SEO rules).

Rendering rule (code, verified): if a PUBLISHED `InfoPage` row exists for the slug, it is
served and is **indexable** and in the sitemap; otherwise the built-in text is served with a
visible "Draft — pending owner and legal review" notice, `noindex`, and excluded from the
sitemap. Canonical is the short path (`/{slug}/`), robots `noindex, nofollow` while pending
(`LEGACY_NOINDEX`). **DB state per slug: unknown** — the development and production
databases were deliberately not queried.

| Page (slug) | Content source | Built-in review state | Public visibility today | Robots / sitemap (no DB row) | Last modified | Missing factual inputs (`ownerInputs`) | Technical readiness | Legal review | Owner approval needed |
|---|---|---|---|---|---|---|---|---|---|
| About NFRGuide (`about`) | config; DB override if published | pending-owner-review | Public, draft notice | noindex; excluded | not tracked in config | Publisher / owning entity name; editorial team and roles | Ready | Not required beyond owner | Approve wording + entity name (ties to D-14) |
| Editorial Policy (`editorial-policy`) | config | pending | Public, draft notice | noindex; excluded | not tracked | Source-verification thresholds; who approves publication; AI-assisted drafting | Ready | Recommended | Approve policy statements |
| Corrections Policy (`corrections`) | config | pending | Public, draft notice | noindex; excluded | not tracked | Correction request channel; correction-notice format | Blocked on contact channel | Recommended | Approve + supply channel |
| Affiliate & Advertising Disclosure (`affiliate-disclosure`) | config | pending | Public, draft notice | noindex; excluded | not tracked | Whether any affiliate/ad programme is active; final wording | Ready | **Required** (FTC-style disclosure) | Confirm programmes; approve wording; resolve §2.3 |
| Privacy Policy (`privacy`) | config | pending | Public, draft notice | noindex; excluded | not tracked | Data controller identity/contact; legal basis & jurisdiction; analytics decision | **Blocked**: text contradicts product (§2.2) | **Required** | Approve corrected wording; supply controller identity |
| Terms of Use (`terms`) | config | pending | Public, draft notice | noindex; excluded | not tracked | Owning entity & governing law; content licensing terms | Blocked on entity/jurisdiction | **Required** | Approve + supply entity/law |
| Contact (`contact`) | config | pending | Public, draft notice | noindex; excluded | not tracked | Public contact channel; whether a postal address is published | Blocked on channel | Not required | Supply channel |

Note: `SiteIdentity` (`lib/cms/settingsService.ts`) has optional `contactEmail` and
`editorialEmail` fields editable in Admin → Settings. Their stored values were not read.
If the owner has already entered a contact address there, the Contact and Corrections
pages can reuse it once the owner confirms it is meant to be public.

### 2.2 Finding — the Privacy Policy contradicts the product (verified again)

`config/legalPages.ts`, Privacy → Readers states: *"NFRGuide does not ask readers to create
accounts and does not set advertising or analytics cookies."*

Verified in code at this checkpoint:

- `/register/`, `/login/`, `/account/` (+ `/forgot-password/`, `/reset-password/`) are live
  routes behind no feature flag (`tests/stage09-ownership-and-privacy.test.ts`).
- `lib/auth/reader.ts`: readers are real `User` rows with the `reader` role; email, display
  name and a password hash are stored; verification/reset tokens are stored **hashed**,
  single-use, expiring (24 h / 1 h). No email provider is configured, so no email is sent.
- `lib/auth/session.ts`: a signed-in reader receives the HttpOnly `nfrguide_session`
  cookie (the policy discloses it only under "Staff accounts").
- `ArticleComment` stores reader-authored text, PENDING until moderated; author relation
  with `onDelete: Cascade`.
- `components/account/forms.tsx`: registration requires ticking *"I accept the Terms and
  Privacy Policy"* — i.e. consent is collected against two documents that are themselves
  drafts, one of which says accounts do not exist.
- No self-service account deletion route was found (`app/api/account/` exposes `GET me`).
- The cookie clause (no advertising/analytics cookies) is consistent with the code: the
  analytics pipeline is cookie-free and off by default.

Proposed replacement for Privacy → Readers — **NOT LEGALLY APPROVED**:

> Reading NFRGuide does not require an account. Readers who choose to register (to comment
> on articles) provide an email address, a display name and a password; we store the email
> address and display name, and only a one-way hash of the password. Signing in sets a
> session cookie that is necessary for the account to work. Comments you submit are stored
> with your account and are published only after moderation. NFRGuide does not set
> advertising or analytics cookies. [Owner to supply: how a reader can request deletion of
> their account and comments, and the retention period.]

Owner decisions: approve (or amend) the wording; decide the deletion/retention commitment
(no self-service deletion exists today — committing to one is a product change); confirm
the data controller identity.

### 2.3 Finding — the affiliate banner fallback over-claims (verified again)

`components/editorial/DisclosureBanner.tsx` renders, when `type === 'affiliate'` and the
article's `disclosureNote` is blank:

> "NFRGuide participates in select affiliate programs for hotel accommodations and verified
> secondary ticket platforms. We may earn a modest commission on qualified purchases at no
> additional cost to readers. Editorial recommendations remain strictly independent and
> unbiased."

It asserts active participation, two named categories and a "verified" status, and is not
derived from the monetization database (which may hold zero partners). The reviewable,
seeded text (`lib/cms/monetizationSeed.ts`) is hedged: *"Some outbound links are affiliate
links; we may earn a commission on qualifying purchases."*

Proposed fallback — **NOT LEGALLY APPROVED**: replace the hardcoded sentence with the same
hedged text the database already uses, so the two cannot disagree:

> "This article may contain affiliate links. If you buy through one, NFRGuide may earn a
> commission at no extra cost to you. Commissions do not determine our coverage."

Owner decision: approve this fallback (one-line code change, then one test update), or
confirm the specific programmes so the current claim becomes true.

### 2.4 Other D-13 observations (no change made)

- The editorial-independence banner correctly **disclaims** official affiliation; it needs
  no approval and must not be softened.
- `affiliate-disclosure` says "No third-party advertising scripts are currently loaded";
  consistent with the CSP (`script-src 'self' 'unsafe-inline'`, report-only).
- Publishing an `InfoPage` through the CMS (APPROVED → PUBLISHED, `system.config` only) makes
  that slug indexable and sitemap-listed. That is the designed approval path; whoever holds
  `system.config` is therefore the de facto legal approver. Owner decision: confirm that.

---

## 3. Package 3 — D-14: publisher identity and sitewide structured data

### 3.1 What is already claimed (inventory, verified)

| Surface | Claim | Source | Verified by owner? |
|---|---|---|---|
| Article JSON-LD `publisher` | `{ '@type': 'Organization', name: 'NFRGuide', url: SITE_URL }` | `lib/seo.tsx` `articleJsonLd` (hardcoded) | **No** |
| Discipline JSON-LD `publisher` | same, duplicated | `lib/seo.tsx` `disciplineJsonLd` (hardcoded) | **No** |
| Open Graph `og:site_name` | `NFRGuide` | `app/layout.tsx` (hardcoded) | No |
| Default `<title>` / brand suffix | "NFRGuide" | `lib/seo.tsx` `brandedTitle` | No (brand, not legal identity) |
| SiteIdentity settings (admin-editable) | `siteName` default "NFRGuide", tagline, description, optional `contactEmail`, `editorialEmail`, `twitterUrl`, `facebookUrl`, `instagramUrl` | `lib/cms/settingsService.ts` | Stored values not read |
| Sitewide `Organization` / `WebSite` JSON-LD | **none** | pinned by `stage09-seo-integrity.test.ts` | — |
| Publisher logo | **none** anywhere in structured data | same | — |

Correction carried forward: an earlier Stage 09 pass wrongly reported that no Organization
markup existed anywhere. The nested `publisher` node above has been emitted on every article
and discipline page since Batch A.

### 3.2 Verification checklist (owner to supply or confirm)

| Field | Status | Notes |
|---|---|---|
| Publisher display name | Brand "NFRGuide" in use, **unverified** | Confirm exact spelling/casing |
| Legal publisher name | **Missing** | Required for Terms/Privacy, not for JSON-LD |
| Website URL | `https://nfrguide.com` (`PRODUCTION_SITE_URL`) | Confirm canonical host (www vs apex) |
| Logo | **Missing** | Needs a hosted square/rectangular image URL the owner controls |
| Contact details | Fields exist (`contactEmail`, `editorialEmail`); values unknown | Confirm which, if any, may be public |
| Business address | **Missing** | Optional; only if the owner wants it public |
| Social profiles | Fields exist (Twitter/X, Facebook, Instagram); values unknown | Confirm each URL is owned by the publisher |
| Organization type | **Missing** | e.g. `Organization` vs `NewsMediaOrganization` |
| Editorial relationship to event organizers | Verified **independent** (disclaimer text) | No affiliation may be claimed |

### 3.3 Proposed markup — verified fields only, NOT IMPLEMENTED

Once the owner confirms, one builder (single owner, replacing both hardcoded nodes) would
read the confirmed values from `SiteIdentity` and emit, on the homepage only:

```json
[
  { "@context": "https://schema.org", "@type": "Organization",
    "@id": "https://nfrguide.com/#publisher",
    "name": "<confirmed display name>", "url": "https://nfrguide.com/",
    "logo": "<confirmed logo URL — omitted if not supplied>",
    "sameAs": ["<only owner-confirmed profile URLs>"] },
  { "@context": "https://schema.org", "@type": "WebSite",
    "@id": "https://nfrguide.com/#website",
    "name": "<confirmed display name>", "url": "https://nfrguide.com/",
    "publisher": { "@id": "https://nfrguide.com/#publisher" } }
]
```

Article and discipline nodes would then reference `{ "@id": "https://nfrguide.com/#publisher" }`
instead of repeating a hardcoded object. `potentialAction` (sitelinks search) is **not**
proposed: `/search/` is `noindex`. No address, legal name, founding date or contact point is
emitted unless separately approved.

**Decisions requested:** (a) confirm or correct the publisher name already being emitted;
(b) supply a logo URL or confirm none; (c) list which social profiles are genuinely the
publisher's; (d) approve or decline sitewide Organization/WebSite markup.

---

## 4. Decisions requested

| ID | Decision | Blocks |
|---|---|---|
| D-09 | Adopt "edit as draft while published stays live" policy | S-1 implementation |
| S-1 | Approve the schema/migration in §1.3–1.4 (or amend) | InfoPage draft isolation, revision history |
| D-13a | Approve corrected Privacy → Readers wording (§2.2) and a deletion/retention commitment | Privacy page approval |
| D-13b | Approve the affiliate banner fallback (§2.3) | Article affiliate disclosures |
| D-13c | Supply missing `ownerInputs` and approve each of the seven pages | Indexing of legal pages |
| D-13d | Confirm `system.config` holders are the legal approvers for CMS-published pages | Governance |
| D-14 | Confirm publisher identity fields and sitewide markup (§3.2–3.3) | Organization/WebSite JSON-LD, logo |
| D-10 | Drop or keep `ArticleSeo.structuredDataType` (dead column; drop = schema change) | Schema hygiene |
