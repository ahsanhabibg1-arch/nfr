# NFRGuide — SEO Engine Comprehensive Audit & Website Builder Integration Plan

| | |
|---|---|
| **Phase** | Phase 1: audit + architecture planning. **Read-only. Nothing implemented.** |
| **Date** | 2026-11-07 |
| **Related** | `docs/NFRGUIDE-SITE-BUILDER-COMPREHENSIVE-AUDIT.md` (*Audit*), `docs/NFRGUIDE-WEBSITE-EXPERIENCE-ARCHITECTURE-BLUEPRINT.md` (*Blueprint*) |
| **Paths** | Relative to `apps/web/` unless they start with `docs/` |

**Evidence labels**

| Label | Meaning |
|---|---|
| **V** | Implemented and verified in source (and, where stated, at runtime) |
| **I** | Implemented, not fully verified |
| **P** | Partially implemented |
| **D** | Documented or planned only |
| **M** | Missing |
| **U** | Unknown; needs runtime or DB verification |

Recommendations are labelled **PROPOSED**. Owner choices are labelled **OPEN Qn** (§21).

---

## 1. Executive Summary

NFRGuide already has a real, codebase-specific SEO system with four parts:

1. **One metadata/JSON-LD builder**, `lib/seo.tsx` (`buildMetadata`, `articleJsonLd`, `breadcrumbJsonLd`, `faqPageJsonLd`, `rodeoEditionJsonLd`, `venueJsonLd`, `competitorJsonLd`, `serializeJsonLd`). Every public page uses it, server-side, through the Next.js Metadata API. **V**
2. **A per-entity override layer**, `EntitySeo` + `lib/cms/entitySeoService.ts` (`mergeSeoMeta`, `resolveCanonical`, additive `noindex`), used by 7 landing page types. **V**
3. **A deterministic, database-based audit engine**, `lib/seo-intel/*`: 41 rules, fingerprinted findings with a status workflow, auto-resolve and reopen, and run history. **V**
4. **A tiered article publish gate**, `utils/seoValidator.ts` `validateArticle`: blocker / compliance / warning / notice, enforced by `articleService.assertPublishable`. **V**

So it is **reusable, and should be integrated, not rebuilt.** But it is **not centralized enough to own the website** today. The most important verified problems:

| # | Finding | Evidence | Severity |
|---|---|---|---|
| S1 | **Article SEO overrides never reach public HTML.** `app/(public)/articles/[slug]/page.tsx` `generateMetadata` builds metadata from `article.title` / `deck` / `excerpt`, and never reads `ArticleSeo` (`seoTitle`, `metaDescription`, `canonicalUrl`, `ogImage`, `robots`). **Runtime-verified:** for `/articles/saddle-bronc-riding-the-classic-event-evolution/` the stored meta description ("An in-depth study of saddle bronc mechanics…") differs from the rendered one ("Regarded as the cradle of competitive cowboy sport…"). All 11 published dev-DB articles have stored descriptions that differ from deck/excerpt. | page.tsx:25–48; read-only DB probe + `curl` | **Critical** |
| S2 | **Section SEO is editable but UI only.** The Landing SEO admin lists "Primary Sections" (`landingAdminService.ts` `SECTION`) and saves `EntitySeo(SECTION, key)`, but `app/(public)/[section]/page.tsx` and `rodeo-events/page.tsx` call `buildMetadata` from `getSectionMeta` only. | landingAdminService.ts:34, 70; [section]/page.tsx:21–30 | High |
| S3 | **Section metadata has four competing sources:** `PRIMARY_SECTIONS` (config), `SectionConfig` (System Settings), `EntitySeo(SECTION)` (unused), and the Page Builder `landing-hero` props. | Audit §16; this report §4 | High |
| S4 | **The sitemap ignores most noindex signals.** It honours `EntitySeo.noindex` only for venues and competitors (`batch12Content.ts`). It lists hubs, events, editions, disciplines and categories regardless of `EntitySeo.noindex`, and lists articles regardless of `ArticleSeo.robots`. `lastModified` is always `new Date()`. | app/sitemap.ts | High |
| S5 | **`noindex` always implies `nofollow`.** `buildMetadata` emits `{index:false, follow:false}`, so "noindex, follow" (wanted for filtered directory pages, `competitors/page.tsx:16` comment) is impossible through the central builder. Only `/search/` sets its own `robots` object. | lib/seo.tsx `buildMetadata` | Medium |
| S6 | **Two SEO rule sets with conflicting thresholds.** Editor/publish validator: title 35–65, description 110–165 (`utils/seoValidator.ts:238,255`). Audit engine: 20–65 and 70–165 (`lib/seo-intel/rules.ts` `DEFAULT_THRESHOLDS`, overridable via `SeoConfig('thresholds')`). | — | Medium |
| S7 | **The audit engine only covers articles, rodeo entities, redirects and media.** No homepage, section, directory, category, discipline, venue/competitor page metadata, `EntitySeo` record, or Page Builder layout is scanned. No rendered-HTML checks exist (no H1 detection, no external links). | orchestrator.ts `buildInventory`; analyzers.ts | High (for the Website Builder) |
| S8 | **Audit-engine correctness defects:** `TECH_SITEMAP_EXCLUDED` compares against `validPaths`, which the same inventory fills with every published article, so it can never fire. `validPaths` lacks `/rodeo-events/<slug>/`, venue, competitor and info pages, so article links to them that match `INTERNAL_PATH_RE` (e.g. `/rodeo-events/x/`) are reported as `LINK_BROKEN` false positives. The canonical domain is hard-coded as `https://nfrguide.com` instead of `SITE_URL`. | analyzers.ts:108–112,134; orchestrator.ts:19,91–96; articleService.ts:331 | Medium |
| S9 | **Redirects are article-only.** `ArticleRedirect` + `syncSlugRedirect` (chain-collapsing, loop-avoiding) are **V** for article slug changes. No redirect is created when hub, event, venue, competitor or discipline slugs change (no other service references a redirect model). There is no redirect admin UI and no URL registry. | articleService.ts:424–441; grep | Medium |
| S10 | **No homepage `Organization`/`WebSite` JSON-LD and no `ItemList`.** `Organization` exists only nested as `publisher` inside article and discipline schema. | lib/seo.tsx | Low |

**Verdict:** reuse all four parts. Fix S1, S2, S4, S5 and S8 first; these are small, contained code changes. Then make the Website Builder pages first-class SEO entities by **reusing `EntitySeo`**, with one central indexing policy shared by `generateMetadata` and `app/sitemap.ts`. The only schema change genuinely required is **one additive enum value** for the homepage (§9, OPEN Q1). A separate **SEO batch "S"** runs before Website Batch A, and the remaining SEO work is folded into Batches A, D, C and G (§17).

---

## 2. Repository Baseline and Working-Tree Status

| Item | Value |
|---|---|
| Branch / HEAD | `main` @ `feb4711` |
| Working tree | 30 changed/untracked paths: the [WT] Website fixes listed in Audit §1.1, `apps/web/package-lock.json`, and three `docs/` reports (this file included). **None of the [WT] changes touch SEO files**, except that `views/ArticleView.tsx` now renders `article-end` global blocks. |
| Runtime used | Local dev server `http://localhost:3000` (`NEXT_PUBLIC_SITE_URL` resolves to localhost in dev, so canonicals render as `http://localhost:3000/...`) and the local dev DB, **read-only queries only** |
| Not used | Production or staging DB, Google Search Console, any external crawler |

---

## 3. Complete SEO Architecture Inventory

