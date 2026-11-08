import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildRouteIndex, resolveRoute, classifyLink, extractLinkCandidates, routeFirstSegments,
  safeNormalizePath, STATIC_PUBLIC_ROUTES, type RouteIndexInput,
} from '../lib/seo/routeIndex';
import { evaluateSitemap, type SitemapCandidate } from '../lib/seo/sitemapEntries';
import type { SeoSubject } from '../lib/seo/policy';
import { analyzeInternalLinks, analyzeTechnical, type Inventory, type ArticleInv } from '../lib/seo-intel/analyzers';
import { PRIMARY_SECTIONS } from '../config/routes';
import { LEGAL_PAGES } from '../config/legalPages';

/** Batch S / S6 — route validation, sitemap audit and link checks. Pure; no DB, no network. */

const SITE = 'http://localhost:3000';
const cand = (subject: Partial<SeoSubject> & { path: string }, family: string): SitemapCandidate =>
  ({ subject: { published: true, ...subject }, family, changeFrequency: 'weekly', priority: 0.5 });

/** A small site: one of every route family, with real S4 outcomes. */
function site() {
  const sitemap = evaluateSitemap([
    cand({ path: '/' }, 'home'),
    cand({ path: '/competition/' }, 'section'),
    cand({ path: '/plan-watch/', editorNoindex: true }, 'section'),
    cand({ path: '/categories/nfr-competition/' }, 'category'),
    cand({ path: '/disciplines/bull-riding/' }, 'discipline'),
    cand({ path: '/articles/live/' }, 'article'),
    cand({ path: '/articles/noindexed/', storedRobots: 'noindex, follow' }, 'article'),
    cand({ path: '/articles/away/', canonical: `${SITE}/articles/live/` }, 'article'),
    cand({ path: '/rodeo-events/hub-full/' }, 'rodeo-hub'),
    cand({ path: '/rodeo-events/texas-thin/', contentEligible: false }, 'rodeo-hub'),
    cand({ path: '/rodeo-events/cheyenne/' }, 'rodeo-event'),
    cand({ path: '/rodeo-events/cheyenne/2026/' }, 'rodeo-edition'),
    cand({ path: '/rodeo-events/cheyenne/2026/results/' }, 'coverage'),
    cand({ path: '/competitors/' }, 'directory'),
    cand({ path: '/venues/' }, 'directory'),
    cand({ path: '/venues/arena/' }, 'venue'),
    cand({ path: '/competitors/rider/' }, 'competitor'),
    cand({ path: '/about/', contentEligible: false }, 'legal'),
  ], SITE);
  const input: RouteIndexInput = {
    sitemap,
    articles: [
      { slug: 'live', status: 'PUBLISHED' }, { slug: 'noindexed', status: 'PUBLISHED' }, { slug: 'away', status: 'PUBLISHED' },
      { slug: 'draft-piece', status: 'DRAFT' }, { slug: 'fixture-x', status: 'PUBLISHED', hiddenFixture: true },
    ],
    venueSlugs: ['arena', 'thin-venue'],
    competitorSlugs: ['rider', 'thin-rider'],
    categorySlugs: ['nfr-competition', 'other-cat'],
    editions: [{ eventSlug: 'cheyenne', editionSlug: '2026' }],
    redirects: new Map([['/articles/old-slug/', '/articles/live/']]),
  };
  return { sitemap, index: buildRouteIndex(input) };
}

