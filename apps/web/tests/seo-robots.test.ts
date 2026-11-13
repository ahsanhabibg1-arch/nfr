import { describe, it, expect, afterEach, vi } from 'vitest';
import type { EntitySeo } from '@prisma/client';
import {
  parseRobotsDirective, combineRobots, robotsToString,
  INDEX_FOLLOW, EDITOR_NOINDEX, LEGACY_NOINDEX, NOINDEX_FOLLOW, directoryListingRobots,
} from '../lib/seo/robots';
import { unavailableArticleMetadataInput } from '../lib/seo/articleMeta';
import { buildMetadata } from '../lib/seo';
import { mergeSeoMeta } from '../lib/cms/entitySeoService';

/** Batch S / S3 — independent index/follow robots policy. Pure; no DB. */

const BASE = { title: 'Page', description: 'Desc.', path: '/p/' };

describe('S3 — parseRobotsDirective', () => {
  it.each([
    ['index, follow', { index: true, follow: true }],
    ['index, nofollow', { index: true, follow: false }],
    ['noindex, follow', { index: false, follow: true }],
    ['noindex, nofollow', { index: false, follow: false }],
  ])('the four combinations: %s', (d, expected) => expect(parseRobotsDirective(d)).toEqual(expected));

  it.each([
    ['NoIndex, FOLLOW', { index: false, follow: true }],
    ['  noindex ,  nofollow  ', { index: false, follow: false }],
    ['noindex,nofollow', { index: false, follow: false }],
    ['noindex nofollow', { index: false, follow: false }],
    ['index,\tnofollow', { index: true, follow: false }],
    ['NONE', { index: false, follow: false }],
  ])('case-insensitive / whitespace-tolerant: %j', (d, expected) => expect(parseRobotsDirective(d)).toEqual(expected));

  it.each([
    [undefined], [null], [''], ['   '], [',,,'], ['garbage'], ['max-snippet:-1, max-image-preview:large'], ['all'],
  ])('missing or unrecognised %j → documented fallback index, follow', (d) => {
    expect(parseRobotsDirective(d as string | null | undefined)).toEqual({ index: true, follow: true });
  });

  it('contradictory tokens resolve to the restrictive value', () => {
    expect(parseRobotsDirective('index, noindex')).toEqual({ index: false, follow: true });
    expect(parseRobotsDirective('follow nofollow')).toEqual({ index: true, follow: false });
  });
});

describe('S3 — combineRobots / robotsToString', () => {
  it('keeps the most restrictive of each flag', () => {
    expect(combineRobots(INDEX_FOLLOW, INDEX_FOLLOW)).toEqual({ index: true, follow: true });
    expect(combineRobots(INDEX_FOLLOW, EDITOR_NOINDEX)).toEqual({ index: false, follow: true });
    expect(combineRobots(LEGACY_NOINDEX, EDITOR_NOINDEX)).toEqual({ index: false, follow: false });
    expect(combineRobots({ index: true, follow: false }, EDITOR_NOINDEX)).toEqual({ index: false, follow: false });
    expect(combineRobots(null, undefined)).toEqual({ index: true, follow: true });
  });
  it('formats directives', () => {
    expect(robotsToString({ index: false, follow: true })).toBe('noindex, follow');
    expect(robotsToString({ index: true, follow: false })).toBe('index, nofollow');
  });
});

describe('S3 — buildMetadata', () => {
  it.each([
    [{ index: true, follow: true }],
    [{ index: true, follow: false }],
    [{ index: false, follow: true }],
    [{ index: false, follow: false }],
  ])('emits robots exactly as given: %j', (robots) => {
    expect(buildMetadata({ ...BASE, robots }).robots).toEqual(robots);
  });

  it('route-level noindex shorthand is unchanged: noindex, nofollow', () => {
    expect(buildMetadata({ ...BASE, noindex: true }).robots).toEqual({ index: false, follow: false });
  });

  it('default (neither given) is index, follow', () => {
    expect(buildMetadata(BASE).robots).toEqual({ index: true, follow: true });
    expect(buildMetadata({ ...BASE, noindex: false }).robots).toEqual({ index: true, follow: true });
  });

  it('explicit robots takes precedence over the noindex shorthand', () => {
    expect(buildMetadata({ ...BASE, noindex: true, robots: { index: false, follow: true } }).robots).toEqual({ index: false, follow: true });
  });

  it('robots changes nothing else (title, description, canonical, OG, Twitter)', () => {
    const plain = buildMetadata({ ...BASE, image: '/i.jpg', canonical: 'https://nfrguide.com/p/' });
    const robotsSet = buildMetadata({ ...BASE, image: '/i.jpg', canonical: 'https://nfrguide.com/p/', robots: { index: false, follow: true } });
    const { robots: _a, ...restPlain } = plain;
    const { robots: _b, ...restRobots } = robotsSet;
    expect(restRobots).toEqual(restPlain);
  });
});

