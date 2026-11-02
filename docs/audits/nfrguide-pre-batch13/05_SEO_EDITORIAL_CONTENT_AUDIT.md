# 05 — SEO, Editorial Architecture & NFR-2026 Readiness

Read-only. Distinguishes implemented **controls** from **outcomes** (which need a deployed site + search
data to verify).

## Technical SEO controls (implemented)
- **SSR + metadata:** every public route uses `generateMetadata` → `buildMetadata` (absolute canonical,
  robots index/noindex, Open Graph + Twitter, OG image). `metadataBase` = `SITE_URL`.
- **Canonical / trailing slash:** `trailingSlash: true`; canonical URLs are path-derived and can be
  overridden same-site only (`resolveCanonical` rejects off-site overrides).
- **Structured data (`lib/seo.tsx`):** Article/NewsArticle, Discipline (Article), Event (editions, only
  when dates verified), **Place** (venues), **Person** (competitors), **FAQPage** (exactly visible FAQs),
  **BreadcrumbList**. All emit verified fields only — no fabricated event/venue data.
- **Sitemap / robots:** `app/sitemap.ts` lists **published + indexable** URLs only (thin/noindex venues &
  competitors excluded); `robots.txt` disallows `/admin`. Verified in `route-smoke` + `seo.test.ts`.
- **Indexability safety:** editor `noindex` is **additive-only** — it can further restrict but can never
  force-index a thin/unpublished entity (`mergeSeoMeta`, `isLandingIndexable`). Draft content is never
  publicly readable (DB-level published filter) and `/search` is `noindex`.

## SEO outcomes (NOT verifiable here)
Rankings, Core Web Vitals field data, crawl/index coverage, rich-result eligibility — require the deployed
site + Google Search Console / analytics. Treat as **post-deploy verification** (R-18/R-35).

## Editorial entity architecture (implemented vs required)
Required chain: Category/Subcategory → Permanent Hub → Related Rodeo Event → Annual Edition → supporting
Articles/Schedules/Results/Guides. **Implemented:**
- Category ✓, Hub ✓, Event (hub-independent URL) ✓, Edition (unique `(eventId, editionSlug)`) ✓,
  Hub↔Event M:N ✓, Discipline ✓, Venue ✓, Competitor ✓ with CompetitorDiscipline / edition-level
  CompetitorParticipation / ArticleCompetitor / CompetitorMedia ✓, polymorphic EntitySeo/EntityFaq ✓,
  Navigation ✓, Article↔entity junctions ✓. Referential integrity (FKs), slug uniqueness (incl.
  cross-table hub/event), canonical paths, published rendering — all present.
- **The existing model supports expansion to future rodeo events/editions without a redesign.**
- **Gaps for the full chain:** **Schedules, Results, Standings** have **no data model** (the "supporting
  Schedules/Results/Guides" leg is articles-only today). Subcategory is a soft concept (no distinct model).

## Publishing workflow & content quality
- Lifecycle Draft→Review→Approved→Scheduled→Published→Update→Archive/Unpublish with permission-gated
  transitions, publication gate (`validateArticle`), revisions + optimistic `version`, scheduled publish,
  author attribution, featured-image rights gate, internal linking (curated relations), canonical,
  structured data. 8 approved fields (title/deck/excerpt/body/SEO title/meta/image SEO title/image ALT).
  Verified: `cms.test.ts`, `eligibility.test.ts`, `editor-fields.test.ts`.
- **Suitable for high-quality original publishing at scale** — minor UX gaps (richer preview, subcategory
  surface) are P2, not blockers.

## NFR-2026 editorial readiness (A=data model, B=admin, C=public, D=content, E=verification)
| Requirement | A | B | C | D | Note |
|---|:--:|:--:|:--:|:--:|---|
| NFR-2026 landing hub | ~ | ~ | N | N | can model as a Hub/Event, but no dedicated landing page/content |
| Event overview / dates / venue | ✓ | ✓ | ✓ | N | edition carries dates+venue; needs **verified** data |
| Daily schedules | **N** | N | N | N | no Schedule model — P1 |
| Competition disciplines | ✓ | ✓ | ✓ | ✓ | the 7 disciplines exist |
| Contestants + qualification | ✓(entity) | ✓ | ✓ | **N** | profiles yes; **qualification data** not modeled/collected |
| Results | **N** | N | N | N | no Result model — P1 |
| Standings / rankings | **N** | N | N | N | no Standing model — P1 |
| TV / legit streaming guide | ~ | ~ | ~ | N | can be editorial articles; no structured broadcast model |
| Tickets / trusted links | ~(affiliate) | ✓ | ✓ | N | via affiliate links; verify legitimacy before publishing |
| Entertainment / related events | ✓ | ✓ | ✓ | N | section + articles exist |
| Visitor / travel planning | ✓ | ✓ | ✓ | N | "Plan & Watch" section exists |
| FAQs | ✓ | ✓ | ✓ | N | per-entity FAQ system exists |
| Related articles | ✓ | ✓ | ✓ | partial | curated relations exist |
| Evergreen historical guides | ✓ | ✓ | ✓ | partial | discipline guides exist; expand editorially |

**Editorial research dependencies (never fabricate):** NFR-2026 dates/venue, daily schedules, contestant
qualification lists, results, standings, broadcast rights, ticket availability, official partnerships.
Until human-verified from official sources, these remain content gaps, not code that can "fill them in".

## SEO/editorial launch-critical items
1. **Real, verified content** replacing seed/demo (P1).
2. **NFR-2026 landing hub** + schedule/results/standings surface (P1 — needs small data models).
3. Competitor/venue **index pages** for crawlability + internal linking (P2).
4. Post-deploy: Search Console, sitemap submission, CWV field data (P1-verify).