describe('S6 — route index: every public route family resolves with its real outcome', () => {
  const { index } = site();
  it.each([
    ['/', 'indexable'], ['/competition/', 'indexable'], ['/plan-watch/', 'noindex'],
    ['/categories/nfr-competition/', 'indexable'], ['/categories/other-cat/', 'indexable'],
    ['/disciplines/bull-riding/', 'indexable'],
    ['/articles/live/', 'indexable'], ['/articles/noindexed/', 'noindex'], ['/articles/away/', 'canonical-away'],
    ['/articles/draft-piece/', 'unpublished'], ['/articles/fixture-x/', 'unpublished'],
    ['/rodeo-events/hub-full/', 'indexable'], ['/rodeo-events/texas-thin/', 'noindex'],
    ['/rodeo-events/cheyenne/', 'indexable'], ['/rodeo-events/cheyenne/2026/', 'indexable'],
    ['/rodeo-events/cheyenne/2026/results/', 'indexable'], ['/rodeo-events/cheyenne/2026/schedule/', 'noindex'],
    ['/competitors/', 'indexable'], ['/venues/', 'indexable'],
    ['/venues/arena/', 'indexable'], ['/venues/thin-venue/', 'noindex'],
    ['/competitors/rider/', 'indexable'], ['/competitors/thin-rider/', 'noindex'],
    ['/about/', 'noindex'], ['/search/', 'noindex'], ['/login/', 'noindex'], ['/account/', 'protected'],
    ['/articles/old-slug/', 'redirect'],
    ['/admin/articles/', 'not-public'], ['/api/media/x', 'not-public'],
    ['/articles/missing/', 'not-found'], ['/rodeo-events/nope/', 'not-found'], ['/categories/made-up/', 'not-found'],
  ])('%s → %s', (p, status) => {
    expect(resolveRoute(index, p).status).toBe(status);
  });

  it('normalises trailing slash, query, fragment and encoding before lookup', () => {
    expect(resolveRoute(index, '/articles/live').status).toBe('indexable');
    expect(resolveRoute(index, '/articles/live/?utm=x#top').status).toBe('indexable');
    expect(resolveRoute(index, '//articles//live//').status).toBe('indexable');
    expect(resolveRoute(index, '/venues/%61rena/').status).toBe('indexable'); // %61 = "a"
    expect(resolveRoute(index, '/articles/%E0%A4%A/').status).toBe('invalid');
    expect(safeNormalizePath('/sitemap.xml')).toBe('/sitemap.xml');
  });

  it('noindex is a valid route, not a 404', () => {
    expect(resolveRoute(index, '/rodeo-events/texas-thin/').status).not.toBe('not-found');
  });
});

describe('S6 — every static app/(public) route is covered (no hand-list drift)', () => {
  it('each static public page folder maps to an S4 candidate or STATIC_PUBLIC_ROUTES', () => {
    const root = path.join(__dirname, '..', 'app', '(public)');
    const staticPages: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name.startsWith('[')) continue;
        const r = `${rel}${e.name}/`;
        if (fs.existsSync(path.join(dir, e.name, 'page.tsx'))) staticPages.push(r);
        walk(path.join(dir, e.name), r);
      }
    };
    walk(root, '/');
    const covered = new Set<string>([
      '/', '/competitors/', '/venues/',
      ...Object.values(PRIMARY_SECTIONS).map((s) => s.path),
      ...LEGAL_PAGES.map((p) => p.path),
      ...STATIC_PUBLIC_ROUTES.map((r) => r.path),
    ]);
    expect(staticPages.length).toBeGreaterThan(10);
    expect(staticPages.filter((p) => !covered.has(p))).toEqual([]);
  });
});

describe('S6 — classifyLink (environment-aware, no network)', () => {
  it.each([
    ['/articles/live/', SITE, 'internal'],
    ['/articles/live', SITE, 'internal'],
    ['https://nfrguide.com/articles/live/', SITE, 'internal'],          // production host under localhost
    ['https://www.nfrguide.com/articles/live/', SITE, 'internal'],
    ['https://nfrguide-staging.onrender.com/x/', 'https://nfrguide-staging.onrender.com', 'internal'], // staging on staging
    ['https://nfrguide-staging.onrender.com/x/', SITE, 'external'],     // staging host is not this site in dev
    ['https://prca.com/articles/foo/', SITE, 'external'],
    ['mailto:desk@nfrguide.com', SITE, 'non-web'],
    ['tel:+15555550100', SITE, 'non-web'],
    ['javascript:alert(1)', SITE, 'unsafe'],
    ['data:text/html,x', SITE, 'unsafe'],
    ['http://[::1', SITE, 'invalid'],
    ['/articles/%E0%A4%A/', SITE, 'invalid'],
    ['   ', SITE, 'invalid'],
  ])('%s (site %s) → %s', (raw, siteUrl, kind) => {
    expect(classifyLink(raw, siteUrl).kind).toBe(kind);
  });

  it('flags links that needed normalisation but resolves them to the canonical path', () => {
    expect(classifyLink('https://nfrguide.com/articles/live?ref=x#y', SITE)).toEqual({ kind: 'internal', path: '/articles/live/', normalized: true });
    expect(classifyLink('/articles/live/', SITE)).toEqual({ kind: 'internal', path: '/articles/live/', normalized: false });
  });
});

