# Full-System Architecture, Article Editor, Entity Management & Hardcoding Audit

**Date:** 2026-11-13 · **Branch:** `main` · **HEAD:** `aafdad296363e4b69d3b01594540116f9b58f39d`
**Mode:** AUDIT ONLY — **no application code was changed**, no fixes applied.
**Companion:** [Article Editor & Entity Capability Matrix](ARTICLE_EDITOR_ENTITY_CAPABILITY_MATRIX.md)

---

## 1. Executive summary

The platform is **substantially administrator-managed already**. Of the editorial entities an
editor touches, 18 can be created, edited and archived by an authorized administrator with no
developer involvement. The Article Editor's 29 fields all save, reload and render; the workflow
graph is complete through archive and revision restore; and RBAC is enforced in the service
layer, not merely in the UI.

**Eight findings. One matters more than the rest.**

| ID | Severity | Finding |
|---|---|---|
| **B-01** | **P1** | `/categories/<anything>/` returns **HTTP 200 with `index, follow`** on a production host. Every other unknown-entity route correctly returns `noindex`. Unlimited indexable soft-404s. |
| **H-01** | **P1** | The Article Editor's **Primary Section dropdown is a hardcoded list of five**, while Categories are fully admin-creatable. A created category can never be assigned to an article. |
| **H-02** | P2 | `Category.description` is editable in the admin and **never read by any public surface**. |
| **H-03** | P2 | `/[section]` honours admin `SectionConfig` overrides; `/categories/[slug]` **ignores them**. Two URLs for one section disagree. |
| **H-04** | P2 | The Settings screen offers a **section "Hero image URL"** that no public surface reads. |
| **G-03** | P3 | A **Tag cannot be renamed** from the admin (create and delete only). |
| **H-05** | P3 | `SectionConfig.visible` is a dead column — no control, no consumer. |
| **H-06** | P3 | JSON-LD `publisher.name` is hardcoded `'NFRGuide'` although a `SiteConfig` subsystem exists. |

**No P0 issues were found.** No security, data-loss or publication-integrity defect surfaced.

**Theme.** The defects cluster in one place: the **primary section / category axis** is the only
editorial concept still owned by code (`config/routes.ts`) rather than by the database — and the
three subsystems that partly overlay it (`Category`, `SectionConfig`, `config/routes.ts`)
disagree about who owns what. Everything the 04-x programme has already migrated to the database
(Article Type, Subcategory, Discipline, Rodeo entities) is clean.

---

## 2. Verified working features

Each verified by a passing test, a service-level probe, or an HTTP probe — **not** by the presence
of a control.

| Area | Evidence |
|---|---|
| Article lifecycle | Full graph `DRAFT → IN_REVIEW → APPROVED → {SCHEDULED} → PUBLISHED → ARCHIVED → DRAFT`, each transition permission-gated (`articleService.ts:669-681`) |
| Editor save/reload | 6 suites, **230 tests passing** (`batch15-editor`, `batch-c-revisions`, `batch-d-scheduling`, `stage06-save-outcome`, `rodeo-lifecycle`, `issue03-discipline-cms`) |
| Optimistic locking | `expectedVersion` mismatch is refused with a readable message |
| Slug rename safety | Creates an `ArticleRedirect`; old URLs keep resolving |
| Revision restore | Restores historical values unconditionally **by design**, bypassing the assignability gate |
| Article Type CMS | 23 definitions; managed + fallback; transactional bootstrap; tombstones; three separate permissions |
| Managed Subcategory | Composite FK `(categoryId, subcategoryId)` with `RESTRICT`; cross-section assignment refused by the service **and** the database |
| Tag inline creation | Editor creates tags on save via `tx.tag.upsert` (`articleService.ts:341`) |
| Navigation | DB-backed (`NavigationItem`), with a **documented** static fallback when a location is empty, so the header is never blank |
| Footer & appearance | `SiteConfig` draft→publish, consumed at `app/(public)/layout.tsx:31` and `app/(public)/page.tsx:34` |
| Info/legal pages | `InfoPage` workflow; `config/legalPages.ts` is an explicitly documented fallback until published |
| Unknown-entity routes | `/articles`, `/disciplines`, `/venues`, `/competitors` all return 200 + `noindex` — a deliberate, consistent soft-404 policy |
| Sitemap | Contains only the five real section archives; no stray category URLs |
| RBAC | Enforced in services; tested per role including "nothing mutated after refusal" |

