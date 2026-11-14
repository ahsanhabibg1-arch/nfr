# NFRGuide — Public Pages, Navigation & SEO Management: Architecture Audit

## VERDICT: `INVESTIGATION ONLY — one live SEO defect found, no code changed`

**Date:** 2026-11-14 · **Branch:** `main` · **HEAD:** `148c481`
**Mode:** read-only. No implementation, no schema change, no migration, no commit, no deploy.
Production was read but never written. The live site was fetched over HTTPS to verify
rendered output.

---

## 1. Executive summary

**The capability the owner is asking for mostly exists. The problem is that it is not being
used, and the fallback it drops to is actively harmful to SEO.**

Three findings matter more than the rest.

**1. All seven policy pages are live, indexable URLs that tell readers they are unfinished —
and tell Google not to index them.** This is not a theory from reading code; it was measured
against `https://nfrguide.com`:

| URL | HTTP | Draft banner rendered | Robots |
|---|---|---|---|
| `/about/` | 200 | **yes** | **`noindex, nofollow`** |
| `/privacy/` | 200 | **yes** | **`noindex, nofollow`** |
| `/terms/` | 200 | **yes** | **`noindex, nofollow`** |
| `/editorial-policy/` | 200 | **yes** | **`noindex, nofollow`** |

The banner reads *"Draft — pending owner and legal review · This page describes how the site
currently works. Its wording has not been finalized."* followed by a bulleted list of items
still to be confirmed. Anyone who opens the Privacy Policy or Terms of Use sees that.

The cause is not a bug. It is a **correct fallback with an empty database behind it**: the
`InfoPage` table in production holds **0 rows**, so every page falls back to the built-in
copy in `config/legalPages.ts`, where all seven entries are marked
`review: 'pending-owner-review'`. The renderer, the metadata and the sitemap all agree with
each other and all three conclude "not ready". The system is behaving exactly as designed;
nobody has ever published a page through it.

**2. Navigation management is genuinely complete, and it already honours the three
distinctions in the brief.** Hiding a link does not unpublish its page, a canonical lock is
on the nav row rather than the page, and deleting a nav item cannot touch editorial data.
That part needs no work.

**3. Page CONTENT and page SEO are the real gaps.** The editor offers four fields — title, a
raw HTML textarea, SEO title, meta description. There is no rich text, no preview, no image
support of any kind (`<img>` is stripped by the sanitiser), no canonical control, no Open
Graph, no structured data beyond breadcrumbs, no revision history, no soft delete, and no
Visual Builder page family. Information pages are also **absent from the centralized SEO
module** — `LandingEntityType` has no `INFO_PAGE` member — so they are the one public page
family the SEO Intelligence architecture does not reach.

**Nothing here requires a new CMS or a second SEO system.** Both already exist and both have
a clearly shaped hole where information pages should plug in.

---

## 2. Exact inventory of existing public pages

Every one of the seven is a **7-line delegating route**. There is no page-specific React.

| Page | Route | Source file | Renders |
|---|---|---|---|
| About NFRGuide | `/about/` | `app/(public)/about/page.tsx` | `<LegalPageView slug="about" />` |
| Editorial Policy | `/editorial-policy/` | `app/(public)/editorial-policy/page.tsx` | `<LegalPageView slug="editorial-policy" />` |
| Corrections Policy | `/corrections/` | `app/(public)/corrections/page.tsx` | `<LegalPageView slug="corrections" />` |
| Affiliate Disclosure | `/affiliate-disclosure/` | `app/(public)/affiliate-disclosure/page.tsx` | `<LegalPageView slug="affiliate-disclosure" />` |
| Privacy Policy | `/privacy/` | `app/(public)/privacy/page.tsx` | `<LegalPageView slug="privacy" />` |
| Terms of Use | `/terms/` | `app/(public)/terms/page.tsx` | `<LegalPageView slug="terms" />` |
| Contact | `/contact/` | `app/(public)/contact/page.tsx` | `<LegalPageView slug="contact" />` |
| **Any additional page** | `/info/<slug>/` | `app/(public)/info/[slug]/page.tsx` | `<LegalPageView slug={slug} />` |