| Component | File / location | Responsibility | Status | Depends on |
|---|---|---|---|---|
| Metadata builder | `lib/seo.tsx` `buildMetadata` | title (brand suffix once), description, canonical (`SITE_URL`+path or override), robots, OG, Twitter | **V** | `SITE_URL` (`NEXT_PUBLIC_SITE_URL`) |
| JSON-LD builders | `lib/seo.tsx` `articleJsonLd` (Article/NewsArticle via `NEWS_ARTICLE_TYPES`), `disciplineJsonLd`, `rodeoEditionJsonLd` (only with verified `startAt`), `venueJsonLd`, `competitorJsonLd`, `breadcrumbJsonLd`, `faqPageJsonLd` | Structured data from stored fields only | **V** | — |
| JSON-LD renderer | `lib/seo.tsx` `JsonLd`, `serializeJsonLd` (escapes `<`, `>`, `&`, U+2028/9) | XSS-safe `<script type="application/ld+json">` | **V** | — |
| Entity SEO overrides | `prisma` `EntitySeo`; `lib/cms/entitySeoService.ts` (`getEntitySeo`, `upsertEntitySeo`, `mergeSeoMeta`, `resolveCanonical`, `isLandingIndexable`) | Title/description/canonical/OG/noindex/intro per landing entity; same-site canonical only; noindex additive | **V** for DISCIPLINE, CATEGORY, RODEO_HUB, RODEO_EVENT, RODEO_EDITION, VENUE, COMPETITOR; **P** for SECTION (saved, never rendered) | `LandingEntityType` enum |
| Landing SEO admin | `app/admin/(dashboard)/landing-seo/page.tsx`, `views/admin/AdminLandingSeoPage.tsx`, `app/admin/landing-seo-actions.ts`, `lib/cms/landingAdminService.ts` | Edit `EntitySeo` + FAQs per entity | **V** (SECTION: UI only) | `landingEntities.ts` `permForEntity` |
| Article SEO record | `ArticleSeo` (1:1); written in `articleService.ts:329–333` | `seoTitle`, `metaDescription` defaulted from title/excerpt; `canonicalUrl` **hard-coded** `https://nfrguide.com/articles/<slug>/`; `ogImage` = hero; `robots` default "index, follow" (not editable in UI) | **P**: stored, **not rendered** (S1) | — |
| Article editor SEO | `views/admin/AdminArticleEditorShell.tsx` (fields 5/6/7/8), `components/admin/editor/SeoAssistantPanel.tsx`, `views/admin/ArticleSeoPanel.tsx` | Editing + live validator report | **V** | `utils/seoValidator.ts` |
| Publish validator | `utils/seoValidator.ts` `validateArticle` → `articleService.assertPublishable` (L164) | Tiered: blocker/compliance block publish; warning/notice advise | **V** | — |
| Audit engine | `lib/seo-intel/rules.ts` (41 rules, `SEO_ENGINE_VERSION` 1.0.0), `analyzers.ts`, `orchestrator.ts` (`syncSeoRules`, `buildInventory`, `runAudit`), `types.ts` | DB-based scans, fingerprints, auto-resolve/reopen | **V** (scope limits S7, defects S8) | `SeoRule`, `SeoAuditRun`, `SeoFinding`, `SeoConfig` |
| SEO service + actions | `lib/cms/seoService.ts` (`runSeoAudit`, `getSeoDashboard`, `listFindings`, `updateFinding`, `recheckFinding`, `listSeoRules`, `setRuleEnabled`, `get/updateSeoThresholds`, `getFindingDetail`); `app/admin/seo-actions.ts` | RBAC-guarded operations, audit log | **V** | `lib/auth/rbac.ts` |
| SEO admin UI | `app/admin/(dashboard)/seo/page.tsx`, `views/admin/AdminSEOPage.tsx` (tabs Overview / Issues / Rules + thresholds) | Dashboard, findings workflow, rule toggles | **V** | seoService |
| Sitemap | `app/sitemap.ts` | Home, 5 sections, 5 category archives, disciplines, published articles, hubs/events/editions, directories, indexable venues/competitors, coverage pages, approved legal pages | **V** (40 `<url>` entries in dev, runtime) with gaps S4 | content/rodeo/batch12/competition services |
| Robots | `app/robots.ts` | `Allow: /`, `Disallow: /admin/`, sitemap + host | **V** (runtime) | `SITE_URL` |
| Admin noindex | `app/admin/layout.tsx:10` `robots: {index:false, follow:false}`; next.config `Cache-Control: private` for `/admin/` | Keep admin out of the index | **V** | — |
| Staging noindex | `middleware.ts` (`STAGING_NOINDEX=true` → `X-Robots-Tag: noindex, nofollow`) | Environment-wide protection | **I** (env-dependent) | env |
| Preview noindex | `app/admin/(dashboard)/website/preview/route.ts`: `X-Robots-Tag: noindex` + `<meta robots noindex>` on the wrapper | Preview wrapper not indexable | **V**; the iframed public page under draft mode emits **normal** robots (see §6) | — |
| Trailing slash + legacy redirects | `next.config.mjs` `trailingSlash: true`, `redirects()` (5 legacy section paths, 308) | URL normalisation | **V** (`tests/redirects.test.ts`) | — |
| Article redirects | `ArticleRedirect`; `articleService.syncSlugRedirect` / `claimArticlePath`; `lib/content.ts` `resolveArticleRedirect` | Slug-change 308s, chain collapse, loop avoidance; only to live articles | **V** | — |
| Legal/info page SEO | `InfoPage` (`seoTitle`, `metaDescription`, workflow), `views/LegalPageView.tsx`, `config/legalPages.ts` `getIndexableLegalPages` | DB override + config fallback; unapproved → noindex | **V**, with sitemap mismatch (§7) | — |
| Media SEO | `MediaAsset.altText`, `seoTitle`; `AdminMediaPage.tsx` | Asset-level alt/SEO title fallback | **V** | — |
| Legacy client SEO hook | `utils/seo.ts` `useSEO` | Phase 0 DOM injection | **Dead code**: no importers (only mentioned in a `lib/seo.tsx` comment) | — |
| Search page robots | `app/(public)/search/page.tsx` `metadata.robots = {index:false, follow:true}` | Keep SERPs out of the index | **V** (bypasses `buildMetadata`) | — |
| Website Builder SEO | `PageLayout`, `sectionRegistry` | — | **M**: no SEO fields; the homepage title/description are hard-coded in `app/(public)/page.tsx` | — |

**Data flow today (Admin → HTML)**

```
EntitySeo (7 landing types) ──getEntitySeo──▶ mergeSeoMeta(derived) ──▶ buildMetadata ──▶ <head>   ✅
ArticleSeo ─────────────────────────── (not read by generateMetadata) ─────────────────▶   ❌ (S1)
EntitySeo(SECTION) ─────────────────── (not read by [section]/page.tsx) ───────────────▶   ❌ (S2)
SectionConfig ──getSectionMeta──▶ `${name} — Coverage & Guides` ──▶ buildMetadata ─────▶   ✅
Homepage ─────────── hard-coded title/description in app/(public)/page.tsx ────────────▶   (no admin control)
InfoPage ──getPublishedInfoPage──▶ LegalPageView metadata ─────────────────────────────▶   ✅
```

**Centralization verdict:** *output* is centralized (`buildMetadata` + JSON-LD builders). *Decisions* are scattered across per-route `generateMetadata` functions (12+ routes), `app/sitemap.ts`, the `batch12Content.ts` indexability helpers, `config/legalPages.ts`, `search/page.tsx` and `competitors/page.tsx`. **There is no single indexing policy function.**

---

## 4. SEO Database Model Analysis

The names in the brief (`seo_profiles`, `seo_metadata`, `url_registry`) **do not exist**. The actual models are below.

