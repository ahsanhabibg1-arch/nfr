# Article Editor & Editorial Entity Capability Matrix

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`
**Companion:** [Full-System Architecture & Hardcoding Audit](FULL_SYSTEM_ARCHITECTURE_AND_HARDCODING_AUDIT.md)
**Scope:** audit only — no code was changed.

**Status legend**
`WORKING` verified by test or probe · `BUG` verified defect · `GAP` verified missing capability ·
`HARDCODED` editorial value fixed in code · `DEFERRED` deliberately out of scope ·
`CONSTANT` legitimate technical/validation constant, **not** a defect · `NOT VERIFIED`

---

## Part 1 — Article Editor fields

Authoritative source: `ArticleInputSchema` in `lib/cms/articleService.ts:72-150` (29 fields).
UI: `views/admin/AdminArticleEditorShell.tsx`. Write path: `saveArticle` → `persistArticle`
(one transaction, optimistic `expectedVersion` lock, full revision snapshot, audit row).

| # | Field | Purpose | Option source | Admin-configurable options? | Validation | Public rendering | SEO | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | `slug` | Article URL | editor text | n/a | unique; rename creates an `ArticleRedirect` | `/articles/<slug>/` | canonical | `WORKING` |
| 2 | `title` | Headline | editor text | n/a | required | H1 | `headline` in JSON-LD | `WORKING` |
| 3 | `deck` | Kicker/summary | editor text | n/a | optional | deck | JSON-LD `description` (preferred) | `WORKING` |
| 4 | `excerpt` | Summary | editor text | n/a | required, length-gated at publish | card/meta | `description` fallback | `WORKING` |
| 5 | `blocks` | Structured body | RichBlockEditor | block types from `blockRegistry` | per-block schema | `ArticleBody` | body copy | `WORKING` |
| 6 | `seoTitle` | SEO title override | editor text | n/a | optional | — | `<title>` override | `WORKING` |
| 7 | `metaDescription` | Meta description override | editor text | n/a | optional | — | meta description | `WORKING` |
| 8 | `imageSeoTitle` | Hero image SEO title | editor text | n/a | optional | — | image SEO | `WORKING` |
| 9 | `imageAltText` | Hero alt text | editor text | n/a | required at publish | `alt` | accessibility + image SEO | `WORKING` |
| 10 | `subcategory` | **Legacy** free-text label | stored text | n/a | ≤ 120 | kicker fallback | — | `DEFERRED` (preserved by design; see 04-C) |
| 11 | `subcategoryId` | Managed subcategory | `Subcategory` table, filtered to the article's own section | **Yes** — full CRUD + archive | composite FK `(categoryId, subcategoryId)`, `RESTRICT` | kicker (preferred over legacy) | — | `WORKING` |
| 12 | `articleType` | Editorial typology | `ArticleType` table, fallback to the 23 compiled-in definitions | **Yes** — full CRUD, archive, evergreen, schema type | assignable-only at write boundary | type chip, archive filter | drives `Article` vs `NewsArticle` | `WORKING` |
| 13 | `categoryName` | Primary section | **hardcoded array of 5** — `AdminArticleEditorShell.tsx:57` | **No** — `Category` CRUD exists but the dropdown ignores it | required | section, breadcrumb | section URL | **`HARDCODED`** → H-01 |
| 14 | `authorName` | Byline | `Author` table (prop) | **Yes** — create/edit/delete | required | byline, `AuthorBio` | JSON-LD `author` | `WORKING` |
| 15 | `authorRole` | Byline role | `Author.role` | **Yes** | optional | byline | `jobTitle` | `WORKING` |
| 16 | `reviewerName` | Editorial reviewer | editor text | n/a | optional | review line | E-E-A-T | `WORKING` |
| 17 | `heroImage` | Hero image URL | Media Library picker | **Yes** — Media Library | ≤ 600 | hero `<img>` | preload, `srcset` | `WORKING` |
| 18 | `imageCredit` | Image credit | editor text | n/a | ≤ 300 | credit line | rights | `WORKING` |
| 19 | `imageCaption` | Image caption | editor text | n/a | ≤ 600 | caption | — | `WORKING` |
| 20 | `imageRightsStatus` | Licence status | fixed union (`RIGHTS_LABEL`) | **No — and correctly so** | enum | — | rights compliance | `CONSTANT` |
| 21 | `disclosure` | Disclosure type | fixed union `DisclosureType` | **No — and correctly so** | enum | `DisclosureBanner` | FTC compliance | `CONSTANT` |
| 22 | `disclosureNote` | Disclosure text | editor text | n/a | optional | banner | — | `WORKING` |
| 23 | `tags` | Tags | `Tag` table **+ inline creation** | **Partly** — create/delete; **no rename** | upsert by deterministic id (`articleService.ts:341`) | tag chips | — | `WORKING` / `GAP` → G-03 |
| 24 | `takeaways` | Key takeaways | editor list | n/a | optional | takeaway block | — | `WORKING` |
| 25 | `sources` | Source citations | `Source` table + inline creation | **Yes** — full CRUD + status | id reused when free | `SourceList` | E-E-A-T | `WORKING` |
| 26 | `disciplineIds` | Linked disciplines | `Discipline` table | **Yes** — full CRUD (Issue 03) | ids validated | related links | entity linking | `WORKING` |
| 27 | `hubIds` | Linked rodeo hubs | `RodeoHub` table | **Yes** — full CRUD + archive | ids validated | related links | entity linking | `WORKING` |
| 28 | `eventIds` | Linked events | `RodeoEvent` table | **Yes** | ids validated | related links | entity linking | `WORKING` |
| 29 | `editionIds` | Linked editions | `RodeoEventEdition` table | **Yes** | ids validated | related links | entity linking | `WORKING` |

**Concurrency:** `expectedVersion` is an optimistic lock — a stale save is refused with
*"This article was changed by someone else."* `CONSTANT`/`WORKING`.

### Lifecycle

`lib/cms/articleService.ts:669-681` — the transition graph is complete and permission-gated:

```
DRAFT ──submit──► IN_REVIEW ──approve──► APPROVED ──publish──► PUBLISHED ──► ARCHIVED
  ▲                   │                     │  └─schedule─► SCHEDULED ─┘         │
  └───────review──────┴─────review──────────┘                                    │
  └────────────────────────── edit.any ◄──────────────────────────────────────────┘
