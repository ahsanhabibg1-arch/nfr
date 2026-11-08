import { describe, it, expect } from 'vitest';
import {
  normalizeSameSiteCanonical, canonicalUrlKey, classifyStoredCanonical, productionCanonicalUrl,
  sameSiteHosts, PRODUCTION_SITE_URL,
} from '../lib/seo/canonical';
import { resolveCanonical } from '../lib/cms/entitySeoService';
import { articleMetadataInput } from '../lib/seo/articleMeta';
import { isCanonicalSelf, isInSitemap, canonicalKey } from '../lib/seo/policy';
import { evaluateSitemap } from '../lib/seo/sitemapEntries';
import { analyzeTechnical, analyzeStructuredData, type Inventory, type ArticleInv } from '../lib/seo-intel/analyzers';
import { buildMetadata, SITE_URL } from '../lib/seo';
import type { Article } from '../types';

/** Batch S / S5 — one canonical normalizer, environment-aware. Pure; no DB. */

const ENVS = {
  localhost: 'http://localhost:3000',
  staging: 'https://nfrguide-staging.onrender.com',
  production: 'https://nfrguide.com',
} as const;
const STORED = 'https://nfrguide.com/articles/a/'; // what articleService stores (production URL)

describe('S5 — environment matrix for a stored production canonical', () => {
  it.each(Object.entries(ENVS))('%s: production URL re-bases onto SITE_URL (self)', (_env, site) => {
    expect(normalizeSameSiteCanonical(STORED, site)).toBe(`${site}/articles/a/`);
    expect(classifyStoredCanonical(STORED, '/articles/a/', site)).toBe('self');
  });

  it('development and staging hosts never count as this site in production', () => {
    expect(normalizeSameSiteCanonical('http://localhost:3000/articles/a/', ENVS.production)).toBeNull();
    expect(normalizeSameSiteCanonical('https://nfrguide-staging.onrender.com/articles/a/', ENVS.production)).toBeNull();
    expect(sameSiteHosts(ENVS.production)).toEqual(new Set(['nfrguide.com']));
  });

  it('staging accepts its own host and the production origin, not localhost', () => {
    expect(sameSiteHosts(ENVS.staging)).toEqual(new Set(['nfrguide-staging.onrender.com', 'nfrguide.com']));
    expect(normalizeSameSiteCanonical('http://localhost:3000/x/', ENVS.staging)).toBeNull();
  });

  it('persistence always stores the production URL (no environment host)', () => {
    expect(productionCanonicalUrl('/articles/a')).toBe('https://nfrguide.com/articles/a/');
    expect(productionCanonicalUrl('/articles//a/')).toBe('https://nfrguide.com/articles/a/');
    expect(PRODUCTION_SITE_URL).toBe('https://nfrguide.com');
  });
});

describe('S5 — normalisation rules', () => {
  const site = ENVS.production;
  it.each([
    ['same-site absolute', 'https://nfrguide.com/x/', 'https://nfrguide.com/x/'],
    ['http → https (scheme ignored, SITE_URL scheme used)', 'http://nfrguide.com/x/', 'https://nfrguide.com/x/'],
    ['www ignored', 'https://www.nfrguide.com/x/', 'https://nfrguide.com/x/'],
    ['host case ignored', 'https://NFRGuide.COM/x/', 'https://nfrguide.com/x/'],
    ['trailing slash added', '/x', 'https://nfrguide.com/x/'],
    ['repeated slashes collapsed', 'https://nfrguide.com//x//y//', 'https://nfrguide.com/x/y/'],
    ['query removed', '/x/?utm_source=a&b=c', 'https://nfrguide.com/x/'],
    ['fragment removed', '/x/#section', 'https://nfrguide.com/x/'],
    ['relative path (leading slash)', '/articles/a/', 'https://nfrguide.com/articles/a/'],
    ['relative path (no leading slash)', 'articles/a', 'https://nfrguide.com/articles/a/'],
    ['whitespace trimmed', '  /x/  ', 'https://nfrguide.com/x/'],
  ])('%s', (_label, input, expected) => {
    expect(normalizeSameSiteCanonical(input, site)).toBe(expected);
  });

  it.each([
    ['cross-domain (owner decision: ignored → self)', 'https://partner.example/x/'],
    ['look-alike host', 'https://nfrguide.com.evil.example/x/'],
    ['protocol-relative off-site', '//evil.example/x/'],
    ['javascript:', 'javascript:alert(1)'],
    ['mailto:', 'mailto:a@nfrguide.com'],
    ['ftp:', 'ftp://nfrguide.com/x/'],
    ['malformed', 'http://[::1'],
    ['empty', ''],
  ])('rejects %s', (_label, input) => {
    expect(normalizeSameSiteCanonical(input, site)).toBeNull();
  });
});

describe('S5 — classifyStoredCanonical (used by render, sitemap and audit)', () => {
  const site = ENVS.localhost;
  it.each([
    [null, 'absent'], ['', 'absent'],
    ['https://nfrguide.com/articles/a/', 'self'],
    ['/articles/a', 'self'],
    ['https://nfrguide.com/articles/b/', 'same-site-other'],
    ['https://partner.example/articles/a/', 'ignored-off-site'],
    ['http://[::1', 'ignored-malformed'],
    ['javascript:alert(1)', 'ignored-malformed'],
  ])('%j → %s', (value, expected) => {
    expect(classifyStoredCanonical(value as string | null, '/articles/a/', site)).toBe(expected);
  });
});