| Model (schema line) | Stores | Belongs to | Written by | Draft/pub | History | Constraints | Builder-ready? |
|---|---|---|---|---|---|---|---|
| `ArticleSeo` (L128) | seoTitle, metaDescription, canonicalUrl, ogImage, robots, structuredDataType | Article 1:1 (`articleId @unique`, cascade) | `articleService` on every save | Follows the article workflow (values are saved with the article; the public page shows published articles only) | Captured in `ArticleRevision` snapshot v2 (seoTitle, metaDescription) | unique articleId | n/a (articles) |
| `EntitySeo` (L1168) | seoTitle, metaDescription, canonicalOverride, ogImage, noindex, intro | (`LandingEntityType`, entityId), polymorphic, **no FK** | `upsertEntitySeo` | **No**: live on save | **No** (audit log line only) | `@@unique([entityType, entityId])`, `@@index([entityType])` | **Yes, with lifecycle wrapping** (§11). `SECTION` is already a value; the homepage has none. |
| `LandingEntityType` (L1540) | DISCIPLINE, CATEGORY, RODEO_HUB, RODEO_EVENT, RODEO_EDITION, VENUE, COMPETITOR, SECTION | — | — | — | — | — | Missing a homepage value (OPEN Q1) |
| `SectionConfig` (L1553) | displayName, tagline, description, heroImage, visible | sectionKey | System Settings | No | No | unique sectionKey | Identity, not SEO; feeds `getSectionMeta` (title/description fallback) |
| `SeoRule` (L583) | code, category, severity, enabled, config Json, ruleVersion | registry mirror | `syncSeoRules` (each run) + `setRuleEnabled` | — | — | unique code | Reusable; new rule codes needed for pages |
| `SeoAuditRun` (L599) | scope, engineVersion, status, summary, totals | — | `runAudit` | — | Yes (all runs kept) | index startedAt | Reusable |
| `SeoFinding` (L614) | rule, run, `entityType` (string), `entityId`, `articleId?`, fingerprint, severity, kind, status, evidence, recommendation, resolution fields | polymorphic via `entityType` string; FK only to Article | `runAudit`, `updateFinding` | — | firstSeen/lastSeen/resolvedAt | unique fingerprint; indexes on status, severity, (entityType, entityId), category | **Yes**: `entityType: 'page'` with `entityId: pageKey` needs no schema change |
| `SeoConfig` (L648) | key → Json (today `thresholds`) | global | `updateSeoThresholds` | No | No | PK key | Reusable for global SEO defaults (site name, default OG image, Twitter handle) |
| `ArticleRedirect` (L574) | sourcePath (unique), targetPath, statusCode (default 308), status | article paths in practice | `syncSlugRedirect` | — | createdAt only | unique sourcePath | Name says "Article" but the columns are generic paths; it can serve all entities (§9) |
| `InfoPage` (L1568) | title, body, seoTitle, metaDescription, workflow status | legal/info slugs | `infoPageService` | Yes (workflow) | — | unique slug | n/a |
| `MediaAsset` (L221 region) | altText, seoTitle, width, height, visibility, rightsConfirmed | media | Media Library | visibility | — | — | Hero/block images |
| `PageLayout`, `SiteConfig` | Website Builder documents | pageKey / key | Page Builder | Yes | Blueprint `WebsiteRevision` (proposed) | — | Where draft page SEO can live (§11) |

**Duplication and missing relationships**

| Issue | Detail |
|---|---|
| Section title/description | 4 sources (S3) |
| Canonical domain | Hard-coded in `articleService.ts:331–332`, `analyzers.ts:108,134`, while `lib/seo.tsx` uses `SITE_URL` |
| SEO length thresholds | 3 places: `seoValidator.ts`, `rules.ts`, editor UI hints in `AdminArticleEditorShell.tsx:791,834` |
| `EntitySeo` | No FK. Orphan cleanup relies on `deleteEntitySeoForEntity` being called from each delete path. Whether every delete path calls it is **U**. |
| `SeoFinding` | `entityType` is a free string (`'article'`, `'route'`, `'structured_data'`, `'rodeo_entity'`, `'rodeo_event'`, `'rodeo_edition'`); there is no enum, so there is no guarantee of consistency |
| `ArticleSeo.robots` / `structuredDataType` | Stored, not editable in the UI, not read publicly |

---

## 5. Existing Engine Capability Matrix

### 5.1 Metadata management

| Field | Articles | Landing entities (7) | Sections | Homepage | Directory index | Legal pages | Auto/derived |
|---|---|---|---|---|---|---|---|
| SEO title | Editable, **not rendered** (S1) | Editable → rendered **V** | From `SectionConfig.displayName` + " — Coverage & Guides"; `EntitySeo` ignored | Hard-coded | Hard-coded | InfoPage `seoTitle` **V** | Brand suffix added once **V** |
| Meta description | Editable, **not rendered** | **V** | `SectionConfig.description` | Hard-coded | Hard-coded | **V** | — |
| Canonical | Auto (hard-coded domain), **not rendered**; public canonical = `SITE_URL` path **V** | Override (same-site only) **V** | path **V** | `/` **V** | path **V** | path | `SITE_URL` + path **V** |
| Robots | `ArticleSeo.robots` not editable/not rendered; unavailable → noindex | `noindex` additive **V** | always index | index | filtered/paged → noindex (+nofollow, S5) | unapproved → noindex **V** | — |
| OG title/description/image | Mirrors title/description; image = hero | override image **V** | default image | default OG image | default | default | `DEFAULT_OG_IMAGE` |
| Twitter | `summary_large_image` + title/desc/image everywhere **V**; no `twitter:site` | | | | | | |
| `og:type` article + `publishedTime` + `authors` | **V** | — | — | — | — | — | `modifiedTime`, `og:site_name`, image alt/dimensions **M** |
| Inheritance/fallback | — | `mergeSeoMeta` (override → derived) **V** | — | — | — | DB → config **V** | — |
| Duplicate detection | Articles only (`ART_DUP_SEO_TITLE`, `ART_DUP_META_DESC`), on **stored** values not rendered values | **M** | **M** | **M** | **M** | **M** | — |

### 5.2 Rules engine

| Aspect | Finding | Status |
|---|---|---|
| Definitions | `RULES` (41) in code, mirrored to `SeoRule` each run | **V** |
| Scopes | `AuditScope.kind`: full / article / rodeo / technical | **V** |
| Priority / inheritance / conflicts | None: rules are independent; severity fixed per rule (a finding may override) | **M** (not needed for the current model) |
| Admin configurability | Enable/disable (`setRuleEnabled`), thresholds (`SeoConfig('thresholds')`) | **V** |
| Execution | Manual (`runSeoAuditAction`); no schedule | **V** / scheduling **M** |
| Single engine? | **No.** `validateArticle` (publish gate, own thresholds) and `seo-intel` (audit) are separate rule sets with overlapping checks: alt text, headings, SEO title/description length, entity association, sources. | **P** |
| SEO decisions outside the engine | `generateMetadata` in each route; `app/sitemap.ts`; `batch12Content.ts` `getIndexable*Slugs`; `config/legalPages.ts`; `search/page.tsx`; `competitors/page.tsx` / `venues/page.tsx` filtered-noindex; `entitySeoService.isLandingIndexable` (**exported, never called**; grep finds no callers) | — |

### 5.3 Analysis detectors

| Detector | Status | Evidence / note |
|---|---|---|
| Missing SEO title | **Fully** (articles) | `ART_NO_SEO_TITLE`. Note: it checks the *stored* value, which `articleService` always defaults to the headline, so it practically never fires. |
| Duplicate SEO title | **Partial** | Articles only, stored values |
| Missing / duplicate description | **Partial** | Articles only |
| Invalid canonical | **Partial** | `TECH_NO_CANONICAL`, `TECH_CANONICAL_MISMATCH` against the hard-coded domain; checks the stored value, not the rendered one |
| Missing H1 / multiple H1 | **Not implemented** | No rendered-HTML analysis. Risk: the homepage renders `<h1>` in both `EditorialHero` and `IntroBanner` when an intro banner is configured. |
| Heading hierarchy | **Partial** | `ART_HEADING_HIERARCHY` (article body has no headings) and `ART_DUP_HEADINGS`; level skipping is not checked despite the rule text |
| Missing image alt | **Partial** | `IMG_NO_ALT`: article featured image only; body images and Page Builder images are not checked |
| Broken internal links | **Partial** | `LINK_BROKEN` for article body links matching `INTERNAL_PATH_RE`; false positives for `/rodeo-events/<slug>/` (S8); venue/competitor/info links are ignored |
| Broken external links | **Not implemented** | No network calls (by design) |
| Orphan pages | **Partial** | `LINK_ORPHAN`: articles only; inbound counted from article bodies + relations, not from homepage/section feeds |
| Missing internal links | **Partial** | `LINK_OPPORTUNITY` (shared discipline) |
| Thin content | **Partial** | `ART_EMPTY_BODY` (< `minBodyWords`, default 60) |
| Duplicate URLs | **Partial** | `RODEO_DUP_SLUG` across rodeo entity types; article slugs are unique in the DB |
| Redirect chains / loops | **Fully** (DB) | `TECH_REDIRECT_LOOP` (target is itself a source) |
| Redirect target unknown | **Partial** | `TECH_REDIRECT_TARGET_UNKNOWN`, same `validPaths` gaps |
| Noindex conflicts | **Partial** | `TECH_PUBLISHED_NOINDEX` on `ArticleSeo.robots`, which is not rendered anyway |
| Sitemap eligibility conflicts | **Not effective** | `TECH_SITEMAP_EXCLUDED` cannot fire (S8); entity noindex vs sitemap is not checked |
| Missing structured data | **Partial** | `SD_ARTICLE_NO_HEADLINE`, `SD_ARTICLE_NO_DATE`, `SD_ARTICLE_NO_IMAGE` |
| Invalid structured data | **Partial** | `SD_CANONICAL_MISMATCH`; no schema validation of the other builders |

