import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import type { PrismaClient } from '@prisma/client';
import type { Article } from '../types';
import {
  effectiveAlt,
  effectiveCaption,
  buildResponsiveSources,
  IMAGE_SIZES,
} from '../lib/media/imageMeta';
import { ArticleHeader } from '../components/editorial/ArticleHeader';
import { ImageWithCredit } from '../components/ImageWithCredit';
import { EditorialArticleGrid } from '../components/editorial/EditorialArticleGrid';
import { RelatedArticles } from '../components/editorial/RelatedArticles';

/**
 * The media delivery route calls `getActor()`, which reads cookies — impossible
 * outside a request scope. Anonymous is exactly the case the visibility gate
 * must refuse, so it is mocked to return null. `audit` is stubbed with it
 * because `mediaService` imports it from the same module; everything else in
 * the module is the real implementation.
 */
vi.mock('../lib/cms/guard', async (orig) => {
  const actual = await orig<typeof import('../lib/cms/guard')>();
  return { ...actual, getActor: vi.fn(async () => null), audit: vi.fn(async () => {}) };
});

/**
 * MED-01B / MED-01C — image SEO metadata and responsive delivery.
 *
 * The two defects these tests exist to prevent are both "the data was right and
 * the HTML was wrong":
 *
 *   1. ALT text and captions were stored, analysed by the SEO engine, and then
 *      discarded by `ArticleHeader`, which rendered the headline instead.
 *   2. WebP thumb/md/lg derivatives were generated on every upload and never
 *      advertised to a browser.
 *
 * So these assertions are made against RENDERED MARKUP wherever the claim is
 * about delivered HTML, and against the database wherever the claim is about
 * persistence. Asserting on a field's value would have passed happily
 * throughout the period both defects were live.
 */

const TMP = path.join(os.tmpdir(), `nfr-med01bc-${Date.now()}`);
process.env.MEDIA_LOCAL_ROOT = TMP;
process.env.MEDIA_STORAGE_PROVIDER = 'local';

const toUrl = (key: string) => `/api/media/${key}`;

function derivatives(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    thumb: { key: '2026/11/a__thumb.webp', width: 320, height: 180, bytes: 9000 },
    md: { key: '2026/11/a__md.webp', width: 768, height: 432, bytes: 40000 },
    lg: { key: '2026/11/a__lg.webp', width: 1600, height: 900, bytes: 150000 },
    ...over,
  };
}

function article(over: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    slug: 'qualifying-pipeline',
    title: 'The Qualifying Pipeline',
    headline: 'The Qualifying Pipeline',
    deck: '',
    excerpt: 'An editorial excerpt.',
    content: [],
    structuredBody: [],
    category: 'NFR Competition',
    status: 'published',
    workflowStatus: 'published',
    readTime: '5 min read',
    author: { name: 'Staff Writer', role: 'Reporter' },
    publishedAt: 'Nov 1, 2026',
    updatedAt: 'Nov 1, 2026',
    heroImage: '/api/media/2026/11/a.jpg',
    imageCredit: 'Staff Photo',
    takeaways: [],
    tags: [],
    sources: [],
    ...over,
  } as unknown as Article;
}

const heroHtml = (over: Partial<Article> = {}): string =>
  renderToStaticMarkup(React.createElement(ArticleHeader, { article: article(over) }));

// ===========================================================================
// MED-01B — ALT precedence (requirements 1, 2, 3)
// ===========================================================================

