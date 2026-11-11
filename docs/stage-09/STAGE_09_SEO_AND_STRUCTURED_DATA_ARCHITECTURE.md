# Stage 09 — SEO and Structured-Data Architecture (as built)

This describes the code as it stands after the Stage 09 continuation (base `f24af32` +
uncommitted continuation changes). It documents implementation, not intent; each rule
names the file that enforces it and the test that pins it.

## 1. Ownership model (unchanged, verified)

| Concern | Single owner | Enforced / pinned by |
|---|---|---|
| Editorial facts and relationships | Structured CMS (Prisma models + `lib/cms/*Service.ts`) | `stage09-ownership-and-privacy` Task F: Builder blocks store only `featuredIds` |
| Page presentation / layout | Visual Builder (`PageLayout`, `lib/cms/sectionRegistry.ts`) | `stage09-seo-integrity`: no block declares an SEO metadata key |
| Title, description, canonical, robots, OG/Twitter, JSON-LD, sitemap | SEO Intelligence (`lib/seo.tsx`, `lib/seo/*`, `ArticleSeo`, `EntitySeo`) | same suite, Task A |

There is one metadata builder (`buildMetadata`), one canonical normalizer
(`lib/seo/canonical.ts`), one robots model (`lib/seo/robots.ts`), one sitemap builder
(`lib/seo/sitemapEntries.ts`) and one JSON-LD serializer (`serializeJsonLd`). No second
SEO store was introduced.

Known boundary exceptions, recorded rather than changed: `EntitySeo.intro` is visible body
copy edited on the SEO screen; `ArticleSeo.structuredDataType` is dead storage (D-10).

## 2. Metadata pipeline

```
route generateMetadata
  ├─ article:  articleMetadataInput(article)   lib/seo/articleMeta.ts
  │              title  ArticleSeo.seoTitle → article.title
  │              desc   ArticleSeo.metaDescription → deck → excerpt → fallback
  │              canon  same-site ArticleSeo.canonicalUrl → self
  │              robots parseRobotsDirective(ArticleSeo.robots)
  ├─ entity:   mergeSeoMeta(EntitySeo, derived)  lib/cms/entitySeoService.ts
  │              robots combineRobots(content noindex, editor noindex) — most restrictive
  └─ buildMetadata()                              lib/seo.tsx
        title  brandedTitle(title)   ← Stage 09 continuation: exported, shared with admin preview
        alternates.canonical (exactly one), robots {index, follow} (exactly one)
        openGraph / twitter derived from the same title, description, canonical, image
```

Drafts never reach metadata: public routes load through published-only readers
(`getPublishedArticleBySlug`, `getPublicEditionBySlug`, `getPublishedInfoPage`); an
unavailable article renders `noindex, follow`.

Unsupported metadata is not invented: no `article:section`/`og:locale` beyond what Next
derives, no Twitter handle (none verified), no `og:site_name` change.

## 3. Canonical and robots rules

- Canonical: absolute, `SITE_URL` origin, trailing slash, no query/fragment. Stored
  production URLs re-base onto `SITE_URL`; off-site or malformed overrides are refused on
  save and ignored on render (`validateCanonicalOverride` and `resolveCanonical` call the
  same normalizer).
- Robots sources: `ArticleSeo.robots` (free text, parsed); `EntitySeo.noindex` →
  `noindex, follow`; route-level `noindex` → `noindex, nofollow`; filtered/paged directory
  views → `noindex, follow` with canonical on the unfiltered path.
- `ArticleSeo.robots` is honoured by metadata and sitemap but **has no editor control**
  (only `articleService` writes `ArticleSeo`, and it never sets `robots`). The continuation
  now **displays** the stored directive and the article's real public status in the editor
  rather than a hardcoded "index, follow (SSL Enforced)"; adding a control is carried to the
  Stage 10 register.

## 4. Structured data