**Persistence:**

- Fingerprint = sha1(rule | entityType | entityId | discriminator). Repeat runs update `lastSeenAt`.
- RESOLVED findings that reappear become REOPENED. Unseen active findings in scope are auto-resolved.
- IGNORED is preserved. **V** (`tests/seo-intel.test.ts`, 11 DB tests)
- **Analyzable today:** articles (incl. drafts for content rules), rodeo entities, redirects, media.
- **Not analyzable:** homepage, sections, directories, categories/disciplines/venues/competitors *page metadata*, `EntitySeo`, legal pages, Page Builder layouts.

### 5.4 URL and redirect management

| Capability | Status |
|---|---|
| URL registry | **M** (no model). Uniqueness exists per entity table only; `RODEO_DUP_SLUG` detects cross-type collisions after the fact. |
| Slug history | **P**: articles via `ArticleRedirect` + `ArticleRevision`; other entities **M** |
| Canonical normalisation | **V**: `trailingSlash: true`; `buildMetadata` path policy |
| Automatic redirects on slug change | **V** articles (`syncSlugRedirect`); **M** hubs/events/editions/venues/competitors/disciplines/categories |
| Redirect validation / chains / loops | **V** at write time (articles); **V** detection in audit |
| Status codes | `ArticleRedirect.statusCode` default 308; `resolveArticleRedirect` maps 301/308 → `permanentRedirect`, else `redirect` (307). Legacy section redirects are 308 (`next.config.mjs`). |
| Resolution scope | `ArticleRedirect` is consulted only by `app/(public)/articles/[slug]/page.tsx` when the slug is not live. Rows with non-article `sourcePath` would never be served. |
| Redirect admin UI | **M** |
| 404 handling | `notFound()` per route; `app/(public)/error.tsx` exists. A custom `not-found` page exists (`views/NotFoundView.tsx`); its wiring for all routes is **U**. |
| Builder pages | Fixed routes (`/`, 5 sections). Slugs are not editable, so no redirects are needed unless OPEN Q6 adds editable paths. |

### 5.5 Sitemap and robots

| Check | Status |
|---|---|
| `/sitemap.xml` | **V** (runtime: 40 URLs in dev) |
| Sitemap index / image sitemap | **M** (single sitemap; fine below 50k URLs) |
| Articles | **V**, published only via `publicArticleWhere` (fixtures excluded) |
| Sections / category archives / disciplines | **V** (always listed) |
| `/robots.txt` | **V** (runtime: `Disallow: /admin/`, Sitemap, Host) |
| Noindex exclusion | **P**: venues/competitors only (S4) |
| Canonical consistency | **P**: lists self paths only; a `canonicalOverride` pointing elsewhere still leaves the original in the sitemap |
| Published-only | **V** articles/rodeo (`publicSlugWhere`), **V** legal (approved config) |
| Legal page mismatch | `LegalPageView` makes a DB-published `InfoPage` indexable even when its config entry isn't `approved`, but the sitemap uses config approval only, so an indexable page is missing from the sitemap |
| Duplicate URL prevention | **I** (no dedup pass; duplicates would need colliding slugs across hubs/events, which `RODEO_DUP_SLUG` detects) |
| `lastModified` accuracy | **M**: always `now` for every URL |
| Preview / draft / private / redirected excluded | **V**: only published entities enumerated; `/admin/` disallowed; redirected article slugs no longer exist as published slugs |

---

## 6. Technical SEO Findings (public rendering)

| # | Area | Finding | Status |
|---|---|---|---|
| 1 | Server-side metadata | All public routes use `generateMetadata` / `metadata` exports (Next.js Metadata API); JSON-LD is rendered in server components. No client-side SEO. | **V** |
| 2 | Consistency | Title format: `"<title> — NFRGuide"`, brand added once. Section titles: `"<name> — Coverage & Guides — NFRGuide"` (runtime). Homepage title hard-coded in both `app/layout.tsx` and `app/(public)/page.tsx`. | **V** |
| 3 | Canonical | `SITE_URL + path` everywhere; entity overrides validated same-site. Article stored canonical unused. | **V** / S1 |
| 4 | Robots meta / headers | Central `index, follow` / `noindex, nofollow` (S5); admin noindex; staging header; search page `noindex, follow`. | **V** |
| 5 | Preview protection | The wrapper is noindex, but the **iframed page under draft mode renders normal `index, follow` metadata and the draft content** [WT]. It is only reachable with the staff draft cookie, so the exposure risk is low, but metadata does not signal draft state. | **P** |
| 6 | Visibility | Published-only adapters (`publicArticleWhere`, `publicSlugWhere`); unpublished article → 404 or redirect. | **V** |
| 7 | OG | `og:title/description/url/type/image`, article `publishedTime`/`authors`. No `og:site_name`, `og:locale`, image dimensions/alt, `modifiedTime`. | **P** |
| 8 | Twitter | `summary_large_image` + title/description/image; no `twitter:site`. | **P** |
| 9 | Structured data | Article/NewsArticle (`NEWS_ARTICLE_TYPES`), Breadcrumb (articles, sections), FAQPage (landing entities with FAQs), Event (verified dates only), Place, Person, discipline Article. | **V** |
| 10 | Organization / WebSite | Not emitted standalone. | **M** (S10) |
| 11 | ItemList / CollectionPage | Not emitted. | **M** |
| 12 | Breadcrumbs | JSON-LD on articles and sections (**V**); visible breadcrumb on section hero (`SectionLandingHero` `breadcrumbs`). Article breadcrumb points at `/categories/<slug>/`, not the section path. | **V** |
| 13 | Images | Hero/feeds use `imageAltText || title` (`HomeArticleFeed.tsx`); Page Builder hero override alt [WT]; `image-text-block` `imageAlt`. Raw `<img>` (no `next/image`) in several places, so no automatic dimensions (CLS risk). | **P** |
| 14 | Internal linking | Header/footer/quick links from the CMS; feeds link articles; article related list. | **V** |
| 15 | HTTP status | 404 via `notFound()`; 308 legacy; article redirects 308/307. | **V** |
| 16 | Pagination / params | Directories: filtered/paged → noindex (also nofollow, S5); canonical stays `/competitors/` (path without query), good. Search page noindex. | **V** / S5 |
| 17 | Mobile | Responsive Tailwind layouts; `viewport` metadata is **U** (not inspected in `app/layout.tsx`). | **U** |
| 18 | H1 ownership | Homepage `<h1>` = lead article headline (`EditorialHero`). `IntroBanner` also renders an `<h1>` when configured → **two H1s** on the homepage. Section hero, article header, discipline header, category view, directory pages: one each by component. | **P** |
| 19 | Rendering vs metadata conflict | The homepage metadata title/description are static while the visible hero is editorial; no conflict, but the homepage SEO is not editable. | — |

---

## 7. Sitemap and Robots Findings (summary)

