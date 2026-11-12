/**
 * Pure slug rules, shared by the server service and the admin editor.
 *
 * `lib/cms/rodeoSlugs.ts` is `server-only` because it touches the database, so
 * the admin modal cannot import from it. Duplicating normalisation in the
 * browser would be worse than importing it: the two copies would drift, and the
 * operator would see a preview that does not match what gets stored.
 *
 * Everything here is deliberately free of imports and side effects so it runs
 * identically on both sides. The server still validates independently — this is
 * for instant feedback, never for enforcement.
 */

/** Slugs that would shadow, or be shadowed by, a real route segment. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'about', 'account', 'affiliate-disclosure', 'articles', 'categories', 'competitors',
  'contact', 'corrections', 'disciplines', 'editorial-policy', 'forgot-password', 'info',
  'login', 'privacy', 'register', 'reset-password', 'rodeo-events', 'search', 'terms',
  'venues', 'admin', 'api', 'sitemap.xml', 'robots.txt',
  // Edition sub-routes — an edition slug matching one of these would collide
  // with its own coverage pages.
  'schedule', 'results', 'standings',
]);

/**
 * Normalise operator input into a safe URL segment.
 *
 * Deliberately strict: lowercase, ASCII alphanumerics and single hyphens only.
 * Anything else is dropped rather than escaped, because a slug that needs
 * percent-encoding to be legal is a slug nobody can type or read.
 */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** The shape rule, as a message or null. Shared so UI and server agree exactly. */
export function slugShapeError(slug: string): string | null {
  if (!slug) return 'A slug cannot be empty.';
  if (slug.length > 80) return 'A slug may be at most 80 characters.';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return 'A slug may contain only lowercase letters, numbers and single hyphens.';
  }
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" is a reserved path and cannot be used as a slug.`;
  return null;
}