describe('S6 — extractLinkCandidates', () => {
  const { index } = site();
  const segs = routeFirstSegments(index);
  it('takes absolute URLs whole and never treats a path inside an external URL as internal', () => {
    expect(extractLinkCandidates('Source: https://prca.com/articles/foo/ (official).', segs)).toEqual(['https://prca.com/articles/foo/']);
  });
  it('finds site-relative paths at word boundaries for known route families only', () => {
    expect(extractLinkCandidates('See /venues/arena/ and /rodeo-events/cheyenne. Also 24/7 and and/or.', segs))
      .toEqual(['/venues/arena/', '/rodeo-events/cheyenne']);
    expect(extractLinkCandidates('("/articles/live/")', segs)).toEqual(['/articles/live/']);
    expect(extractLinkCandidates('Visit /unknown-family/x/', segs)).toEqual([]);
  });
});

function art(slug: string, links: string[], over: Partial<ArticleInv> = {}): ArticleInv {
  return {
    id: slug, slug, title: slug, excerpt: 'e', status: 'PUBLISHED', categoryId: 'c', categoryName: 'C', authorName: 'W', createdById: null,
    heroImageUrl: '/h.jpg', publishedAt: new Date('2026-10-01'), robots: 'index, follow', seoTitle: 't', metaDescription: 'd',
    canonicalUrl: `https://nfrguide.com/articles/${slug}/`, ogImage: null, imageAltText: 'a', imageSeoTitle: 's', headings: [], bodyWords: 100,
    internalLinks: links, disciplineSlugs: [], hubIds: [], eventIds: [], editions: [], sourceCount: 1, relatedIds: [], ...over,
  };
}
function inventory(articles: ArticleInv[], extra: Partial<Inventory> = {}): Inventory {
  const { sitemap, index } = site();
  return {
    articles, articleStatusBySlug: new Map(articles.map((a) => [a.slug, a.status])), validPaths: new Set(), redirectSources: new Map([['/articles/old-slug/', '/articles/live/']]),
    routes: index, sitemap: { urls: new Set(sitemap.included.map((c) => c.subject.path)), duplicates: [] },
    hubs: [], events: [], editions: [], disciplines: [], venues: [], categories: [], mediaByUrl: new Map(), currentYear: 2026, ...extra,
  };
}
const byCode = (fs: { ruleCode: string; evidence: string }[], code: string) => fs.filter((f) => f.ruleCode === code);

describe('S6 — LINK_BROKEN: valid destinations are not broken; real breakage is', () => {
  const valid = [
    '/articles/live/', '/articles/live', 'https://nfrguide.com/articles/live/', '/articles/live/?a=1#b',
    '/rodeo-events/cheyenne/', '/rodeo-events/cheyenne/2026/', '/rodeo-events/cheyenne/2026/schedule/',
    '/rodeo-events/texas-thin/', '/articles/noindexed/', '/venues/thin-venue/', '/competitors/rider/',
    '/search/', '/about/', '/account/', 'https://prca.com/articles/foo/', 'mailto:x@nfrguide.com',
  ];
  it.each(valid)('%s → no LINK_BROKEN / LINK_TO_UNPUBLISHED', (link) => {
    const f = analyzeInternalLinks(inventory([art('live', []), art('src', [link])]), SITE);
    expect(byCode(f, 'LINK_BROKEN')).toEqual([]);
    expect(byCode(f, 'LINK_TO_UNPUBLISHED')).toEqual([]);
  });

  it.each([
    ['/articles/missing/', 'LINK_BROKEN'],
    ['/rodeo-events/no-such-event/', 'LINK_BROKEN'],
    ['/categories/made-up/', 'LINK_BROKEN'],
    ['/admin/articles/', 'LINK_BROKEN'],
    ['javascript:alert(1)', 'LINK_BROKEN'],
    ['/articles/%E0%A4%A/', 'LINK_BROKEN'],
    ['/articles/draft-piece/', 'LINK_TO_UNPUBLISHED'],
    ['/articles/fixture-x/', 'LINK_TO_UNPUBLISHED'],
    ['/articles/old-slug/', 'LINK_REDIRECTED'],
  ])('%s → %s', (link, code) => {
    const f = analyzeInternalLinks(inventory([art('live', []), art('src', [link])]), SITE);
    expect(byCode(f, code)).toHaveLength(1);
  });

  it('a valid internal link still counts as an inbound link (orphan detection unchanged)', () => {
    const f = analyzeInternalLinks(inventory([art('live', []), art('src', ['https://nfrguide.com/articles/live'])]), SITE);
    expect(f.filter((x) => x.ruleCode === 'LINK_ORPHAN').map((x) => x.entityId)).toEqual(['src']);
  });
});