1. **Single policy missing.** Each source decides eligibility differently: `publicArticleWhere`, `publicSlugWhere`, `getIndexable*Slugs` (content + EntitySeo), `getIndexableLegalPages` (config only).
2. **Gaps** (S4):
   - EntitySeo noindex is ignored for 5 landing types.
   - `ArticleSeo.robots` is ignored.
   - SECTION noindex is ignored.
   - The legal-page DB/config mismatch.
3. **`lastModified`** is always "now". PROPOSED: use `updatedAt`/`publishedAt`, and `PageLayout.publishedAt` for builder pages.
4. **Robots** (`app/robots.ts`) is minimal and correct. PROPOSED: keep it, and optionally add `Disallow: /api/` (not verified whether `/api/` pages render HTML; **U**).

---

## 8. SEO Admin UX Assessment

**Today there are four places that edit SEO-relevant data:**

| Place | Edits | Permission (verified) | Issue |
|---|---|---|---|
| Article editor (fields 5–8 + SEO Assistant) | ArticleSeo title/description, image SEO/alt | article edit perms | Edits don't render (S1) |
| *Landing SEO* (`/admin/landing-seo/`) | EntitySeo + FAQs for 8 types | `rodeo.manage` / `taxonomy.manage` to open; per type `permForEntity` (SECTION → `system.config`) | SECTION is UI only (S2) |
| *SEO* (`/admin/seo/`) | Run audits, findings workflow, rule toggles, thresholds | `seo.audit.*`, `seo.finding.manage`, `seo.config` | No page-level view; no global defaults; no redirects |
| *System Settings → Sections* | `SectionConfig` name/tagline/description | `system.config` | Overlaps EntitySeo(SECTION) and the Page Builder (S3) |

**Missing:** global SEO defaults UI (site name, default OG image, Twitter handle), redirect manager, URL view, per-page SEO status, SERP/social preview.

---

## 9. Website Builder Integration Assessment

### 9.1 Page-level SEO (PROPOSED)

**Storage decision: reuse `EntitySeo`.** It already has the right fields, a same-site canonical validator, additive noindex, an audit log, and an admin form.

| Page | EntitySeo key | Schema change |
|---|---|---|
| 5 sections | `(SECTION, '<sectionKey>')` | none: the value exists and the admin already lists it |
| Homepage | `(PAGE, 'homepage')` **or** `(SECTION, 'homepage')` | Option A: add enum value `PAGE` (one additive migration, `ALTER TYPE … ADD VALUE`). Option B: no migration, but semantically wrong and listed under "Primary Sections". **OPEN Q1**, recommend A. |

**Page Editor → SEO tab fields:**

| Control | Stored | Derived default | Notes |
|---|---|---|---|
| SEO title | `EntitySeo.seoTitle` | Home: current hard-coded title; Section: `SectionConfig.displayName` + " — Coverage & Guides" | Length guidance from the single threshold source (§10) |
| Meta description | `EntitySeo.metaDescription` | `SectionConfig.description` | — |
| Canonical | `EntitySeo.canonicalOverride` | self path | Same-site validation exists (`validateCanonicalOverride`) |
| Index / noindex | `EntitySeo.noindex` | index | Separate from publish (§11) |
| Follow / nofollow | **M** in model | follow | OPEN Q3: add a column, or fix S5 so noindex keeps follow and drop the toggle (recommended) |
| OG title / description | — | = SEO title / description | **Not separate fields** (avoids duplicates); `buildMetadata` already mirrors them |
| OG image | `EntitySeo.ogImage` | Section: `SectionConfig.heroImage`; Home: lead hero image | — |
| Twitter | — | = OG | No separate fields |
| Structured data | — | Automatic per page type: Home `WebSite` + `Organization`; Sections `CollectionPage` + `BreadcrumbList` + `ItemList` (from rendered feed items) | No manual JSON-LD editing (prevents fabrication, consistent with `lib/seo.tsx` policy) |
| Validation status / findings | read from `SeoFinding where entityType='page' and entityId=pageKey` | — | Read-only panel with "Run page check" |

### 9.2 Blocks (PROPOSED: semantics owned by the renderer, not by per-block SEO objects)

| Concern | Owner | Mechanism |
|---|---|---|
| H1 | The page hero block only (`editorial-hero`, `section-hero`) | Blueprint invariant R4; `IntroBanner` becomes a hero *style* (Blueprint §7), which removes the duplicate H1 |
| H2/H3 | `PageRenderer`: block headings are `<h2>`; item titles are `<h3>` | Matches today's `SectionHeading` (h2) and `HomeArticleFeed` (h3) |
| Image alt | Article images: article `imageAltText` → asset `altText` → title. Static blocks: required `*Alt` prop when an image is set. | Block `propsSchema` makes alt required when the image is set (warning, not blocker, for decorative images: OPEN Q7) |
| Internal links / labels | CTA props (`ctaText` + `ctaUrl`) | Save-time validation: internal URL must resolve (shared `validPaths` builder, §10); generic labels ("Click here", "Read more") produce a recommendation |
| Feed visibility | Content Source Engine | Published + `publicArticleWhere` only (Blueprint §6) |
| Structured data eligibility | Page type, not block | `ItemList` built from the items the feed blocks actually rendered |

### 9.3 Publishing lifecycle (PROPOSED)

| Stage | SEO behaviour |
|---|---|
| Draft | Page SEO draft stored with the page's website draft (Blueprint `SiteConfig('page:<key>')`, or `section:<key>` as named in Blueprint §9.1; same mechanism, one key per page holding `{ identity, seo }`) |
| Preview | Page renders with draft SEO; `generateMetadata` under staff draft mode forces `robots: noindex, nofollow`; preview panel shows the SERP/social snippet computed by the **same** metadata resolver |
| Validate | On publish: run page validators (§10.3) → Blocking errors stop publish; Warnings require confirmation; Recommendations are informational. No score threshold. |
| Publish | Write `EntitySeo` (published store) + `SectionConfig` identity + `WebsiteRevision` snapshot (includes the SEO block), then revalidate the page path + `/sitemap.xml` |
| Rollback | Restore snapshot → draft → preview → publish (Blueprint §9.3); SEO travels with the page |
| Concurrency | The same `expectedVersion` as the page document (Blueprint §10.2); EntitySeo is only written by publish, so no separate race |

**Content publication ≠ indexing ≠ sitemap.** Three explicit, independent flags, evaluated by one function:

```
isPublished(entity)                         -- workflow / layout published
isIndexable  = isPublished && !noindex(effective) && contentEligible
isInSitemap  = isIndexable && canonicalIsSelf && sitemapEligible(type)
```

A page can be published and intentionally noindex. A noindex page is never in the sitemap.

### 9.4 SEO preview (PROPOSED)

The preview toolbar (Blueprint Batch E) gets an **SEO** drawer that shows:

- the Google-style snippet (title truncated at the guidance width, URL breadcrumb, description);
- the social card (OG image, title, description);
- the canonical;
- the effective robots;
- an H1/H2 outline extracted from the rendered preview DOM (client-side, in the admin iframe parent);
- current page findings.

Data comes from a server action that calls the **same** `resolvePageMetadata(pageKey, {draft:true})` used by `generateMetadata`.

**Draft safety:** draft-mode metadata always carries noindex; the preview wrapper already sends `X-Robots-Tag: noindex`; draft mode requires a staff cookie.

### 9.5 Single source of truth: ownership matrix (PROPOSED)

