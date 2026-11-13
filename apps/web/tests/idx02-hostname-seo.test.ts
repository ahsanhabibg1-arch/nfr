import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { parseHostHeader, isIndexableHost, PRODUCTION_HOSTNAMES } from '../lib/seo/productionHosts';
import { PRODUCTION_SITE_URL } from '../lib/seo/canonical';

/**
 * IDX-02 — hostname-aware SEO protection.
 *
 * `nfrguide.com` and the Render service hostname resolve to the same service, so
 * the noindex decision is made per request from the `Host` header. These tests
 * drive the REAL middleware with a REAL `NextRequest` and assert on the REAL
 * response headers — not on how the decision was computed.
 *
 * The middleware reads `process.env.STAGING_NOINDEX` at module scope, so every
 * case stubs the variable and re-imports the module.
 */

const APEX = 'nfrguide.com';
const WWW = 'www.nfrguide.com';
const STAGING = 'nfr-qadd.onrender.com';
const NOINDEX = 'noindex, nofollow';

async function loadMiddleware(stagingNoindex = ''): Promise<(r: NextRequest) => NextResponseLike> {
  vi.stubEnv('STAGING_NOINDEX', stagingNoindex);
  vi.resetModules();
  const mod = await import('../middleware');
  return mod.middleware as unknown as (r: NextRequest) => NextResponseLike;
}

type NextResponseLike = { headers: Headers };

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new Request(url, { headers }));
}

