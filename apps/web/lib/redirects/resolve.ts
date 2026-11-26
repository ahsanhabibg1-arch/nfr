import 'server-only';
import { prisma } from '../db';
import { publicArticleWhere, publicSlugWhere } from '../fixturePolicy';
import { LEGAL_PAGES } from '../../config/legalPages';
import { PRIMARY_SECTIONS, ROUTES, articleUrl } from '../../config/routes';
import { resolvePublicInfoPage } from '../cms/infoPageService';
import {
  normalizeRedirectPath,
  validateRedirectSource,
  validateRedirectDestinationShape,
  isSupportedRedirectStatus,
  isPermanentStatus,
  samePath,
  type RedirectStatusCode,
} from './paths';

/**
 * The one place a stored redirect becomes an HTTP destination.
 *
 * WHY A DESTINATION IS RE-RESOLVED RATHER THAN TRUSTED.
 *
 * `ArticleRedirect.targetPath` is a string written at some point in the past.
 * Between then and now the destination article may have been unpublished,
 * deleted, renamed again, or moved between subcategories. Serving the stored
 * string would then send a reader to a 404, or through a second hop, or — if a
 * bad row ever reached the table — off the site entirely.
 *
 * So the stored target is treated as a POINTER, not an answer: it identifies an
 * entity, the entity is looked up, and the destination returned is that
 * entity's CURRENT canonical URL from `config/routes.ts`. A stale target
 * therefore self-heals into one hop instead of two, and a dead one resolves to
 * nothing and falls through to the route's own `notFound()`.
 *
 * VISIBILITY IS PER ENTITY FAMILY, NOT UNIVERSAL.
 *
 * An article must be PUBLISHED to be a valid destination, because an
 * unpublished article's route 404s. A rodeo hub, event, edition, venue or
 * discipline must merely EXIST and not be a hidden fixture — archiving one
 * deliberately keeps its detail URL at HTTP 200 with `noindex`
 * (`lib/cms/lifecycle.ts`), so refusing an archived destination would break the
 * inbound links that policy exists to preserve. Applying a blanket "must be
 * published" rule here would have been the easy mistake.
 */

export interface ResolvedRedirect {
  /** The destination's CURRENT canonical path — never the raw stored string. */
  destination: string;
  permanent: boolean;
  statusCode: RedirectStatusCode;
}

/** Why a resolution attempt produced nothing. Returned for diagnostics, not to callers. */
export type ResolveRejection =
  | 'no-row'
  | 'bad-source'
  | 'bad-destination'
  | 'reserved'
  | 'self'
  | 'dangling'
  | 'unsupported-shape'
  | 'bad-status';

/* ── Destination resolution, per route family ──────────────────────────── */

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const RE_ARTICLE_FLAT = new RegExp(`^/articles/(${SLUG})/$`);
const RE_DISCIPLINE = new RegExp(`^/disciplines/(${SLUG})/$`);
const RE_VENUE = new RegExp(`^/venues/(${SLUG})/$`);
const RE_COMPETITOR = new RegExp(`^/competitors/(${SLUG})/$`);
const RE_CATEGORY = new RegExp(`^/categories/(${SLUG})/$`);
const RE_RODEO_ROOT = new RegExp(`^/rodeo-events/(${SLUG})/$`);
const RE_RODEO_EDITION = new RegExp(`^/rodeo-events/(${SLUG})/(${SLUG})/$`);
const RE_RODEO_EDITION_TAB = new RegExp(`^/rodeo-events/(${SLUG})/(${SLUG})/(schedule|results|standings)/$`);
const RE_INFO_PAGE = new RegExp(`^/info/(${SLUG})/$`);
const RE_SINGLE_SEGMENT = new RegExp(`^/(${SLUG})/$`);
/** Two segments that are not one of the prefixes above: a subcategory article. */
const RE_TWO_SEGMENTS = new RegExp(`^/(${SLUG})/(${SLUG})/$`);

const STATIC_PUBLIC_PATHS = new Set([
  ROUTES.HOME,
  ...Object.values(PRIMARY_SECTIONS).map((section) => section.path),
  ROUTES.MORE_RODEO,
  '/venues/',
  '/competitors/',
]);

const LEGAL_PATHS = new Map(LEGAL_PAGES.map((page) => [page.path, page.slug]));

/** The edition sub-tabs that exist as real routes. */
const EDITION_TABS = {
  schedule: ROUTES.EDITION_SCHEDULE,
  results: ROUTES.EDITION_RESULTS,
  standings: ROUTES.EDITION_STANDINGS,
} as const;

/** An article is a valid destination only while it is published and publicly visible. */
async function liveArticleCanonical(slug: string): Promise<string | null> {
  const a = await prisma.article.findFirst({
    where: { slug, ...publicArticleWhere() },
    select: { slug: true, subcategoryTaxon: { select: { slug: true } } },
  });
  if (!a) return null;
  // The article's CURRENT address, which may differ from the stored target.
  return articleUrl({ slug: a.slug, subcategoryRef: a.subcategoryTaxon });
}