| Metadata of… | Canonical owner | Edited in | Removed duplicate |
|---|---|---|---|
| Article | `ArticleSeo` (+ article fields for fallbacks) | Article editor | none, but **wire it** (S1) |
| Section page | `EntitySeo(SECTION, key)` for SEO; `SectionConfig` for visible identity | Page Editor → SEO tab / Page settings | Landing SEO "Primary Sections" group (redirects to the Page Editor); `landing-hero` title props (Blueprint §7) |
| Homepage | `EntitySeo(PAGE, 'homepage')` | Page Editor → SEO tab | Hard-coded strings in `app/(public)/page.tsx` become defaults only |
| Landing entities (hub/event/edition/discipline/category/venue/competitor) | `EntitySeo` | Landing SEO (unchanged) | — |
| Legal/info pages | `InfoPage` | Info pages admin | Config `review` flag becomes the fallback only; sitemap follows the same policy |
| Global defaults (site name, default OG image, Twitter handle, title suffix) | `SeoConfig('defaults')` (existing model, new key) | SEO → Global settings | `DEFAULT_OG_IMAGE` constant and the `'NFRGuide'` literals in `lib/seo.tsx` become fallbacks |
| Length/quality thresholds | `SeoConfig('thresholds')` (exists) | SEO → Rules | Hard-coded 35–65 / 110–165 in `seoValidator.ts` and the editor UI read from it |
| Indexing policy | `lib/seo/policy.ts` (PROPOSED) | — (code) | Per-route logic in sitemap, `batch12Content`, `legalPages` |

---

## 10. Recommended Target Architecture

```
                       ┌─────────────────────────── Admin ───────────────────────────┐
 Article editor ──▶ ArticleSeo        Page Editor SEO tab ──▶ draft (page doc) ──publish──▶ EntitySeo(PAGE|SECTION)
 Landing SEO   ──▶ EntitySeo(7)       SEO ▸ Global ──▶ SeoConfig('defaults','thresholds')
                       └──────────────────────────────┬────────────────────────────────┘
                                                      ▼
                lib/seo/resolve.ts  resolveMetadataFor(kind, id, {draft?})   ◀── single resolver
                     │  merges: stored overrides → derived values → SeoConfig defaults
                     │  applies: lib/seo/policy.ts  isPublished / isIndexable / isInSitemap
                     ▼
   generateMetadata (every route) ── buildMetadata (lib/seo.tsx, robots object supported)
   app/sitemap.ts ── iterates entities via the same policy (no per-type ad-hoc rules)
   lib/seo-intel ── inventory includes pages + EntitySeo; checks the *resolved* metadata
   utils/seoValidator + page validators ── read thresholds from SeoConfig (one rule source for limits)
```

**New code (PROPOSED), no new engines:**

| Module | Role |
|---|---|
| `lib/seo/policy.ts` | Pure functions: `isIndexable`, `isInSitemap`, `effectiveRobots`; unit-testable |
| `lib/seo/resolve.ts` | `resolveMetadataFor()` per kind (article, page, landing entity, info page), wrapping existing getters + `mergeSeoMeta` |
| Inventory extension in `lib/seo-intel/orchestrator.ts` | Add pages, EntitySeo and resolved metadata; new rules: `PAGE_NO_DESC`, `PAGE_DUP_TITLE` (cross-entity), `PAGE_NOINDEX_IN_NAV`, `SITEMAP_NOINDEX_CONFLICT`, `PAGE_BLOCK_IMG_NO_ALT`, `PAGE_CTA_BROKEN`, `PAGE_MULTI_H1` (structural, from layout) |

---

## 11. Publishing and Indexing Lifecycle Proposal

Summarised from §9.3.

| State | Public render | `<meta robots>` | Sitemap |
|---|---|---|---|
| Draft (never published) | Published version (or defaults) | per published | per published |
| Preview (staff draft mode) | Draft | **noindex, nofollow (forced)** | n/a |
| Published + index | Published | index, follow | Yes (if canonical is self) |
| Published + noindex | Published | noindex, **follow** (after S5 fix) | **No** |
| Unpublished / unavailable article | 404 / redirect | noindex (unavailable meta) | No |
| Canonical override → other URL | Published | index, follow (canonical points away) | **No** (only canonical targets listed) |

**Validation levels for page publish (PROPOSED):**

| Level | Checks |
|---|---|
| **Blocking** | Off-site canonical (already rejected); canonical to a non-resolving path; broken internal CTA URL; hero missing (no H1); required image alt missing on a non-decorative block image |
| **Warning** (confirm to publish) | Missing description; title/description outside thresholds; duplicate title with another page/entity; noindex on a page linked from the header nav |
| **Recommendation** | Generic link text; no OG image; feed block with zero items |

---

## 12. Security and RBAC Assessment

**Verified (`lib/auth/rbac.ts`):**

| Permission | Granted to |
|---|---|
| `seo.audit.run`, `seo.audit.view`, `seo.finding.manage` | editor, administrator, super_admin, seo_manager |
| `seo.config` | administrator, super_admin, seo_manager |
| `system.config` | super_admin only |

- Landing SEO: `rodeo.manage` / `taxonomy.manage` to open; per-type write via `permForEntity`.
- Services re-check permissions (`need()` in `seoService.ts`; `requireEntityPerm` in `entitySeoService.upsertEntitySeo`). Writes are audited (`audit()`, `auditLog` on runs).

**Gaps:**

- The **SEO Manager cannot fix** what it finds: there is no `article.edit.any`, no `rodeo.manage`, and SECTION needs `system.config`.
- Editors can run full-site audits (resource use; acceptable).
- The audit lock is `findFirst({status:'running'})` then `create`, which is not atomic. A crashed process leaves a `running` row that **blocks all future audits** (no timeout). **V** by code reading (`orchestrator.ts:117–121`).

**Minimum permission boundaries (PROPOSED; reuse the existing RBAC, add permission strings only):**

| Action | Permission |
|---|---|
| View SEO data / findings | `seo.audit.view` (existing) |
| Run scans | `seo.audit.run` (existing) |
| Manage findings | `seo.finding.manage` (existing) |
| Global SEO defaults, rules, thresholds | `seo.config` (existing) |
| Manage redirects (new UI) | `seo.config` (reuse; OPEN Q4 if a separate `seo.redirect.manage` is wanted) |
| Edit page SEO (draft) | `website.edit` (Blueprint §10.1), **or** `seo.config` so SEO managers can edit page SEO drafts (OPEN Q2) |
| Publish page SEO | `website.publish` (it publishes with the page) |
| Edit section/homepage SEO today | `system.config`, to be replaced by the above |

---

## 13. Performance Assessment

| Area | Finding | Recommendation |
|---|---|---|
| Metadata queries | Article `generateMetadata` and the page both call `getPublishedArticleBySlug` (two full article loads with includes); landing pages call `getEntitySeo` twice (metadata + body) | Wrap the getters in React `cache()` per request (pattern exists: `getCurrentUser` uses `cache`) |
| Audit run | `buildInventory` loads all articles (with blocks), relations, entities and media in 10 parallel queries (fine to low thousands). Persistence is **sequential `findUnique` + create/update per finding** (O(findings) round-trips). | Batch: one `findMany({fingerprint in})` + `createMany` / transaction chunks; keep synchronous for ≤ ~2k articles, then move to a background job (no infrastructure needed until then) |
| Stuck lock | See §12 | Treat `running` older than N minutes as stale |
| Sitemap | 6 `getSectionMeta` queries in a loop + ~8 list queries; rendering cadence **U** (no `revalidate` export inspected for the sitemap route) | Single SectionConfig `findMany`; `revalidate` on publish (`revalidatePath('/sitemap.xml')`) |
| History growth | `SeoAuditRun` and RESOLVED `SeoFinding` rows kept forever | Retention: keep 90 days of runs; purge RESOLVED > 180 days (OPEN Q8) |
| URL registry | Not present; not needed at current scale | Defer |
| External link checking | Not present | Background-only if ever added (rate-limited); defer |

---

## 14. Existing Test Coverage and Missing Tests

**Present and executed in this session** (full Vitest run earlier on 2026-11-07: 55 files / 558 passed, with the local test DB migrated):

| File | Tests | Covers |
|---|---|---|
| `tests/seo.test.ts` | 3 | Canonical from `SITE_URL`, brand suffix + noindex, Article vs NewsArticle |
| `tests/seoValidator.test.ts` | 8 | `validateArticle` severities |
| `tests/seo-intel.test.ts` | 11, DB | RBAC for audits/config, detection, dedup, auto-resolve/reopen, run history, concurrent-run block, scoped audit, finding workflow, author visibility, advisory-only |
| `tests/redirects.test.ts` | 2 | Legacy section 308s, trailing-slash policy |
| `tests/public-content.test.ts` | — | Legal pages awaiting review excluded from the sitemap (source-level) |

