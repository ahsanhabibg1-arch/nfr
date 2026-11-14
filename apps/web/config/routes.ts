/**
 * Centralized Route Configuration for NFRGuide.com
 * Public & Admin Editorial CMS Routes
 */

export const ROUTES = {
  // Public Routes
  HOME: '/',
  /**
   * An article's URL depends on whether it has a managed subcategory.
   *
   * With one, it lives INSIDE that subcategory — `/cowboy-christmas/<slug>/`.
   * Without one it keeps the original `/articles/<slug>/`, and that is not a
   * transitional nicety: the owner's flat scheme gives an article no URL at all
   * unless something supplies the first segment. Most articles have no
   * subcategory, so `/articles/` remains a real, permanent, indexable home
   * rather than a legacy alias.
   *
   * Pass the subcategory SLUG, never its display name. `Article.subcategoryRef`
   * carries it on every mapped article.
   *
   * Assigning, changing or clearing a subcategory therefore MOVES the article.
   * `recordArticleUrlMove` in articleService writes the 301 for that, the same
   * way a slug rename already does — so this helper is never the only thing
   * standing between a reader and a 404.
   */
  ARTICLE: (slug: string, subcategorySlug?: string | null) =>
    subcategorySlug ? `/${subcategorySlug}/${slug}/` : `/articles/${slug}/`,
  ARTICLE_PATTERN: '/articles/:slug',
  /** A subcategory archive. Depth 1, sharing the namespace with the sections. */
  SUBCATEGORY: (slug: string) => `/${slug}/`,
  SUBCATEGORY_PATTERN: '/:subcategory',
  COMPETITION: '/competition/',
  ENTERTAINMENT: '/entertainment/',
  EVENTS_SHOPPING: '/events-shopping/',
  PLAN_WATCH: '/plan-watch/',
  MORE_RODEO: '/rodeo-events/',
  DISCIPLINE: (slug: string) => `/disciplines/${slug}/`,
  DISCIPLINE_PATTERN: '/disciplines/:slug',
  CATEGORY: (slug: string) => `/categories/${slug}/`,
  CATEGORY_PATTERN: '/categories/:slug',
  // Public rodeo entity pages (Batch 10) — nested under the /rodeo-events/ section.
  // Hubs and recurring events share the depth-1 namespace (cross-table slug
  // uniqueness enforced on write); an event URL is hub-independent.
  RODEO_HUB: (slug: string) => `/rodeo-events/${slug}/`,
  RODEO_EVENT: (slug: string) => `/rodeo-events/${slug}/`,
  RODEO_EDITION: (eventSlug: string, editionSlug: string) => `/rodeo-events/${eventSlug}/${editionSlug}/`,
  // Edition competition coverage (Batch 14) — nested under the annual edition URL.
  EDITION_SCHEDULE: (eventSlug: string, editionSlug: string) => `/rodeo-events/${eventSlug}/${editionSlug}/schedule/`,
  EDITION_RESULTS: (eventSlug: string, editionSlug: string) => `/rodeo-events/${eventSlug}/${editionSlug}/results/`,
  EDITION_STANDINGS: (eventSlug: string, editionSlug: string) => `/rodeo-events/${eventSlug}/${editionSlug}/standings/`,
  // Public venue & competitor entity pages (Batch 12).
  VENUE: (slug: string) => `/venues/${slug}/`,
  VENUE_PATTERN: '/venues/:slug',
  COMPETITOR: (slug: string) => `/competitors/${slug}/`,
  COMPETITOR_PATTERN: '/competitors/:slug',

  // Admin CMS Routes (12 Modules)
  ADMIN: '/admin/',
  ADMIN_ARTICLES: '/admin/articles/',
  ADMIN_ARTICLE_NEW: '/admin/articles/new/',
  ADMIN_ARTICLE_EDIT: (id: string) => `/admin/articles/${id}/edit/`,
  ADMIN_ARTICLE_EDIT_PATTERN: '/admin/articles/:id/edit',
  ADMIN_RODEO_COVERAGE: '/admin/rodeo-coverage/',
  ADMIN_EDITORIAL_ORG: '/admin/editorial-organization/',
  ADMIN_MEDIA: '/admin/media/',
  ADMIN_SOURCES: '/admin/sources/',
  ADMIN_SEO: '/admin/seo/',
  ADMIN_WEBSITE: '/admin/website/',
  ADMIN_INFO_PAGES: '/admin/info-pages/',
  ADMIN_ANALYTICS: '/admin/analytics/',
  ADMIN_MONETIZATION: '/admin/monetization/',
  ADMIN_TEAM: '/admin/team/',
  ADMIN_SETTINGS: '/admin/settings/',
  ADMIN_VENUES: '/admin/venues/',
  ADMIN_COMPETITORS: '/admin/competitors/',
  ADMIN_COMPETITION: '/admin/competition/',
  ADMIN_COMMENTS: '/admin/comments/',
  ADMIN_READERS: '/admin/readers/',
  // Public reader account routes (Batch 24)
  LOGIN: '/login/',
  REGISTER: '/register/',
  FORGOT_PASSWORD: '/forgot-password/',
  RESET_PASSWORD: '/reset-password/',
  ACCOUNT: '/account/',
  ACCOUNT_COMMENTS: '/account/comments/',
} as const;

