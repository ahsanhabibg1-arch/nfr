import { describe, it, expect } from 'vitest';
import {
  normalizeRedirectPath,
  isReservedPath,
  isSupportedRedirectStatus,
  isPermanentStatus,
  samePath,
  validateRedirectSource,
  validateRedirectDestinationShape,
} from '../lib/redirects/paths';

/**
 * Stage 03 — the redirect path rules, on their own.
 *
 * These are the pure half of the engine: no database, no Prisma, no fixtures.
 * They exist as a separate file because the rules they encode are security
 * boundaries, and a security boundary that can only be tested through a
 * database fixture is one that gets tested rarely.
 *
 * The hostile inputs below are not hypothetical variations. Each is a shape
 * that has defeated a real redirect validator somewhere: a backslash the
 * browser reads as a slash, a `%2F` the validator reads as one segment and the
 * server as two, a protocol-relative `//host` that looks rooted, a scheme that
 * never touches the network at all.
 */

describe('normalizeRedirectPath — shapes that must be accepted', () => {
  it('normalises a well-formed path and guarantees a trailing slash', () => {
    expect(normalizeRedirectPath('/articles/nfr-2026/')).toBe('/articles/nfr-2026/');
    expect(normalizeRedirectPath('/articles/nfr-2026')).toBe('/articles/nfr-2026/');
  });

  it('collapses duplicate slashes rather than refusing them', () => {
    expect(normalizeRedirectPath('/concerts//nfr-2026/')).toBe('/concerts/nfr-2026/');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeRedirectPath('  /venues/thomas-mack/  ')).toBe('/venues/thomas-mack/');
  });

  it('keeps the root as the root', () => {
    expect(normalizeRedirectPath('/')).toBe('/');
  });
});