---

## 3. Verified bugs

### B-01 — `/categories/[slug]` makes every unknown slug indexable · **P1** · SEO / publication integrity

**Module:** `app/(public)/categories/[slug]/page.tsx`

**Expected:** an unknown category slug behaves like every other unknown entity — HTTP 200 with
`noindex`, or a 404.

**Actual:** HTTP 200 with `<meta name="robots" content="index, follow">`.

**Reproduction** (dev server, production `Host` header so IDX-02's staging `X-Robots-Tag` does
not mask the result):

```
curl -H "Host: nfrguide.com" http://127.0.0.1:3000/categories/does-not-exist/

  /categories/does-not-exist/     HTTP 200   meta-robots=index, follow      ← BUG
  /articles/does-not-exist/       HTTP 200   meta-robots=noindex, follow
  /disciplines/does-not-exist/    HTTP 200   meta-robots=noindex, nofollow
  /venues/does-not-exist/         HTTP 200   meta-robots=noindex, nofollow
  /competitors/does-not-exist/    HTTP 200   meta-robots=noindex, nofollow
```

**Evidence / root cause:** `generateMetadata` at line 33 passes `derivedNoindex: false`
**unconditionally**, even though `meta` is `undefined` for an unknown slug and `catRow` is `null`:

```ts
const meta = getSectionMetaByCategorySlug(slug);          // undefined for an unknown slug
const catRow = await getCategoryBySlug(slug);             // null
return buildMetadata(mergeSeoMeta(seo, {
  title: `${categoryName} Archive — Editorial Dispatches`,
  description: meta?.description || `Explore comprehensive articles…`,
  path: `/categories/${slug}/`,
  derivedNoindex: false,                                   // ← never reconsidered
}));
```

The article route already does this correctly via `unavailableArticleMetadataInput`
(`lib/seo/articleMeta.ts:43-50`), which returns `UNAVAILABLE_ARTICLE_ROBOTS`.

**Impact:** any crawler or inbound link can mint unlimited thin, indexable archive pages, each
with a plausible title built from the slug. Classic index-bloat and keyword-cannibalisation
exposure on a site whose whole stabilisation programme has been about indexing safety.

**Recommended fix:** when `!meta && !catRow`, return noindex metadata (mirroring the article
route) — or call `notFound()`. One-line condition; no schema change.

**Regression tests required:** unknown category slug emits `noindex`; a real section still emits
`index, follow`; the sitemap still contains exactly the five section archives.

---

## 4. Missing admin capabilities

### H-01 — A created Category cannot be used · **P1** · core CMS workflow

**Module:** `views/admin/AdminArticleEditorShell.tsx:57`

```ts
const PRIMARY_SECTIONS: PrimarySection[] = [
  'NFR Competition', 'NFR Entertainment', 'NFR Events & Shopping',
  'NFR Plan & Watch', 'More Rodeo',
];
```

…rendered directly into the Primary Section `<select>` (line ~1248).

**Expected:** an administrator creates a sixth section in Editorial Organization and can classify
articles into it — the owner's stated requirement that editorial entities must not need code
changes.

**Actual:** `createCategoryAction` succeeds and the row exists, but the editor offers only the
five compiled-in names, so the category is unreachable. No public route and no navigation entry
follow either, because `config/routes.ts` separately hardcodes the same five.

**Evidence:** admin CRUD exists (`app/admin/taxonomy-actions.ts:10,14,17`); the editor array is
compiled in; `config/routes.ts:75-120` hardcodes `PRIMARY_SECTIONS` with name, path, categoryKey,
tagline and description.