/**
 * Resolve a well-formed path to the current canonical URL of the live entity it
 * addresses, or `null` when nothing public lives there.
 *
 * Known prefixes are matched BEFORE the generic two-segment article rule, so
 * `/disciplines/<slug>/` is never mistaken for an article in a subcategory
 * called "disciplines".
 */
export async function resolveLiveCanonical(path: string): Promise<string | null> {
  const p = normalizeRedirectPath(path);
  if (!p) return null;

  let m: RegExpExecArray | null;

  if (STATIC_PUBLIC_PATHS.has(p)) return p;

  const legalSlug = LEGAL_PATHS.get(p);
  if (legalSlug) {
    const resolution = await resolvePublicInfoPage(legalSlug);
    return resolution.kind === 'withdrawn' ? null : p;
  }

  if ((m = RE_INFO_PAGE.exec(p))) {
    const slug = m[1];
    const resolution = await resolvePublicInfoPage(slug);
    if (resolution.kind === 'live' || (resolution.kind === 'unmanaged' && LEGAL_PAGES.some((page) => page.slug === slug))) {
      return p;
    }
    return null;
  }

  if ((m = RE_SINGLE_SEGMENT.exec(p))) {
    const subcategory = await prisma.subcategory.findUnique({
      where: { slug: m[1] },
      select: { slug: true },
    });
    return subcategory ? ROUTES.SUBCATEGORY(subcategory.slug) : null;
  }

  if ((m = RE_ARTICLE_FLAT.exec(p))) return liveArticleCanonical(m[1]);

  if ((m = RE_DISCIPLINE.exec(p))) {
    const row = await prisma.discipline.findFirst({ where: { slug: m[1], ...publicSlugWhere() }, select: { slug: true } });
    return row ? ROUTES.DISCIPLINE(row.slug) : null;
  }

  if ((m = RE_VENUE.exec(p))) {
    const row = await prisma.venue.findFirst({ where: { slug: m[1], ...publicSlugWhere() }, select: { slug: true } });
    return row ? ROUTES.VENUE(row.slug) : null;
  }

  if ((m = RE_COMPETITOR.exec(p))) {
    const row = await prisma.competitor.findFirst({ where: { slug: m[1], ...publicSlugWhere() }, select: { slug: true } });
    return row ? ROUTES.COMPETITOR(row.slug) : null;
  }

  if ((m = RE_CATEGORY.exec(p))) {
    const row = await prisma.category.findFirst({ where: { slug: m[1] }, select: { slug: true } });
    return row ? ROUTES.CATEGORY(row.slug) : null;
  }

  // Edition sub-tab, before the bare edition rule (it is strictly longer).
  if ((m = RE_RODEO_EDITION_TAB.exec(p))) {
    const [, eventSlug, editionSlug, tab] = m;
    const row = await prisma.rodeoEventEdition.findFirst({
      where: { editionSlug, event: { slug: eventSlug, ...publicSlugWhere() } },
      select: { editionSlug: true, event: { select: { slug: true } } },
    });
    if (!row) return null;
    return EDITION_TABS[tab as keyof typeof EDITION_TABS](row.event.slug, row.editionSlug);
  }

  if ((m = RE_RODEO_EDITION.exec(p))) {
    const [, eventSlug, editionSlug] = m;
    const row = await prisma.rodeoEventEdition.findFirst({
      where: { editionSlug, event: { slug: eventSlug, ...publicSlugWhere() } },
      select: { editionSlug: true, event: { select: { slug: true } } },
    });
    return row ? ROUTES.RODEO_EDITION(row.event.slug, row.editionSlug) : null;
  }

  if ((m = RE_RODEO_ROOT.exec(p))) {
    const slug = m[1];
    const ev = await prisma.rodeoEvent.findFirst({ where: { slug, ...publicSlugWhere() }, select: { slug: true } });
    if (ev) return ROUTES.RODEO_EVENT(ev.slug);
    const hub = await prisma.rodeoHub.findFirst({ where: { slug, ...publicSlugWhere() }, select: { slug: true } });
    return hub ? ROUTES.RODEO_HUB(hub.slug) : null;
  }

  /*
    A two-segment path that matched none of the prefixes above is an article
    under a subcategory. The FIRST segment is not checked against the
    article's current subcategory on purpose: the article is identified by its
    slug, and what comes back is wherever it lives NOW. That is what turns a
    stale `/<old-subcategory>/<slug>/` target into a single hop.
  */
  if ((m = RE_TWO_SEGMENTS.exec(p))) return liveArticleCanonical(m[2]);

  // Anything else — a bare subcategory archive, a section, an unknown depth —
  // is not a shape this engine will redirect to.
  return null;
}

/* ── Bounded lookup cache ──────────────────────────────────────────────── */

/** The tag every redirect write invalidates. */
export const REDIRECT_CACHE_TAG = 'redirects';

/** Conservative, well inside the 60–300s band the public routes already use. */
const POSITIVE_TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 10_000;
const MAX_LOOKUP_ENTRIES = 1_024;

type RedirectRow = { targetPath: string; statusCode: number } | null;