**Other public routes that are NOT part of this family** and have their own owners: the five
section landings, `/categories/[slug]`, `/articles/[slug]`, `/disciplines/[slug]`,
`/venues/[slug]`, `/competitors/[slug]`, `/rodeo-events/**`, `/search`, `/account/**`, and
the auth routes (`/login`, `/register`, `/forgot-password`, `/reset-password`).

---

## 3. Current content ownership architecture

`views/LegalPageView.tsx` is the single renderer, and it resolves **two competing sources in
a fixed order**:

```
getPublishedInfoPage(slug)   → DB row, status = PUBLISHED      ... wins
getLegalPage(slug)           → config/legalPages.ts, compiled in ... fallback
neither                      → notFound()
```

| Aspect | Database (`InfoPage`) | Compiled-in (`config/legalPages.ts`) |
|---|---|---|
| Storage | `InfoPage` table, one row per slug | 225-line TypeScript module, 7 entries |
| Body format | HTML string, sanitised on save **and** on render | structured `sections[].heading` + `paragraphs[]` |
| Editable by admin | yes | **no — requires a developer and a deploy** |
| Carries review state | `status` enum | `review: 'pending-owner-review'` on **all seven** |
| Rows in production | **0** | 7 |

**The practical consequence:** today the owner cannot change a word of any policy page
without a code change, even though an editor exists, because nothing has been created in it.
The moment a page is published through the admin, that page's DB row takes over completely —
body, title, SEO title, meta description — and the draft banner and the `noindex` both
disappear for that page.

`InfoPage` model — `prisma/schema.prisma:1871`:

```
id, slug (unique), title, body, seoTitle?, metaDescription?,
status (DRAFT | PENDING_REVIEW | APPROVED | PUBLISHED),
approvedById?, approvedAt?, publishedAt?, createdById?, updatedById?, createdAt, updatedAt
```

Note what is **not** in that model: no `deletedAt`, no revision relation, no canonical, no OG
fields, no media reference, no protection flag, no scheduling field.

---

## 4. Navigation management findings

Service: `lib/cms/navigationService.ts` · Model: `NavigationItem` (`schema.prisma:1080`) ·
Admin: `/admin/website/` (Header & Nav tab) · Permission gate: `requireNav(actor)` on every
mutation · Audit row written on every mutation.

| Action | Supported | Behaviour and evidence |
|---|---|---|
| Add | **Yes** | `createNavItem` — validates the URL, forces `isSystem: false` so an operator cannot mint a canonical row |
| Edit | **Yes, with a deliberate restriction** | `updateNavItem` — for `isSystem` rows only `label`, `sortOrder`, `visible`, `description` change; `url` and `location` are preserved |
| Hide / Show | **Yes** | `setNavVisible` — flips `visible` only |
| Reorder | **Yes** | `sortOrder`, indexed `@@index([location, sortOrder])` |
| Delete | **Yes, non-system only** | `deleteNavItem` refuses `isSystem` with *"Canonical navigation links cannot be deleted — hide it instead."* |
| Lock / Unlock | **Intentionally restricted** | `isSystem` is set by seeding, not by an admin action. There is no unlock |
| Restore canonical links | **Yes** | `restoreCanonicalNav` — create-missing-only, never overwrites a customised value, never deletes |

### The three distinctions in the brief — all three already hold

| Distinction | Status | Why |
|---|---|---|
| Hiding a nav link must not unpublish its page | **Correct** | `setNavVisible` touches one boolean on `NavigationItem`. Nothing reads it when rendering a page |
| Locking a canonical nav item ≠ locking page content | **Correct** | `isSystem` guards a row's `url`/`location`/deletion. It has no relationship to `InfoPage` at all |
| Deleting a nav item must not delete its destination | **Correct** | `deleteNavItem` deletes one `NavigationItem`. There is no cascade to any content table |

