/**
 * Synthetic test fixtures and requirement-defined reference identities (Batch A, D3).
 * Side-effect free: imported by the seed, unit tests, the route smoke script and e2e tests.
 * Fixtures are created only in isolated test/CI databases (see prisma/seed.ts).
 */

/** The seven NFR disciplines are fixed by Requirements v2.0 §2 (names only — no claims). */
export const NFR_DISCIPLINES: { slug: string; name: string; category: 'Roughstock' | 'Timed Event' }[] = [
  { slug: 'bareback-riding', name: 'Bareback Riding', category: 'Roughstock' },
  { slug: 'steer-wrestling', name: 'Steer Wrestling', category: 'Timed Event' },
  { slug: 'team-roping', name: 'Team Roping', category: 'Timed Event' },
  { slug: 'saddle-bronc-riding', name: 'Saddle Bronc Riding', category: 'Roughstock' },
  { slug: 'tie-down-roping', name: 'Tie-Down Roping', category: 'Timed Event' },
  { slug: 'barrel-racing', name: 'Barrel Racing', category: 'Timed Event' },
  { slug: 'bull-riding', name: 'Bull Riding', category: 'Roughstock' },
];

export const FIXTURE_PREFIX = 'fixture-';
export const FIXTURE_TEXT = 'Synthetic fixture content used by automated tests. It is not real editorial content and describes no real event.';

/** One published fixture article per primary section, plus one draft. Slugs are stable for smoke/e2e tests. */
export const FIXTURE_ARTICLES = [
  { key: 'competition', slug: 'fixture-competition-article', title: 'Fixture: Competition Sample Article', type: 'Rules & Format', published: true },
  { key: 'entertainment', slug: 'fixture-entertainment-article', title: 'Fixture: Entertainment Sample Article', type: 'General Information', published: true },
  { key: 'events-shopping', slug: 'fixture-events-shopping-article', title: 'Fixture: Events and Shopping Sample Article', type: 'General Information', published: true },
  { key: 'plan-watch', slug: 'fixture-plan-watch-news-article', title: 'Fixture: Plan and Watch Sample News Article', type: 'News', published: true },
  { key: 'rodeo-events', slug: 'fixture-more-rodeo-article', title: 'Fixture: More Rodeo Sample Article', type: 'Event Update', published: true },
  { key: 'competition', slug: 'fixture-draft-article', title: 'Fixture: Draft Article (never public)', type: 'General Information', published: false },
] as const;

export const FIXTURE_SLUGS = {
  hub: 'fixture-hub-a',
  events: ['fixture-rodeo-event-a', 'fixture-rodeo-event-b'] as const,
  editionSlug: 'fixture-2099',
  publishedArticle: 'fixture-competition-article',
  newsArticle: 'fixture-plan-watch-news-article',
  draftArticle: 'fixture-draft-article',
  source: 'fixture-source-a',
} as const;