const queryRedirectRow = async (sourcePath: string): Promise<RedirectRow> =>
  prisma.articleRedirect.findFirst({
    where: { sourcePath, status: 'ACTIVE' },
    select: { targetPath: true, statusCode: true },
  });

type CacheEntry = { value: RedirectRow; expiresAt: number };
const lookupCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<RedirectRow>>();

let lookupGeneration = 0;

export function clearRedirectLookupCache(): void {
  lookupGeneration++;
  lookupCache.clear();
  inflight.clear();
}

function remember(key: string, value: RedirectRow): void {
  lookupCache.delete(key);
  lookupCache.set(key, { value, expiresAt: Date.now() + (value ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) });
  while (lookupCache.size > MAX_LOOKUP_ENTRIES) {
    const oldest = lookupCache.keys().next().value as string | undefined;
    if (!oldest) break;
    lookupCache.delete(oldest);
  }
}

/**
 * Shapes a redirect source can plausibly take.
 *
 * THIS IS THE CACHE BOUND. A redirect lookup only happens when a route has
 * already failed to find its entity, which is exactly the path a crawler or a
 * broken-link scanner walks — so the key space is attacker-influenced. Caching
 * every string anyone requests would let arbitrary bot traffic fill the store.
 *
 * Only paths that look like a real public route are cached. Anything else
 * still gets a correct answer, from a direct query, and leaves no entry
 * behind.
 */
const SOURCE_SHAPES = [
  RE_ARTICLE_FLAT, RE_DISCIPLINE, RE_VENUE, RE_COMPETITOR, RE_CATEGORY,
  RE_RODEO_ROOT, RE_RODEO_EDITION, RE_RODEO_EDITION_TAB, RE_TWO_SEGMENTS,
];

function isCacheableSource(path: string): boolean {
  return SOURCE_SHAPES.some((re) => re.test(path));
}

/**
 * Read the stored row, through Next's data cache where that is available.
 *
 * WHAT IS CACHED AND WHAT IS NOT. Only the ROW lookup — the mapping from a
 * source path to a stored target and status. The destination's liveness is
 * deliberately re-checked on every request by `resolveLiveCanonical`, because
 * that is the part that must react immediately: unpublishing an article has to
 * stop its inbound redirects at once, not up to a minute later. Caching the
 * cheap half and re-proving the consequential half is the trade that keeps a
 * stale cache from ever publishing hidden content.
 *
 * NEGATIVE RESULTS ARE CACHED, and that is the main win: the common case here
 * is a 404 sweep finding no redirect at all, which otherwise costs a query
 * every time against a database with a small connection budget.
 *
 * FALLBACK, NOT FAILURE. `unstable_cache` only exists inside the Next runtime;
 * under Vitest there is no such context. Rather than branch on an environment
 * variable, the call is attempted and any failure falls through to a direct
 * query — so the tests exercise the same code path the server does, minus the
 * cache, and a cache fault can never turn into a 500.
 */
async function readRedirectRow(sourcePath: string): Promise<RedirectRow> {
  if (!isCacheableSource(sourcePath)) return queryRedirectRow(sourcePath);
  const cached = lookupCache.get(sourcePath);
  if (cached && cached.expiresAt > Date.now()) {
    lookupCache.delete(sourcePath);
    lookupCache.set(sourcePath, cached);
    return cached.value;
  }
  if (cached) lookupCache.delete(sourcePath);
  const existing = inflight.get(sourcePath);
  if (existing) return existing;
  const generation = lookupGeneration;
  const query = queryRedirectRow(sourcePath)
    .then((value) => {
      if (generation === lookupGeneration) remember(sourcePath, value);
      return value;
    })
    .finally(() => {
      if (inflight.get(sourcePath) === query) inflight.delete(sourcePath);
    });
  inflight.set(sourcePath, query);
  return query;
}

/* ── The resolver the routes call ──────────────────────────────────────── */

/**
 * Look up an ACTIVE redirect for `requestPath` and return a destination that
 * has been proven to be live, or `null`.
 *
 * `null` always means "fall through to the route's own notFound()". An invalid
 * row must never become a redirect to the homepage: that would turn link rot
 * into a soft-404 and tell a crawler the old URL still has content.
 */
export async function resolveRedirect(requestPath: string): Promise<ResolvedRedirect | null> {
  const src = validateRedirectSource(requestPath);
  if (!src.ok || !src.path) return null;

  const row = await readRedirectRow(src.path);
  if (!row) return null;

  if (!isSupportedRedirectStatus(row.statusCode)) return null;

  const dest = validateRedirectDestinationShape(row.targetPath, src.path);
  if (!dest.ok || !dest.path) return null;

  const canonical = await resolveLiveCanonical(dest.path);
  if (!canonical) return null;

  /*
    The resolved canonical can equal the source even when the stored target did
    not — an article moved away and then back, for instance. Redirecting there
    would be an immediate loop, so it is refused and the route renders normally.
  */
  if (samePath(canonical, src.path)) return null;

  return {
    destination: canonical,
    permanent: isPermanentStatus(row.statusCode),
    statusCode: row.statusCode as RedirectStatusCode,
  };
}