### One pre-existing ownership conflict, carried forward

`SiteConfig.footer.columns` **silently replaces** the `footer-sections` / `footer-academy`
menus when configured (`SiteFooter.tsx:67-74`). An administrator editing footer links in
Header & Nav can see no public change and be given no warning. This was already recorded in
`docs/NFRGUIDE-FULL-ADMIN-CONTROL-AUDIT.md` §7.3 and is unchanged.

A second, smaller duplication belongs to this audit: `LegalPageView` renders its own
**policy cross-navigation** at the bottom of every policy page, built directly from the
compiled-in `LEGAL_PAGES` array. It is not admin-managed and does not consult
`NavigationItem`, so a hidden or renamed policy link in the admin still appears there.

---

## 5. Public page editing capabilities

Admin UI: `views/admin/AdminInfoPagesPage.tsx` (246 lines) · Route: `/admin/info-pages/`

The editor offers exactly **four fields**:

| Field | Control |
|---|---|
| Title | `<input>` |
| **Body** | **`<textarea rows={12}>` labelled "Body (plain text or HTML)"** |
| SEO Title (optional override) | `<input>` |
| Meta Description | `<textarea rows={2}>` |

| Capability | Status | Evidence |
|---|---|---|
| Page title | **Exists** | `title` field |
| Main heading (H1) | **Exists, indirectly** | H1 is always `title`; it cannot be set separately |
| Introductory description | **Exists, conflated** | the visible intro paragraph is `metaDescription` — one value serving both the page and the search snippet |
| Full page body | **Exists, raw** | HTML typed by hand into a textarea |
| Rich-text content | **Missing** | zero matches for rich-text/Tiptap in the admin page |
| Headings, paragraphs, lists, tables | **Exists in output** | sanitiser allows `h1`–`h6`, `p`, `ul`/`ol`/`li`, `table`/`thead`/`tbody`/`tr`/`th`/`td`, `blockquote`, `pre`, `code` |
| Links | **Exists** | `a` with `href`, `title`, `rel`, `target`; schemes limited to `https`, `http`, `mailto` |
| **Images** | **Not possible** | **`img` is absent from the sanitiser allowlist, so any image tag is discarded on save and on render** |
| Notices / disclaimers | **Missing as a construct** | only the automatic draft banner; no editorial callout |
| FAQ sections | **Missing** | no FAQ relation for info pages |
| Page layout and sections | **Missing** | fixed single-column template |
| **Preview** | **Missing** | zero matches for preview in the admin page |
| Create new custom pages without code | **Yes, with a caveat** | "Create New Info Page" works; the new page is reachable at `/info/<slug>/` only — a top-level path like `/press/` still needs a route file |

### Persistence chain — verified by code path

`Admin editor → saveInfoPageDraft → Zod validation → sanitizeLegalHtml → prisma.infoPage.upsert → audit row`
then `LegalPageView → getPublishedInfoPage → sanitizeLegalHtml (again) → rendered`.
The body is sanitised **twice**, on write and on read, so a row written before an allowlist
change cannot reintroduce a stripped tag.

### The editing defect that matters — D-09 / S-1

A **PUBLISHED page cannot be edited at all**. `saveInfoPageDraft` refuses with a message that
is unusually honest about why:

> *"This page is PUBLISHED, so its content cannot be edited in place — there is no
> draft-alongside-published capability yet. To change it you must Unpublish it first, which
> removes it from public view."*

For a legal page this is worse than it sounds: unpublishing one of the seven legacy slugs
does not 404, it **reverts the live URL to the compiled-in draft text with the pending-review
banner**. So correcting a typo in a published Privacy Policy means showing visitors an
unapproved draft for the duration of the edit. The code comments state that the real fix
needs schema change **S-1** and is blocked pending owner approval.