describe('MED-01B (1-3) ALT precedence: usage → article → media → fallback', () => {
  it('a per-usage override wins over everything', () => {
    expect(effectiveAlt({ usage: 'Usage alt', article: 'Article alt', media: 'Media alt', fallback: 'Title' }))
      .toEqual({ alt: 'Usage alt', decorative: false, source: 'usage' });
  });

  it('article-level wins over the media default', () => {
    expect(effectiveAlt({ article: 'Article alt', media: 'Media alt', fallback: 'Title' }))
      .toEqual({ alt: 'Article alt', decorative: false, source: 'article' });
  });

  it('the media default is used when nothing more specific is set', () => {
    expect(effectiveAlt({ media: 'Media alt', fallback: 'Title' }))
      .toEqual({ alt: 'Media alt', decorative: false, source: 'media' });
  });

  it('with nothing set the fallback is used AND flagged as a fallback', () => {
    const r = effectiveAlt({ fallback: 'The Qualifying Pipeline' });
    expect(r.alt).toBe('The Qualifying Pipeline');
    expect(r.source).toBe('fallback'); // ← this is what makes IMG_NO_ALT fire
    expect(r.decorative).toBe(false);
  });

  it('null and undefined mean "not set" and do NOT stop the chain', () => {
    expect(effectiveAlt({ usage: null, article: undefined, media: 'Media alt' }).source).toBe('media');
  });

  it('REGRESSION: an empty string is DECORATIVE and stops the chain', () => {
    // The distinction that makes decorative images expressible without a column.
    expect(effectiveAlt({ media: '', fallback: 'Title' })).toEqual({ alt: '', decorative: true, source: 'media' });
    expect(effectiveAlt({ usage: '', media: 'Media alt', fallback: 'Title' }))
      .toEqual({ alt: '', decorative: true, source: 'usage' });
  });

  it('whitespace-only is treated as decorative, not as text', () => {
    expect(effectiveAlt({ media: '   ', fallback: 'Title' }).decorative).toBe(true);
  });

  /**
   * An existing SEO-intelligence test caught this: decorative is only
   * expressible where the save path PRESERVES an empty string — the asset and
   * the per-usage override. `saveArticle` stores `imageAltText || null`, so an
   * empty article field is emptiness rather than a decision, and the callers
   * normalise it to null before consulting the chain.
   */
  it('REGRESSION: an empty ARTICLE-level field is normalised to unset by callers, not decorative', () => {
    // The helper itself is level-agnostic …
    expect(effectiveAlt({ article: '', media: 'Media alt' }).decorative).toBe(true);
    // … so callers pass `|| null`, which is what keeps IMG_NO_ALT firing.
    const articleLevel = '' as string;
    expect(effectiveAlt({ article: articleLevel || null, media: 'Media alt' })).toEqual({
      alt: 'Media alt', decorative: false, source: 'media',
    });
    expect(effectiveAlt({ article: articleLevel || null, fallback: 'Title' }).source).toBe('fallback');
  });

  it('values are trimmed', () => {
    expect(effectiveAlt({ media: '  A bull rider mid-ride  ' }).alt).toBe('A bull rider mid-ride');
  });
});

// ===========================================================================
// MED-01B — caption (requirement 4)
// ===========================================================================

describe('MED-01B (4) caption precedence, and no invented captions', () => {
  it('follows the same precedence', () => {
    expect(effectiveCaption({ usage: 'U', article: 'A', media: 'M' })).toBe('U');
    expect(effectiveCaption({ article: 'A', media: 'M' })).toBe('A');
    expect(effectiveCaption({ media: 'M' })).toBe('M');
  });

  it('REGRESSION: with nothing set there is NO caption — none is generated', () => {
    expect(effectiveCaption({})).toBeUndefined();
    expect(effectiveCaption({ usage: null, article: null, media: null })).toBeUndefined();
  });

  it('an explicitly cleared caption stays cleared', () => {
    expect(effectiveCaption({ article: '', media: 'M' })).toBeUndefined();
  });
});

// ===========================================================================
// MED-01B — rendered hero HTML (requirements 5, 6)
// ===========================================================================

