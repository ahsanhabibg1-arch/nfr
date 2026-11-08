/**
 * Batch S / S3 — single robots policy model shared by every metadata path.
 *
 * `RobotsPolicy` keeps index and follow independent so all four combinations can be
 * expressed (index/follow, index/nofollow, noindex/follow, noindex/nofollow).
 *
 * Sources and their policies:
 *   - ArticleSeo.robots (free text)  → parseRobotsDirective()
 *   - EntitySeo.noindex (editor)     → EDITOR_NOINDEX = noindex, FOLLOW (owner decision: an
 *                                      editor noindex must not block link following)
 *   - route-level `noindex: true` on buildMetadata (unavailable / not-found / thin /
 *     filtered states)               → LEGACY_NOINDEX = noindex, nofollow — the established
 *                                      behaviour, preserved unchanged
 * When several sources apply, combineRobots() keeps the most restrictive of each flag.
 */

export interface RobotsPolicy {
  index: boolean;
  follow: boolean;
}

export const INDEX_FOLLOW: Readonly<RobotsPolicy> = Object.freeze({ index: true, follow: true });
/** Editor-requested noindex (EntitySeo.noindex): keep following links. */
export const EDITOR_NOINDEX: Readonly<RobotsPolicy> = Object.freeze({ index: false, follow: true });
/** Route-level `noindex: true` (pre-S3 behaviour, unchanged). */
export const LEGACY_NOINDEX: Readonly<RobotsPolicy> = Object.freeze({ index: false, follow: false });
/** Keep out of the index but let crawlers follow links (same value as EDITOR_NOINDEX). */
export const NOINDEX_FOLLOW: Readonly<RobotsPolicy> = EDITOR_NOINDEX;

/**
 * Explicit route policies (owner-approved, Batch S Phase 0 decision 4 / S3 follow-up):
 *   - filtered or paged directory listings (/competitors/?q=, /venues/?country=, ?page>1)
 *     are thin duplicates → noindex, but their entity links are real → follow.
 *   - the unavailable-article page → noindex, follow.
 * Unchanged (not routed through here): thin rodeo hubs and other content-noindex pages
 * (noindex, nofollow via LEGACY_NOINDEX), admin (noindex, nofollow), staging middleware
 * (X-Robots-Tag noindex, nofollow), /search/ (noindex, follow — set in the route).
 */
export function directoryListingRobots(filtered: boolean): RobotsPolicy {
  return filtered ? { ...NOINDEX_FOLLOW } : { ...INDEX_FOLLOW };
}
export const UNAVAILABLE_ARTICLE_ROBOTS: Readonly<RobotsPolicy> = NOINDEX_FOLLOW;

/**
 * Parse a stored robots directive, e.g. "index, follow", " NOINDEX ,nofollow", "none".
 *
 * - Case-insensitive; tokens may be separated by commas and/or whitespace.
 * - `noindex` → index:false; `nofollow` → follow:false; `none` → both false.
 *   `index`, `follow`, `all` and unrecognised tokens (e.g. "max-snippet:-1") change nothing.
 * - Contradictions resolve to the restrictive value ("index, noindex" → noindex).
 * - Fallback: missing, blank or wholly unrecognised input → index, follow. This is the
 *   established default (`ArticleSeo.robots` defaults to "index, follow"; before S1 the
 *   stored value was not read at all and every published article rendered index, follow).
 */
export function parseRobotsDirective(value: string | null | undefined): RobotsPolicy {
  const policy: RobotsPolicy = { index: true, follow: true };
  for (const token of (value ?? '').toLowerCase().split(/[\s,]+/)) {
    if (token === 'noindex') policy.index = false;
    else if (token === 'nofollow') policy.follow = false;
    else if (token === 'none') { policy.index = false; policy.follow = false; }
  }
  return policy;
}

/** Most restrictive combination: index only if all allow it; follow only if all allow it. */
export function combineRobots(...policies: ReadonlyArray<RobotsPolicy | null | undefined>): RobotsPolicy {
  const present = policies.filter((p): p is RobotsPolicy => !!p);
  return {
    index: present.every((p) => p.index),
    follow: present.every((p) => p.follow),
  };
}

/** Canonical directive string, e.g. "noindex, follow". */
export function robotsToString(policy: RobotsPolicy): string {
  return `${policy.index ? 'index' : 'noindex'}, ${policy.follow ? 'follow' : 'nofollow'}`;
}
