# 03 — Public Website Audit

**Mode:** READ-ONLY (static source inspection + route smoke on local dev server). Full visual/browser QA: see report 09.

## 1. Routes present (evidence: `find app/(public) -name page.tsx`)

24 public page templates:
- Home `/`, section `/[section]/`
- Articles `/articles/[slug]/`, categories `/categories/[slug]/`
- Disciplines `/disciplines/[slug]/`
- Rodeo: `/rodeo-events/`, `/rodeo-events/[slug]/`, `/rodeo-events/[slug]/[edition]/`, `+/schedule/`, `+/results/`, `+/standings/`
- Venues `/venues/`, `/venues/[slug]/`
- Competitors `/competitors/`, `/competitors/[slug]/`
- Search `/search/`
- Legal: `/about/`, `/privacy/`, `/terms/`, `/editorial-policy/`, `/corrections/`, `/affiliate-disclosure/`, `/contact/`

### Local route smoke (this audit, dev server on :3000, GET only)
| Route | HTTP |
|-------|------|
| `/` | 200 |
| `/competitors/` | 200 |
| `/venues/` | 200 |
| `/rodeo-events/` | 200 |
| `/admin/login/` | 200 |

> This is a **liveness** check only (status codes against the local dev DB), not a full content/visual audit.

## 2. Homepage & navigation (5.1)
- Homepage: `app/(public)/page.tsx` — server component. Brand positioning string present: *"Independent rodeo editorial publication covering the National Finals Rodeo, championship competition, entertainment, and spectator guides."* (`page.tsx:22`).
- **Information architecture**: 5 primary sections defined centrally in `config/routes.ts` → `PRIMARY_SECTIONS` (competition, entertainment, events-shopping, plan-watch, rodeo-events), each with name/tagline/description/categoryKey. Dynamic, config-driven — not hardcoded per page.
- **Footer**: `components/SiteFooter.tsx` appends the Competitors/Venues directory links unconditionally and de-duplicated against DB-backed nav (Batch 15/16 fix) — directory links cannot be masked by CMS nav state.
- **Empty/unpublished handling**: services filter to published/eligible records (see report 05); `404` paths exercised in `scripts/route-smoke.mts` for unknown slugs.

## 3. NFR editorial sections (5.2)
- All five sections resolve through `app/(public)/[section]/page.tsx` driven by `PRIMARY_SECTIONS`. CMS-manageable via navigation + article category assignment.
- **Status:** IMPL-NOT-RTV. Section pages render; whether each currently has published articles depends on DB content (local dev has seeded fixtures; production content is a separate concern — see report 10).

## 4. Rodeo entities (5.3)
Models + routes exist for: hubs, recurring events, editions, 7 disciplines, competitor directory/profiles, venue directory/profiles, competition schedules/results/standings, event↔edition and competitor↔event relationships (`CompetitorParticipation`, `ArticleCompetitor`, `RodeoHubEvent`), related-article associations (`ArticleHub/Event/Edition/Discipline/Competitor`).
- Edition competition coverage (Batch 14): `CompetitionSession` / `CompetitionResult` / `CompetitionStanding` with `coverageStatus` + `verification` enums — public pages render only published/verified coverage.
- **Orphan risk:** directory pages (`/venues/`, `/competitors/`) rely on sitemap-eligible entities; `route-smoke.mts:110-122` already guards the empty-state (404) vs populated (200+canonical) branches. No orphaned-page defect found in source.

## 5. Editorial content (5.4)
- Article detail emits JSON-LD (`Article`/`NewsArticle` chosen by `isNewsArticleType`, `lib/seo.tsx`), canonical, breadcrumb.
- Author attribution: DB-backed `Author` model (Batch 16), with `legacyBylineName` preservation for pre-existing bylines.
- Legal/affiliate: dedicated routes present incl. `/affiliate-disclosure/` and `/corrections/`.
- **Public visibility rules:** drafts/archived/unverified competition coverage filtered server-side (not client). Covered by `tests/eligibility.test.ts`, `public-content.test.ts`, `rodeo-public.test.ts` (not executed this audit).

## 6. Findings
- ✅ No hardcoded-only section pages found; IA is config-driven.
- ✅ Directory footer links hardened against nav masking.
- ⚠️ Public content **volume** is content-dependent; thin/empty sections in production would be a content task, not a code defect (report 10).
- ⚠️ Pre-existing minor global horizontal-overflow reported in prior QA — see report 09.

## 7. Limitations
- Only HTTP status liveness checked live; per-template content correctness, metadata rendering, and visual layout were not fully browser-audited in this pass (report 09 covers what browser QA is available).