describe('MED-01B (5) article hero renders the editorial ALT, not the headline', () => {
  it('REGRESSION: the media/article ALT reaches the alt attribute', () => {
    const html = heroHtml({ heroImageAlt: 'A bull rider leaves the chute at the Thomas & Mack' });
    expect(html).toContain('alt="A bull rider leaves the chute at the Thomas &amp; Mack"');
    expect(html).not.toContain('alt="The Qualifying Pipeline"');
  });

  it('a decorative hero emits an EMPTY alt attribute, not the headline', () => {
    const html = heroHtml({ heroImageAlt: '', heroImageDecorative: true });
    expect(html).toContain('alt=""');
    expect(html).not.toContain('alt="The Qualifying Pipeline"');
  });

  it('falls back to the headline only when nothing is resolved at all', () => {
    // An Article assembled outside toArticle (no heroImageAlt field at all).
    expect(heroHtml()).toContain('alt="The Qualifying Pipeline"');
  });

  it('an empty string is never overridden by the fallback (?? not ||)', () => {
    const html = heroHtml({ heroImageAlt: '', imageAltText: 'Should not be used' });
    expect(html).toContain('alt=""');
    expect(html).not.toContain('Should not be used');
  });
});

describe('MED-01B (6) article hero caption', () => {
  it('REGRESSION: the synthesised "Editorial Dispatch:" caption is gone', () => {
    expect(heroHtml({ heroImageCaption: 'Round 7, December 2026.' })).not.toContain('Editorial Dispatch');
    expect(heroHtml()).not.toContain('Editorial Dispatch');
  });

  it('renders the editor’s caption when there is one', () => {
    expect(heroHtml({ heroImageCaption: 'Round 7, December 2026.' })).toContain('Round 7, December 2026.');
  });

  it('renders no caption when nobody wrote one — the credit line still shows', () => {
    const html = heroHtml();
    expect(html).not.toContain('Editorial Dispatch');
    expect(html).toContain('Staff Photo'); // credit is unchanged
  });
});

// ===========================================================================
// MED-01C — responsive sources (requirements 8, 9, 10)
// ===========================================================================

