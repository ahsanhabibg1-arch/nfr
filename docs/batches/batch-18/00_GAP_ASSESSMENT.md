# Batch 18 §1 — Read-Only Public Website & Editorial UX Gap Assessment

**Date:** 2026-11-04 · Method: source inspection + live checks against the local dev server. Legend: ✅ complete & verified · 🟡 implemented, could improve · ❌ missing · ⛔ blocked by content/external.

| # | Area | Status | Evidence |
|---|------|:------:|----------|
| 1 | Homepage & primary navigation | ✅ | `app/(public)/page.tsx`, `config/routes.ts` PRIMARY_SECTIONS, `components/sections/*` |
| 2 | Responsive header, mobile nav, search | ✅ | `components/SiteHeader.tsx` (Batch 17 overflow fix), `PublicChrome` ⌘K, `SearchModal` |
| 3 | Five primary public sections | ✅ | `app/(public)/[section]/page.tsx` + `views/SectionLandingView.tsx` (with empty state) |
| 4 | Rodeo category & event landing pages | ✅ | `rodeo-events/page.tsx`, `rodeo-events/[slug]/page.tsx`, `categories/[slug]/page.tsx` |
| 5 | Editorial hubs & annual editions | ✅ | `rodeo-events/[slug]/[edition]/page.tsx`; hub/event/edition models + routes |
| 6 | Article listing & detail | ✅ | `articles/[slug]/page.tsx` → `ArticleView` (header, TOC, body, author bio, sources, related, JSON-LD); category archives paginated (`ArticlePagination`) |
| 7 | Competitor directory & profiles | ✅ | `competitors/page.tsx` (+empty state), `competitors/[slug]/page.tsx` (+RelatedArticles) |
| 8 | Venue directory & detail | ✅ | `venues/page.tsx` (+empty state), `venues/[slug]/page.tsx` (+RelatedArticles) |
| 9 | Competition sessions/results/standings | ✅ | `.../[edition]/{schedule,results,standings}/page.tsx` (+empty states, +`noindex` on thin coverage) |
| 10 | Breadcrumbs & contextual nav | ✅ | `components/editorial/Breadcrumbs.tsx` used on all detail/landing pages; `CoverageNav` |
| 11 | Related articles & internal linking | ✅ | `RelatedArticles` on article + discipline + competitor + venue; `getRelatedPublishedArticles`; `lib/seo-intel` internal-link intelligence |
| 12 | **Empty / loading / error states** | 🟡→✅ | Empty states ✅ everywhere. **Loading & error states were MISSING** — only `app/not-found.tsx` existed; no `loading.tsx`, `error.tsx`, or `global-error.tsx`. **← the one confirmed gap; implemented in Batch 18.** |
| 13 | Accessibility & responsive layouts | ✅ | axe e2e (`a11y-known-issues.json=[]`), focus rings in `globals.css`, Batch 17 overflow fix verified 360→1440 |
| 14 | Public search & filtering | ✅ | `search/page.tsx` — q/type/category/discipline/sort filters; noindex; SSR results |

## Conclusion
After Phase 1 (01–16), Phase 2 (A–D) and Batch 17, the public site and editorial UX are **substantially complete**. The single genuinely missing capability was **route-level loading skeletons and error boundaries** (Next.js App Router `loading.tsx` / `error.tsx` / `global-error.tsx`). No other area was found missing; nothing was assumed missing merely because an older report omitted it.

## Not treated as gaps (verified present, to avoid inventing work)
- Related articles on article detail — **present** in `ArticleView`.
- Directory/section/competition empty states — **present**.
- Search filtering — **present**.
- Breadcrumbs — **present** across detail/landing pages.

## Blocked (content, not code — out of Batch 18 scope)
- Actual NFR 2026 editorial content (dates/contestants/schedule/results) — ⛔ requires source-verified human entry; not fabricated.
