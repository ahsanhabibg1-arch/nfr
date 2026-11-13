import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isIndexableHost } from '@/lib/seo/productionHosts';

/**
 * SEO protection for non-production hostnames (Batch 29, reworked for IDX-02).
 *
 * `X-Robots-Tag: noindex, nofollow` is set on every HTML response that did NOT
 * arrive on an official production hostname. Every major crawler honours the
 * header, and it overrides a page's own `meta robots`.
 *
 * WHY THIS IS NOW PER-REQUEST. `nfrguide.com` and the Render service hostname
 * resolve to the same running service, so a single process serves both the
 * public site and a staging URL. The original form of this file keyed only off
 * `STAGING_NOINDEX`, which cannot express that: on this service, on would
 * de-index the real site and off would let the Render hostname be indexed as a
 * duplicate of it. The hostname the visitor actually used is the only thing that
 * distinguishes the two, so that is what decides.
 *
 * Which header is trusted, why unknown hosts fail closed, and why
 * `X-Forwarded-Host` is deliberately never read, are all documented in
 * `lib/seo/productionHosts.ts`.
 *
 * CACHE SAFETY. The decision reads exactly one request property, `Host`, which
 * is part of the effective request URI and therefore part of every conformant
 * cache's primary key. No secondary key (and so no `Vary`) is needed, and a
 * response produced for one hostname cannot be served for another. Nothing here
 * depends on a header a client could vary freely while keeping the cache key
 * identical — which is precisely what reading `X-Forwarded-Host` would do.
 *
 * Static assets (`_next/*`, `favicon`) and API routes are outside the matcher,
 * so CDN caching of assets is unaffected.
 */

/**
 * Site-wide kill switch, kept for compatibility: when set to exactly `true` it
 * noindexes EVERY hostname, including production.
 *
 * It is no longer the mechanism that protects the Render hostname — the hostname
 * check below does that on its own, with no configuration. Because this service
 * answers on the production domain too, setting this variable on it would
 * de-index nfrguide.com. It is retained only as a deliberate, explicit
 * "noindex everything" control.
 *
 * Read at module scope, so a change takes effect from the next process start
 * (an environment change restarts the service, which is sufficient).
 */
const NOINDEX_ALL_HOSTS = process.env.STAGING_NOINDEX === 'true';

/**
 * Paths that must never be indexed on any hostname, production included.
 *
 * `/admin` is already disallowed in `robots.txt` and carries `noindex` in its
 * own layout metadata; this is the response-header backstop for both, so a
 * sub-route that forgets its metadata still cannot be indexed. Checked as a path
 * segment, not a bare prefix, so a public route such as `/administration/` is
 * not caught by it.
 */
function isAlwaysNoindexPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();

  const noindex =
    NOINDEX_ALL_HOSTS ||
    isAlwaysNoindexPath(request.nextUrl.pathname) ||
    !isIndexableHost(request.headers.get('host'));

  if (noindex) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|api/).*)',
  ],
};