describe('MED-01C (9) derivative selection', () => {
  it('REGRESSION: the stored derivatives become a srcset, smallest first', () => {
    const r = buildResponsiveSources(derivatives(), { key: '2026/11/a.jpg', width: 4000 }, toUrl);
    expect(r.widths).toEqual([320, 768, 1600]);
    expect(r.srcSet).toBe(
      '/api/media/2026/11/a__thumb.webp 320w, /api/media/2026/11/a__md.webp 768w, /api/media/2026/11/a__lg.webp 1600w',
    );
  });

  it('a very large original is NOT offered — the lg derivative is the ceiling', () => {
    // 8000px original vs 1600px largest derivative: beyond the 2x cap.
    const r = buildResponsiveSources(derivatives(), { key: '2026/11/a.jpg', width: 8000 }, toUrl);
    expect(r.widths).toEqual([320, 768, 1600]);
    expect(r.srcSet).not.toContain('8000w');
  });

  it('a modest original IS offered, so a small upload is not served at 320px', () => {
    // 600px original → the pipeline only produces a thumb; without the original
    // in the candidate list the browser would pick 320px for a full-width hero.
    const r = buildResponsiveSources(
      { thumb: { key: '2026/11/s__thumb.webp', width: 320, height: 180, bytes: 9000 } },
      { key: '2026/11/s.jpg', width: 600 },
      toUrl,
    );
    expect(r.widths).toEqual([320, 600]);
    expect(r.srcSet).toContain('/api/media/2026/11/s.jpg 600w');
  });

  it('every candidate URL goes through the gated media proxy', () => {
    const r = buildResponsiveSources(derivatives(), { key: '2026/11/a.jpg', width: 2000 }, toUrl);
    for (const part of (r.srcSet ?? '').split(', ')) expect(part).toMatch(/^\/api\/media\//);
    expect(r.srcSet).not.toContain('r2.cloudflarestorage.com');
  });

  it('duplicate widths are collapsed (a repeated width makes srcset invalid)', () => {
    const r = buildResponsiveSources(
      {
        thumb: { key: 'a__thumb.webp', width: 320, height: 180, bytes: 1 },
        md: { key: 'a__md.webp', width: 320, height: 180, bytes: 1 },
        lg: { key: 'a__lg.webp', width: 1600, height: 900, bytes: 1 },
      },
      { key: 'a.jpg', width: 1600 },
      toUrl,
    );
    expect(r.widths).toEqual([320, 1600]);
  });
});

describe('MED-01C (10) missing or malformed derivatives fall back safely', () => {
  it.each([[null], [undefined], [{}], ['nonsense'], [42]])('no srcset for %j', (d) => {
    expect(buildResponsiveSources(d, { key: 'a.jpg', width: 1200 }, toUrl)).toEqual({ widths: [] });
  });

  it('malformed entries are skipped rather than emitted', () => {
    const r = buildResponsiveSources(
      { thumb: { key: '', width: 320 }, md: { width: 768 }, lg: { key: 'a__lg.webp', width: 1600, height: 900, bytes: 1 } },
      { key: 'a.jpg', width: 1700 },
      toUrl,
    );
    // Only lg is usable; with the original that is two candidates.
    expect(r.widths).toEqual([1600, 1700]);
  });

  it('a single candidate produces NO srcset (it would pin one size)', () => {
    const r = buildResponsiveSources(
      { thumb: { key: 'a__thumb.webp', width: 320, height: 180, bytes: 1 } },
      { key: 'a.jpg', width: 320 },
      toUrl,
    );
    expect(r.srcSet).toBeUndefined();
  });

  it('a legacy asset with no derivatives renders from src alone, never broken', () => {
    const html = heroHtml({ heroImage: '/assets/images/legacy.jpg', heroImageSrcSet: undefined });
    expect(html).toContain('src="/assets/images/legacy.jpg"');
    // Case-insensitive: renderToStaticMarkup emits camelCase `srcSet=`, so a
    // lowercase-only check would pass even if a srcset were present.
    expect(html).not.toMatch(/srcset=/i);
    expect(html).not.toMatch(/sizes=/i);
  });
});

describe('MED-01C (8) srcset and sizes reach the HTML', () => {
  const srcSet = '/api/media/2026/11/a__md.webp 768w, /api/media/2026/11/a__lg.webp 1600w';

  it('REGRESSION: the hero advertises the derivatives and declares its sizes', () => {
    const html = heroHtml({ heroImageSrcSet: srcSet, heroImageWidth: 1600, heroImageHeight: 900 });
    expect(html).toMatch(/srcset="\/api\/media\/2026\/11\/a__md\.webp 768w, \/api\/media\/2026\/11\/a__lg\.webp 1600w"/i);
    expect(html).toContain(`sizes="${IMAGE_SIZES.hero}"`);
    expect(html).toContain('width="1600"');
    expect(html).toContain('height="900"');
  });

  it('sizes is omitted when there is no srcset (it would be meaningless)', () => {
    const html = heroHtml({ heroImageWidth: 1600 });
    expect(html).not.toMatch(/sizes=/i);
  });

  it('cards advertise the same derivatives with card-appropriate sizes', () => {
    const arts = [article({ heroImageSrcSet: srcSet, heroImageAlt: 'Card alt', heroImageWidth: 1600, heroImageHeight: 900 })];
    for (const C of [EditorialArticleGrid, RelatedArticles]) {
      const html = renderToStaticMarkup(React.createElement(C as never, { articles: arts } as never));
      expect(html).toMatch(/srcset=/i);
      expect(html).toContain(`sizes="${IMAGE_SIZES.card}"`);
      expect(html).toContain('alt="Card alt"');
    }
  });
});

// ===========================================================================
// MED-01C — loading priority (requirements 11, 12)
// ===========================================================================

describe('MED-01C (11) the hero is the prioritised LCP image', () => {
  it('REGRESSION: the hero loads eagerly at high fetch priority', () => {
    const html = heroHtml();
    expect(html).toContain('loading="eager"');
    expect(html).toMatch(/fetchpriority="high"/i);
    expect(html).not.toContain('loading="lazy"');
  });

  it('the priority prop is actually wired (it used to be declared and ignored)', () => {
    const on = renderToStaticMarkup(React.createElement(ImageWithCredit, { src: '/x.jpg', alt: 'a', priority: true }));
    const off = renderToStaticMarkup(React.createElement(ImageWithCredit, { src: '/x.jpg', alt: 'a' }));
    expect(on).toMatch(/fetchpriority="high"/i);
    expect(off).not.toMatch(/fetchpriority/i);
    expect(on).not.toBe(off);
  });
});

describe('MED-01C (12) everything below the fold is lazy', () => {
  it('cards and related articles lazy-load and decode asynchronously', () => {
    const arts = [article({ heroImageAlt: 'Card alt' })];
    for (const C of [EditorialArticleGrid, RelatedArticles]) {
      const html = renderToStaticMarkup(React.createElement(C as never, { articles: arts } as never));
      expect(html).toContain('loading="lazy"');
      expect(html).toContain('decoding="async"');
      expect(html).not.toMatch(/fetchpriority/i);
    }
  });

  it('not every image is marked high priority', () => {
    const html = renderToStaticMarkup(
      React.createElement(EditorialArticleGrid as never, { articles: [article(), article(), article()] } as never),
    );
    expect(html.match(/fetchpriority/gi)).toBeNull();
  });
});

// ===========================================================================
// Delivery URL parity — the mapper must not invent a different URL shape
// ===========================================================================

describe('MED-01C the mapper’s media URL matches the storage adapter’s', () => {
  it('both produce the same gated proxy path', async () => {
    const { S3StorageAdapter } = await import('../lib/media/storage/s3');
    const key = '2026/11/a__md.webp';
    expect(new S3StorageAdapter('r2').publicUrl(key)).toBe(toUrl(key));
  });
});

// ===========================================================================
// DB-gated: persistence, mapper resolution, SEO engine, delivery gate
// ===========================================================================

let dbAvailable = false;
let prisma: PrismaClient;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
}