describe('normalizeRedirectPath — shapes that must be refused', () => {
  /*
    Each of these returns null rather than a cleaned string. A validator that
    "fixes" a hostile path hands the attacker a second interpretation of it.
  */
  const hostile: [string, string][] = [
    ['absolute http URL', 'https://evil.example/'],
    ['absolute http URL, no TLS', 'http://evil.example/'],
    ['protocol-relative', '//evil.example/'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript scheme', 'vbscript:msgbox(1)'],
    ['mailto scheme', 'mailto:someone@example.com'],
    ['backslash root', '\\evil.example'],
    ['backslash pair', '\\\\evil.example\\share'],
    ['mixed slash bypass', '/\\evil.example/'],
    ['encoded forward slash', '/articles/a%2F..%2Fadmin/'],
    ['encoded backslash', '/articles/a%5Cb/'],
    ['encoded NUL', '/articles/a%00b/'],
    ['encoded CR', '/articles/a%0db/'],
    ['literal NUL', '/articles/a\u0000b/'],
    ['literal newline', '/articles/a\nb/'],
    ['literal tab', '/articles/a\tb/'],
    ['DEL character', '/articles/a\u007Fb/'],
    ['parent traversal', '/articles/../admin/'],
    ['current-dir segment', '/articles/./x/'],
    ['relative path', 'articles/x/'],
    ['carries a query string', '/articles/x/?next=//evil.example'],
    ['carries a fragment', '/articles/x/#frag'],
    ['empty', ''],
    ['whitespace only', '   '],
  ];

  for (const [label, value] of hostile) {
    it(`refuses ${label}`, () => {
      expect(normalizeRedirectPath(value), label).toBeNull();
    });
  }

  it('refuses a non-string', () => {
    expect(normalizeRedirectPath(null)).toBeNull();
    expect(normalizeRedirectPath(undefined)).toBeNull();
  });
});

describe('reserved infrastructure paths', () => {
  /*
    THE BLIND SPOT THIS BLOCK USED TO HAVE (APP-01 / APP-02).

    These cases asserted `isReservedPath` with the argument as written —
    `/robots.txt` — and passed. But nothing in production ever calls it that
    way: `validateRedirectSource` normalises first, and
    `normalizeRedirectPath` always appends a trailing slash, so the real
    argument is `/robots.txt/`, which the exact-path list did not match. The
    test proved the list held the right strings; it never proved the guard
    fired. Both the helper AND the entry points are asserted below, and every
    exact path is checked in both spellings.
  */
  const EXACT = ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/manifest.json'];
  const PREFIXES = ['/admin', '/api', '/_next', '/login', '/register', '/account', '/forgot-password', '/reset-password'];

  it('protects admin, api, auth and framework routes', () => {
    for (const p of ['/admin/', '/admin/articles/', '/api/', '/api/health/', '/_next/static/', '/login/', '/account/']) {
      expect(isReservedPath(p), p).toBe(true);
    }
  });

  it('protects exact infrastructure files, slashed and un-slashed alike', () => {
    for (const p of EXACT) {
      expect(isReservedPath(p), p).toBe(true);
      expect(isReservedPath(`${p}/`), `${p}/`).toBe(true);
      expect(isReservedPath(p.toUpperCase()), p.toUpperCase()).toBe(true);
    }
  });

  it('protects every reserved prefix in both spellings and as a parent', () => {
    for (const p of PREFIXES) {
      expect(isReservedPath(p), p).toBe(true);
      expect(isReservedPath(`${p}/`), `${p}/`).toBe(true);
      expect(isReservedPath(`${p}/anything/`), `${p}/anything/`).toBe(true);
    }
  });

  it('does NOT catch public routes that merely start with the same letters', () => {
    /*
      Compared segment-wise, not as a bare string prefix. `/administration/` is
      a legitimate public slug and must stay redirectable.
    */
    for (const p of ['/administration/', '/apiary/', '/accounts-payable/', '/loginesque/', '/registered-bulls/', '/robots-txt/']) {
      expect(isReservedPath(p), p).toBe(false);
    }
  });

  /* ── the entry points production actually calls ──────────────────────── */

  it('REGRESSION: validateRedirectSource refuses every exact infrastructure file', () => {
    for (const p of EXACT) {
      expect(validateRedirectSource(p), p).toMatchObject({ ok: false, reason: 'reserved' });
      expect(validateRedirectSource(`${p}/`), `${p}/`).toMatchObject({ ok: false, reason: 'reserved' });
      expect(validateRedirectSource(p.toUpperCase()), p.toUpperCase()).toMatchObject({ ok: false, reason: 'reserved' });
    }
  });

  it('REGRESSION: validateRedirectDestinationShape refuses them too', () => {
    for (const p of EXACT) {
      expect(validateRedirectDestinationShape(p, '/articles/x/'), p).toMatchObject({ ok: false, reason: 'reserved' });
      expect(validateRedirectDestinationShape(`${p}/`, '/articles/x/'), `${p}/`).toMatchObject({ ok: false, reason: 'reserved' });
    }
  });

  it('refuses every reserved prefix through both entry points', () => {
    for (const p of PREFIXES) {
      expect(validateRedirectSource(`${p}/x/`), `${p}/x/`).toMatchObject({ ok: false, reason: 'reserved' });
      expect(validateRedirectDestinationShape(`${p}/x/`, '/articles/y/'), `${p}/x/`).toMatchObject({ ok: false, reason: 'reserved' });
    }
  });

  it('still accepts representative legitimate redirect sources and destinations', () => {
    // Over-reservation would silently break real editorial redirects, so the
    // permissive half of the contract is pinned as tightly as the refusing half.
    for (const p of [
      '/articles/old-slug/',
      '/concerts/nfr-concerts-2026/',
      '/administration/',
      '/apiary/',
      '/registered-bulls/',
      '/robots-txt/',
      '/sitemap/',
      '/accounts-payable/',
    ]) {
      expect(validateRedirectSource(p), p).toMatchObject({ ok: true });
    }
    expect(validateRedirectDestinationShape('/rules-scoring/nfr-bull-riding-scoring/', '/standings-rankings/old/')).toMatchObject({ ok: true });
  });

  it('the normalised source and the boundary lookup key agree', () => {
    /*
      The defect's mechanism: the proxy passes a REQUEST pathname and the admin
      stores a NORMALISED one. If those two disagree for a protected path, one
      side can refuse while the other matches. Both must refuse.
    */
    expect(validateRedirectSource('/robots.txt').ok).toBe(false);
    expect(validateRedirectSource(normalizeRedirectPath('/robots.txt') as string).ok).toBe(false);
  });
});

describe('status-code policy', () => {
  it('recognises exactly 301, 302, 307 and 308', () => {
    for (const c of [301, 302, 307, 308]) expect(isSupportedRedirectStatus(c), String(c)).toBe(true);
    for (const c of [0, 200, 303, 304, 305, 399, 404, 500, -1, 3.08]) {
      expect(isSupportedRedirectStatus(c), String(c)).toBe(false);
    }
  });

  it('treats 301 and 308 as permanent, 302 and 307 as temporary', () => {
    expect(isPermanentStatus(301)).toBe(true);
    expect(isPermanentStatus(308)).toBe(true);
    expect(isPermanentStatus(302)).toBe(false);
    expect(isPermanentStatus(307)).toBe(false);
  });
});

describe('self-redirect detection', () => {
  it('sees through a trailing-slash difference', () => {
    // Otherwise `/a/` -> `/a` would store as a loop that no check caught.
    expect(samePath('/concerts/x/', '/concerts/x')).toBe(true);
  });

  it('refuses a destination equal to its source', () => {
    expect(validateRedirectDestinationShape('/concerts/x/', '/concerts/x/')).toMatchObject({ ok: false, reason: 'self' });
  });

  it('allows a genuinely different destination', () => {
    expect(validateRedirectDestinationShape('/concerts/y/', '/concerts/x/')).toMatchObject({ ok: true, path: '/concerts/y/' });
  });

  it('is false for unrelated or unparsable paths', () => {
    expect(samePath('/a/', '/b/')).toBe(false);
    expect(samePath('https://evil.example/', 'https://evil.example/')).toBe(false);
  });
});