describe('S6 — TECH_SITEMAP_EXCLUDED agrees with S4 evaluateSitemap', () => {
  const sitemapCodes = (articles: ArticleInv[], urls?: string[]) => {
    const inv = inventory(articles);
    if (urls) inv.sitemap = { urls: new Set(urls), duplicates: [] };
    return byCode(analyzeTechnical(inv, SITE), 'TECH_SITEMAP_EXCLUDED');
  };
  it('listed, eligible article → no finding', () => {
    expect(sitemapCodes([art('live', [])])).toEqual([]);
  });
  it('correctly excluded (noindex, canonical-away, hidden fixture) → no finding', () => {
    expect(sitemapCodes([art('noindexed', [], { robots: 'noindex, follow' })])).toEqual([]);
    expect(sitemapCodes([art('away', [], { canonicalUrl: 'https://nfrguide.com/articles/live/' })])).toEqual([]);
    expect(sitemapCodes([art('fixture-x', [], { hiddenFixture: true })])).toEqual([]);
  });
  it('unpublished articles are not evaluated', () => {
    expect(sitemapCodes([art('draft-piece', [], { status: 'DRAFT' })])).toEqual([]);
  });
  it('eligible but missing from the actual sitemap → finding with evidence', () => {
    const f = sitemapCodes([art('live', [])], ['/']);
    expect(f).toHaveLength(1);
    expect(f[0].evidence).toMatch(/missing from the sitemap.*robots index, follow.*canonical self.*expected listed.*actual not listed/);
  });
  it('listed but excluded by the page policy → finding', () => {
    const f = sitemapCodes([art('noindexed', [], { robots: 'noindex, nofollow' })], ['/articles/noindexed/']);
    expect(f).toHaveLength(1);
    expect(f[0].evidence).toMatch(/listed in the sitemap but the page policy excludes it.*stored-robots-noindex/);
  });
  it('duplicate sitemap URL → finding', () => {
    const inv = inventory([]);
    inv.sitemap = { urls: new Set(), duplicates: [{ path: '/rodeo-events/x/', family: 'rodeo-hub' }] };
    expect(byCode(analyzeTechnical(inv, SITE), 'TECH_SITEMAP_EXCLUDED').map((f) => f.evidence)).toEqual([expect.stringMatching(/Duplicate sitemap URL \/rodeo-events\/x\//)]);
  });
  it('without sitemap state (hand-built inventory) the check is skipped, never tautological', () => {
    const inv = inventory([art('live', [])]); delete inv.sitemap;
    expect(byCode(analyzeTechnical(inv, SITE), 'TECH_SITEMAP_EXCLUDED')).toEqual([]);
  });
  it('real S4 output for the sample site produces no false positives', () => {
    const arts = [art('live', []), art('noindexed', [], { robots: 'noindex, follow' }), art('away', [], { canonicalUrl: `${SITE}/articles/live/` })];
    expect(sitemapCodes(arts)).toEqual([]);
  });
});

describe('S6 — TECH_REDIRECT_TARGET_UNKNOWN uses the route index', () => {
  it('redirect to a valid hub page is not "unknown"; to a missing page is', () => {
    const inv = inventory([], { redirectSources: new Map([['/old-a/', '/rodeo-events/hub-full/'], ['/old-b/', '/rodeo-events/missing/']]) });
    const f = byCode(analyzeTechnical(inv, SITE), 'TECH_REDIRECT_TARGET_UNKNOWN');
    expect(f.map((x) => (x as { entityId?: string }).entityId)).toEqual(['/old-b/']);
  });
});
