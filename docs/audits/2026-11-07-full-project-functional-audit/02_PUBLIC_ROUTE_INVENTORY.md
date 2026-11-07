# 02 — Public Route Inventory

**Audited:** 2026-11-07 · **Source:** Next.js App Router `app/(public)/` + `app/api/`

## Complete Route Map

| # | Route Pattern | Page Purpose | Data Source | DB Model(s) | Admin Module | Status |
|---|---|---|---|---|---|---|
| 1 | `/` | Homepage — hero, sections, disciplines, hubs, events | DB (articles, disciplines, hubs, events) | Article, Discipline, RodeoHub, RodeoEvent | Articles, Rodeo Coverage | ✅ FUNCTIONAL |
| 2 | `/competition/` | NFR Competition section landing | DB (articles by category) | Article, Category | Articles | ✅ FUNCTIONAL |
| 3 | `/entertainment/` | NFR Entertainment section landing | DB (articles by category) | Article, Category | Articles | ✅ FUNCTIONAL |
| 4 | `/events-shopping/` | Events & Shopping section landing | DB (articles by category) | Article, Category | Articles | ✅ FUNCTIONAL |
| 5 | `/plan-watch/` | Plan & Watch section landing | DB (articles by category) | Article, Category | Articles | ✅ FUNCTIONAL |
| 6 | `/rodeo-events/` | More Rodeo section + hub/event directory | DB (articles + hubs + events) | Article, RodeoHub, RodeoEvent | Articles, Rodeo Coverage | ✅ FUNCTIONAL |
| 7 | `/rodeo-events/[slug]/` | Hub or Event detail (resolved by slug) | DB | RodeoHub \| RodeoEvent, EntitySeo, EntityFaq | Rodeo Coverage, Landing SEO | ✅ FUNCTIONAL |
| 8 | `/rodeo-events/[slug]/[edition]/` | Annual edition detail | DB | RodeoEventEdition, EntitySeo, EntityFaq | Rodeo Coverage, Landing SEO | ✅ FUNCTIONAL |
| 9 | `/rodeo-events/[slug]/[edition]/schedule/` | Edition schedule | DB | CompetitionSession | Competition Coverage | ✅ FUNCTIONAL |
| 10 | `/rodeo-events/[slug]/[edition]/results/` | Edition results | DB | CompetitionResult | Competition Coverage | ✅ FUNCTIONAL |
| 11 | `/rodeo-events/[slug]/[edition]/standings/` | Edition standings | DB | CompetitionStanding | Competition Coverage | ✅ FUNCTIONAL |
| 12 | `/disciplines/[slug]/` | Discipline guide | DB | Discipline, EntitySeo, EntityFaq | Rodeo Coverage (Disciplines tab), Landing SEO | ✅ FUNCTIONAL |
| 13 | `/categories/[slug]/` | Category article archive | DB | Category, Article, EntitySeo, EntityFaq | Organization & Taxonomy, Landing SEO | ✅ FUNCTIONAL |
| 14 | `/competitors/` | Competitor directory (search/filter/page) | DB | Competitor, Discipline | Competitors | ✅ FUNCTIONAL |
| 15 | `/competitors/[slug]/` | Competitor profile | DB | Competitor, CompetitorDiscipline, CompetitorParticipation, EntitySeo, EntityFaq | Competitors, Landing SEO | ✅ FUNCTIONAL |
| 16 | `/venues/` | Venue directory (search/filter/page) | DB | Venue | Venues (in Rodeo Coverage) | ✅ FUNCTIONAL |
| 17 | `/venues/[slug]/` | Venue detail | DB | Venue, RodeoEventEdition, EntitySeo, EntityFaq | Venues, Landing SEO | ✅ FUNCTIONAL |
| 18 | `/articles/[slug]/` | Published article | DB | Article, ArticleSeo, ArticleBlock, Author, Comment | Articles, SEO Intelligence | ✅ FUNCTIONAL |
| 19 | `/search/` | Internal search (noindex) | DB (full-text search) | Article, Discipline, Category, RodeoHub/Event/Edition | N/A (indexed by content) | ✅ FUNCTIONAL |
| 20 | `/login/` | Reader login | Session auth | User, Session | Reader Accounts | ✅ FUNCTIONAL |
| 21 | `/register/` | Reader registration | Session auth | User, Session, UserRole | Reader Accounts | ✅ FUNCTIONAL |
| 22 | `/forgot-password/` | Password reset request | DB | PasswordResetToken | N/A | ✅ FUNCTIONAL |
| 23 | `/reset-password/` | Password reset (token) | DB | PasswordResetToken | N/A | ✅ FUNCTIONAL |
| 24 | `/account/` | Reader account dashboard | Session | User | N/A (self-service) | ✅ FUNCTIONAL |
| 25 | `/account/comments/` | Reader's own comments | Session + DB | ArticleComment | N/A (self-service) | ✅ FUNCTIONAL |
| 26 | `/about/` | About page | **HARDCODED** (config/legalPages.ts) | None | **NONE** | ⚠️ HARDCODED |
| 27 | `/privacy/` | Privacy policy | **HARDCODED** (config/legalPages.ts) | None | **NONE** | ⚠️ HARDCODED |
| 28 | `/terms/` | Terms of use | **HARDCODED** (config/legalPages.ts) | None | **NONE** | ⚠️ HARDCODED |
| 29 | `/editorial-policy/` | Editorial policy | **HARDCODED** (config/legalPages.ts) | None | **NONE** | ⚠️ HARDCODED |
| 30 | `/affiliate-disclosure/` | Affiliate disclosure | **HARDCODED** (config/legalPages.ts) | None | **NONE** | ⚠️ HARDCODED |
| 31 | `/corrections/` | Corrections policy | **HARDCODED** (config/legalPages.ts) | None | **NONE** | ⚠️ HARDCODED |
| 32 | `/contact/` | Contact page | **HARDCODED** (config/legalPages.ts) | None | **NONE** | ⚠️ HARDCODED |

## API Routes

| Route | Purpose | Auth |
|---|---|---|
| `/api/analytics/event/` | First-party analytics ingest | Same-origin + rate limit |
| `/api/media/[...key]/` | Media proxy/serve | Public (signed keys) |
| `/api/admin/media/upload/` | Admin media upload | Staff + media.upload |
| `/api/account/me/` | Current user state | Session (optional) |
| `/api/health/` | Health check | None |
| `/api/ready/` | Readiness probe | None |
| `/api/csp-report/` | CSP violation reports | None |
| `/go/[id]/` | Affiliate redirect | Public |

## Key Findings

1. **30 public routes** are fully DB-backed and CMS-controlled.
2. **7 legal/policy pages** are hardcoded in `config/legalPages.ts` — by design (pending owner/legal review). These are noindex with a visible draft banner. **Not a bug** but a documented gap: they cannot be edited from Admin.
3. **All rodeo entities** (hubs, events, editions, competitors, venues, schedules, results, standings) are DB-backed with full Admin CRUD.
4. **Section landing pages** derive names/taglines from `config/routes.ts` (PRIMARY_SECTIONS) — these are hardcoded section definitions, but article content within them is fully DB-driven.
5. **Homepage** content is 100% from DB (hero, sections, disciplines, directory). Quick-access links are navigation shortcuts (hardcoded in `config/quickAccess.ts`).
6. **No broken, empty, or orphan routes found.** All routes return proper data or appropriate empty-state messages.
