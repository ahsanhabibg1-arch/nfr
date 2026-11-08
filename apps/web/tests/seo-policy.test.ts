import { describe, it, expect } from 'vitest';
import {
  isPublished, effectiveRobots, isIndexable, isCanonicalSelf, isInSitemap,
  sitemapExclusionReason, canonicalKey, newestDate, type SeoSubject,
} from '../lib/seo/policy';
import { evaluateSitemap, type SitemapCandidate } from '../lib/seo/sitemapEntries';

/** Batch S / S4 — shared indexing & sitemap policy. Pure: no DB. */

const SITE = 'https://nfrguide.com';
const s = (over: Partial<SeoSubject> = {}): SeoSubject => ({ path: '/x/', published: true, ...over });
const cand = (subject: SeoSubject, extra: Partial<SitemapCandidate> = {}): SitemapCandidate =>
  ({ subject, family: 'test', changeFrequency: 'weekly', priority: 0.5, ...extra });

describe('S4 — published vs unpublished', () => {
  it('unpublished is never indexable nor in the sitemap', () => {
    expect(isPublished(s({ published: false }))).toBe(false);
    expect(isIndexable(s({ published: false }))).toBe(false);
    expect(sitemapExclusionReason(s({ published: false }), SITE)).toBe('unpublished');
  });
  it('a published subject with no SEO records is indexable and listed (no EntitySeo ≠ excluded)', () => {
    expect(isIndexable(s())).toBe(true);
    expect(isInSitemap(s(), SITE)).toBe(true);
    expect(isInSitemap(s({ editorNoindex: false, canonical: null }), SITE)).toBe(true);
  });
});

describe('S4 — effectiveRobots (matches what the page renders)', () => {
  it.each([
    [{}, { index: true, follow: true }],
    [{ storedRobots: 'noindex, follow' }, { index: false, follow: true }],
    [{ storedRobots: 'noindex, nofollow' }, { index: false, follow: false }],
    [{ storedRobots: 'index, nofollow' }, { index: true, follow: false }],
    [{ editorNoindex: true }, { index: false, follow: true }],
    [{ contentEligible: false }, { index: false, follow: false }],
    [{ contentEligible: false, editorNoindex: true }, { index: false, follow: false }],
  ] as [Partial<SeoSubject>, object][])('%j', (over, expected) => {
    expect(effectiveRobots(s(over))).toEqual(expected);
  });
});

describe('S4 — sitemap exclusion depends on index only, never on follow', () => {
  it.each([
    ['ArticleSeo noindex, follow', { storedRobots: 'noindex, follow' }, 'stored-robots-noindex'],
    ['ArticleSeo noindex, nofollow', { storedRobots: 'noindex, nofollow' }, 'stored-robots-noindex'],
    ['EntitySeo noindex (section/hub/event/edition/discipline/category/venue/competitor)', { editorNoindex: true }, 'editor-noindex'],
    ['content-based noindex (e.g. thin hub)', { contentEligible: false }, 'content-noindex'],
    ['type not listed', { sitemapType: false }, 'type-not-in-sitemap'],
  ] as [string, Partial<SeoSubject>, string][])('%s → excluded (%s)', (_label, over, reason) => {
    expect(sitemapExclusionReason(s(over), SITE)).toBe(reason);
    expect(isInSitemap(s(over), SITE)).toBe(false);
  });
  it('index, nofollow stays in the sitemap (follow is not an indexing signal)', () => {
    expect(isInSitemap(s({ storedRobots: 'index, nofollow' }), SITE)).toBe(true);
  });
});

describe('S4 — canonical self vs canonical-away', () => {
  it.each([
    [null], [undefined], [''], ['https://nfrguide.com/x/'], ['https://nfrguide.com/x'],
    ['https://www.nfrguide.com/x/'], ['https://nfrguide.com//x//'], ['https://nfrguide.com/x/?utm=1#a'],
  ])('self: %j', (canonical) => {
    expect(isCanonicalSelf(s({ canonical: canonical as string | null | undefined }), SITE)).toBe(true);
    expect(isInSitemap(s({ canonical: canonical as string | null | undefined }), SITE)).toBe(true);
  });
  it.each([['https://nfrguide.com/other/'], ['https://nfrguide.com/x/y/'], ['https://other.example/x/']])('away: %s → excluded', (canonical) => {
    expect(isCanonicalSelf(s({ canonical }), SITE)).toBe(false);
    expect(sitemapExclusionReason(s({ canonical }), SITE)).toBe('canonical-away');
  });
  it('canonicalKey normalises host, slashes, query and hash', () => {
    expect(canonicalKey('https://WWW.NFRGuide.com//a//b?x=1#y', SITE)).toBe('https://nfrguide.com/a/b/');
    expect(canonicalKey('/a', SITE)).toBe('https://nfrguide.com/a/');
  });
});

describe('S4 — regression: /rodeo-events/texas-circuit-stock-shows/', () => {
  it('a hub with no visible events and no public articles renders noindex,nofollow and is NOT listed', () => {
    // Loader rule (= getPublicHubBySlug().indexable): events.length > 0 || articles.length > 0
    const texas = s({ path: '/rodeo-events/texas-circuit-stock-shows/', contentEligible: false });
    expect(effectiveRobots(texas)).toEqual({ index: false, follow: false });
    const out = evaluateSitemap([cand(texas, { family: 'rodeo-hub' }), cand(s({ path: '/rodeo-events/cheyenne/' }), { family: 'rodeo-event' })], SITE);
    expect(out.entries.map((e) => e.url)).toEqual(['https://nfrguide.com/rodeo-events/cheyenne/']);
    expect(out.excluded).toEqual([expect.objectContaining({ reason: 'content-noindex' })]);
  });
});

describe('S4 — evaluateSitemap', () => {
  it('lists eligible pages in order, drops excluded ones with a reason, and de-duplicates URLs', () => {
    const out = evaluateSitemap([
      cand(s({ path: '/' })),
      cand(s({ path: '/a/', editorNoindex: true })),
      cand(s({ path: '/b/', canonical: 'https://nfrguide.com/c/' })),
      cand(s({ path: '/c/' })),
      cand(s({ path: '/c/' })),
    ], SITE);
    expect(out.entries.map((e) => e.url)).toEqual(['https://nfrguide.com/', 'https://nfrguide.com/c/']);
    expect(out.excluded.map((x) => [x.candidate.subject.path, x.reason])).toEqual([
      ['/a/', 'editor-noindex'], ['/b/', 'canonical-away'], ['/c/', 'duplicate-url'],
    ]);
  });

  it('writes a real lastModified when known and omits it otherwise (never fabricates now)', () => {
    const d = new Date('2026-10-01T12:00:00.000Z');
    const out = evaluateSitemap([cand(s({ path: '/with/' }), { lastModified: d }), cand(s({ path: '/without/' }))], SITE);
    expect(out.entries[0]).toMatchObject({ url: 'https://nfrguide.com/with/', lastModified: d });
    expect(out.entries[1]).not.toHaveProperty('lastModified');
  });

  it('newestDate picks the latest known timestamp, ignores null/invalid, and returns undefined when none', () => {
    const a = new Date('2026-01-01'); const b = new Date('2026-06-01');
    expect(newestDate(a, null, b, undefined)).toBe(b);
    expect(newestDate(null, undefined, new Date('nope'))).toBeUndefined();
    expect(newestDate()).toBeUndefined();
  });
});
