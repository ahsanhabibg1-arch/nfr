/**
 * Which public paths a page key's PUBLISHED layout affects (Stage 08 Task D,
 * owner decision D-08).
 *
 * THE DEFECT THIS REPLACES
 *
 * `app/admin/page-layout-actions.ts` had one helper used by every mutation:
 *
 *     const rev = () => { revalidatePath('/admin/website/'); revalidatePath('/', 'layout'); };
 *
 * `revalidatePath('/', 'layout')` invalidates the root layout, and therefore
 * **every page on the site**. It was called by `saveDraftAction` as well as the
 * publish paths, so saving an unpublished draft for one page key flushed the
 * entire public cache — including pages the operator had not touched, and
 * including the published version of the page they were drafting.
 *
 * D-08 records this as an engineering correction within approved scope
 * ("Approval required: NO"), with option (a) — a two-tier scoped model —
 * recommended. This module is the `pageKey → paths` half of that.
 *
 * WHY A DRAFT SAVE NEEDS NO PUBLIC REVALIDATION AT ALL
 *
 * The staff draft preview is rendered through `isStaffDraftPreview()`, which
 * calls `draftMode()`. Reading draft mode opts the route out of static
 * rendering for that request, so the preview is already dynamic and always
 * reflects the latest saved draft. There is no cached public artefact for a
 * draft to invalidate — which is why the correct scope for a draft save is the
 * admin route alone.
 *
 * DYNAMIC SEGMENTS
 *
 * A `template:*` key governs every entity of its type, so its paths are route
 * PATTERNS (`/articles/[slug]`) rather than concrete URLs.
 * `revalidatePath(pattern, 'page')` invalidates every generated instance of
 * that route, which is exactly the fan-out a template change needs and is
 * still far narrower than the whole site. D-08 names tag-based invalidation as
 * the long-term shape for these keys; this is the intermediate step it
 * describes, not a replacement for it.
 */

import { KNOWN_PAGE_KEYS } from './sectionRegistry';

export interface CacheTarget {
  /** The path or route pattern passed to `revalidatePath`. */
  path: string;
  /**
   * `'page'` for a single route (including a dynamic pattern, where it covers
   * every instance). `'layout'` only where a key genuinely governs a subtree.
   */
  type: 'page' | 'layout';
}

/**
 * The authoritative map. Every one of the 15 page keys is present, and
 * `tests/stage08-cache-scope.test.ts` asserts that — a key added later without
 * an entry would otherwise publish and invalidate nothing.
 */
const PUBLISHED_PATHS: Record<string, CacheTarget[]> = {
  homepage: [{ path: '/', type: 'page' }],

  // Section landings own one path each.
  'section:competition': [{ path: '/competition', type: 'page' }],
  'section:entertainment': [{ path: '/entertainment', type: 'page' }],
  'section:events-shopping': [{ path: '/events-shopping', type: 'page' }],
  'section:plan-watch': [{ path: '/plan-watch', type: 'page' }],
  'section:rodeo-events': [{ path: '/rodeo-events', type: 'page' }],

  /**
   * Detail templates fan out across every entity of their type. The pattern
   * form invalidates all instances of the route and nothing else.
   */
  'template:article': [{ path: '/articles/[slug]', type: 'page' }],
  'template:category': [{ path: '/categories/[slug]', type: 'page' }],
  'template:discipline': [{ path: '/disciplines/[slug]', type: 'page' }],
  'template:competitor': [{ path: '/competitors/[slug]', type: 'page' }],
  'template:venue': [{ path: '/venues/[slug]', type: 'page' }],
  'template:rodeo-hub': [{ path: '/rodeo-events/[slug]', type: 'page' }],
  'template:rodeo-edition': [{ path: '/rodeo-events/[slug]/[edition]', type: 'page' }],

  // Directory listings own their index path.
  'directory:competitors': [{ path: '/competitors', type: 'page' }],
  'directory:venues': [{ path: '/venues', type: 'page' }],
};

/** The admin route whose own cache a draft save must refresh. */
export const ADMIN_LAYOUT_PATH = '/admin/website/';

/**
 * Public paths a PUBLISH of this page key must invalidate.
 *
 * An unknown key returns an empty list rather than falling back to the whole
 * site. A fallback of `/` would quietly restore the defect this module exists
 * to remove, and `saveDraft`/`publishLayout` already reject an unknown key
 * through `validatePageKey`, so an unknown key here cannot come from a real
 * publish.
 */
export function publishedPathsFor(pageKey: string): CacheTarget[] {
  return PUBLISHED_PATHS[pageKey] ?? [];
}

/** Every page key the map covers. Used by the coverage test. */
export function mappedPageKeys(): string[] {
  return Object.keys(PUBLISHED_PATHS);
}

/** Page keys the registry knows but this map does not cover. Must be empty. */
export function unmappedPageKeys(): string[] {
  return KNOWN_PAGE_KEYS.filter((k) => !(k in PUBLISHED_PATHS));
}

/**
 * Whether a mutation that writes ONLY the draft needs any public invalidation.
 *
 * Always false, and stated as a function so the reasoning has one home and the
 * tests can assert it directly. A draft write changes no published artefact:
 * `publishedSections` is untouched, and the preview that reads
 * `draftSections` is dynamically rendered.
 */
export function draftWriteNeedsPublicRevalidation(): boolean {
  return false;
}