**Present, not executed in this session:** `e2e/seo-assistant.spec.ts` (editor panel UI), `e2e/public.spec.ts` (asserts a noindex robots meta at L80).

**Missing (PROPOSED):**

| Area | Tests |
|---|---|
| Metadata | Article page renders `ArticleSeo` title/description/canonical/OG (would have caught S1); section page renders `EntitySeo(SECTION)` (S2); homepage renders `EntitySeo(PAGE)`; `mergeSeoMeta` precedence; `SeoConfig('defaults')` fallback |
| Indexing | Published+index / published+noindex (meta `noindex, follow`) / draft / preview forced noindex / unavailable article / redirected slug 308 |
| Sitemap | Includes only `isInSitemap`; excludes EntitySeo-noindex for **every** landing type, `ArticleSeo` noindex, canonical-away pages, unapproved legal; `lastModified` = `updatedAt` |
| Structured data | JSON parses; one primary type per page; homepage `WebSite` + `Organization`; section `CollectionPage` + `ItemList` built from rendered items; no duplicate Breadcrumb |
| Website Builder | Each of 6 pages: metadata from EntitySeo; draft vs published metadata; revision restore restores SEO; hero-only H1 (render test) |
| Engine | `validPaths` covers all public route families (no false `LINK_BROKEN`); `TECH_SITEMAP_EXCLUDED` uses the real sitemap entry list; canonical checks use `SITE_URL`; stale `running` lock recovery |
| Security | Unauthorized page-SEO edit/publish rejected; draft metadata never served without draft mode + permission |

---

## 15. Critical Architectural Risks

1. **Silent no-op settings** (S1, S2). Editors tune SEO that never ships. This is the same class of defect the Site Builder audit found, and it destroys trust in the admin.
2. **No single indexing policy** (S4). The sitemap and the page `<meta robots>` can disagree, so search engines get mixed signals.
3. **Competing owners for section metadata** (S3). Any fix that doesn't pick one owner will reintroduce drift.
4. **Rule-set divergence** (S6). Editors see one guidance range and audits flag against another.
5. **The audit lock can wedge permanently** (§12).
6. **Hard-coded production domain** in stored canonicals and audit checks. Staging and dev audits compare against prod.

---

## 16. Recommended Target Architecture

See §10 for the diagram. The principles:

- **No second engine.** `lib/seo.tsx` stays the only builder, `seo-intel` the only auditor, `validateArticle` the only article gate (thresholds unified via `SeoConfig`), and `EntitySeo` the only override store for non-article pages.
- **One resolver + one policy** (`lib/seo/resolve.ts`, `lib/seo/policy.ts`) used by every `generateMetadata`, the sitemap and the auditor.
- **Website Builder pages = EntitySeo entities**, drafted with the page document and published with it.
- **Blocks own semantics, not metadata** (§9.2).

---

## 17. Prioritized Implementation Roadmap

**Fit with the Website sequence `0 → A → B → E → F → D → C → G`:**

- A separate **Batch S** (SEO correctness) runs **before or in parallel with Website Batch A**. It touches no Page Builder code and fixes live public-SEO defects now.
- Page-SEO integration goes into the batches that build the lifecycle it depends on: **A** (resolver + page metadata read path), **D** (draft/publish/revision of page SEO), **E** (preview SEO drawer), **C** (SEO tab UI), and **G** (regression).
- **Batch S2** (engine extension) runs after A.

```
S ──┬──▶ A(+SEO read path) ──▶ B ──▶ E(+SEO preview) ──▶ F ──▶ D(+SEO lifecycle) ──▶ C(+SEO tab, SEO admin) ──▶ G
    └──▶ S2 (engine: pages, policy-aware checks) ─────────────────────────────┘
```

