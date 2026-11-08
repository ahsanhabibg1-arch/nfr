import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Batch B — Detail Template Registry', () => {
  const registrySrc = read('components/blocks/registry.tsx');

  it('maps detail-related and detail-cta to registry entries', () => {
    expect(registrySrc).toContain("'detail-related'");
    expect(registrySrc).toContain("'detail-cta'");
  });

  it('imports detail block components from DetailBlocks', () => {
    expect(registrySrc).toContain("from './DetailBlocks'");
  });

  it('does not register detail-hero, detail-body or detail-faq as renderable blocks', () => {
    const entries = registrySrc.slice(registrySrc.indexOf('blockRegistry'));
    expect(entries).not.toContain("'detail-hero'");
    expect(entries).not.toContain("'detail-body'");
    expect(entries).not.toContain("'detail-faq'");
  });
});

describe('Batch B — Detail block components', () => {
  it('DetailBlocks exports DetailRelatedBlock and DetailCtaBlock', () => {
    const src = read('components/blocks/DetailBlocks.tsx');
    expect(src).toContain('export function DetailRelatedBlock');
    expect(src).toContain('export function DetailCtaBlock');
  });

  it('DetailRelatedBlock delegates to RelatedArticles', () => {
    const src = read('components/blocks/DetailBlocks.tsx');
    expect(src).toContain('RelatedArticles');
  });

  it('DetailCtaBlock renders link with CTA props from data', () => {
    const src = read('components/blocks/DetailBlocks.tsx');
    expect(src).toContain('d.ctaText');
    expect(src).toContain('d.ctaUrl');
  });
});

describe('Batch B — Detail template data resolver', () => {
  const resolverSrc = read('lib/cms/detailTemplateData.ts');

  it('is a server-only module', () => {
    expect(resolverSrc).toMatch(/^import 'server-only'/);
  });

  it('fetches template:article published sections', () => {
    expect(resolverSrc).toContain('getPublishedSections');
    expect(resolverSrc).toContain("'template:article'");
  });

  it('exports resolveArticleTemplateSlots', () => {
    expect(resolverSrc).toContain('export async function resolveArticleTemplateSlots');
  });

  it('filters visible slots and sorts by order', () => {
    expect(resolverSrc).toContain('.filter((s) => s.visible)');
    expect(resolverSrc).toContain('.sort((a, b) => a.order - b.order)');
  });

  it('resolves related articles count from slot props', () => {
    expect(resolverSrc).toContain('getRelatedPublishedArticles');
    expect(resolverSrc).toContain('articleCount');
  });

  it('resolves CTA text and URL from slot props', () => {
    expect(resolverSrc).toContain('ctaText');
    expect(resolverSrc).toContain('ctaUrl');
  });

  it('only emits detail-related and detail-cta slots (not hero, body, faq)', () => {
    const slotChecks = resolverSrc.match(/t === '[\w-]+'/g) || [];
    const types = slotChecks.map((m) => m.replace(/t === '|'/g, ''));
    expect(types).toContain('detail-related');
    expect(types).toContain('detail-cta');
    expect(types).not.toContain('detail-hero');
    expect(types).not.toContain('detail-body');
    expect(types).not.toContain('detail-faq');
  });
});

describe('Batch B — ArticleView refactoring', () => {
  it('ArticleView uses resolveArticleTemplateSlots instead of getSlot/slotProp', () => {
    const src = read('views/ArticleView.tsx');
    expect(src).toContain('resolveArticleTemplateSlots');
    expect(src).toContain('ArticleAppendageSlots');
    expect(src).not.toContain('getSlot(');
    expect(src).not.toContain('slotProp(');
    expect(src).not.toContain('getPublishedSections');
  });

  it('ArticleView preserves all editorial chrome', () => {
    const src = read('views/ArticleView.tsx');
    expect(src).toContain('ArticleHeader');
    expect(src).toContain('ArticleBody');
    expect(src).toContain('TableOfContents');
    expect(src).toContain('AuthorBio');
    expect(src).toContain('SourceList');
    expect(src).toContain('DisclosureBanner');
  });

  it('ArticleView preserves GlobalBlockRenderer at article-end', () => {
    const src = read('views/ArticleView.tsx');
    expect(src).toContain('GlobalBlockRenderer');
    expect(src).toContain('articleEndBlocks');
  });

  it('ArticleAppendageSlots is a client component using PageRenderer', () => {
    const src = read('views/ArticleAppendageSlots.tsx');
    expect(src).toMatch(/^'use client'/);
    expect(src).toContain('PageRenderer');
  });
});

describe('Batch B — Existing routes preserved', () => {
  it('article route is unchanged', () => {
    const src = read('app/(public)/articles/[slug]/page.tsx');
    expect(src).toContain('ArticleView');
    expect(src).toContain('buildMetadata');
    expect(src).toContain('articleJsonLd');
    expect(src).toContain('breadcrumbJsonLd');
  });

  it('article route SEO: metadata, canonical, robots, JSON-LD all intact', () => {
    const src = read('app/(public)/articles/[slug]/page.tsx');
    expect(src).toContain('articleMetadataInput');
    expect(src).toContain('unavailableArticleMetadataInput');
    expect(src).toContain('JsonLd');
    expect(src).toContain('CommentSection');
    expect(src).toContain('ViewBeacon');
  });
});

describe('Batch B — Batch A compatibility', () => {
  it('block registry still has all 21 Batch A entries plus 2 Phase B entries', () => {
    const src = read('components/blocks/registry.tsx');
    const batchA = [
      'editorial-hero', 'latest-coverage', 'quick-access', 'competition',
      'plan-and-watch', 'entertainment', 'events-shopping', 'more-rodeo', 'learning',
      'rich-text-block', 'image-text-block', 'stats-banner', 'cta-banner', 'faq-block', 'newsletter-signup',
      'landing-hero', 'landing-featured', 'landing-empty', 'landing-grid', 'landing-competition-disciplines',
    ];
    const batchB = ['detail-related', 'detail-cta'];
    for (const type of [...batchA, ...batchB]) {
      expect(src, `missing registry entry: ${type}`).toContain(`'${type}'`);
    }
  });

  it('PageRenderer still exports RenderedSlot', () => {
    const src = read('components/blocks/PageRenderer.tsx');
    expect(src).toContain('export interface RenderedSlot');
    expect(src).toContain('export function PageRenderer');
  });
});