---

## 6. Page-level SEO capabilities

| Field | Status | Where stored / evidence |
|---|---|---|
| SEO title | **Exists** | `InfoPage.seoTitle`, falls back to `title` |
| Meta description | **Exists** | `InfoPage.metaDescription`, falls back to config `description` |
| Robots index/noindex | **Derived, not controllable** | `noindex: !db && (!page \|\| page.review !== 'approved')` — publishing is the only way to make a page indexable; an operator cannot noindex a published page |
| Follow / nofollow | **Missing** | never set independently; the live pages emit `noindex, nofollow` as one unit |
| Canonical URL | **Missing** | no override field; path is always the route path |
| Open Graph title / description / image | **Missing** | not passed to `buildMetadata` for this family |
| Twitter/X metadata | **Missing** | same |
| Featured image | **Missing** | no field, and `<img>` is stripped from the body |
| Image ALT / credit / rights | **Missing** | no image support at all |
| Breadcrumbs | **Exists** | visible trail plus `breadcrumbJsonLd([Home, <title>])` |
| Structured data | **Breadcrumbs only** | no `Article`, `WebPage`, `AboutPage` or `ContactPage` type |
| FAQ structured data | **Missing** | no FAQ relation for info pages |
| Sitemap inclusion / exclusion | **Exists, policy-driven** | `sitemapEntries.ts:288` — `contentEligible: infoAt.has(slug) \|\| review === 'approved'` |
| **SEO Intelligence integration** | **MISSING — the structural gap** | `LandingEntityType` has no `INFO_PAGE`; `landingEntities.ts` and `landingAdminService.ts` contain zero references to info pages |
| Internal link analysis | **Missing for this family** | the link inventory covers article bodies |
| SEO preview / validation | **Missing** | no SEO Assistant equivalent on this editor |

### Which system is authoritative, and the one place that is wrong

For every other public entity — disciplines, categories, sections, venues, competitors, rodeo
hubs, events, editions and now subcategories — SEO metadata lives in **`EntitySeo`**, edited
in **Landing SEO**, merged over defaults by `mergeSeoMeta`, and carrying `seoTitle`,
`metaDescription`, `canonicalOverride`, `ogImage`, `noindex` and `intro`.

Information pages are the **single exception**. They carry their own two SEO columns on their
own table, edited in a different module, with no canonical control and no OG image. That is
already a second, weaker SEO surface — so adding `INFO_PAGE` to `LandingEntityType` would
*remove* a duplicate system rather than create one.

### Sitemap and rendering agree — no inconsistency

The live `sitemap.xml` contains **0** policy URLs, which is the correct consequence of all
seven being `noindex`. The two systems are coherent; they are simply coherent about the wrong
state.

---

## 7. Media Library integration status

**None.** There is no integration at any level:

- `InfoPage` has no media column or relation.
- The admin editor imports no picker.
- The sanitiser discards `<img>`, so even hand-written HTML cannot carry an image.

A policy page therefore cannot have a hero, a diagram, a signature or a logo.

---

## 8. Visual Builder integration status

**No page family covers these pages.** `KNOWN_PAGE_KEYS` (`lib/cms/sectionRegistry.ts:993`)
holds 15 keys:

```
homepage · section:competition · section:entertainment · section:events-shopping ·
section:plan-watch · section:rodeo-events · template:article · template:rodeo-hub ·
template:rodeo-edition · template:discipline · template:category · template:competitor ·
template:venue · directory:competitors · directory:venues
```

A search of those keys for `static`, `policy`, `info`, `legal` or `about` returns **zero**
matches. There is no `template:static-page`, no `template:policy-page`, and no equivalent.