| Batch | Scope | Depends on | Files | DB | Risks | Acceptance tests | Rollback |
|---|---|---|---|---|---|---|---|
| **S: SEO correctness** | Wire `ArticleSeo` into article `generateMetadata` (title, description, canonical only if same-site, ogImage, robots); wire `EntitySeo(SECTION)` into `[section]` + `rodeo-events` metadata via `mergeSeoMeta`; `buildMetadata` accepts `robots: {index, follow}` (default unchanged; noindex keeps follow where intended); `lib/seo/policy.ts` + sitemap uses it for **all** landing types, `ArticleSeo.robots` and canonical-away; real `lastModified`; replace hard-coded `https://nfrguide.com` with `SITE_URL` (`articleService.ts:331–332`, `analyzers.ts:108,134`); fix `validPaths` coverage + `TECH_SITEMAP_EXCLUDED` (use the sitemap entry list); stale-lock timeout; delete dead `utils/seo.ts` (OPEN Q9) | none | `app/(public)/articles/[slug]/page.tsx`, `app/(public)/[section]/page.tsx`, `app/(public)/rodeo-events/page.tsx`, `lib/seo.tsx`, new `lib/seo/policy.ts`, `app/sitemap.ts`, `lib/batch12Content.ts`, `lib/rodeoContent.ts`, `lib/cms/articleService.ts`, `lib/seo-intel/analyzers.ts`, `lib/seo-intel/orchestrator.ts` | none | Rendered titles/descriptions change for articles whose stored SEO differs (intended; owner review of the 11 dev articles' stored descriptions first, OPEN Q5) | Metadata tests per route; sitemap policy tests; analyzer tests for `validPaths`/canonical; `tsc` + full Vitest | Revert; data unchanged |
| **S2: Engine extension** | Inventory adds pages (6) + EntitySeo + resolved metadata; new rules (§10); cross-entity duplicate titles; thresholds read by `validateArticle` from `SeoConfig`; batched finding persistence | S, A | `lib/seo-intel/*`, `utils/seoValidator.ts`, `lib/cms/seoService.ts`, `views/admin/AdminArticleEditorShell.tsx` (hint ranges) | none (`SeoFinding.entityType` string) | Finding volume jump on first run | Detector unit tests on fixture inventory; DB test that page findings dedup/auto-resolve | Revert; findings auto-resolve on the next run of the old engine |
| **A (+SEO)** | `lib/seo/resolve.ts`; homepage `generateMetadata` reads `EntitySeo(PAGE,'homepage')` with current strings as defaults; hero is the only H1 (removes `IntroBanner` H1 via the hero-style migration); Organization + WebSite JSON-LD on the homepage; CollectionPage + ItemList on sections from rendered items | S | Blueprint A files + `app/(public)/page.tsx`, `lib/seo.tsx` (new builders) | **+1 enum value `PAGE`** (OPEN Q1) | Enum migration is irreversible in Postgres (values cannot be dropped easily) | Render tests: one H1; JSON-LD parse + types | Code revert; the enum value can stay unused |
| **E (+SEO)** | Preview SEO drawer (snippet, social, canonical, robots, outline, findings); forced noindex under draft mode | A, S2 | preview route, `lib/cms/preview.ts`, `generateMetadata` helpers | none | — | E2E: preview shows draft title; response robots noindex; logged-out unaffected | Revert |
| **D (+SEO)** | Page document `{identity, seo}` draft → publish writes `EntitySeo` + `SectionConfig` + `WebsiteRevision`; validation levels §11; `revalidatePath` page + `/sitemap.xml` | F, S2 | Blueprint D files + `entitySeoService.ts` (publish path) | none beyond Blueprint (`WebsiteRevision`) | Two writers to EntitySeo(SECTION) during transition | Publish → metadata + sitemap updated; rollback restores SEO; blocking checks stop publish | Revision restore; revert |
| **C (+SEO)** | Page Editor SEO tab; SEO area: Overview, **Global settings** (`SeoConfig('defaults')`), Rules, Scans, Issues, **Redirects** (UI over `ArticleRedirect`, generalised paths, served by a catch-all lookup for non-article routes, OPEN Q6); Landing SEO hides SECTION (links to the Page Editor) | D, E | `views/admin/AdminSEOPage.tsx`, new `views/admin/seo/*`, `AdminLandingSeoPage.tsx`, Blueprint C files | none (redirects reuse `ArticleRedirect`; rename deferred) | Redirect serving for arbitrary paths needs a resolver step (middleware or not-found fallback) and loop safety | E2E: edit page SEO → preview → publish → HTML; redirect create → 308; loop rejected | Feature flag (Blueprint `WEBSITE_ADMIN_V2`) |
| **G (+SEO)** | Full SEO matrix (§14), sitemap snapshot test, structured-data validation, remove transition fallbacks | all | tests, e2e | — | — | All green; zero "UI only" SEO controls | — |

**Deferred:** URL registry table, external link checker, scheduled audits/background worker, image sitemap, editable builder-page paths, AI/LLM SEO features.

---

## 18. Acceptance Criteria per Batch

| Batch | Must be true |
|---|---|
| S | (1) For every published article, rendered `<title>` / description / canonical / og:image / robots equal the resolved `ArticleSeo` values. (2) Section pages honour `EntitySeo(SECTION)`. (3) Sitemap = exactly the set where `isInSitemap` is true, for all types. (4) noindex pages render `noindex, follow` unless explicitly nofollow. (5) No hard-coded production domain remains in services/analyzers. (6) A stale `running` audit no longer blocks. |
| S2 | Page and EntitySeo findings appear, dedupe, and auto-resolve; zero `LINK_BROKEN` false positives for valid rodeo/venue/competitor/info paths; editor and audit use the same thresholds |
| A (+SEO) | Homepage metadata editable via EntitySeo (with defaults); exactly one H1 on all six pages; valid `WebSite`/`Organization`/`CollectionPage`/`ItemList` JSON-LD |
| E (+SEO) | Preview SEO drawer shows draft values; draft-mode responses are noindex; public responses unchanged |
| D (+SEO) | Page SEO is drafted, previewed, validated (blocking/warning/recommendation), published, revisioned and restorable; sitemap/metadata revalidated on publish |
| C (+SEO) | One UI per setting (no duplicate SECTION SEO form); global defaults editable; redirects manageable with loop/chain prevention |
| G | §14 matrix green; owner sign-off |

---

## 19. Migration and Backward-Compatibility Considerations

- **Article metadata switch (S):** stored `ArticleSeo` values already exist for all articles (defaulted from title/excerpt by `articleService`), so the switch is safe. Articles whose stored description differs from the deck will change their public snippet. Export a before/after list for owner review (OPEN Q5).
- **Section SEO (S):** existing `EntitySeo(SECTION)` rows (if any; **U**, not queried) will start rendering. Review them before release.
- **`SectionConfig` vs `EntitySeo`:** `SectionConfig` stays the identity owner (visible hero); `EntitySeo` the search-snippet owner. Default resolution: `EntitySeo` → `SectionConfig` → `PRIMARY_SECTIONS`.
- **`noindex` semantics (S5):** changing the default from nofollow to follow is visible only on noindex pages. Explicit `nofollow` remains available.
- **Enum `PAGE` (A):** additive. Postgres enum values are not removable without a type rebuild, so treat it as permanent.
- **Canonical domain:** existing `ArticleSeo.canonicalUrl` values contain `https://nfrguide.com`. The resolver must normalise them (same-site check against `SITE_URL`, or recompute from the slug) rather than trusting the stored host.

---

## 20. Rollback and Regression Strategy

- Every batch is code-revertible. The only schema change (enum value) is additive and harmless if unused.
- **Before S:** snapshot rendered `<head>` for all sitemap URLs (scripted `curl`) as a baseline. After S, diff it. Only the intended fields may change.
- **Sitemap snapshot test:** compare the URL set against the policy function on a fixture DB.
- Findings are self-healing: reverting S2 lets the next run auto-resolve the new-rule findings (disabled/unknown rules produce none).
- Page SEO rollback travels with `WebsiteRevision` (Blueprint D).

---

## 21. Unresolved Owner Decisions

| # | Decision | Recommendation |
|---|---|---|
| Q1 | Homepage SEO key: add enum `LandingEntityType.PAGE` (migration) vs reuse `SECTION` with id `homepage` (no migration) | Add `PAGE` |
| Q2 | Who edits page SEO: website editors (`website.edit`), SEO managers (`seo.config`), or both? | Both may edit drafts; only `website.publish` publishes |
| Q3 | Need a separate "nofollow" toggle, or is "noindex keeps follow" enough? | No toggle; fix S5 |
| Q4 | Redirect management permission: reuse `seo.config` or add `seo.redirect.manage`? | Reuse `seo.config` |
| Q5 | Approve the article snippet change after S1 is fixed (stored meta descriptions become live)? | Yes, after reviewing the before/after export |
| Q6 | Generalise `ArticleRedirect` to all paths (served for non-article routes) now, or only on demand? | In Batch C, with entity slug-change hooks |
| Q7 | Treat missing block-image alt as blocking or warning? | Warning, with a "decorative" checkbox |
| Q8 | Audit history retention | Runs 90 days; resolved findings 180 days |
| Q9 | Delete the dead `utils/seo.ts` (`useSEO`) | Yes (Batch S) |
| Q10 | Scheduled audits (nightly) | Defer until after G |

---

## Answers to the Required Architecture Questions

1. **Centralized enough?** Output yes (`lib/seo.tsx`); decisions no (per-route + sitemap + helpers). Needs `policy.ts` + `resolve.ts`.
2. **Can it manage the six builder pages?** Not today: homepage hard-coded, sections ignore `EntitySeo`. Yes after S + A using the existing `EntitySeo`.
3. **Consistent across article / section / directory / static?** No. Article overrides are unrendered; sections have 4 sources; directories and homepage are hard-coded; static pages are fine (`InfoPage`).
4. **Genuinely implemented:** builder + JSON-LD (incl. XSS-safe serialisation), EntitySeo for 7 types, article publish gate, audit engine with lifecycle, sitemap/robots, article slug redirects, admin/staging/preview-wrapper noindex.
5. **Missing:** article/section metadata wiring, unified indexing policy, page-level SEO, global defaults, redirect UI and non-article redirects, homepage/collection schemas, rendered-HTML checks (H1), real `lastModified`.
6. **Integrate, not rebuild:** `buildMetadata`, JSON-LD builders, `EntitySeo` + `mergeSeoMeta`, `seo-intel`, `validateArticle`, `SeoConfig`, `ArticleRedirect`.
7. **DB changes:** one additive enum value (`PAGE`), plus Blueprint's `WebsiteRevision`. Everything else uses existing models (`SeoConfig` keys, `SeoFinding.entityType='page'`).
8. **Draft → Preview → Publish:** page SEO lives in the page draft, previews with forced noindex, validates in three levels, publishes to `EntitySeo`, and is revisioned with the page.
9. **Publishing vs indexing:** three flags via `policy.ts` (`isPublished`, `isIndexable`, `isInSitemap`); published + noindex is a first-class state.
10. **Sitemap/robots follow policy:** the sitemap iterates entities through `isInSitemap`; robots stays static.
11. **Page Editor SEO tab:** §9.1 fields, the derived defaults shown inline, a snippet preview, the findings panel.
12. **Global SEO:** SEO area for defaults, rules, thresholds, scans, issues and redirects; no per-page fields there.
13. **Preventing conflicts:** the ownership matrix (§9.5) + one resolver + removing the duplicate SECTION form.
14. **First:** Batch S (live defects, no schema).
15. **Defer:** URL registry, external link checks, scheduled audits, image sitemap, editable builder paths.

---

*Verification performed:*
- Source inspection of every file listed in §3.
- Read-only dev-DB query (published article SEO fields).
- `curl` of one article, the homepage, `/plan-watch/`, `/sitemap.xml` and `/robots.txt` on the local dev server.

*Not verified:*
- Production/staging data and behaviour.
- Search engine indexing.
- E2E suites (not run in this session).
- `EntitySeo(SECTION)` row contents.
- Sitemap caching behaviour.
- `viewport` metadata.
- Every entity delete path calling `deleteEntitySeoForEntity`.
