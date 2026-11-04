# 07 — SEO, AEO & Editorial Discoverability Audit

**Mode:** READ-ONLY. Evidence: `lib/seo.tsx`, `app/robots.ts`, `app/sitemap.ts`, `scripts/route-smoke.mts`, `next.config.mjs`, `lib/seo-intel`.

## 1. Technical SEO controls
| Control | Status | Evidence |
|---------|--------|----------|
| Canonical URLs (policy-driven) | MITIGATED | `buildMetadata` → `alternates.canonical` from `SITE_URL` + path |
| Trailing-slash consistency | MITIGATED | `next.config.mjs trailingSlash`; routes end in `/` |
| HTTP 308/301 redirects (legacy paths) | MITIGATED | `ArticleRedirect` model + route-smoke asserts `/nfr-competition/` → 308 → `/competition/` |
| Robots directives | MITIGATED | `app/robots.ts` — allow `/`, disallow `/admin/`, sitemap ref |
| XML sitemap, excludes `/admin` | MITIGATED | `app/sitemap.ts`; route-smoke asserts `<urlset>` + no `/admin` |
| noindex for thin/utility pages | MITIGATED | `/search/` emits noindex (route-smoke); filtered directory variants noindex |
| Metadata generation (title/desc/OG/twitter) | MITIGATED | `buildMetadata` full OG+Twitter card |
| Article JSON-LD (Article/NewsArticle) | MITIGATED | `articleJsonLd` + `isNewsArticleType` |
| Event structured data (only when dates verified) | MITIGATED | `rodeoEditionJsonLd` returns null if no `startAt` — never fabricates |
| Venue/Competitor JSON-LD | MITIGATED | `venueJsonLd` (Place), `competitorJsonLd` (Person) — omit unknown fields |
| Breadcrumbs | MITIGATED | `breadcrumbJsonLd` |
| FAQ structured data | MITIGATED | `faqPageJsonLd` — null unless ≥1 visible FAQ; built from rendered FAQs only |
| JSON-LD injection safety | MITIGATED | `serializeJsonLd` escapes `<>&`, U+2028/9 |

## 2. Integrity / anti-fabrication (editorial honesty — Master Reqs §8.2)
- Structured data is emitted **only from verified fields**; `rodeoEditionJsonLd` and `venueJsonLd`/`competitorJsonLd` omit or null-out unknown values rather than inventing them. This is a strong, deliberately conservative design. Evidence: header comments + conditional builders in `lib/seo.tsx`.
- Competition coverage carries `verification` (UNVERIFIED/VERIFIED/CORRECTION_REQUIRED) so unverified results are not surfaced as fact.

## 3. Internal linking / orphan prevention
- Related-article join tables (`ArticleHub/Event/Edition/Discipline/Competitor`) + directory pages provide internal links. `lib/seo-intel` includes internal-link intelligence (Batch 06, `INTERNAL_LINK_INTELLIGENCE.md`). Orphan detection is part of SEO audit runs (`SeoAuditRun`/`SeoFinding`).

## 4. Directory SEO (competitors/venues)
- `/competitors/` and `/venues/` indexable when populated (route-smoke fetches sitemap-listed entity → expects 200 + canonical); filtered/search variants `noindex` to avoid thin duplicate indexing. Empty-state → 404 (no thin placeholder indexed).

## 5. SEO Intelligence engine — genuine vs fabricated
- `lib/seo-intel` + `SeoRule`/`SeoAuditRun`/`SeoFinding`/`SeoConfig` models + admin `seo/page.tsx`. Rules are **configurable registry** (`SEO_RULE_REGISTRY.md`), findings are produced by real audit runs over actual content — not hardcoded vanity metrics. Covered by `tests/seo-intel.test.ts`, `seoValidator.test.ts` (not executed this audit). Status: IMPL-NOT-RTV.

## 6. Editorial identity / disclosures
- Independent-publication positioning in homepage copy + `/editorial-policy/`, `/corrections/`, `/affiliate-disclosure/` routes. Affiliate relationships carry `rel` attributes (`AffiliateRelAttribute`) + disclosures (`MonetizationDisclosure`). Image ALT + media rights tracked via `MediaAsset` + `ImageRightsStatus` (editor defaults `Unresolved`, forcing explicit resolution).

## 7. Important distinction
- This is **technical SEO readiness**, verified at source level. Actual Google **indexing/ranking** cannot be inferred from code and is out of scope. Social-card rendering (OG/Twitter) requires a live deployed URL to validate against platform debuggers — a post-deploy check.

## 8. Findings
- ✅ Strong, honesty-first structured-data design.
- ⚠️ `publishedTime`/date accuracy depends on real content entry (report 10).
- ⚠️ CSP absence (report 06) is orthogonal but affects some embed/preview behaviors.
- ⚠️ Post-deploy: validate canonical host, sitemap submission, OG cards against live domain.
