/**
 * Batch S / S6 — public route index for the SEO audit engine. Pure (no DB, no Next runtime).
 *
 * The audit must report what the site actually does, so this index is built from the
 * authorities, not a parallel content registry:
 *   - S4 sitemap evaluation (evaluateSitemap over loadSitemapCandidates) supplies every
 *     candidate route with its real outcome — indexable, noindex (content / stored robots /
 *     editor), canonical-away (S5 normalizer) or unpublished;
 *   - routes that render publicly but are never sitemap candidates are added from the same
 *     inventory data (draft/hidden articles, thin venues & competitors, every edition's
 *     coverage subpages, non-section categories, static app routes, active redirects).
 * A route can be valid without being indexable or listed; noindex ≠ 404.
 *
 * Link classification is purely syntactic + this index: no network requests are made
 * (external links are never fetched — no SSRF surface).
 */
import { sameSiteHosts, normalizePathname } from './canonical';
import type { SitemapEvaluation } from './sitemapEntries';
import type { SitemapExclusionReason } from './policy';

export type RouteStatus =
  | 'indexable'       // renders, index (may still be absent from the sitemap by type)
  | 'noindex'         // renders, robots noindex (valid destination)
  | 'canonical-away'  // renders, canonical points to another page (valid destination)
  | 'redirect'        // permanent redirect to `redirectTo`
  | 'unpublished'     // record exists but is not public (draft / hidden fixture) → 404
  | 'protected'       // requires sign-in (reader account pages)
  | 'not-public'      // admin / API — never a public destination
  | 'not-found'       // no such public route
  | 'invalid';        // malformed path (bad percent-encoding)

export interface RouteInfo {
  status: RouteStatus;
  family: string;
  detail?: string;
  redirectTo?: string;
}
export type RouteIndex = Map<string, RouteInfo>;

/** Statuses whose path renders a public page (a valid link / redirect target). */
export const RENDERS_PUBLICLY: ReadonlySet<RouteStatus> = new Set(['indexable', 'noindex', 'canonical-away']);

/**
 * Static public app routes that are not sitemap candidates (app/(public)/<folder>/page.tsx).
 * Content routes (sections, articles, rodeo, directories, legal pages, ...) come from S4.
 * A test asserts every app/(public) static folder is covered by S4 or this list.
 */
export const STATIC_PUBLIC_ROUTES: ReadonlyArray<{ path: string; status: RouteStatus; family: string; detail: string }> = [
  { path: '/search/', status: 'noindex', family: 'search', detail: 'search results (noindex, follow)' },
  { path: '/login/', status: 'noindex', family: 'auth', detail: 'reader sign-in (noindex)' },
  { path: '/register/', status: 'noindex', family: 'auth', detail: 'reader registration (noindex)' },
  { path: '/forgot-password/', status: 'noindex', family: 'auth', detail: 'password reset request (noindex)' },
  { path: '/reset-password/', status: 'noindex', family: 'auth', detail: 'password reset (noindex)' },
  { path: '/account/', status: 'protected', family: 'account', detail: 'reader account (sign-in required)' },
  { path: '/account/comments/', status: 'protected', family: 'account', detail: 'reader comments (sign-in required)' },
];

/** Path prefixes that are never public destinations. */
export const NON_PUBLIC_PREFIXES: ReadonlyArray<string> = ['/admin/', '/api/'];

const RANK: Record<RouteStatus, number> = {
  indexable: 9, 'canonical-away': 8, noindex: 7, redirect: 6, protected: 5, unpublished: 4, 'not-public': 3, invalid: 2, 'not-found': 1,
};

/** S4 outcomes: when two candidates share a URL, the one that renders "best" wins. */
function put(index: RouteIndex, path: string, info: RouteInfo): void {
  const existing = index.get(path);
  if (!existing || RANK[info.status] > RANK[existing.status]) index.set(path, info);
}

