# NFRGuide.com — SEO Architecture, 12 Rule Groups & Structured Data

> Specification: **NFRGuide Developer Master Requirements v2.0 Aligned**

This document outlines the search engine optimization (SEO) architecture, the 12 evaluation groups, URL canonization policies, Schema.org JSON-LD implementations, and server-side rendering (SSR) requirements for NFRGuide.com.

---

## 1. Editorial SEO Philosophy

NFRGuide approaches SEO as an editorial product quality standard rather than an algorithmic afterthought. Sports publications frequently suffer from shallow clickbait, uninformative headlines, missing accessibility descriptions, and broken URL conventions.

NFRGuide enforces:
1. **Deterministic Pre-Publish Validation**: Editors cannot publish dispatches that violate fundamental on-page and compliance standards.
2. **Canonical URL Hygiene**: Universal trailing-slash enforcement prevents split indexation penalties (`/articles/:slug/`, `/competition/`, etc.).
3. **Rich Structured Data**: Every article embeds Schema.org metadata tailored to journalism (`NewsArticle` or `Article`).
4. **E-E-A-T Signal Reinforcement**: Every article explicitly cites primary sources (PRCA rulebooks, judicial records) and features verified author credentials.

---

## 2. The Twelve Approved SEO Rule Groups

Implemented in `src/utils/seoValidator.ts` and audited in `AdminSEOPage.tsx`:

| Group # | Group Name | Operational Focus | Implemented Checks (Phase 0) | Future Backend Crawler Checks (Phase 1) |
|---|---|---|---|---|
| **01** | **On-page** | Essential HTML tags and headings. | Main H1 presence (Field 01), H2 hierarchical progression. | DOM depth inspection, automated LCP tag checks. |
| **02** | **Search Appearance** | SERP snippet presentation. | SEO Title length (35–65 chars), Meta Description length (110–165 chars). | Pixel width simulation, rich snippet qualification tests. |
| **03** | **Technical** | Site hierarchy and slug cleanliness. | Lowercase hyphenated slug validation, character sanitization. | XML sitemap validation, HTTP status codes, robots.txt directives. |
| **04** | **Content & Topic** | Editorial depth and scannability. | Minimum body block count (&ge;2), summary excerpt presence (100–220 chars). | TF-IDF keyword distribution, readability scoring, duplicate content checks. |
| **05** | **External Links** | Outbound authority and disclosure. | Commercial monetization disclosures, FTC transparency notes. | Automated outbound HTTP 200 checks, rel="sponsored" validation. |
| **06** | **Internal Links** | Cross-article discovery. | Related dispatches linking, discipline guide associations. | Internal link graph analysis, click-depth calculation, broken link scanning. |
| **07** | **Image SEO** | Photography indexing & accessibility. | Featured photography presence, descriptive ALT text (&ge;10 chars), image SEO title. | WebP/AVIF delivery, responsive srcset generation. |
| **08** | **Structured Data** | Schema.org machine readability. | Article/NewsArticle JSON-LD generation with author, publisher, dates. | Google Rich Results API validation, BreadcrumbList and SportsEvent schema. |
| **09** | **AI Search Readiness** | Extraction for AI answer engines. | Key takeaway callout blocks / summary capsules. | Semantic chunking analysis, entity graph completeness. |
| **10** | **Freshness** | Publication velocity and revision tracking. | PublishedAt, UpdatedAt, ReviewedAt timestamps, future schedule date validation. | Automated stale content alerts, seasonal content refresh triggers. |
| **11** | **Event SEO** | Sports hub and tournament taxonomy. | Rodeo Hub, Recurring Event, and Edition multi-tier relationship linking. | SportsEvent Schema markup with date, location, and aggregate standing records. |
| **12** | **Redirects** | Clean routing without hops. | Trailing slash canonical enforcement (`/articles/:slug/`). | Server-side 301/308 redirect audit, redirect chain detection. |

---

## 3. Severity Tiers & Publishing Gatekeeper

The validation engine categorizes checks into three deterministic severity levels:

### Category A: Required Editorial Blockers (`blocker`)
*Prevents publication.* An article CANNOT be published (individually or via bulk publish) if any Category A check fails:
- **H1 Headline (Field 01)**: Must be present and non-empty.
- **Summary Excerpt (Field 03)**: Required for RSS syndication and archive index cards.
- **Article Body (Field 04)**: Minimum 2 structured content blocks required.
- **URL Slug**: Must be valid lowercase alphanumeric hyphenated.

### Category B: Rights, Safety & Compliance (`compliance`)
*Required for publication clearance:*
- **Featured Image Rights**: Must not be marked as `Unresolved`. Must be verified as `Staff Photo`, `Editorial Pool`, `PRCA Archive`, or `Licensed Creative`.
- **Image ALT Text (Field 08)**: Must be at least 10 characters long to satisfy accessibility compliance.
- **Commercial Disclosures**: If marked as sponsored or affiliate, an explicit reader disclosure note is mandatory.
- **Scheduled Timestamp**: If status is `scheduled`, the release date must be set in the future.

### Category C: SEO & Quality Recommendations (`warning` & `notice`)
*Advisory alerts that do not block publishing but affect the overall internal quality score:*
- SEO title length between 35 and 65 characters.
- Meta description length between 110 and 165 characters.
- Internal links / related article recirculation.
- Rodeo entity relationship linking (disciplines, hubs, events).
- Primary research citations attached.

> **Quality Score Transparency**:  
> Any numerical score (e.g. `85% Score`) generated by the validation engine is an **internal prototype heuristic** calculating the percentage of passed advisory rules. It is NOT an external Google Lighthouse or search ranking guarantee.

---

## 4. Schema.org JSON-LD Implementation

Every article rendered by `src/pages/ArticleDetailPage.tsx` dynamically injects structured data into the document `<head>`:

```json
{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "Inside the Chutes: Why the 8-Second Ride Remains Sport’s Purest Crucible",
  "description": "Beyond the roar of 17,000 spectators at the Thomas & Mack Center lies the quiet, calculated preparation of world-class roughstock athletes defying physics.",
  "image": "https://nfrguide.com/images/hero_bull_riding.jpg",
  "datePublished": "2026-10-27T08:00:00Z",
  "dateModified": "2026-10-27T14:30:00Z",
  "author": {
    "@type": "Person",
    "name": "Clayton Vance",
    "jobTitle": "Senior Rodeo Correspondent"
  },
  "publisher": {
    "@type": "Organization",
    "name": "NFRGuide",
    "url": "https://nfrguide.com"
  },
  "articleSection": "NFR Competition"
}
```

---

## 5. Why Production Requires Next.js App Router (SSR)

In Phase 0, NFRGuide operates as a React SPA with client-side head manipulation (`src/utils/seo.ts`). While modern browsers render this seamlessly:

1. **Search Engine Crawlers**: Googlebot, Bingbot, and social media scrapers (Twitter Card bot, Facebook OpenGraph scraper, Slack preview bot) require pre-rendered HTML for reliable indexation.
2. **First Contentful Paint (FCP)**: Server-side rendering (SSR) delivers the complete article text and primary photography in the initial HTTP response.
3. **Phase 1 Migration**: Moving to Next.js App Router (detailed in `MIGRATION_PLAN.md`) enables `generateMetadata()`, native OpenGraph image generation, and Incremental Static Regeneration (ISR).