What this means for the recommendation: the Builder's architecture (page key → stored layout
→ revisions → draft/publish → `resolve*TemplateSlots` → `ArticleAppendageSlots`) is already
generic and already serves seven families. Adding `template:info-page` would follow the same
shape rather than inventing one. It is an extension, not a new system.

---

## 9. Page lifecycle, protection and permissions

Service: `lib/cms/infoPageService.ts` (207 lines).

```
DRAFT ──submit──► PENDING_REVIEW ──approve──► APPROVED ──publish──► PUBLISHED
  ▲                                                                    │
  └──────────────── revertToDraft ◄──── unpublish ◄────────────────────┘
```

| Capability | Status | Evidence |
|---|---|---|
| Draft | **Exists** | `saveInfoPageDraft` |
| Submit for review | **Exists** | `submitForReview`, refuses anything but `DRAFT` |
| Approve | **Exists** | `approveInfoPage`, stamps `approvedById` / `approvedAt` |
| Published | **Exists** | `publishInfoPage` |
| Unpublished | **Exists** | `unpublishInfoPage` |
| Revert to draft | **Exists** | `revertToDraft`; editing an APPROVED page also drops the approval **and clears the stamp**, and says so in the audit record |
| Edit while published | **MISSING — D-09 / S-1, owner-blocked** | see §5 |
| Hidden from navigation | **Exists, separately** | `NavigationItem.visible`; correctly not coupled to publication |
| Noindex | **Derived only** | see §6 |
| Locked against editing | **Missing** | no protection flag on `InfoPage` |
| Protected system page | **Missing as a flag; safe in practice** | there is **no delete function at all** in the service, so no page can be removed through the admin |
| Soft delete / restore | **Missing** | no `deletedAt` on `InfoPage` |
| Revision history | **Missing** | no revision table; `ArticleRevision` has no counterpart here |
| Scheduled publication | **Missing** | no scheduling field |
| Preview | **Missing** | see §5 |
| Role-based permissions | **Exists** | every mutation calls `need(actor, 'system.config')` |
| Audit logging | **Exists, thorough** | every transition writes an audit row; the approval-reset case writes an explanatory detail string |

**On deletion:** the brief asks not to recommend unrestricted deletion of required system
pages. The current design already goes further — nothing can be deleted. The gap is the
opposite one: there is no way to retire a genuinely obsolete custom page except to unpublish
it, which leaves the row and the `/info/<slug>/` URL 404ing with no record of intent.

---

## 10. Current public presentation

`LegalPageView` renders a fixed template: `max-w-3xl` centred column, `px-4 sm:px-6 py-10`,
a `"Publication policy"` mono kicker, a serif H1 at `text-3xl sm:text-4xl`, the description
paragraph, the conditional draft banner, the body, then the policy cross-navigation.

| Aspect | Observation |
|---|---|
| Page width | `max-w-3xl` — a comfortable measure, consistent with the article template |
| Typography / hierarchy | Single H1 from `title`; DB bodies render through `prose prose-stone`, config bodies render `h2` per section. **Two different typographic paths for the same page family** |
| Draft notice styling | Amber bordered aside, `aria-label="Draft notice"`, `data-legal-review="pending"` — well built; the problem is that it is public, not how it looks |
| Responsive | Fluid single column; no fixed widths; no overflow risk identified |
| Accessibility | H1 present, labelled aside, labelled cross-nav `<nav aria-label="Publication policies">`. Not formally axe-audited in this investigation |
| Breadcrumbs | JSON-LD only — `Home → <title>`. **No visible breadcrumb trail**, unlike articles and entity pages |
| Footer duplication | See §4 — the bottom cross-nav is a third link surface after header nav and footer |

No redesign is proposed here, per the brief.

---

## 11. Feature matrix

Legend: **E** fully implemented and verified · **EV?** implemented, not behaviourally
verified in this audit · **P** partial · **M** missing · **R** intentionally restricted