function entitySeo(over: Partial<EntitySeo> = {}): EntitySeo {
  return {
    id: 'x', entityType: 'VENUE', entityId: 'v1', seoTitle: null, metaDescription: null,
    canonicalOverride: null, ogImage: null, noindex: false, intro: null, updatedById: null,
    updatedAt: new Date(0), ...over,
  } as EntitySeo;
}

describe('S3 — mergeSeoMeta (EntitySeo) robots', () => {
  it('no record, no derived noindex → index, follow', () => {
    expect(mergeSeoMeta(null, BASE).robots).toEqual({ index: true, follow: true });
  });
  it('editor noindex → noindex, FOLLOW (does not block link following)', () => {
    expect(mergeSeoMeta(entitySeo({ noindex: true }), BASE).robots).toEqual({ index: false, follow: true });
    expect(buildMetadata(mergeSeoMeta(entitySeo({ noindex: true }), BASE)).robots).toEqual({ index: false, follow: true });
  });
  it('content-based derivedNoindex keeps the existing route policy: noindex, nofollow', () => {
    expect(mergeSeoMeta(null, { ...BASE, derivedNoindex: true }).robots).toEqual({ index: false, follow: false });
  });
  it('editor can never force-index a derived-noindex page (most restrictive wins)', () => {
    expect(mergeSeoMeta(entitySeo({ noindex: false }), { ...BASE, derivedNoindex: true }).robots).toEqual({ index: false, follow: false });
    expect(mergeSeoMeta(entitySeo({ noindex: true }), { ...BASE, derivedNoindex: true }).robots).toEqual({ index: false, follow: false });
  });
  it('does not emit the legacy noindex shorthand any more (robots is authoritative)', () => {
    expect(mergeSeoMeta(entitySeo({ noindex: true }), BASE)).not.toHaveProperty('noindex');
  });
});

describe('S3 follow-up — explicit route policies', () => {
  it('filtered/paged directory listings → noindex, follow; unfiltered → index, follow', () => {
    expect(buildMetadata({ ...BASE, robots: directoryListingRobots(true) }).robots).toEqual({ index: false, follow: true });
    expect(buildMetadata({ ...BASE, robots: directoryListingRobots(false) }).robots).toEqual({ index: true, follow: true });
  });

  it('directoryListingRobots returns a fresh object (shared constants cannot be mutated)', () => {
    const a = directoryListingRobots(true);
    a.follow = false;
    expect(directoryListingRobots(true)).toEqual({ index: false, follow: true });
    expect(NOINDEX_FOLLOW).toEqual({ index: false, follow: true });
  });

  it('unavailable article → noindex, follow (title/description/path unchanged)', () => {
    const input = unavailableArticleMetadataInput('gone-piece');
    expect(input).toMatchObject({ title: 'Dispatch Unavailable', description: 'The requested editorial dispatch is currently unavailable.', path: '/articles/gone-piece/' });
    expect(buildMetadata(input).robots).toEqual({ index: false, follow: true });
  });

  it('content-noindex pages (e.g. thin rodeo hubs via derivedNoindex) stay noindex, nofollow', () => {
    expect(buildMetadata(mergeSeoMeta(null, { ...BASE, derivedNoindex: true })).robots).toEqual({ index: false, follow: false });
  });
});

describe('S3 — route-level policies that must not change', () => {
  it('admin root layout stays noindex, nofollow', async () => {
    const layout = await import('../app/admin/layout');
    expect(layout.metadata.robots).toEqual({ index: false, follow: false });
  });

  /**
   * IDX-02 changed this contract deliberately. The middleware no longer keys only
   * off STAGING_NOINDEX: the production domain and the Render hostname resolve to
   * the same service, so the noindex decision is made per request from the `Host`
   * header, and STAGING_NOINDEX remains only as a site-wide kill switch.
   *
   * These two cases keep asserting the kill switch's own contract, now with a
   * request that carries a host (as every real request does). The hostname
   * behaviour itself — staging, www, unknown hosts, ports, forged forwarded
   * headers, caching — is covered in `tests/idx02-hostname-seo.test.ts`.
   */
  describe('staging middleware (X-Robots-Tag)', () => {
    afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
    const req = (host = 'nfrguide.com') => ({
      nextUrl: new URL(`https://${host}/`),
      headers: new Headers({ host }),
    }) as unknown as import('next/server').NextRequest;

    it('STAGING_NOINDEX=true → X-Robots-Tag: noindex, nofollow, even on the production host', async () => {
      vi.stubEnv('STAGING_NOINDEX', 'true');
      vi.resetModules();
      const { middleware } = await import('../middleware');
      expect(middleware(req()).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    });

    it('STAGING_NOINDEX unset → no X-Robots-Tag header on the production host', async () => {
      vi.stubEnv('STAGING_NOINDEX', '');
      vi.resetModules();
      const { middleware } = await import('../middleware');
      expect(middleware(req()).headers.get('X-Robots-Tag')).toBeNull();
    });
  });
});