```

| Step | Status | Evidence |
|---|---|---|
| Create | `WORKING` | `tests/batch15-editor.test.ts`, `stage06-save-outcome.test.ts` |
| Save draft | `WORKING` | same |
| Edit | `WORKING` | same; version lock tested |
| Preview | `WORKING` | `ArticleDraftPreview`; `tests/batch-f-preview.test.ts` |
| Publish | `WORKING` | publication gate (excerpt, alt text) enforced |
| Update | `WORKING` | slug rename creates a redirect |
| **Archive** | `WORKING` | `PUBLISHED → ARCHIVED`, `ARCHIVED → DRAFT` both present and gated |
| Restore revision | `WORKING` | `restoreRevision`; `tests/batch-c-revisions.test.ts`. Accepts historical values unconditionally **by design** |
| Schedule | `WORKING` | `tests/batch-d-scheduling.test.ts` |

**Suite evidence:** 6 lifecycle/editor/entity suites — **230 tests, all passing**.

---

## Part 2 — Editorial entities

Columns: **Model** (Prisma) · **Admin UI** · **Create/Edit/Archive** · **Editor can select** ·
**Public page** · **SEO metadata** · **Server-side RBAC** · **Code registry restricting admin values?**

| Entity | Model | Admin UI | C / E / A | Editor select | Public page | SEO | RBAC | Restricting registry | Status |
|---|---|---|---|---|---|---|---|---|---|
| **Category / Section** | ✅ `Category` | ✅ Editorial Organization | ✅ / ✅ / — (delete, no archive) | ⚠️ **from a hardcoded list of 5** | ✅ `/categories/[slug]`, `/[section]` | ⚠️ partly — see H-02, H-03 | ✅ `taxonomy.manage` | ⚠️ `config/routes.ts` + editor array | **`HARDCODED`** H-01 |
| **Subcategory** | ✅ `Subcategory` | ✅ Editorial Organization | ✅ / ✅ / ✅ | ✅ (section-filtered) | ❌ none | n/a | ✅ `taxonomy.manage` | none | `WORKING` + `DEFERRED` (no public route) |
| **Article Type** | ✅ `ArticleType` | ✅ Editorial Organization | ✅ / ✅ / ✅ | ✅ | ❌ none (a filter, not a URL) | ✅ drives JSON-LD type | ✅ 3 separate permissions | compiled-in set is **fallback only** | `WORKING` |
| **Discipline** | ✅ `Discipline` | ✅ Rodeo Coverage | ✅ / ✅ / ✅ | ✅ | ✅ `/disciplines/[slug]` | ✅ EntitySeo + FAQ | ✅ `rodeo.manage` | none | `WORKING` |
| **Rodeo Hub** | ✅ `RodeoHub` | ✅ Rodeo Coverage | ✅ / ✅ / ✅ | ✅ | ✅ via events | ✅ | ✅ | none | `WORKING` |
| **Rodeo Event** | ✅ `RodeoEvent` | ✅ Rodeo Coverage | ✅ / ✅ / ✅ | ✅ | ✅ `/rodeo-events/[slug]` | ✅ | ✅ | none | `WORKING` |
| **Event Edition** | ✅ `RodeoEventEdition` | ✅ Rodeo Coverage | ✅ / ✅ / ✅ | ✅ | ✅ `/rodeo-events/[slug]/[edition]` (+ results/schedule/standings) | ✅ | ✅ | none | `WORKING` |
| **Competitor** | ✅ `Competitor` | ✅ Competitors | ✅ / ✅ / ✅ | ✅ (via article relations) | ✅ `/competitors/[slug]` | ✅ | ✅ | none | `WORKING` |
| **Venue** | ✅ `Venue` | ✅ Venues | ✅ / ✅ / ✅ | — | ✅ `/venues/[slug]` | ✅ | ✅ | none | `WORKING` |
| **Tag** | ✅ `Tag` | ✅ Editorial Organization | ✅ / ❌ **no rename** / — | ✅ inline creation | ❌ no tag archive page | n/a | ✅ `taxonomy.manage` | none | `GAP` G-03 |
| **Author** | ✅ `Author` | ✅ Editorial Organization | ✅ / ✅ / — | ✅ | ❌ no author page | n/a | ✅ `author.manage` | none | `WORKING` + `DEFERRED` |
| **Media Asset** | ✅ `MediaAsset` | ✅ Media Library | upload / ✅ / ✅ visibility | ✅ picker | n/a | ✅ alt, credit, rights | ✅ `media.*` (5 perms) | none | `WORKING` |
| **Source** | ✅ `Source` | ✅ Sources | ✅ / ✅ / ✅ status | ✅ inline creation | n/a | E-E-A-T | ✅ `source.manage` | none | `WORKING` |
| **Navigation** | ✅ `NavigationItem` | ✅ Website & Navigation | ✅ / ✅ / ✅ visible | — | ✅ header/footer | n/a | ✅ `navigation.manage` | static fallback **when empty** — documented | `WORKING` |
| **Section Config** | ✅ `SectionConfig` | ✅ Settings | — / ✅ / — | — | ⚠️ `/[section]` only | ⚠️ partial | ✅ `system.config` | overlays `config/routes.ts` | `BUG` H-02, H-04, H-05 |
| **Info Page** | ✅ `InfoPage` | ✅ Info & Legal Pages | ✅ / ✅ / ✅ workflow | — | ✅ `/info/[slug]` | ✅ | ✅ `system.config` | `config/legalPages.ts` is a **documented fallback** | `WORKING` |
| **Site Config** (footer, appearance) | ✅ `SiteConfig` | ✅ Appearance + Footer editors | — / ✅ / draft→publish | — | ✅ `layout.tsx:31`, `page.tsx:34` | — | ✅ | 2 fixed keys — `CONSTANT` | `WORKING` |
| **Page Layout** (Visual Builder) | ✅ `PageLayout` + revisions | ✅ Website | ✅ / ✅ / ✅ + schedule | — | ✅ all layout pages | — | ✅ | `sectionRegistry` block catalogue — `CONSTANT` | `WORKING` |
| **Global Block** | ✅ `GlobalBlock` | ✅ Website | ✅ / ✅ / ✅ toggle | — | via Builder | — | ✅ | none | `NOT VERIFIED` (no public consumer traced) |
| **Announcement** | ✅ `Announcement` | ✅ Website | ✅ / ✅ / ✅ toggle | — | via Builder | — | ✅ | none | `NOT VERIFIED` (no public consumer traced) |
| **Entity SEO / FAQ** | ✅ `EntitySeo`, `EntityFaq` | ✅ Landing & SEO | ✅ / ✅ / ✅ | — | ✅ intro + FAQ accordion | ✅ FAQ JSON-LD | ✅ `seo.config` | none | `WORKING` |
| **Competition data** | ✅ Session/Result/Standing | ✅ Competition | ✅ / ✅ / — | — | ✅ edition sub-pages | — | ✅ | none | `WORKING` |
| **Comments** | ✅ `ArticleComment` | ✅ Comment Moderation | — / ✅ / ✅ | — | ✅ `CommentSection` | — | ✅ `comment.*` | none | `WORKING` |
| **Readers / Team / Roles** | ✅ | ✅ | ✅ | — | — | — | ✅ | RBAC matrix — `CONSTANT`, **not** a defect | `WORKING` |

### Entities an administrator can create **without a developer**

✅ Subcategory · Article Type · Discipline · Rodeo Hub · Event · Edition · Competitor · Venue ·
Tag · Author · Source · Navigation item · Info Page · Global Block · Announcement · FAQ ·
Media Asset · Page Layout

❌ **Category / primary section** — creatable in the database, but unusable: the editor will
not offer it, and no route or navigation entry follows. **H-01.**

---

## Part 3 — Unverified areas

| Area | Why |
|---|---|
| Global Blocks & Announcements on public pages | No public consumer traced within the audit budget; they may render through the Builder's slot resolver. Not claimed either way. |
| R2 upload against the real bucket | Local storage provider only (`MEDIA_STORAGE_PROVIDER=local`); production R2 was not reachable. |
| Any production behaviour | No production access path exists in this session. |
| Browser-level admin interaction | Verified through services, server actions and HTTP; no automated browser driver was used. |
