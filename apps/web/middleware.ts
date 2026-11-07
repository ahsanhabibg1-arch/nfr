import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Staging SEO protection (Batch 29). When STAGING_NOINDEX=true, every HTML
 * response gets X-Robots-Tag: noindex, nofollow — preventing search engines
 * from indexing non-production deployments. This header is respected by all
 * major crawlers and overrides in-page meta robots directives.
 *
 * Static assets (_next/*, favicon, media) are excluded so CDN caching is unaffected.
 */
const STAGING_NOINDEX = process.env.STAGING_NOINDEX === 'true';

export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();

  if (STAGING_NOINDEX) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|api/).*)',
  ],
};
