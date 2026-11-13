import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * BLD-01 — the Builder preview must redirect to a same-origin RELATIVE Location.
 *
 * THE DEFECT. Both redirects in `app/admin/(dashboard)/website/preview/route.ts`
 * were built with `NextResponse.redirect(new URL(path, req.url))`. Resolving
 * against `req.url` takes the origin as the SERVER sees it, and behind the
 * deployment platform's proxy the app is bound to the container's internal
 * address. The browser was handed `Location: http://localhost:10000/...`, tried
 * its own localhost and showed "localhost refused to connect". The Builder
 * canvas uses the `embed=1` branch, so the canvas was the visible symptom.
 *
 * These tests drive the REAL route handler and assert on the REAL `Response`
 * it returns — status, `Location`, and the cache/robots headers — rather than
 * checking how a URL was assembled. Only the three things a route handler
 * cannot reach in a unit test are replaced: the session, the draft-mode cookie
 * store and the database.
 *
 * The decisive case is `internal localhost request origin`: it replays exactly
 * the production condition (a request whose own URL is `http://localhost:10000`)
 * and requires that no absolute URL — and no localhost — reaches the browser.
 */

const { requireUser, roleHasPermission, draftEnable, draftDisable, findUnique, findFirst } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  roleHasPermission: vi.fn(),
  draftEnable: vi.fn(),
  draftDisable: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock('@/lib/auth/currentUser', () => ({ requireUser }));
vi.mock('@/lib/auth/rbac', () => ({ roleHasPermission }));
vi.mock('next/headers', () => ({
  draftMode: async () => ({ enable: draftEnable, disable: draftDisable, isEnabled: false }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    pageLayout: { findUnique },
    article: { findFirst },
    rodeoHub: { findFirst },
    rodeoEvent: { findFirst },
    rodeoEventEdition: { findFirst },
    discipline: { findFirst },
    category: { findFirst },
    competitor: { findFirst },
    venue: { findFirst },
  },
}));

const { GET } = await import('../app/admin/(dashboard)/website/preview/route');

/** Build a request whose own origin is `origin` — the production variable. */
const req = (origin: string, qs: string) => new NextRequest(new URL(`${origin}/admin/website/preview${qs}`));

/** A page key that always resolves without touching a lookup. */
const HOMEPAGE = '?pageKey=homepage';

/** The internal address the platform binds to, from the deploy log. */
const INTERNAL = 'http://localhost:10000';
const PUBLIC_HTTPS = 'https://nfr-qadd.onrender.com';
const LOCAL_DEV = 'http://localhost:3000';

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: 'u1', roles: ['super_admin'] });
  roleHasPermission.mockReturnValue(true);
  // A stored draft, so the standalone path does not 404.
  findUnique.mockResolvedValue({ pageKey: 'homepage', draftSections: [{ id: 's1' }] });
});

/* ── 1. The production failure, replayed ──────────────────────────── */