/**
 * The article URL for anything carrying the shape the public mappers produce.
 *
 * Prefer this over calling `ROUTES.ARTICLE` with two arguments. The two-argument
 * form makes it easy to pass a subcategory's NAME where its SLUG belongs — and
 * `"Cowboy Christmas"` produces a URL that looks plausible in a link, 404s at
 * read time, and never fails a type check. Taking the whole article removes that
 * opportunity: the caller supplies the object it already has.
 */
export function articleUrl(article: {
  slug: string;
  subcategoryRef?: { slug: string } | null;
}): string {
  return ROUTES.ARTICLE(article.slug, article.subcategoryRef?.slug);
}

/**
 * Slugs a subcategory may NOT take, because a flat `/<subcategory>/` route puts
 * it in the same namespace as every depth-1 path the site already serves.
 *
 * Next.js resolves a static segment before a dynamic one, so a subcategory
 * slugged `search` or `venues` would not break those pages — it would simply be
 * unreachable forever, which is worse: it fails silently, at read time, long
 * after someone named it. The write path rejects these instead.
 *
 * Kept here rather than in the service because this list IS the route table;
 * `tests/subcategory-route.test.ts` fails if a public directory appears under
 * `app/(public)/` without a matching entry.
 */
export const RESERVED_SUBCATEGORY_SLUGS: ReadonlySet<string> = new Set([
  // The five primary sections — same depth, same namespace.
  'competition', 'entertainment', 'events-shopping', 'plan-watch', 'rodeo-events',
  // Static public routes.
  'about', 'account', 'affiliate-disclosure', 'articles', 'categories',
  'competitors', 'contact', 'corrections', 'disciplines', 'editorial-policy',
  'forgot-password', 'info', 'login', 'privacy', 'register', 'reset-password',
  'search', 'terms', 'venues',
  // Framework, API and file routes.
  'admin', 'api', 'go', '_next', 'sitemap.xml', 'robots.txt', 'favicon.ico',
  'opensearch.xml', 'manifest.json',
]);

export interface SectionMeta {
  id: string;
  name: string;
  path: string;
  categoryKey: string;
  tagline: string;
  description: string;
}

export const PRIMARY_SECTIONS: Record<string, SectionMeta> = {
  competition: {
    id: 'competition',
    name: 'NFR Competition',
    path: ROUTES.COMPETITION,
    categoryKey: 'NFR Competition',
    tagline: 'Rounds, Disciplines, Schedules & Results Coverage',
    description: 'NFR overview, the ten rounds and seven disciplines, schedules, editorial results and standings coverage, and contestant-related articles.',
  },
  entertainment: {
    id: 'entertainment',
    name: 'NFR Entertainment',
    path: ROUTES.ENTERTAINMENT,
    categoryKey: 'NFR Entertainment',
    tagline: 'Concerts, Watch Parties, Awards & Fan Experiences',
    description: 'Coverage of concerts, after-parties, watch parties, awards, meet-and-greets and other fan experiences around the NFR.',
  },
  'events-shopping': {
    id: 'events-shopping',
    name: 'NFR Events & Shopping',
    path: ROUTES.EVENTS_SHOPPING,
    categoryKey: 'NFR Events & Shopping',
    tagline: 'Cowboy Christmas, Junior NFR & Western Culture',
    description: 'Guides to Cowboy Christmas, Junior NFR, Miss Rodeo America, exhibitions and merchandise-related coverage.',
  },
  'plan-watch': {
    id: 'plan-watch',
    name: 'NFR Plan & Watch',
    path: ROUTES.PLAN_WATCH,
    categoryKey: 'NFR Plan & Watch',
    tagline: 'How to Watch, Tickets, Hotels & Travel',
    description: 'Information on authorized TV and streaming options, tickets, hotels, travel, the venue, transport and Las Vegas guides.',
  },
  'rodeo-events': {
    id: 'rodeo-events',
    name: 'More Rodeo',
    path: ROUTES.MORE_RODEO,
    categoryKey: 'More Rodeo',
    tagline: 'Rodeo Hubs, Recurring Events & Annual Editions',
    description: 'Rodeo beyond the NFR: hubs by region and theme, recurring rodeo events, their annual editions and related articles.',
  },
};