const dbSuite = dbAvailable ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

dbSuite('MED-01B (1,4,7) metadata persistence, decorative and reload', () => {
  const ids: string[] = [];
  const users: string[] = [];
  let actor: { id: string; roles: ['administrator'] };
  let media: typeof import('../lib/cms/mediaService');

  beforeAll(async () => {
    media = await import('../lib/cms/mediaService');
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'administrator' } });
    const u = await prisma.user.create({ data: { email: `med01bc-${rid()}@example.com`, name: 'BC', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    users.push(u.id);
    actor = { id: u.id, roles: ['administrator'] };
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.mediaAsset.deleteMany({ where: { id: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  async function asset(over: Record<string, unknown> = {}): Promise<string> {
    const row = await prisma.mediaAsset.create({
      data: {
        storageKey: `2026/11/${rid()}-${Date.now()}.jpg`, url: '/api/media/x.jpg', filename: 'x.jpg',
        mimeType: 'image/jpeg', width: 1600, height: 900, bytes: 1234, format: 'jpeg', extension: 'jpg',
        storageProvider: 'local', visibility: 'DRAFT', processingStatus: 'READY', ...over,
      },
      select: { id: true },
    });
    ids.push(row.id);
    return row.id;
  }

  it('ALT text and caption persist and reload', async () => {
    const id = await asset();
    await media.updateMediaMetadata(actor, id, { altText: 'A saddle bronc rider', caption: 'Round 7' });
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
    expect(row.altText).toBe('A saddle bronc rider');
    expect(row.caption).toBe('Round 7');
  });

  it('REGRESSION: saving an EMPTY alt stores "" (decorative), not null', async () => {
    const id = await asset({ altText: 'was descriptive' });
    await media.updateMediaMetadata(actor, id, { altText: '' });
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
    expect(row.altText).toBe(''); // the editor's decision survives
    expect(row.altText).not.toBeNull();
    expect(effectiveAlt({ media: row.altText, fallback: 'Title' }).decorative).toBe(true);
  });

  it('null clears ALT back to unset, which is a different state', async () => {
    const id = await asset({ altText: '' });
    await media.updateMediaMetadata(actor, id, { altText: null });
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
    expect(row.altText).toBeNull();
    expect(effectiveAlt({ media: row.altText, fallback: 'Title' }).source).toBe('fallback');
  });

  it('every other field still clears on an empty string', async () => {
    const id = await asset({ caption: 'something', credit: 'someone' });
    await media.updateMediaMetadata(actor, id, { caption: '', credit: '' });
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
    expect(row.caption).toBeNull();
    expect(row.credit).toBeNull();
  });

  it('a partial update never wipes neighbouring fields', async () => {
    const id = await asset({ altText: 'keep me', credit: 'keep me too' });
    await media.updateMediaMetadata(actor, id, { title: 'New title' });
    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
    expect(row.title).toBe('New title');
    expect(row.altText).toBe('keep me');
    expect(row.credit).toBe('keep me too');
  });

  it('RBAC is unchanged: a role without media.edit cannot write metadata', async () => {
    const id = await asset();
    await expect(
      media.updateMediaMetadata({ id: actor.id, roles: ['contributor'] as never }, id, { altText: 'nope' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

dbSuite('MED-01B/C (2,13,16) toArticle resolves ALT, caption and srcset from the DAM', () => {
  const ids: string[] = [];
  const users: string[] = [];
  const slugs: string[] = [];
  let mediaId = '';
  let articleId = '';
  let mappers: typeof import('../lib/mappers');

  beforeAll(async () => {
    mappers = await import('../lib/mappers');
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'administrator' } });
    const u = await prisma.user.create({ data: { email: `med01bc-map-${rid()}@example.com`, name: 'Map', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    users.push(u.id);

    const key = `2026/11/${rid()}.jpg`;
    const asset = await prisma.mediaAsset.create({
      data: {
        storageKey: key, url: `/api/media/${key}`, filename: 'hero.jpg', mimeType: 'image/jpeg',
        width: 2400, height: 1350, bytes: 500000, format: 'jpeg', extension: 'jpg',
        storageProvider: 'local', visibility: 'PUBLIC', processingStatus: 'READY',
        altText: 'Media-level ALT from the library', caption: 'Media-level caption',
        derivatives: {
          thumb: { key: `${key}__thumb.webp`, width: 320, height: 180, bytes: 9000 },
          md: { key: `${key}__md.webp`, width: 768, height: 432, bytes: 40000 },
          lg: { key: `${key}__lg.webp`, width: 1600, height: 900, bytes: 150000 },
        },
      },
      select: { id: true, url: true },
    });
    mediaId = asset.id;
    ids.push(asset.id);

    const category = await prisma.category.findFirstOrThrow();
    const author = await prisma.author.findFirstOrThrow();
    const slug = `med01bc-${rid()}`;
    slugs.push(slug);
    const art = await prisma.article.create({
      data: {
        slug, title: 'A Headline That Must Not Become ALT Text',
        excerpt: 'An excerpt long enough to be realistic for this mapper test case.',
        categoryId: category.id, authorId: author.id, articleType: 'ANALYSIS', workflowStatus: 'PUBLISHED',
        publishedAt: new Date(), heroImageUrl: asset.url, imageCredit: 'Staff Photo',
      },
      select: { id: true },
    });
    articleId = art.id;
    await prisma.articleMedia.create({ data: { articleId: art.id, usageKey: 'hero', mediaId: asset.id, sortOrder: 0 } });
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.articleMedia.deleteMany({ where: { mediaId: { in: ids } } });
    await prisma.article.deleteMany({ where: { slug: { in: slugs } } });
    await prisma.mediaAsset.deleteMany({ where: { id: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  const load = async () =>
    mappers.toArticle(
      await prisma.article.findUniqueOrThrow({ where: { id: articleId }, include: mappers.articleInclude }),
    );

  it('REGRESSION: the media-level ALT reaches the public Article object', async () => {
    const a = await load();
    expect(a.heroImageAlt).toBe('Media-level ALT from the library');
    expect(a.heroImageAltSource).toBe('media');
    expect(a.heroImageCaption).toBe('Media-level caption');
  });

  it('REGRESSION: the stored derivatives become a srcset on the public object', async () => {
    const a = await load();
    expect(a.heroImageSrcSet).toContain('__md.webp 768w');
    expect(a.heroImageSrcSet).toContain('__lg.webp 1600w');
    expect(a.heroImageWidth).toBe(2400);
    expect(a.heroImageHeight).toBe(1350);
  });

  it('and all of it reaches the rendered HTML end to end', async () => {
    const html = renderToStaticMarkup(React.createElement(ArticleHeader, { article: await load() }));
    expect(html).toContain('alt="Media-level ALT from the library"');
    expect(html).toContain('Media-level caption');
    expect(html).toMatch(/srcset=/i);
    expect(html).not.toContain('alt="A Headline That Must Not Become ALT Text"');
  });

  it('an article-level ALT overrides the media default', async () => {
    await prisma.article.update({ where: { id: articleId }, data: { imageAltText: 'Article-level ALT' } });
    const a = await load();
    expect(a.heroImageAlt).toBe('Article-level ALT');
    expect(a.heroImageAltSource).toBe('article');
    await prisma.article.update({ where: { id: articleId }, data: { imageAltText: null } });
  });

  it('a per-usage override beats both, and does not touch the media default', async () => {
    await prisma.articleMedia.update({
      where: { articleId_usageKey: { articleId, usageKey: 'hero' } },
      data: { altText: 'Usage-specific ALT', caption: 'Usage-specific caption' },
    });
    const a = await load();
    expect(a.heroImageAlt).toBe('Usage-specific ALT');
    expect(a.heroImageAltSource).toBe('usage');
    expect(a.heroImageCaption).toBe('Usage-specific caption');
    // The reusable default is untouched, so another article still sees it.
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
    expect(asset.altText).toBe('Media-level ALT from the library');
    await prisma.articleMedia.update({
      where: { articleId_usageKey: { articleId, usageKey: 'hero' } },
      data: { altText: null, caption: null },
    });
  });

  it('(13) an article with no DAM link still renders from heroImageUrl alone', async () => {
    const category = await prisma.category.findFirstOrThrow();
    const author = await prisma.author.findFirstOrThrow();
    const slug = `med01bc-legacy-${rid()}`;
    slugs.push(slug);
    const legacy = await prisma.article.create({
      data: {
        slug, title: 'Legacy Article', excerpt: 'A legacy excerpt for the backward-compatibility case.',
        categoryId: category.id, authorId: author.id, articleType: 'ANALYSIS', workflowStatus: 'PUBLISHED',
        publishedAt: new Date(), heroImageUrl: '/assets/images/legacy-hero.jpg',
      },
      select: { id: true },
    });
    const a = mappers.toArticle(
      await prisma.article.findUniqueOrThrow({ where: { id: legacy.id }, include: mappers.articleInclude }),
    );
    expect(a.heroImage).toBe('/assets/images/legacy-hero.jpg');
    expect(a.heroImageSrcSet).toBeUndefined();
    expect(a.heroImageAlt).toBe('Legacy Article'); // fallback, and reported by IMG_NO_ALT
    expect(a.heroImageAltSource).toBe('fallback');
    const html = renderToStaticMarkup(React.createElement(ArticleHeader, { article: a }));
    expect(html).toContain('src="/assets/images/legacy-hero.jpg"');
    expect(html).not.toMatch(/srcset=/i);
  });

  it('(16) the SEO engine judges the SAME effective ALT the renderer uses', async () => {
    const { analyzeImages } = await import('../lib/seo-intel/analyzers');
    const base = {
      // `isPublished` reads `status`, not `workflowStatus` — the inventory shape
      // is its own thing, not the Prisma row.
      id: 'x', slug: 's', title: 'A Headline', status: 'PUBLISHED', publishedAt: new Date(),
      heroImageUrl: '/api/media/2026/11/x.jpg', imageSeoTitle: 'An image SEO title',
    };
    const mk = (articleAlt: string | null, mediaAlt: string | null) => ({
      articles: [{ ...base, imageAltText: articleAlt }],
      mediaByUrl: new Map([[base.heroImageUrl, {
        url: base.heroImageUrl, id: 'm', visibility: 'PUBLIC', rightsConfirmed: true,
        storageProvider: 'r2', altText: mediaAlt, seoTitle: 'T', width: 1600, height: 900,
      }]]),
    });
    const codes = (inv: unknown) => analyzeImages(inv as never).map((f) => f.ruleCode);

    // Nothing set anywhere → the headline stands in → report it.
    expect(codes(mk(null, null))).toContain('IMG_NO_ALT');
    // A media-level default is enough — the renderer will use it.
    expect(codes(mk(null, 'Media ALT'))).not.toContain('IMG_NO_ALT');
    // An article-level value is enough too.
    expect(codes(mk('Article ALT', null))).not.toContain('IMG_NO_ALT');
    // Deliberately decorative on the ASSET is correct markup, not a finding.
    expect(codes(mk(null, ''))).not.toContain('IMG_NO_ALT');
    // But an empty ARTICLE field is emptiness: still reported.
    expect(codes(mk('', null))).toContain('IMG_NO_ALT');
  });
});

dbSuite('MED-01C (14,15) media delivery gate is unchanged', () => {
  const ids: string[] = [];
  let route: typeof import('../app/api/media/[...key]/route');
  let publicKey = '';
  let draftKey = '';

  beforeAll(async () => {
    const { getStorage } = await import('../lib/media/storage');
    const storage = getStorage();
    route = await import('../app/api/media/[...key]/route');
    const bytes = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();

    for (const vis of ['PUBLIC', 'DRAFT'] as const) {
      const key = `2026/11/${rid()}-${vis.toLowerCase()}.jpg`;
      await storage.put(key, bytes, 'image/jpeg');
      const row = await prisma.mediaAsset.create({
        data: {
          storageKey: key, url: `/api/media/${key}`, filename: 'd.jpg', mimeType: 'image/jpeg',
          width: 40, height: 40, bytes: bytes.length, format: 'jpeg', extension: 'jpg',
          storageProvider: 'local', visibility: vis, processingStatus: 'READY',
        },
        select: { id: true },
      });
      ids.push(row.id);
      // The route derives the asset id from the key, so the key must carry it.
      const idKey = `2026/11/${row.id}.jpg`;
      await storage.put(idKey, bytes, 'image/jpeg');
      await prisma.mediaAsset.update({ where: { id: row.id }, data: { storageKey: idKey, url: `/api/media/${idKey}` } });
      if (vis === 'PUBLIC') publicKey = idKey; else draftKey = idKey;
    }
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.mediaAsset.deleteMany({ where: { id: { in: ids } } });
    vi.unstubAllEnvs();
  });

  const get = async (key: string): Promise<Response> => {
    const { NextRequest } = await import('next/server');
    return route.GET(new NextRequest(new Request(`https://nfrguide.com/api/media/${key}`)), {
      params: Promise.resolve({ key: key.split('/') }),
    });
  };

  it('(15) a PUBLIC, READY asset is delivered to anonymous visitors, cacheable', async () => {
    const res = await get(publicKey);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Cache-Control')).toContain('public');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('(14) REGRESSION: a DRAFT asset is NOT served to an anonymous visitor', async () => {
    const res = await get(draftKey);
    expect(res.status).toBe(404);
  });

  it('(14) a key that does not belong to the asset is refused', async () => {
    const res = await get(publicKey.replace(/\.jpg$/, '__forged.webp'));
    expect(res.status).toBe(404);
  });

  it('(14) a traversal key is rejected before any lookup', async () => {
    const res = await get('../../etc/passwd');
    expect([400, 404]).toContain(res.status);
  });
});