/** Supplementary routes only fill gaps — they never override an S4 (authoritative) outcome. */
function fill(index: RouteIndex, path: string, info: RouteInfo): void {
  if (!index.has(path)) index.set(path, info);
}

const S4_STATUS: Record<SitemapExclusionReason, RouteStatus> = {
  unpublished: 'unpublished',
  'content-noindex': 'noindex',
  'stored-robots-noindex': 'noindex',
  'editor-noindex': 'noindex',
  'canonical-away': 'canonical-away',
  'type-not-in-sitemap': 'indexable',
};

export interface RouteIndexInput {
  sitemap: Pick<SitemapEvaluation, 'included' | 'excluded'>;
  articles: ReadonlyArray<{ slug: string; status: string; hiddenFixture?: boolean }>;
  venueSlugs: ReadonlyArray<string>;
  competitorSlugs: ReadonlyArray<string>;
  categorySlugs: ReadonlyArray<string>;
  editions: ReadonlyArray<{ eventSlug: string; editionSlug: string }>;
  redirects: ReadonlyMap<string, string>;
}

export function buildRouteIndex(input: RouteIndexInput): RouteIndex {
  const index: RouteIndex = new Map();
  // 1. S4 — authoritative outcome for every sitemap candidate.
  for (const c of input.sitemap.included) put(index, c.subject.path, { status: 'indexable', family: c.family, detail: 'in sitemap' });
  for (const x of input.sitemap.excluded) {
    if (x.reason === 'duplicate-url') continue; // the first candidate for that URL already decided it
    put(index, x.candidate.subject.path, { status: S4_STATUS[x.reason], family: x.candidate.family, detail: `excluded from sitemap: ${x.reason}` });
  }
  // 2. Valid public routes that are not sitemap candidates (fill gaps only).
  for (const a of input.articles) {
    const live = a.status === 'PUBLISHED' && !a.hiddenFixture;
    fill(index, `/articles/${a.slug}/`, live
      ? { status: 'indexable', family: 'article' }
      : { status: 'unpublished', family: 'article', detail: a.hiddenFixture ? 'hidden fixture (404 in production)' : `article is ${a.status.toLowerCase()} (404)` });
  }
  for (const s of input.venueSlugs) fill(index, `/venues/${s}/`, { status: 'noindex', family: 'venue', detail: 'thin venue page (renders noindex)' });
  for (const s of input.competitorSlugs) fill(index, `/competitors/${s}/`, { status: 'noindex', family: 'competitor', detail: 'thin competitor page (renders noindex)' });
  for (const s of input.categorySlugs) fill(index, `/categories/${s}/`, { status: 'indexable', family: 'category', detail: 'category archive (not a sitemap type)' });
  for (const e of input.editions) {
    for (const sub of ['schedule', 'results', 'standings']) {
      fill(index, `/rodeo-events/${e.eventSlug}/${e.editionSlug}/${sub}/`, { status: 'noindex', family: 'coverage', detail: 'no published coverage rows (renders noindex)' });
    }
  }
  for (const r of STATIC_PUBLIC_ROUTES) fill(index, r.path, { status: r.status, family: r.family, detail: r.detail });
  for (const [source, target] of input.redirects) {
    const from = safeNormalizePath(source);
    // A live page owns its path (articleService.claimArticlePath), so a redirect only fills gaps.
    if (from) fill(index, from, { status: 'redirect', family: 'redirect', redirectTo: safeNormalizePath(target) ?? target });
  }
  return index;
}

/** Normalised, percent-decoded pathname, or null when the encoding is malformed. */
export function safeNormalizePath(pathname: string): string | null {
  let decoded: string;
  try { decoded = decodeURI(pathname.split('#')[0].split('?')[0]); } catch { return null; }
  // Files (e.g. /sitemap.xml, /robots.txt) keep no trailing slash.
  const last = decoded.split('/').filter(Boolean).pop() ?? '';
  return /\.[a-z0-9]{1,5}$/i.test(last) ? decoded.replace(/\/{2,}/g, '/') : normalizePathname(decoded);
}

