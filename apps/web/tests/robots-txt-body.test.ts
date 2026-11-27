import { describe, it, expect, afterEach, vi } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/**
 * Stage 03 / APP-02 — the robots.txt BODY, which had no test at all.
 *
 * `tests/seo-robots.test.ts` covers per-page `meta robots`, and
 * `tests/idx02-hostname-seo.test.ts` covers the `X-Robots-Tag` header on the
 * route. Neither asserts a single byte of what `/robots.txt` actually serves —
 * the endpoint at the centre of the SEO-CRITICAL-01 incident was the one SEO
 * surface with zero regression coverage.
 *
 * WHY THE SERIALIZER AND NOT JUST THE OBJECT. `app/robots.ts` returns a
 * `MetadataRoute.Robots` object; Next.js turns that into text. A test that only
 * inspected the object would pass while the emitted bytes changed — and the
 * bytes are what Google reads. So these cases run the real object through
 * Next's own `resolveRobots`, the same function the build uses, and assert the
 * string it produces.
 */

const NEXT_SERIALIZER = resolve(
  process.cwd(),
  'node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.js',
);

async function serialize(siteUrl: string | undefined): Promise<string> {
  vi.resetModules();
  if (siteUrl === undefined) vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
  else vi.stubEnv('NEXT_PUBLIC_SITE_URL', siteUrl);

  const [{ default: robots }, { resolveRobots }] = await Promise.all([
    import('../app/robots'),
    import(pathToFileURL(NEXT_SERIALIZER).href) as Promise<{ resolveRobots: (d: unknown) => string }>,
  ]);
  return resolveRobots(robots());
}

/** The body Google Search Console recorded on 2026-11-26, for direct comparison. */
const BLOCKING_BODY = 'User-agent: *\nDisallow: /\n';
const PRODUCTION_ORIGIN = 'https://nfrguide.com';

const SITE_URLS: Array<[string, string | undefined]> = [
  ['production origin', PRODUCTION_ORIGIN],
  ['Render service hostname', 'https://nfr-qadd.onrender.com'],
  ['local development', 'http://localhost:3000'],
  ['unset (falls back to the hardcoded production origin)', undefined],
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('APP-02 — robots.txt serves a permissive production policy', () => {
  it('emits exactly the expected body on the production origin', async () => {
    const body = await serialize(PRODUCTION_ORIGIN);
    expect(body).toBe(
      'User-Agent: *\n' +
        'Allow: /\n' +
        'Disallow: /admin/\n' +
        '\n' +
        `Host: ${PRODUCTION_ORIGIN}\n` +
        `Sitemap: ${PRODUCTION_ORIGIN}/sitemap.xml\n`,
    );
  });

  it('is 111 bytes on the production origin, matching the live response', async () => {
    // Pinned because a byte length is what Search Console reports, and it is how
    // the 26-byte blocking response was distinguished from this one.
    const body = await serialize(PRODUCTION_ORIGIN);
    expect(Buffer.byteLength(body, 'utf8')).toBe(111);
  });

  it('advertises the canonical sitemap on the same origin as Host', async () => {
    const body = await serialize(PRODUCTION_ORIGIN);
    expect(body).toContain(`Sitemap: ${PRODUCTION_ORIGIN}/sitemap.xml`);
    expect(body).toContain(`Host: ${PRODUCTION_ORIGIN}`);
    expect(body).not.toMatch(/Sitemap:\s*\/sitemap\.xml/);
    expect(body).not.toContain('localhost');
    expect(body).not.toContain('onrender');
  });

  it('keeps /admin/ disallowed', async () => {
    expect(await serialize(PRODUCTION_ORIGIN)).toContain('Disallow: /admin/');
  });
});

describe('APP-02 — no reachable configuration produces a site-wide block', () => {
  it.each(SITE_URLS)('retains an unconditional "Allow: /" with %s', async (_label, url) => {
    expect(await serialize(url)).toContain('Allow: /');
  });

  it.each(SITE_URLS)('emits no site-wide "Disallow: /" with %s', async (_label, url) => {
    const body = await serialize(url);
    // The exact shape Google reported: a Disallow of the site root, on its own line.
    expect(body).not.toMatch(/^Disallow:\s*\/\s*$/m);
  });

  it.each(SITE_URLS)('never equals the recorded blocking body with %s', async (_label, url) => {
    expect(await serialize(url)).not.toBe(BLOCKING_BODY);
  });

  it('falls back to the production origin when the environment variable is unset', async () => {
    const body = await serialize(undefined);
    expect(body).toContain(`Host: ${PRODUCTION_ORIGIN}`);
    expect(Buffer.byteLength(body, 'utf8')).toBe(111);
  });

  it('pins the serializer capitalisation the incident analysis turned on', async () => {
    // Next emits "User-Agent:" with a capital A; the blocking response Google
    // displayed used lowercase "User-agent:". Pinned so a serializer change that
    // altered it would be noticed rather than quietly invalidating that analysis.
    const body = await serialize(PRODUCTION_ORIGIN);
    expect(body).toContain('User-Agent: *');
    expect(body).not.toContain('User-agent: *');
  });
});

describe('APP-02 — the route itself is dependency-free', () => {
  it('declares no database, Prisma or CMS import anywhere in its graph', async () => {
    // SEO-04's static half: robots.txt must not acquire a data dependency. The
    // module graph is read rather than executed, so a lazily-required client
    // would still be caught.
    const { readFileSync } = await import('node:fs');
    const sources = [
      resolve(process.cwd(), 'app/robots.ts'),
      resolve(process.cwd(), 'lib/seo.tsx'),
      resolve(process.cwd(), 'lib/seo/canonical.ts'),
    ].map((p) => readFileSync(p, 'utf8'));

    for (const source of sources) {
      expect(source).not.toMatch(/from\s+['"]@?\/?lib\/db['"]/);
      expect(source).not.toMatch(/@prisma\/client/);
      expect(source).not.toMatch(/from\s+['"].*\/cms\//);
    }
  });

  it('is a pure function of SITE_URL — same input, same bytes, every time', async () => {
    const a = await serialize(PRODUCTION_ORIGIN);
    const b = await serialize(PRODUCTION_ORIGIN);
    expect(a).toBe(b);
  });
});

describe('APP-02 — crawl policy is identical for browsers and crawlers', () => {
  it('the policy is a static artifact, so it cannot vary by User-Agent', async () => {
    /*
      `app/robots.ts` takes no request and reads no header, so there is no input
      through which a User-Agent could change the body. This asserts that
      structurally: the route's signature accepts nothing.
    */
    const { default: robots } = await import('../app/robots');
    expect(robots.length).toBe(0);
    expect(JSON.stringify(robots())).toBe(JSON.stringify(robots()));
  });

  it('the only User-Agent group is the wildcard, so no crawler is singled out', async () => {
    const body = await serialize(PRODUCTION_ORIGIN);
    const groups = body.match(/^User-Agent:.*$/gim) ?? [];
    expect(groups).toEqual(['User-Agent: *']);
  });
});