/** The header the middleware produced, or null when it set none. */
async function robotsHeader(
  url: string,
  headers: Record<string, string> = {},
  stagingNoindex = '',
): Promise<string | null> {
  const middleware = await loadMiddleware(stagingNoindex);
  return middleware(request(url, headers)).headers.get('X-Robots-Tag');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// 1 + 2. The official production hostname stays indexable.
// ---------------------------------------------------------------------------

describe('IDX-02 (1) official production hostname — indexable', () => {
  it.each([
    `https://${APEX}/`,
    `https://${APEX}/about/`,
    `https://${APEX}/articles/some-dispatch/`,
    `https://${APEX}/competition/`,
  ])('no X-Robots-Tag is added on the apex: %s', async (url) => {
    expect(await robotsHeader(url, { host: APEX })).toBeNull();
  });

  it('the allow-list is derived from PRODUCTION_SITE_URL, not retyped', () => {
    expect(PRODUCTION_HOSTNAMES).toEqual([APEX, WWW]);
    expect(new URL(PRODUCTION_SITE_URL).hostname).toBe(APEX);
  });
});

describe('IDX-02 (2) www variant of the official hostname — indexable', () => {
  it('www.nfrguide.com is treated as production', async () => {
    expect(await robotsHeader(`https://${WWW}/about/`, { host: WWW })).toBeNull();
  });

  it('host matching is case-insensitive (crawlers and proxies may upper-case it)', async () => {
    expect(await robotsHeader(`https://${APEX}/`, { host: 'NFRGuide.COM' })).toBeNull();
    expect(await robotsHeader(`https://${APEX}/`, { host: 'WWW.NFRGUIDE.COM' })).toBeNull();
  });

  it('the fully-qualified form with a trailing dot is the same host', async () => {
    expect(await robotsHeader(`https://${APEX}/`, { host: 'nfrguide.com.' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3 + 4. Staging and unknown hostnames are protected.
// ---------------------------------------------------------------------------

describe('IDX-02 (3) Render staging hostname — protected', () => {
  it.each([
    `https://${STAGING}/`,
    `https://${STAGING}/about/`,
    `https://${STAGING}/articles/some-dispatch/`,
  ])('REGRESSION: the staging host is noindexed: %s', async (url) => {
    expect(await robotsHeader(url, { host: STAGING })).toBe(NOINDEX);
  });

  it('protection needs no environment variable — STAGING_NOINDEX is unset here', async () => {
    expect(await robotsHeader(`https://${STAGING}/`, { host: STAGING }, '')).toBe(NOINDEX);
  });

  it('a lookalike of the official host is not the official host', async () => {
    for (const host of ['nfrguide.com.evil.example', 'notnfrguide.com', 'nfrguide.co', 'wwwnfrguide.com']) {
      expect(await robotsHeader(`https://${host}/`, { host })).toBe(NOINDEX);
    }
  });
});

describe('IDX-02 (4) unknown or missing hostname — fails closed', () => {
  it('an unrecognised domain pointed at the service is noindexed', async () => {
    expect(await robotsHeader('https://preview.example.com/', { host: 'preview.example.com' })).toBe(NOINDEX);
  });

  it('no Host header at all is noindexed, not indexed by default', async () => {
    const middleware = await loadMiddleware('');
    // Build the request without a host header, then prove it really is absent.
    const req = request(`https://${APEX}/`);
    req.headers.delete('host');
    expect(req.headers.get('host')).toBeNull();
    expect(middleware(req).headers.get('X-Robots-Tag')).toBe(NOINDEX);
  });

  it('a malformed or header-injecting Host value is noindexed', async () => {
    for (const host of [`${APEX}, evil.example`, `${APEX} evil.example`, `https://${APEX}`, `${APEX}/path`, '   ']) {
      expect(await robotsHeader(`https://${APEX}/`, { host })).toBe(NOINDEX);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Ports.
// ---------------------------------------------------------------------------

describe('IDX-02 (5) port handling', () => {
  it('an explicitly written default port is still the public origin', async () => {
    expect(await robotsHeader(`https://${APEX}/`, { host: `${APEX}:443` })).toBeNull();
    expect(await robotsHeader(`https://${APEX}/`, { host: `${APEX}:80` })).toBeNull();
  });

  it('an unexpected port is not the public origin and is noindexed', async () => {
    for (const host of [`${APEX}:8443`, `${APEX}:3000`, `${APEX}:10000`]) {
      expect(await robotsHeader(`https://${APEX}/`, { host })).toBe(NOINDEX);
    }
  });

  it('a non-numeric port is rejected rather than ignored', async () => {
    expect(await robotsHeader(`https://${APEX}/`, { host: `${APEX}:abc` })).toBe(NOINDEX);
  });
});

// ---------------------------------------------------------------------------
// 6. Forwarded headers are never trusted.
// ---------------------------------------------------------------------------

describe('IDX-02 (6) forged forwarded headers cannot change the decision', () => {
  it('X-Forwarded-Host cannot make the staging host look like production', async () => {
    expect(
      await robotsHeader(`https://${STAGING}/`, { host: STAGING, 'x-forwarded-host': APEX }),
    ).toBe(NOINDEX);
  });

  it('X-Forwarded-Host cannot de-index the production host (cache-poisoning vector)', async () => {
    expect(
      await robotsHeader(`https://${APEX}/`, { host: APEX, 'x-forwarded-host': 'evil.example' }),
    ).toBeNull();
  });

  it('Forwarded and X-Forwarded-Server are equally ignored', async () => {
    expect(
      await robotsHeader(`https://${APEX}/`, {
        host: APEX,
        forwarded: `host=${STAGING}`,
        'x-forwarded-server': STAGING,
        'x-original-host': STAGING,
      }),
    ).toBeNull();
  });

  it('a spoofed Host is the only thing that matters — and it fails closed', async () => {
    // A request reaching the service's URL while claiming another hostname.
    expect(await robotsHeader(`https://${STAGING}/`, { host: 'evil.example' })).toBe(NOINDEX);
  });
});

// ---------------------------------------------------------------------------
// 7 + 8. Realistic production request shape, across HTML routes.
// ---------------------------------------------------------------------------

describe('IDX-02 (7) production-style HTTPS reverse-proxy request', () => {
  it('the full header set a platform proxy sends does not change the outcome', async () => {
    expect(
      await robotsHeader(`https://${APEX}/about/`, {
        host: APEX,
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '203.0.113.9',
        'x-request-start': '1763000000',
        'accept-encoding': 'gzip, br',
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      }),
    ).toBeNull();
  });

  it('the same proxy shape on the staging host is still protected', async () => {
    expect(
      await robotsHeader(`https://${STAGING}/about/`, {
        host: STAGING,
        'x-forwarded-proto': 'https',
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      }),
    ).toBe(NOINDEX);
  });
});

describe('IDX-02 (8) HTML page responses', () => {
  const paths = ['/', '/about/', '/competition/', '/disciplines/bull-riding/', '/competitors/', '/venues/'];

  it('every public HTML route is indexable on production and protected on staging', async () => {
    for (const path of paths) {
      expect(await robotsHeader(`https://${APEX}${path}`, { host: APEX })).toBeNull();
      expect(await robotsHeader(`https://${STAGING}${path}`, { host: STAGING })).toBe(NOINDEX);
    }
  });
});

// ---------------------------------------------------------------------------
// 9 + 10. robots.txt and sitemap.xml get the same treatment.
// ---------------------------------------------------------------------------

describe('IDX-02 (9) robots.txt', () => {
  it('is noindexed on the staging host and untouched on production', async () => {
    expect(await robotsHeader(`https://${STAGING}/robots.txt`, { host: STAGING })).toBe(NOINDEX);
    expect(await robotsHeader(`https://${APEX}/robots.txt`, { host: APEX })).toBeNull();
  });

  it('the matcher still covers it (it is not an excluded asset path)', () => {
    const matcher = /^\/((?!_next\/static|_next\/image|favicon\.ico|api\/).*)$/;
    expect(matcher.test('/robots.txt')).toBe(true);
    expect(matcher.test('/sitemap.xml')).toBe(true);
    expect(matcher.test('/_next/static/chunk.js')).toBe(false);
    expect(matcher.test('/api/health/')).toBe(false);
  });
});

describe('IDX-02 (10) sitemap.xml', () => {
  it('is noindexed on the staging host and untouched on production', async () => {
    expect(await robotsHeader(`https://${STAGING}/sitemap.xml`, { host: STAGING })).toBe(NOINDEX);
    expect(await robotsHeader(`https://${APEX}/sitemap.xml`, { host: APEX })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 11. Page-level noindex is untouched.
// ---------------------------------------------------------------------------

describe('IDX-02 (11) page-level noindex remains the control on production', () => {
  it('no header is added on production, so a page\'s own meta robots decides', async () => {
    for (const path of ['/register/', '/login/', '/privacy/', '/terms/']) {
      expect(await robotsHeader(`https://${APEX}${path}`, { host: APEX })).toBeNull();
    }
  });

  it('page-level policies are unchanged by this step', async () => {
    const { buildMetadata } = await import('../lib/seo');
    const base = { title: 'T', description: 'D.', path: '/p/' };
    expect(buildMetadata({ ...base, noindex: true }).robots).toEqual({ index: false, follow: false });
    expect(buildMetadata(base).robots).toEqual({ index: true, follow: true });
  });
});

// ---------------------------------------------------------------------------
// 12. Admin and preview routes.
// ---------------------------------------------------------------------------

describe('IDX-02 (12) admin and preview routes are never indexable', () => {
  it.each(['/admin', '/admin/', '/admin/website/', '/admin/website/preview', '/admin/media/'])(
    'admin path %s is noindexed even on the production hostname',
    async (path) => {
      expect(await robotsHeader(`https://${APEX}${path}`, { host: APEX })).toBe(NOINDEX);
    },
  );

  it('a public route that merely starts with the same letters is NOT caught', async () => {
    for (const path of ['/administration/', '/admins-choice/']) {
      expect(await robotsHeader(`https://${APEX}${path}`, { host: APEX })).toBeNull();
    }
  });

  it('admin paths stay noindexed on the staging host too', async () => {
    expect(await robotsHeader(`https://${STAGING}/admin/website/`, { host: STAGING })).toBe(NOINDEX);
  });

  it('the admin layout keeps its own noindex metadata (unchanged by this step)', async () => {
    const layout = await import('../app/admin/layout');
    expect(layout.metadata.robots).toEqual({ index: false, follow: false });
  });
});

// ---------------------------------------------------------------------------
// 13. Local development.
// ---------------------------------------------------------------------------

describe('IDX-02 (13) local development', () => {
  it('localhost is not a production hostname, so it is noindexed', async () => {
    expect(await robotsHeader('http://localhost:3000/', { host: 'localhost:3000' })).toBe(NOINDEX);
    expect(await robotsHeader('http://localhost/', { host: 'localhost' })).toBe(NOINDEX);
  });

  it('a loopback IP and an internal container address are also noindexed', async () => {
    expect(await robotsHeader('http://127.0.0.1:3000/', { host: '127.0.0.1:3000' })).toBe(NOINDEX);
    expect(await robotsHeader('http://localhost:10000/', { host: 'localhost:10000' })).toBe(NOINDEX);
  });

  it('development is otherwise unaffected — the response is still NextResponse.next()', async () => {
    const middleware = await loadMiddleware('');
    const res = middleware(request('http://localhost:3000/about/', { host: 'localhost:3000' }));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// 14. STAGING_NOINDEX compatibility.
// ---------------------------------------------------------------------------

describe('IDX-02 (14) STAGING_NOINDEX compatibility', () => {
  it('=true still noindexes every hostname, production included (kill switch)', async () => {
    expect(await robotsHeader(`https://${APEX}/`, { host: APEX }, 'true')).toBe(NOINDEX);
    expect(await robotsHeader(`https://${WWW}/`, { host: WWW }, 'true')).toBe(NOINDEX);
    expect(await robotsHeader(`https://${STAGING}/`, { host: STAGING }, 'true')).toBe(NOINDEX);
  });

  it('unset leaves production indexable and still protects staging', async () => {
    expect(await robotsHeader(`https://${APEX}/`, { host: APEX }, '')).toBeNull();
    expect(await robotsHeader(`https://${STAGING}/`, { host: STAGING }, '')).toBe(NOINDEX);
  });

  it('the comparison stays strict — only the exact string true is the kill switch', async () => {
    for (const value of ['True', 'TRUE', '1', 'yes', 'true ', 'false']) {
      expect(await robotsHeader(`https://${APEX}/`, { host: APEX }, value)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 15. Cache / CDN behaviour.
// ---------------------------------------------------------------------------

describe('IDX-02 (15) cache and CDN variation cannot leak the wrong header', () => {
  it('the decision depends on Host alone, which is part of the primary cache key', async () => {
    const vary: Record<string, string>[] = [
      { 'x-forwarded-host': STAGING },
      { 'x-forwarded-proto': 'http' },
      { cookie: 'session=abc' },
      { 'accept-language': 'fr-FR' },
      { 'user-agent': 'curl/8.4.0' },
      { 'cache-control': 'no-cache' },
      {},
    ];
    const results = await Promise.all(
      vary.map((extra) => robotsHeader(`https://${APEX}/about/`, { host: APEX, ...extra })),
    );
    // Same URL, same Host, seven different secondary-key candidates: one answer.
    expect(new Set(results)).toEqual(new Set([null]));
  });

  it('two hostnames on the same URL path give different, stable answers', async () => {
    expect(await robotsHeader(`https://${APEX}/about/`, { host: APEX })).toBeNull();
    expect(await robotsHeader(`https://${STAGING}/about/`, { host: STAGING })).toBe(NOINDEX);
  });

  it('no Vary header is introduced (the primary key already separates the hosts)', async () => {
    const middleware = await loadMiddleware('');
    expect(middleware(request(`https://${APEX}/`, { host: APEX })).headers.get('Vary')).toBeNull();
    expect(middleware(request(`https://${STAGING}/`, { host: STAGING })).headers.get('Vary')).toBeNull();
  });

  it('the asset and API exclusions are unchanged, so asset caching is unaffected', async () => {
    const { config } = await import('../middleware');
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon\\.ico|api/).*)']);
  });
});

// ---------------------------------------------------------------------------
// Host parsing — the unit-level cases behind the above.
// ---------------------------------------------------------------------------

describe('IDX-02 — parseHostHeader', () => {
  it.each([
    ['nfrguide.com', { hostname: 'nfrguide.com', port: '' }],
    ['NFRGuide.com', { hostname: 'nfrguide.com', port: '' }],
    ['  nfrguide.com  ', { hostname: 'nfrguide.com', port: '' }],
    ['nfrguide.com.', { hostname: 'nfrguide.com', port: '' }],
    ['nfrguide.com:443', { hostname: 'nfrguide.com', port: '443' }],
    ['localhost:3000', { hostname: 'localhost', port: '3000' }],
    ['127.0.0.1', { hostname: '127.0.0.1', port: '' }],
  ])('parses %j', (raw, expected) => expect(parseHostHeader(raw)).toEqual(expected));

  it.each([
    [null], [undefined], [''], ['   '], ['nfrguide.com, evil.example'], ['nfrguide.com evil.example'],
    ['https://nfrguide.com'], ['nfrguide.com/path'], ['nfrguide.com:abc'], ['nfrguide.com:'],
    ['nfrguide..com'], ['.nfrguide.com'], ['-nfrguide.com'], ['[::1]:3000'], ['nfr guide.com'],
    ['nfrguide.com\tevil'], ['a'.repeat(300) + '.com'],
  ])('rejects %j', (raw) => expect(parseHostHeader(raw as string | null | undefined)).toBeNull());

  it('a rejected value is never indexable', () => {
    for (const raw of [null, '', 'nfrguide.com, evil.example', '[::1]']) {
      expect(isIndexableHost(raw as string | null)).toBe(false);
    }
  });
});

describe('IDX-02 — isIndexableHost', () => {
  it('accepts exactly the official hostnames', () => {
    expect(isIndexableHost(APEX)).toBe(true);
    expect(isIndexableHost(WWW)).toBe(true);
  });

  it('rejects everything else', () => {
    for (const host of [STAGING, 'localhost', 'localhost:3000', 'evil.example', `${APEX}:8443`, 'nfrguide.com.evil.example']) {
      expect(isIndexableHost(host)).toBe(false);
    }
  });
});
