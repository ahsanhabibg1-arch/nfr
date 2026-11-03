/**
 * Centralized Route Configuration for NFRGuide.com
 * Public & Admin Editorial CMS Routes
 */

export const ROUTES = {
  // Public Routes
  HOME: '/',
  ARTICLE: (slug: string) => `/articles/${slug}/`,
  ARTICLE_PATTERN: '/articles/:slug',
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
  ADMIN_ANALYTICS: '/admin/analytics/',
  ADMIN_MONETIZATION: '/admin/monetization/',
  ADMIN_TEAM: '/admin/team/',
  ADMIN_SETTINGS: '/admin/settings/',
  ADMIN_VENUES: '/admin/venues/',
  ADMIN_COMPETITORS: '/admin/competitors/',
  ADMIN_COMPETITION: '/admin/competition/',
} as const;

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
