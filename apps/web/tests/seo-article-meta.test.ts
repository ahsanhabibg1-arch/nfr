import { describe, it, expect } from 'vitest';
import {
  articleMetadataInput,
  normalizeSameSiteCanonical,
  parseRobotsDirective,
  ARTICLE_DESCRIPTION_FALLBACK,
} from '../lib/seo/articleMeta';
import { buildMetadata } from '../lib/seo';
import type { Article } from '../types';

/** Batch S / S1 — ArticleSeo → public article metadata. Pure: no DB, no Next runtime. */

const SITE = 'https://nfrguide.com';

function article(over: Partial<Article> = {}, seo?: Article['seo']): Article {
  return {
    id: 'a1',
    slug: 'bull-riding-guide',
    title: 'Bull Riding Explained',
    deck: 'The deck line.',
    excerpt: 'The excerpt line.',
    heroImage: '/media/hero.jpg',
    publishedAt: '2026-11-01T00:00:00.000Z',
    author: { name: 'Jane Writer', role: 'Editor' },
    ...over,
    seo,
  } as unknown as Article;
}

const seo = (over: Partial<NonNullable<Article['seo']>> = {}): Article['seo'] => ({
  title: 'unused-fallback-title',
  description: 'unused-fallback-description',
  ...over,
});

describe('S1 — ArticleSeo overrides', () => {
  it('uses the stored SEO title', () => {
    const m = articleMetadataInput(article({}, seo({ storedTitle: 'Custom SEO Title' })), SITE);
    expect(m.title).toBe('Custom SEO Title');
  });

  it('uses the stored meta description', () => {
    const m = articleMetadataInput(article({}, seo({ storedDescription: 'Stored meta description.' })), SITE);
    expect(m.description).toBe('Stored meta description.');
  });

  it('uses the stored OG image', () => {
    const m = articleMetadataInput(article({}, seo({ ogImage: '/media/social.jpg' })), SITE);
    expect(m.image).toBe('/media/social.jpg');
  });

  it('honours a same-site canonical, normalised on SITE_URL', () => {
    const m = articleMetadataInput(article({}, seo({ canonicalUrl: 'https://nfrguide.com/articles/other-piece' })), SITE);
    expect(m.canonical).toBe('https://nfrguide.com/articles/other-piece/');
  });

  it('ignores an off-site canonical and falls back to the self path', () => {
    const m = articleMetadataInput(article({}, seo({ canonicalUrl: 'https://evil.example/articles/x/' })), SITE);
    expect(m.canonical).toBeUndefined();
    expect(m.path).toBe('/articles/bull-riding-guide/');
  });

  it('maps the stored robots directive to independent index/follow (S3)', () => {
    expect(articleMetadataInput(article({}, seo({ robots: 'noindex, follow' })), SITE).robots).toEqual({ index: false, follow: true });
    expect(articleMetadataInput(article({}, seo({ robots: 'index, nofollow' })), SITE).robots).toEqual({ index: true, follow: false });
    expect(articleMetadataInput(article({}, seo({ robots: 'index, follow' })), SITE).robots).toEqual({ index: true, follow: true });
  });
});

describe('S1 — fallbacks when no override exists (previous behaviour)', () => {
  it('no ArticleSeo row: title, deck, hero, self canonical, indexable', () => {
    const m = articleMetadataInput(article(), SITE);
    expect(m).toMatchObject({
      title: 'Bull Riding Explained',
      description: 'The deck line.',
      image: '/media/hero.jpg',
      path: '/articles/bull-riding-guide/',
      type: 'article',
      publishedTime: '2026-11-01T00:00:00.000Z',
      authorName: 'Jane Writer',
      robots: { index: true, follow: true },
    });
    expect(m.canonical).toBeUndefined();
  });

  it('blank stored values keep the deck → excerpt → generic fallback order', () => {
    const blank = seo({ storedTitle: undefined, storedDescription: undefined, ogImage: '  ', robots: '' });
    expect(articleMetadataInput(article({}, blank), SITE)).toMatchObject({ title: 'Bull Riding Explained', description: 'The deck line.', image: '/media/hero.jpg', robots: { index: true, follow: true } });
    expect(articleMetadataInput(article({ deck: '' }, blank), SITE).description).toBe('The excerpt line.');
    expect(articleMetadataInput(article({ deck: '', excerpt: '' }, blank), SITE).description).toBe(ARTICLE_DESCRIPTION_FALLBACK);
  });

  it('does not use the mapper fallback description (excerpt) ahead of the deck', () => {
    // seo.description is the mapper's fallback (metaDescription ?? excerpt); only storedDescription overrides.
    const m = articleMetadataInput(article({}, seo({ description: 'The excerpt line.' })), SITE);
    expect(m.description).toBe('The deck line.');
  });
});