describe('BLD-01 — no internal origin ever reaches the browser', () => {
  it('REGRESSION: an embed request arriving on localhost:10000 redirects relatively', async () => {
    const res = await GET(req(INTERNAL, `${HOMEPAGE}&embed=1`));
    const location = res.headers.get('location')!;

    expect(res.status).toBe(307);
    expect(location, 'the old code emitted http://localhost:10000/…').not.toContain('localhost');
    expect(location, 'a relative Location resolves against the public URL the visitor used').toMatch(/^\//);
    expect(location).not.toMatch(/^https?:\/\//);
  });

  it('the same request on the public https origin behaves identically', async () => {
    const res = await GET(req(PUBLIC_HTTPS, `${HOMEPAGE}&embed=1`));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('/?_preview=draft&_pk=homepage&_canvas=1');
  });

  it('local development is unaffected', async () => {
    const res = await GET(req(LOCAL_DEV, `${HOMEPAGE}&embed=1`));
    expect(res.headers.get('location')).toBe('/?_preview=draft&_pk=homepage&_canvas=1');
  });

  it('the Location is byte-identical across all three origins', async () => {
    const locations = await Promise.all(
      [INTERNAL, PUBLIC_HTTPS, LOCAL_DEV].map(async (o) => (await GET(req(o, `${HOMEPAGE}&embed=1`))).headers.get('location')),
    );
    expect(new Set(locations).size, 'the response must not depend on the request origin').toBe(1);
  });
});

/* ── 2. Embed behaviour is preserved ──────────────────────────────── */

describe('BLD-01 — embed=1 behaviour is unchanged', () => {
  it('enables draft mode and carries the preview query', async () => {
    const res = await GET(req(PUBLIC_HTTPS, `${HOMEPAGE}&embed=1`));
    expect(draftEnable, 'the draft cookie must still be set').toHaveBeenCalledTimes(1);
    const q = new URLSearchParams(res.headers.get('location')!.split('?')[1]);
    expect(q.get('_preview')).toBe('draft');
    expect(q.get('_pk')).toBe('homepage');
    expect(q.get('_canvas'), 'the click-to-select bridge flag').toBe('1');
  });

  it('keeps the no-store and noindex headers', async () => {
    const res = await GET(req(PUBLIC_HTTPS, `${HOMEPAGE}&embed=1`));
    expect(res.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
  });

  it('still renders the canvas when no draft layout is stored', async () => {
    findUnique.mockResolvedValue(null);
    const res = await GET(req(PUBLIC_HTTPS, `${HOMEPAGE}&embed=1`));
    expect(res.status, 'registry defaults are what the public site shows too').toBe(307);
  });

  it('resolves a section page key to its own path', async () => {
    const res = await GET(req(INTERNAL, '?pageKey=section:competition&embed=1'));
    expect(res.headers.get('location')).toBe('/competition/?_preview=draft&_pk=section%3Acompetition&_canvas=1');
  });
});

/* ── 3. Standalone preview and exit ───────────────────────────────── */

describe('BLD-01 — standalone preview and exit', () => {
  it('the standalone preview still returns its HTML wrapper, not a redirect', async () => {
    const res = await GET(req(PUBLIC_HTTPS, HOMEPAGE));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html, 'its inner iframe is relative and always was').toContain('<iframe src="/?_preview=draft');
    expect(html).not.toContain('localhost');
  });

  it('the standalone preview still 404s when there is no stored draft', async () => {
    findUnique.mockResolvedValue(null);
    expect((await GET(req(PUBLIC_HTTPS, HOMEPAGE))).status).toBe(404);
  });

  it('REGRESSION: exit disables draft mode and redirects relatively', async () => {
    const res = await GET(req(INTERNAL, '?exit=1'));
    expect(res.status).toBe(307);
    expect(draftDisable).toHaveBeenCalledTimes(1);
    expect(res.headers.get('location'), 'this path had the same localhost defect').toBe('/admin/website/');
  });
});

/* ── 4. Authorization and validation are untouched ────────────────── */

describe('BLD-01 — access control is unchanged', () => {
  it('an unauthenticated request never reaches the redirect', async () => {
    requireUser.mockRejectedValue(new Error('unauthenticated'));
    await expect(GET(req(PUBLIC_HTTPS, `${HOMEPAGE}&embed=1`))).rejects.toThrow();
    expect(draftEnable, 'no draft cookie for an anonymous caller').not.toHaveBeenCalled();
  });

  it('a signed-in user without system.config gets 403 and no draft cookie', async () => {
    roleHasPermission.mockReturnValue(false);
    const res = await GET(req(PUBLIC_HTTPS, `${HOMEPAGE}&embed=1`));
    expect(res.status).toBe(403);
    expect(draftEnable).not.toHaveBeenCalled();
  });

  it('an unknown page key is rejected before any redirect', async () => {
    const res = await GET(req(PUBLIC_HTTPS, '?pageKey=not-a-real-key&embed=1'));
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
    expect(draftEnable).not.toHaveBeenCalled();
  });

  it('a missing page key is rejected', async () => {
    expect((await GET(req(PUBLIC_HTTPS, '?embed=1'))).status).toBe(400);
  });
});

/* ── 5. Open-redirect resistance ──────────────────────────────────── */

describe('BLD-01 — the redirect cannot leave this origin', () => {
  /**
   * The path is assembled from CMS slugs, and `normalizeSlug()` only arrived
   * with the Rodeo Coverage work, so rows created earlier were never held to
   * it. These drive a hostile slug through the real resolver.
   */
  const hostileSlugs = [
    ['protocol-relative', '/evil.example'],
    ['absolute url', 'https://evil.example'],
    ['backslash host', '\\evil.example'],
    ['quote breakout', 'x" onload="alert(1)'],
    ['crlf header split', 'x%0d%0aSet-Cookie:+a=b'],
  ] as const;

  for (const [label, slug] of hostileSlugs) {
    it(`refuses a ${label} slug rather than redirecting off-site`, async () => {
      findFirst.mockResolvedValue({ slug, event: { slug } });
      await expect(
        GET(req(PUBLIC_HTTPS, '?pageKey=template:article&embed=1')),
        'an unsafe target must throw, not become a Location',
      ).rejects.toThrow(/Unsafe preview redirect target/);
    });
  }

  it('an ordinary slug still resolves normally', async () => {
    findFirst.mockResolvedValue({ slug: 'nfr-round-one-recap' });
    const res = await GET(req(PUBLIC_HTTPS, '?pageKey=template:article&embed=1'));
    expect(res.headers.get('location')).toBe('/articles/nfr-round-one-recap/?_preview=draft&_pk=template%3Aarticle&_canvas=1');
  });

  it('a page key with no previewable target 404s', async () => {
    findFirst.mockResolvedValue(null);
    expect((await GET(req(PUBLIC_HTTPS, '?pageKey=template:article&embed=1'))).status).toBe(404);
  });
});