export function resolveRoute(index: RouteIndex, path: string): RouteInfo {
  const p = safeNormalizePath(path);
  if (!p) return { status: 'invalid', family: 'unknown', detail: 'malformed percent-encoding' };
  if (NON_PUBLIC_PREFIXES.some((pre) => p === pre || p.startsWith(pre))) return { status: 'not-public', family: 'non-public', detail: 'admin/API path' };
  return index.get(p) ?? { status: 'not-found', family: 'unknown', detail: 'no public route matches' };
}

export type LinkClass =
  | { kind: 'internal'; path: string; normalized: boolean }
  | { kind: 'external'; host: string }
  | { kind: 'non-web'; scheme: string }          // mailto:, tel: — not checked
  | { kind: 'unsafe'; scheme: string }           // javascript:, data:, ... (rendered as '#')
  | { kind: 'invalid'; reason: string };

const UNSAFE_SCHEMES = new Set(['javascript', 'data', 'vbscript', 'file']);
const NON_WEB_SCHEMES = new Set(['mailto', 'tel']);

/**
 * Classify a link target. Internal = site-relative, or absolute http(s) on this site
 * (SITE_URL host or the production origin — S5 sameSiteHosts). Never fetches anything.
 */
export function classifyLink(raw: string, siteUrl: string): LinkClass {
  const v = raw.trim();
  if (!v) return { kind: 'invalid', reason: 'empty link' };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v)?.[1]?.toLowerCase();
  if (scheme && UNSAFE_SCHEMES.has(scheme)) return { kind: 'unsafe', scheme };
  if (scheme && NON_WEB_SCHEMES.has(scheme)) return { kind: 'non-web', scheme };
  if (scheme && scheme !== 'http' && scheme !== 'https') return { kind: 'external', host: scheme };
  let url: URL;
  const base = `${siteUrl.replace(/\/+$/, '')}/`;
  try { url = new URL(v, base); } catch { return { kind: 'invalid', reason: 'unparseable URL' }; }
  const hostKey = url.host.toLowerCase().replace(/^www\./, '');
  if (!sameSiteHosts(siteUrl).has(hostKey)) return { kind: 'external', host: url.host };
  const path = safeNormalizePath(url.pathname);
  if (!path) return { kind: 'invalid', reason: 'malformed percent-encoding' };
  const normalized = /^[a-z]+:/i.test(v) || v.startsWith('//') || !!url.search || !!url.hash || path !== url.pathname;
  return { kind: 'internal', path, normalized };
}

/**
 * Extract link candidates from a text value: absolute http(s) URLs, plus site-relative
 * paths that start at a word boundary (never a substring of another URL) and whose first
 * segment is a known public/non-public route family (`firstSegments`).
 */
export function extractLinkCandidates(text: string, firstSegments: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const trimPunct = (s: string) => s.replace(/[.,;:!?]+$/, '');
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s"'<>()[\]]+/gi)) out.push(trimPunct(m[0]));
  const withoutAbs = text.replace(/\bhttps?:\/\/[^\s"'<>()[\]]+/gi, ' ');
  for (const m of withoutAbs.matchAll(/(?:^|[\s("'[])(\/[^\s"'<>()[\]]+)/g)) {
    const p = trimPunct(m[1]);
    const seg = p.split(/[/?#]/)[1]?.toLowerCase();
    if (seg && firstSegments.has(seg)) out.push(p);
  }
  return out;
}

/** First path segments of every indexed route + non-public prefixes (link extraction scope). */
export function routeFirstSegments(index: RouteIndex): Set<string> {
  const segs = new Set<string>(NON_PUBLIC_PREFIXES.map((p) => p.split('/')[1]));
  for (const path of index.keys()) { const s = path.split('/')[1]; if (s) segs.add(s.toLowerCase()); }
  return segs;
}