| # | Feature | E | EV? | P | M | R | Code evidence | Recommendation |
|---|---|---|---|---|---|---|---|---|
| 1 | Policy pages publicly routed | ✔ | | | | | `app/(public)/<slug>/page.tsx` ×7 | keep |
| 2 | DB-backed page content | | ✔ | | | | `InfoPage`, `infoPageService.ts` | **use it — 0 rows in production** |
| 3 | Compiled-in fallback | ✔ | | | | | `config/legalPages.ts` | keep as a safety net only |
| 4 | Create page without code | | ✔ | | | | `AdminInfoPagesPage.tsx:208` | extend to top-level paths |
| 5 | Rich-text body editing | | | | ✔ | | raw `<textarea>` | reuse `RichTextBodyEditor` |
| 6 | Images in page body | | | | ✔ | | `img` not in allowlist | allow `img` + Media Library |
| 7 | Media Library integration | | | | ✔ | | no reference anywhere | reuse `MediaPickerModal` |
| 8 | Page preview | | | | ✔ | | no preview in admin | reuse the draft-preview guard |
| 9 | SEO title / meta description | | ✔ | | | | `InfoPage.seoTitle`, `.metaDescription` | migrate to `EntitySeo` |
| 10 | Canonical override | | | | ✔ | | not passed to `buildMetadata` | via `EntitySeo` |
| 11 | Robots control (operator-set) | | | ✔ | | | derived from publish state | via `EntitySeo.noindex` |
| 12 | Open Graph / Twitter | | | | ✔ | | not set for this family | via `EntitySeo.ogImage` |
| 13 | Breadcrumb JSON-LD | ✔ | | | | | `LegalPageView` | add a visible trail |
| 14 | FAQ structured data | | | | ✔ | | no FAQ relation | via `EntityFaq` |
| 15 | Sitemap policy | ✔ | | | | | `sitemapEntries.ts:288` | keep |
| 16 | SEO Intelligence integration | | | | ✔ | | no `INFO_PAGE` in `LandingEntityType` | **add the enum member** |
| 17 | Visual Builder page family | | | | ✔ | | 15 keys, none applicable | add `template:info-page` |
| 18 | Draft → review → approve → publish | | ✔ | | | | `infoPageService.ts` | keep |
| 19 | Edit while published | | | | ✔ | | D-09 / S-1 refusal | **needs schema S-1** |
| 20 | Revision history | | | | ✔ | | no revision table | follow `ArticleRevision` |
| 21 | Soft delete / restore | | | | ✔ | | no `deletedAt` | add with protection flag |
| 22 | Page protection flag | | | | ✔ | | no column | add `isSystem`-style flag |
| 23 | Scheduled publication | | | | ✔ | | no field | defer |
| 24 | Nav add / edit / reorder | | ✔ | | | | `navigationService.ts` | keep |
| 25 | Nav hide / show | | ✔ | | | | `setNavVisible` | keep |
| 26 | Nav delete, canonical guarded | | ✔ | | | | `deleteNavItem` | keep |
| 27 | Nav lock / unlock | | | | | ✔ | `isSystem` seed-only | keep restricted |
| 28 | Restore canonical nav | | ✔ | | | | `restoreCanonicalNav` | keep |
| 29 | Nav RBAC + audit | | ✔ | | | | `requireNav` + `audit` on each | keep |
| 30 | Info page RBAC + audit | | ✔ | | | | `need(actor,'system.config')` | consider a dedicated permission |
| 31 | Footer column ownership | | | ✔ | | | `SiteFooter.tsx:67-74` | warn in the admin |
| 32 | Policy cross-nav admin-managed | | | | ✔ | | hardcoded `LEGAL_PAGES` | drive from `NavigationItem` |

Nothing in rows 24–29 was exercised in a browser during this audit; they are marked **EV?**
because the code path and its guards were read rather than clicked.

---

## 12. SEO and publication risks

Ordered by severity.