**Root cause:** the section axis predates the CMS and was never migrated. The 04-x programme
migrated Article Type and Subcategory to the database; Category was left half-migrated — a table
exists and is editable, but nothing downstream reads it as the source of truth.

**Recommended fix (staged, see §10):** feed the editor's dropdown from `listCategories()` via the
existing server pages — the same pattern Article Type already uses. A **public route** for a
non-canonical section is a larger decision and should be taken separately.

**Dependencies:** none for the editor dropdown. A new public section route depends on a decision
about `config/routes.ts` ownership.

### G-03 — A Tag cannot be renamed · **P3**

`lib/cms/taxonomyService.ts` exposes `createTag` and `deleteTag` only; there is no
`updateTag`/rename and no admin control. A rename today happens only as a side effect of an
article save (`tx.tag.upsert` updates `name` for the same deterministic id). Deleting and
recreating loses every article association.

---

## 5. Hardcoded editorial content

Only findings that affect **editorial** output are listed. RBAC definitions, validation enums
(`imageRightsStatus`, `DisclosureType`), the block registry and `SiteConfig`'s two fixed keys are
legitimate technical constants and are **not** flagged.

### H-02 — `Category.description` is editable and never read · **P2**

The Editorial Organization screen offers a Description field for each category and saves it
(`Category.description`). `getCategoryBySlug` even selects it (`lib/content.ts:282`). But the
public category page uses `meta?.description` — from `config/routes.ts` — for both the meta
description and the view, and uses `catRow` only to look up `EntitySeo` and FAQs
(`app/(public)/categories/[slug]/page.tsx:27,31,44,46,63`). **The admin's text has no effect.**

### H-03 — Two URLs for one section disagree about admin overrides · **P2**

```ts
// lib/content.ts:329 — ASYNC, applies the admin override
export async function getSectionMeta(sectionKey) {
  const base = PRIMARY_SECTIONS[sectionKey];
  const override = await prisma.sectionConfig.findUnique({ where: { sectionKey } });
  return override ? { ...base, name: override.displayName || base.name, … } : base;
}

// lib/content.ts:346 — SYNC, config only, no override
export function getSectionMetaByCategorySlug(slug) {
  return Object.values(PRIMARY_SECTIONS).find(…);
}
```

`/[section]` honours the admin's display name, tagline and description. `/categories/[slug]` —
the URL in the sitemap — does not. An administrator renaming a section sees it change on one
public URL and not the other.

### H-04 — Section "Hero image URL" has no consumer · **P2**

`views/admin/AdminSettingsPage.tsx:196` renders a *Hero image URL* input per section and saves it
to `SectionConfig.heroImage`. But `SectionMeta` (`config/routes.ts:66-73`) has **no `heroImage`
field**, and `getSectionMeta` does not return one. No public surface reads it. The control looks
functional and does nothing.

### H-05 — `SectionConfig.visible` is dead · **P3**

The column exists (`schema.prisma:1765`), no admin control sets it, and no query reads it.

### H-06 — JSON-LD publisher is hardcoded · **P3**

`lib/seo.tsx:175,192` — `publisher: { name: 'NFRGuide' }` in both article and discipline JSON-LD,
although `SiteConfig` already provides an admin-managed appearance/branding channel.

---

## 6. Architecture risks

| ID | Risk | Assessment |
|---|---|---|
| **A-1** | **Three overlapping owners of "section"**: `config/routes.ts` (canonical), `Category` (editable, largely unread), `SectionConfig` (editable, read by one route) | The root cause behind B-01, H-01, H-02, H-03, H-04. Any fix should pick **one** owner rather than adding a fourth overlay |
| A-2 | `getSectionMetaByCategorySlug` is synchronous, so it structurally **cannot** read the database | Makes H-03 a signature change, not a one-liner. Plan it deliberately |
| A-3 | `restoreRevision` bypasses the article-type assignability gate | **Correct by design** — a revision must restore what it recorded. Classification and evergreen both fail safe for such values (04-E.1/04-E.2). Recorded so it is not "fixed" by mistake |
| A-4 | Subcategory has no public route, and adding a flat one later would need a global unique added after rows exist | Deferred; a nested route avoids the problem |
| A-5 | Managed subcategory names are absent from the search vector | Deferred; needs a generated-column migration |