| Builder | Emitted on | Rules | Continuation change |
|---|---|---|---|
| `articleJsonLd` | `/articles/{slug}/` | `NewsArticle` only for `news`/`event update`, else `Article`; Person author from record; absolute image; dates from record | — |
| `disciplineJsonLd` | `/disciplines/{slug}/` | `Article` | — |
| `breadcrumbJsonLd` | all hierarchical routes | positions from 1, absolute items | — |
| `rodeoEditionJsonLd` | edition page | `Event` only when `startAt` is stored; venue → `Place` | **No empty `PostalAddress`** when the venue has no stored locality |
| `venueJsonLd` | `/venues/{slug}/` | `Place`; address/geo/capacity only when stored | **`url` made absolute** (callers pass a route path) |
| `competitorJsonLd` | `/competitors/{slug}/` | `Person`; no achievements/rankings | **`url` made absolute** |
| `faqPageJsonLd` | entity pages | null when no complete Q/A pair | — |

Not emitted, deliberately: sitewide `Organization`/`WebSite` (D-14 unapproved),
`SportsEvent` (owner decision: `Event`), ratings/offers/awards/results, publisher logo.
The nested `publisher: Organization 'NFRGuide'` in article/discipline nodes pre-dates
Stage 09 and is pending D-14 confirmation (see the decisions file, Package 3).

Injection safety: all JSON-LD passes through `serializeJsonLd`, which escapes `<`, `>`,
`&`, U+2028, U+2029 (mutation M14 is killed by `batchA` / `batch17-sanitization`).

## 5. Sitemap and robots.txt

`buildSitemapEntries` lists a URL only when it is published, content-eligible, indexable
(content rule ∧ stored robots ∧ ¬editor noindex) and self-canonical. Fixtures are excluded
when `APP_ENV=production` (proved end-to-end in `stage09-seo-integrity`). Legal slugs are
listed only when a published InfoPage exists or the config page is approved — today none is.

**Continuation fix (cache):** `app/sitemap.ts` is statically cached, and InfoPage
publish/unpublish did not revalidate it, so an unpublished (noindex) legal page could stay
in the cached sitemap. `publishInfoPageAction` and `unpublishInfoPageAction` now revalidate
`/sitemap.xml`; entity-SEO saves (which change `noindex`/canonical membership) do too.
Pinned by `tests/stage09-sitemap-revalidation.test.ts` (mutations M20, M21 killed).

## 6. SEO admin UX (Task H) — what the screens now state

| Screen | Before | After (continuation) |
|---|---|---|
| Article editor → Search appearance | Robots hardcoded "index, follow (SSL Enforced)"; canonical host literal; title without brand suffix; OG image ignored stored value | Stored directive parsed by the public parser; draft/review status shown as "not public"; canonical from `productionCanonicalUrl`; title via `brandedTitle`; image = stored OG → hero → default |
| Article editor → canonical line under status | Host literal | `productionCanonicalUrl` |
| Landing SEO & FAQ | Labels not associated with inputs; no length limits; no canonical preview; "SEO saved." | `htmlFor`/`id` on every field; `maxLength` = server Zod bounds; live **effective canonical** computed by the server's normalizer, with an "will be refused on save" warning + `aria-invalid`; save message states the change is live (no draft step) |
| Info & Legal Pages | Edit silently disabled on published pages; one-click Unpublish with "now a draft" toast; errors in the green success box; labels unassociated | Visible explanation linked by `aria-describedby`; confirmation stating the real public effect (404, or fallback to built-in pending text); approval-reset warning and message; failures shown as `role="alert"` in error style; labels associated |

No control was added that does not work; no editorial capability was added.

## 7. Open items carried to Stage 10

1. `ArticleSeo.robots` editor control (policy decision: who may noindex an article).
2. `ArticleSeo.structuredDataType` drop (schema change, D-10).
3. `ogImage` URL-format validation (low severity; not an injection vector).
4. CSP is report-only; `script-src 'unsafe-inline'`.
5. D-14 single publisher node with `@id`, replacing the two hardcoded copies.