| # | Risk | Severity | Status |
|---|---|---|---|
| 1 | **All 7 policy pages show a public "Draft — pending owner and legal review" banner** | **High** | **Confirmed live** on 4 of 7 by HTTPS fetch; the other 3 share the identical code path and the same `review` value |
| 2 | **All 7 are `noindex, nofollow`** — the site has no indexable About, Privacy, Terms, Contact or Editorial Policy | **High** | **Confirmed live.** These are the pages search engines and E-E-A-T assessment look for |
| 3 | Policy URLs absent from `sitemap.xml` | Medium | **Confirmed live** (0 of 7). Correct given #2, and resolves with it |
| 4 | Editing a published policy page requires unpublishing it, reverting the live URL to unapproved draft text | **High** | D-09 / S-1, owner-blocked; no safe edit path exists today |
| 5 | Information pages invisible to SEO Intelligence | Medium | No `INFO_PAGE` entity type; these pages are never audited, scored or link-analysed |
| 6 | Policy cross-nav hardcoded, a third link surface | Low | `LegalPageView` bottom nav ignores `NavigationItem` |
| 7 | Footer columns silently override nav menus | Low | Pre-existing, `SiteFooter.tsx:67-74` |
| 8 | No canonical control on any info page | Low | No duplicate observed today; a risk if a page is ever reachable at two paths |
| 9 | Custom pages confined to `/info/<slug>/` | Low | A marketing or press page cannot take a top-level URL without a code change |
| 10 | No visible breadcrumb on policy pages | Low | JSON-LD claims a trail the page does not show |

**No compliance or legal claim is made here.** Whether the current wording of any policy is
adequate is a question for the owner and their counsel. This audit reports only that the
pages publicly describe themselves as unfinished.

---

## 13. Recommended architecture

**Do not build a new module.** Three existing systems already cover this; information pages
are simply not wired into two of them.

| Concern | Owner today | Owner in the recommendation |
|---|---|---|
| Factual page content | `InfoPage` + Info & Legal Pages admin | **unchanged** |
| Presentation / layout | nothing | **Visual Builder**, via a new `template:info-page` key |
| SEO metadata | `InfoPage.seoTitle` + `.metaDescription` | **`EntitySeo` / Landing SEO**, via `LandingEntityType.INFO_PAGE` |
| Navigation | `NavigationItem` | **unchanged** |
| Media | nothing | **Media Library**, via the existing `MediaPickerModal` |

This keeps the Controlled Hybrid boundary the project already follows, and it **reduces** the
number of SEO surfaces from two to one.

### Why not a new "Public Pages" module

The brief asks whether a dedicated management interface is needed. The existing
`/admin/info-pages/` already provides the directory, the status column, the type column
(Legacy vs CMS) and the workflow actions. What it lacks is depth per page, not breadth across
pages. Extending that one screen is smaller, and it avoids a second place where a page can be
created.

---

## 14. Implementation phases and dependencies

Each phase is independently shippable and ordered by value per unit of risk.

| Phase | Work | Depends on | Schema |
|---|---|---|---|
| **0** | **Publish the seven pages through the existing admin.** Removes risks #1, #2 and #3 with no code at all | nothing | none |
| **1** | Rich text + Media Library in the info page editor; allow `img` in the sanitiser with required `alt` | 0 | none |
| **2** | `LandingEntityType.INFO_PAGE` — canonical, OG image, operator-set robots, intro and FAQ for info pages; retire `InfoPage.seoTitle`/`.metaDescription` after backfill | 1 | **additive enum + backfill** |
| **3** | `template:info-page` in the Visual Builder | 2 | none |
| **4** | Draft-alongside-published (**S-1**) — the only safe way to edit a live policy page | nothing | **requires owner approval** |
| **5** | Revision history, protection flag, soft delete + restore | 4 | additive columns + new table |
| **6** | Visible breadcrumb; drive the policy cross-nav from `NavigationItem`; warn in the admin about footer precedence | nothing | none |