---

## 7. Public / admin integration findings

| Surface | Result |
|---|---|
| Header & footer navigation | DB-backed with a documented static fallback — `WORKING` |
| Homepage & section landings | Visual Builder layouts, draft vs published separation — `WORKING` |
| Article detail | Canonical, JSON-LD, comments, monetization slots, view beacon — `WORKING` |
| Category archive | **B-01, H-02, H-03** |
| Entity detail pages | Discipline, venue, competitor, event, edition all present with EntitySeo + FAQ — `WORKING` |
| Dynamic route generation | `generateStaticParams` on articles and sections; ISR 60–300 s — `WORKING` |
| Preview vs published | Separate draft resolvers, staff-only preview guard — `WORKING` |
| Media Library / R2 | Local provider verified; **R2 not reachable in this session** — `NOT VERIFIED` |
| Sitemap & robots | Section, article, entity and layout URLs with accurate `lastModified`; five category URLs only — `WORKING` |
| Cache invalidation | `revalidatePath` per change class across taxonomy, article type and layout actions — `WORKING` |
| Empty states | `ContentEmptyState` on archives — `WORKING` |

---

## 8. Security and SEO findings

**Security:** no P0. Every mutation re-checks permissions in the service layer; the UI only
decides what is rendered. Admin pages are gated by `requireUser` / `requirePermissionPage`; the
rate limiter and CSP reporter fail closed. **No security defect was found.**

**SEO:**

- **B-01** is the material one (P1).
- **H-03** means an administrator's section rename is applied inconsistently across two public URLs.
- Article/NewsArticle classification, canonical URLs, publication dates, sitemap and robots are
  otherwise correct and tested (04-E.1 §7, 04-E.2 §7).
- IDX-02 hostname protection remains in force: non-production hosts receive
  `X-Robots-Tag: noindex, nofollow`, which is why B-01 must be probed with a production `Host`
  header to be visible at all.

---

## 9. Severity-ranked issue backlog

| ID | Sev | Module | Expected | Actual | Fix | Deps | Regression tests |
|---|---|---|---|---|---|---|---|
| **B-01** | **P1** | `app/(public)/categories/[slug]/page.tsx:33` | unknown slug → `noindex` or 404 | `index, follow` | add the `!meta && !catRow` condition | none | unknown slug noindex; real section unchanged; sitemap unchanged |
| **H-01** | **P1** | `AdminArticleEditorShell.tsx:57` | section list from `Category` | hardcoded 5 | pass `listCategories()` as a prop, as Article Type does | none for the dropdown | create a 6th category → appears in the editor → article saves and reloads |
| **H-03** | P2 | `lib/content.ts:346` | both section URLs honour overrides | only `/[section]` does | make the category page use the async, override-aware lookup | A-2 | admin rename visible on both URLs |
| **H-02** | P2 | Editorial Organization + category page | the edited description is used, or the field is removed | saved, never read | pick one owner (see A-1) | H-03 | admin description reaches the public page, or the field is gone |
| **H-04** | P2 | `AdminSettingsPage.tsx:196` | section hero renders, or the control is removed | saved, never read | render it in the section hero, or remove the input | A-1 | hero image appears, or the control is absent |
| **G-03** | P3 | `taxonomyService.ts` | tags can be renamed | create/delete only | add `updateTag` + admin control | none | rename preserves article associations |
| **H-05** | P3 | `schema.prisma:1765` | no dead columns | unused | implement or drop in a later migration | migration | — |
| **H-06** | P3 | `lib/seo.tsx:175,192` | publisher from site config | hardcoded | read from `SiteConfig` appearance | none | JSON-LD publisher follows the config |