describe('S1 — normalizeSameSiteCanonical', () => {
  it.each([
    ['/articles/a', 'https://nfrguide.com/articles/a/'],
    ['/articles/a/', 'https://nfrguide.com/articles/a/'],
    ['https://nfrguide.com/articles/a/', 'https://nfrguide.com/articles/a/'],
    ['https://www.nfrguide.com/articles/a/', 'https://nfrguide.com/articles/a/'],
    ['http://nfrguide.com/articles/a', 'https://nfrguide.com/articles/a/'],
    ['https://nfrguide.com//articles//a//', 'https://nfrguide.com/articles/a/'],
    ['https://nfrguide.com/articles/a/?utm=x#top', 'https://nfrguide.com/articles/a/'],
    ['  /articles/a/  ', 'https://nfrguide.com/articles/a/'],
  ])('same-site %s → %s', (input, expected) => {
    expect(normalizeSameSiteCanonical(input, SITE)).toBe(expected);
  });

  it.each([
    [''], ['   '], [null], [undefined],
    ['https://other.com/articles/a/'],
    ['//other.com/articles/a/'],
    ['https://nfrguide.com.evil.com/articles/a/'],
    ['javascript:alert(1)'],
    ['mailto:x@nfrguide.com'],
  ])('rejects %s', (input) => {
    expect(normalizeSameSiteCanonical(input as string | null | undefined, SITE)).toBeNull();
  });

  it('uses the configured SITE_URL (no hard-coded production host)', () => {
    expect(normalizeSameSiteCanonical('/articles/a/', 'http://localhost:3000')).toBe('http://localhost:3000/articles/a/');
    // Batch S5: stored values are production URLs; the production origin counts as this site
    // in every environment and is re-based onto the current SITE_URL (was: ignored in dev).
    expect(normalizeSameSiteCanonical('https://nfrguide.com/articles/a/', 'http://localhost:3000')).toBe('http://localhost:3000/articles/a/');
    // …but a development host is never accepted when SITE_URL is production.
    expect(normalizeSameSiteCanonical('http://localhost:3000/articles/a/', 'https://nfrguide.com')).toBeNull();
    expect(normalizeSameSiteCanonical('/articles/a/', 'https://nfrguide.com/')).toBe('https://nfrguide.com/articles/a/');
  });
});

describe('S1 — parseRobotsDirective', () => {
  it.each([
    ['index, follow', { index: true, follow: true }],
    ['noindex, follow', { index: false, follow: true }],
    ['noindex, nofollow', { index: false, follow: false }],
    ['index, nofollow', { index: true, follow: false }],
    ['NOINDEX,NOFOLLOW', { index: false, follow: false }],
    ['none', { index: false, follow: false }],
    ['all', { index: true, follow: true }],
    ['', { index: true, follow: true }],
    [undefined, { index: true, follow: true }],
    ['max-snippet:-1', { index: true, follow: true }],
  ])('%s', (input, expected) => {
    expect(parseRobotsDirective(input as string | undefined)).toEqual(expected);
  });
});

describe('S1 — end-to-end through buildMetadata', () => {
  it('stored overrides reach title, description, canonical, OG and Twitter', () => {
    const meta = buildMetadata(articleMetadataInput(article({}, seo({
      storedTitle: 'Custom SEO Title',
      storedDescription: 'Stored meta description.',
      ogImage: '/media/social.jpg',
      canonicalUrl: '/articles/bull-riding-guide',
      robots: 'index, follow',
    })), SITE));
    expect(meta.title).toEqual({ absolute: 'Custom SEO Title — NFRGuide' });
    expect(meta.description).toBe('Stored meta description.');
    expect(meta.alternates?.canonical).toBe('https://nfrguide.com/articles/bull-riding-guide/');
    expect(meta.robots).toEqual({ index: true, follow: true });
    const og = meta.openGraph as { title?: string; description?: string; images?: { url: string }[]; type?: string };
    expect(og.title).toBe('Custom SEO Title — NFRGuide');
    expect(og.description).toBe('Stored meta description.');
    expect(og.type).toBe('article');
    expect(og.images?.[0].url).toMatch(/\/media\/social\.jpg$/);
    const tw = meta.twitter as { title?: string; description?: string };
    expect(tw.title).toBe('Custom SEO Title — NFRGuide');
    expect(tw.description).toBe('Stored meta description.');
  });

  it.each([
    ['index, follow', { index: true, follow: true }],
    ['index, nofollow', { index: true, follow: false }],
    ['noindex, follow', { index: false, follow: true }],
    ['noindex, nofollow', { index: false, follow: false }],
  ])('stored "%s" renders exactly that robots policy (S3)', (directive, expected) => {
    const meta = buildMetadata(articleMetadataInput(article({}, seo({ robots: directive })), SITE));
    expect(meta.robots).toEqual(expected);
  });
});