describe('S5 — duplicate canonical detection (equivalent spellings share one key)', () => {
  it('different spellings of the same page compare equal', () => {
    const site = ENVS.production;
    const keys = ['https://nfrguide.com/x/', 'http://www.nfrguide.com/x', 'https://nfrguide.com//x/?q=1#f'].map((u) => canonicalUrlKey(u, site)?.replace(/^https?:/, ''));
    expect(new Set(keys).size).toBe(1);
    expect(canonicalKey('/x', site)).toBe(canonicalUrlKey('/x', site));
  });
});

describe('S5 — EntitySeo overrides use the same normalizer', () => {
  it('render: same-site values normalised (trailing slash, no query/fragment); off-site ignored', () => {
    expect(resolveCanonical('/disciplines/bull-riding')).toBe(`${SITE_URL}/disciplines/bull-riding/`);
    expect(resolveCanonical('/disciplines/bull-riding/?x=1#y')).toBe(`${SITE_URL}/disciplines/bull-riding/`);
    expect(resolveCanonical('https://nfrguide.com/venues/x/')).toBe(`${SITE_URL}/venues/x/`);
    expect(resolveCanonical('https://partner.example/x/')).toBeNull();
    expect(resolveCanonical('//evil.example/x/')).toBeNull();
  });
});

function art(canonicalUrl: string | undefined): Article {
  return { id: 'a1', slug: 'a', title: 'T', deck: 'D', excerpt: 'E', heroImage: '/h.jpg', publishedAt: '2026-10-01', author: { name: 'W', role: 'R' }, seo: { title: 'T', description: 'E', canonicalUrl } } as unknown as Article;
}

describe('S5 — rendered canonical ↔ sitemap eligibility agree, per environment', () => {
  it.each(Object.entries(ENVS))('%s', (_env, site) => {
    for (const [stored, expectedSelf] of [
      [STORED, true],
      ['https://nfrguide.com/articles/other/', false],
      ['https://partner.example/articles/a/', true], // ignored → renders self
      [undefined, true],
    ] as const) {
      const rendered = buildMetadata(articleMetadataInput(art(stored), site)).alternates?.canonical as string;
      const resolved = normalizeSameSiteCanonical(stored, site);
      const subject = { path: '/articles/a/', published: true, canonical: resolved };
      expect(isCanonicalSelf(subject, site)).toBe(expectedSelf);
      expect(isInSitemap(subject, site)).toBe(expectedSelf);
      // what the page renders is exactly what the sitemap evaluated
      if (resolved) expect(rendered).toBe(resolved);
      const listed = evaluateSitemap([{ subject, family: 'article', changeFrequency: 'weekly', priority: 0.7 }], site).entries.map((e) => e.url);
      expect(listed).toEqual(expectedSelf ? [`${site}/articles/a/`] : []);
    }
  });
});

function inv(canonicalUrl: string | null): Inventory {
  const a: ArticleInv = {
    id: 'a1', slug: 'a', title: 'T', excerpt: 'E', status: 'PUBLISHED', categoryId: 'c', categoryName: 'C', authorName: 'W', createdById: null,
    heroImageUrl: '/h.jpg', publishedAt: new Date('2026-10-01'), robots: 'index, follow', seoTitle: 'T', metaDescription: 'D',
    canonicalUrl, ogImage: null, imageAltText: 'alt', imageSeoTitle: 't', headings: [], bodyWords: 100, internalLinks: [],
    disciplineSlugs: [], hubIds: [], eventIds: [], editions: [], sourceCount: 1, relatedIds: [],
  };
  return {
    articles: [a], articleStatusBySlug: new Map([['a', 'PUBLISHED']]), validPaths: new Set(['/articles/a/']), redirectSources: new Map(),
    hubs: [], events: [], editions: [], disciplines: [], venues: [], categories: [], mediaByUrl: new Map(), currentYear: 2026,
  };
}
const codes = (fs: { ruleCode: string }[]) => fs.map((f) => f.ruleCode).filter((c) => c.includes('CANONICAL'));

describe('S5 — SEO audit engine uses the same canonical semantics (no hard-coded host)', () => {
  it.each(Object.entries(ENVS))('%s: stored production self-canonical → no canonical findings', (_env, site) => {
    expect(codes([...analyzeTechnical(inv(STORED), site), ...analyzeStructuredData(inv(STORED), site)])).toEqual([]);
  });
  it('absent → TECH_NO_CANONICAL', () => {
    expect(codes(analyzeTechnical(inv(null), ENVS.localhost))).toEqual(['TECH_NO_CANONICAL']);
  });
  it('same-site other page → TECH_CANONICAL_MISMATCH + SD_CANONICAL_MISMATCH (canonical-away)', () => {
    const site = ENVS.localhost;
    expect(codes([...analyzeTechnical(inv('https://nfrguide.com/articles/b/'), site), ...analyzeStructuredData(inv('https://nfrguide.com/articles/b/'), site)])).toEqual(['TECH_CANONICAL_MISMATCH', 'SD_CANONICAL_MISMATCH']);
  });
  it('off-site / malformed stored value is reported, not silent (page renders self → no SD mismatch)', () => {
    const site = ENVS.production;
    const off = analyzeTechnical(inv('https://partner.example/articles/a/'), site);
    expect(codes(off)).toEqual(['TECH_CANONICAL_MISMATCH']);
    expect(off.find((f) => f.ruleCode === 'TECH_CANONICAL_MISMATCH')!.evidence).toMatch(/off-site and is ignored/);
    expect(codes(analyzeStructuredData(inv('https://partner.example/articles/a/'), site))).toEqual([]);
    expect(analyzeTechnical(inv('http://[::1'), site).find((f) => f.ruleCode === 'TECH_CANONICAL_MISMATCH')!.evidence).toMatch(/malformed/);
  });
});