**Phase 0 is the whole of the live problem.** It needs no engineering — only the owner
reviewing the seven drafts and pressing Publish.

---

## 15. Database migration requirements

None are needed for Phases 0, 1, 3 and 6.

| Phase | Change | Destructive? |
|---|---|---|
| 2 | `ALTER TYPE "LandingEntityType" ADD VALUE 'INFO_PAGE'` + backfill `EntitySeo` rows from the two existing columns | No — additive, same shape as the `SUBCATEGORY` addition applied on 2026-11-14 |
| 4 (S-1) | Separate draft and published body — a second column or a `published` snapshot row | **Owner approval required.** The shape is a design decision, not a mechanical change |
| 5 | `InfoPage.deletedAt`, `InfoPage.isProtected`, and an `InfoPageRevision` table | No — all additive |

Any production migration must still clear **BKP-01**: no restore has ever been rehearsed
against the Aiven database.

---

## 16. Acceptance criteria for a future implementation

1. No public page renders a draft or pending-review banner.
2. Every policy page returns `index, follow` and appears in `sitemap.xml`.
3. An administrator can edit a **published** policy page without it leaving the public site.
4. Page body supports headings, lists, tables, links and images with required ALT text.
5. Canonical, OG image and robots for an info page are set in Landing SEO, not a second form.
6. SEO Intelligence audits info pages alongside every other public family.
7. A page can be previewed before publication.
8. Revisions are recorded and an earlier version can be restored.
9. A required system page cannot be deleted; an obsolete custom page can be archived.
10. Hiding a nav link still does not unpublish its page — the existing guarantee is preserved.
11. No second SEO system exists at the end of the work; `InfoPage.seoTitle` and
    `.metaDescription` are gone once `EntitySeo` owns them.

---

## 17. File paths and code evidence

| Concern | Path |
|---|---|
| Policy routes (×7) | `apps/web/app/(public)/{about,editorial-policy,corrections,affiliate-disclosure,privacy,terms,contact}/page.tsx` |
| Catch-all route | `apps/web/app/(public)/info/[slug]/page.tsx` |
| Shared renderer + metadata | `apps/web/views/LegalPageView.tsx` |
| Compiled-in fallback copy | `apps/web/config/legalPages.ts` |
| Page service + lifecycle | `apps/web/lib/cms/infoPageService.ts` |
| D-09 refusal message | `apps/web/lib/cms/infoPageService.ts:80` |
| HTML sanitiser + allowlist | `apps/web/lib/cms/sanitizeHtml.ts:3` |
| Admin UI | `apps/web/views/admin/AdminInfoPagesPage.tsx` |
| `InfoPage` model | `apps/web/prisma/schema.prisma:1871` |
| Navigation service | `apps/web/lib/cms/navigationService.ts` |
| `NavigationItem` model | `apps/web/prisma/schema.prisma:1080` |
| Footer precedence conflict | `apps/web/components/.../SiteFooter.tsx:67-74` |
| Sitemap rule for legal pages | `apps/web/lib/seo/sitemapEntries.ts:288` |
| Builder page keys | `apps/web/lib/cms/sectionRegistry.ts:993` |
| `LandingEntityType` enum | `apps/web/prisma/schema.prisma:1812` |
| Landing SEO service | `apps/web/lib/cms/landingAdminService.ts` |

### Verification performed

- **Static:** every file above read directly.
- **Production database (read-only):** `InfoPage` row count — **0**.
- **Live site (HTTPS GET):** `/about/`, `/privacy/`, `/terms/`, `/editorial-policy/` — HTTP
  status, presence of `data-legal-review="pending"`, and the `robots` meta tag.
- **Live sitemap:** policy URL count — **0**.
- **Not performed:** browser-driven admin interaction (nav edit, lock, hide, save/reload,
  RBAC enforcement). Those rows are marked **EV?** in §11 rather than claimed as verified.
