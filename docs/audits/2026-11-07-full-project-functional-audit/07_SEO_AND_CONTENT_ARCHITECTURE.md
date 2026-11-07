# 07 — SEO & Content Architecture Audit

**Audited:** 2026-11-07

## SEO Coverage by Entity Type

| Entity | SEO Title | Meta Description | Canonical | OG Image | Robots | Structured Data | Breadcrumbs | FAQs |
|---|---|---|---|---|---|---|---|---|
| Articles | ✅ (ArticleSeo) | ✅ | ✅ | ✅ | ✅ | ✅ Article schema | ✅ | NA |
| Disciplines | ✅ (EntitySeo) | ✅ | ✅ | ✅ | ✅ (noindex if no content) | ✅ Custom schema | ✅ | ✅ |
| Categories | ✅ (EntitySeo) | ✅ | ✅ | — | ✅ | ✅ BreadcrumbList | ✅ | ✅ |
| Rodeo Hubs | ✅ (EntitySeo) | ✅ | ✅ | — | ✅ | ✅ BreadcrumbList | ✅ | ✅ |
| Rodeo Events | ✅ (EntitySeo) | ✅ | ✅ | — | ✅ | ✅ BreadcrumbList | ✅ | ✅ |
| Annual Editions | ✅ (EntitySeo) | ✅ | ✅ | — | ✅ (noindex if not indexable) | ✅ Event + BreadcrumbList | ✅ | ✅ |
| Competitors | ✅ (EntitySeo) | ✅ | ✅ | ✅ (hero) | ✅ | ✅ Person schema | ✅ | ✅ |
| Venues | ✅ (EntitySeo) | ✅ | ✅ | — | ✅ | ✅ Place schema | ✅ | ✅ |
| Schedule/Results/Standings | Derived from edition | ✅ | ✅ | — | ✅ (noindex if empty) | ✅ BreadcrumbList | ✅ | NA |
| Search | Fixed (noindex) | Fixed | — | — | noindex, follow | NA | NA | NA |
| Legal pages | ✅ (hardcoded) | ✅ | ✅ | — | noindex (pending review) | ✅ BreadcrumbList | NA | NA |

## SEO Intelligence System

- **17 check rules** in `seoValidator.ts` covering: title length, meta description, slug, hero image, image rights, body length, excerpt, article type, takeaways, SEO title, canonical, date, subcategory, disclosure, scheduled time
- **SEO Assistant Panel** in article editor with real-time checks, grouped findings, go-to-field navigation
- **Server-side publication gate** — `canPublish` enforced server-side regardless of client checks
- **EntitySeo** system for non-article entities — CMS-editable overrides that fall back to derived metadata
- **FAQ Schema** — `EntityFaq` with structured data JSON-LD output via `faqPageJsonLd()`

## Content Quality Controls

- **No fabricated content**: empty states display honest messages
- **Publication workflow**: Draft → In Review → Approved → Published → Archived
- **Image rights tracking**: `ImageRightsStatus` enum enforced in publication gate
- **Source verification**: `SourceStatus` enum with verification date tracking
- **Competition data verification**: Dual gate (coverageStatus=PUBLISHED + verification=VERIFIED)
- **Article redirect registry**: renamed slugs get 308 redirects via `ArticleRedirect`

## Sitemap & Robots

- `buildMetadata()` correctly sets noindex for: empty coverage pages, filtered/paginated directories, search results, pending-review legal pages, non-indexable entities
- Pages with `noindex` won't appear in sitemap generation

- **`app/sitemap.ts`** — Comprehensive dynamic XML sitemap covering: homepage, sections, categories, disciplines, articles, rodeo hubs, events, editions, competition coverage (schedule/results/standings where published), competitor/venue directories, and approved legal pages. Only published/indexable content is included.
- **`app/robots.ts`** — Allows `/`, disallows `/admin/`, references sitemap URL.

## Gaps

- **P3**: Legal pages are hardcoded and noindex until owner approval — intentional.