---

## 10. Recommended remediation stages

Dependency-aware, smallest blast radius first. **None of this has been implemented.**

**Stage 1 — Indexing safety (P1, isolated).** B-01 only. One condition, two tests, no schema
change, no dependency on anything else. Ship independently.

**Stage 2 — Make the section axis administrator-owned (P1 + P2).** H-01 → H-03 → H-02 → H-04,
in that order, as one coherent change: decide that `Category` + `SectionConfig` own name,
description and hero, and that `config/routes.ts` keeps only the canonical route table. This is
the only stage that needs design agreement, because of A-1.

**Stage 3 — Consistency clean-up (P3).** G-03, H-05, H-06. Independent of Stages 1–2;
H-05 needs its own additive migration.

---

## 11. Test evidence

| Check | Result |
|---|---|
| Full regression | **136 files, 3,169 passed, 0 skipped** |
| Lifecycle / editor / entity suites | 6 files, **230 passed** |
| TypeScript | `tsc --noEmit` clean |
| Production build | succeeded — `BUILD_ID 3344e7BQRPxB2aIp76tF8` |
| `git diff --check` | clean |
| Encoding scan | 55 files, no BOM, no mojibake |
| HTTP probes | 7 routes 200; 5 unknown-entity routes probed under a production `Host` |

**A false finding I discarded.** I initially measured "no public consumer of `siteConfigService`"
and nearly reported the footer/appearance editors as controls with no backend. The grep that
produced it filtered out the very lines that disprove it (`app/(public)/layout.tsx:31`,
`app/(public)/page.tsx:34`). Re-checked, and `SiteConfig` is recorded as **working**. Noted
because the brief requires findings to be reproducible, and this one was not.

---

## 12. Unverified areas and limitations

| Area | Limitation |
|---|---|
| Production behaviour | **No production access path exists in this session** — `.env` holds only the two local databases, verified by connecting (`inet_server_addr()` = loopback) |
| Cloudflare R2 | `MEDIA_STORAGE_PROVIDER=local`; the real bucket was not reachable |
| Global Blocks, Announcements | Admin CRUD confirmed; no public consumer traced within budget. **Not claimed either way** |
| Browser-level admin UX | Verified through services, actions and HTTP, not a browser driver |
| Visual Builder block-by-block rendering | Covered by existing suites; not re-audited block by block |
| Monetization, analytics, comments internals | Out of this audit's priority list; covered by their own suites |

**Never claimed from an HTTP 200 alone:** every "working" above rests on a test, a service probe
or a header/body inspection.

---

## 13. Git and database preservation

```
branch : main
HEAD   : aafdad296363e4b69d3b01594540116f9b58f39d   (unchanged)
stashes: 0
```

| | |
|---|---|
| Application code changed | **none** — audit only |
| Git | no commit, push, branch, reset, rebase or stash |
| Uncommitted work | all Issue 03 / 04-A…04-E.2 work preserved |
| `nfrguide_dev` | 11 articles, 23 article types, 0 subcategories — unchanged |
| `nfrguide_test` | 17 articles — unchanged; suites manage their own fixtures |
| Production database | **never connected to** |
| Migrations | none created, none run |
| On-hold items | Legacy Subcategory mapping, BKP-01, production migration, deployment and backfill were **not** reopened |

---

## 14. The three things to look at first

1. **B-01** — an indexable soft-404 on a site whose entire stabilisation programme has been about
   indexing safety. Smallest fix here, largest asymmetry between cost and risk.
2. **H-01** — the owner's stated requirement is that editorial entities must not need code
   changes. Categories are the one place that is still false.
3. **A-1** — before fixing H-02/H-03/H-04 individually, decide which of the three overlapping
   owners of "section" is authoritative. Fixing them separately would add a fourth.

**Stop condition honoured:** no fixes implemented, awaiting owner review.
