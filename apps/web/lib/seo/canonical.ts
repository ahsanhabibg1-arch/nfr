/**
 * Batch S / S5 — the single canonical-URL normalizer.
 *
 * Every canonical decision goes through here: rendered article canonicals (ArticleSeo),
 * EntitySeo overrides (render + save validation), the sitemap policy (lib/seo/policy.ts)
 * and the SEO audit engine. Pure — no DB, no Next runtime.
 *
 * Environment model
 *   SITE_URL              the origin this deployment serves (NEXT_PUBLIC_SITE_URL):
 *                         http://localhost:3000 in dev, the staging host on staging,
 *                         https://nfrguide.com in production.
 *   PRODUCTION_SITE_URL   the public production origin. System-generated canonicals are
 *                         STORED as production URLs (environment-independent data), so a
 *                         stored production-origin URL is "this site" in every environment
 *                         and is re-based onto SITE_URL when rendered. The reverse never
 *                         happens: a stored localhost/staging URL is off-site in production,
 *                         so development hosts cannot leak into production canonicals.
 *
 * Same-site rule (owner decision, Batch S Phase 0 #2): only same-site canonicals are
 * honoured; off-site or malformed values are ignored (the page is self-canonical) and are
 * reported by the SEO audit engine rather than silently dropped.
 *
 * Normalised form: SITE_URL + pathname, repeated slashes collapsed, one trailing slash
 * (the site's trailingSlash policy), query string and fragment removed; scheme (http/https),
 * host case and a leading "www." are ignored when matching origins.
 */

/** Public production origin (also the SITE_URL fallback in lib/seo.tsx). */
export const PRODUCTION_SITE_URL = 'https://nfrguide.com';

const trimBase = (u: string) => u.replace(/\/+$/, '');
const hostKey = (host: string) => host.toLowerCase().replace(/^www\./, '');

/** Collapse repeated slashes, ensure a leading and a single trailing slash (trailingSlash policy). */
export function normalizePathname(pathname: string): string {
  return normalizedPath(pathname);
}

function normalizedPath(pathname: string): string {
  let p = pathname.replace(/\/{2,}/g, '/');
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.endsWith('/')) p = `${p}/`;
  return p;
}

/** Hosts treated as "this site" when SITE_URL is `siteUrl`. */
export function sameSiteHosts(siteUrl: string): Set<string> {
  const hosts = new Set<string>();
  for (const origin of [siteUrl, PRODUCTION_SITE_URL]) {
    try { hosts.add(hostKey(new URL(`${trimBase(origin)}/`).host)); } catch { /* ignore */ }
  }
  return hosts;
}

/**
 * Normalise a stored canonical (site path or absolute URL) to an absolute URL on
 * `siteUrl`, or null when it is off-site, non-http(s) or malformed.
 */
export function normalizeSameSiteCanonical(value: string | null | undefined, siteUrl: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const base = trimBase(siteUrl);
  let url: URL;
  try {
    // Protocol-relative ("//host/x") parses as absolute → host check below.
    url = new URL(raw, `${base}/`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!sameSiteHosts(base).has(hostKey(url.host))) return null;
  return `${base}${normalizedPath(url.pathname)}`;
}

/**
 * Batch 02 Task E — an ARTICLE's effective canonical, with a stale legacy value healed.
 *
 * THE DEFECT THIS FIXES. An article's public path moved when the flat
 * subcategory route shipped: an article with a subcategory now lives at
 * `/<subcategory>/<slug>/`, and `/articles/<slug>/` permanently redirects to it
 * (see `app/(public)/articles/[slug]/page.tsx`). The system-generated
 * `ArticleSeo.canonicalUrl` rows were written BEFORE that move and still say
 * `/articles/<slug>/`. A stored same-site canonical outranks the page's own
 * path, so every such article:
 *
 *   - rendered `<link rel="canonical">` pointing at a URL that 308s away, and
 *   - was dropped from the sitemap as `canonical-away`, because
 *     `lib/seo/policy.ts` lists a page only when it is SELF-canonical.
 *
 * Measured before this fix: 7 of 7 published articles, and 0 articles in a
 * 35-URL sitemap.
 *
 * WHY HEAL IT HERE RATHER THAN IN THE DATA. The rows live in the production
 * database, and rewriting published editorial records is both outside this
 * assignment's authority and the wrong shape of fix: the same staleness recurs
 * the moment an editor assigns, changes or clears a subcategory, because that
 * MOVES the article (`config/routes.ts`). Resolving it in the one place every
 * canonical decision already passes through fixes the existing rows and every
 * future move, and it is the layer the renderer and the sitemap share — so what
 * is rendered and what is listed cannot disagree again.
 *
 * WHAT IS DELIBERATELY PRESERVED. A canonical that points at a DIFFERENT page is
 * an editorial decision (duplicate or syndicated content) and is returned
 * untouched. Only one narrow case is treated as stale: the stored value is this
 * article's own LEGACY flat path while its resolved path is elsewhere — a URL
 * the application itself redirects, so it can never be the indexable target.
 *
 * Returning `null` means "self-canonical", which is what both callers already
 * do with an absent stored value.
 */
export function resolveArticleCanonical(
  stored: string | null | undefined,
  selfPath: string,
  slug: string,
  siteUrl: string,
): string | null {
  const normalized = normalizeSameSiteCanonical(stored, siteUrl);
  if (!normalized) return null;

  const base = trimBase(siteUrl);
  const self = `${base}${normalizedPath(selfPath)}`;
  if (normalized === self) return null;

  // The legacy flat path for THIS article: stale by construction, since the app
  // permanently redirects it to `selfPath`.
  const legacy = `${base}${normalizedPath(`/articles/${slug}/`)}`;
  if (normalized === legacy) return null;

  return normalized;
}

/**
 * Comparison key for any URL (same-site or not): scheme://host(lower, no www)/path/ —
 * query and fragment removed. Two URLs with the same key are the same canonical target.
 */
export function canonicalUrlKey(url: string, siteUrl: string): string | null {
  try {
    const u = new URL(url, `${trimBase(siteUrl)}/`);
    return `${u.protocol}//${hostKey(u.host)}${normalizedPath(u.pathname)}`;
  } catch {
    return null;
  }
}

export type StoredCanonicalStatus = 'absent' | 'self' | 'same-site-other' | 'ignored-off-site' | 'ignored-malformed';

/** How a stored canonical will be treated for a page whose own path is `selfPath`. */
export function classifyStoredCanonical(value: string | null | undefined, selfPath: string, siteUrl: string): StoredCanonicalStatus {
  const raw = value?.trim();
  if (!raw) return 'absent';
  const resolved = normalizeSameSiteCanonical(raw, siteUrl);
  if (!resolved) {
    try { new URL(raw, `${trimBase(siteUrl)}/`); } catch { return 'ignored-malformed'; }
    return /^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:/i.test(raw) ? 'ignored-malformed' : 'ignored-off-site';
  }
  return resolved === `${trimBase(siteUrl)}${normalizedPath(selfPath)}` ? 'self' : 'same-site-other';
}

/** Production URL to STORE for a system-generated canonical path (never the dev/staging host). */
export function productionCanonicalUrl(path: string): string {
  return `${PRODUCTION_SITE_URL}${normalizedPath(path)}`;
}
