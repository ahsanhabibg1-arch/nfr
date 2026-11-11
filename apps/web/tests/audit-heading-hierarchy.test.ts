import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Article, ContentBlock } from '../types';

/**
 * Full-project audit — heading-hierarchy regression guard.
 *
 * THE DEFECT CLASS. A live audit of every public URL in the sitemap found a
 * skipped heading level (WCAG 1.3.1 / 2.4.6) on 16 of 62 pages — every category
 * archive and most article pages. Three templates were responsible, each
 * emitting a heading two levels below the one before it:
 *
 *   1. `TableOfContents`  — `h3` rendered immediately after the article `h1`,
 *      while the article's own body sections are `h2`  (h1 -> h3).
 *   2. `ArticleBody` callout — `h4` title between `h2` body sections (h2 -> h4).
 *   3. `CategoryArchiveView` — the article grid's `h3` cards rendered directly
 *      after the page `h1`, with no section heading between (h1 -> h3).
 *
 * The homepage form of the same defect was fixed separately in `EditorialHero`
 * and is guarded in `stage08-hero-links.test.ts`.
 *
 * These tests assert on RENDERED markup, because the claim is about delivered
 * HTML. The end-to-end guard across whole pages is `e2e/a11y.spec.ts`, which now
 * also audits a category archive.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const { TableOfContents } = await import('../components/editorial/TableOfContents');
const { ArticleBody } = await import('../components/editorial/ArticleBody');
const { CategoryArchiveView } = await import('../views/CategoryArchiveView');

/** Heading levels in document order. */
function levels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
}
/** Every place a level is skipped, e.g. "h1->h3". */
function jumps(ls: number[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < ls.length; i++) if (ls[i] - ls[i - 1] > 1) out.push(`h${ls[i - 1]}->h${ls[i]}`);
  return out;
}

function article(blocks: ContentBlock[]): Article {
  return {
    id: 'a1', slug: 'a-1', title: 'Headline', deck: 'Deck', excerpt: 'Excerpt',
    category: 'Competition', subcategory: 'Bull Riding', readTime: '5 min read',
    heroImage: '/img/a.jpg', author: { name: 'Reporter', role: 'Staff Writer' },
    structuredBody: blocks,
  } as unknown as Article;
}

function card(id: string, title: string): Article {
  return {
    id, slug: `s-${id}`, title, deck: 'd', excerpt: 'e', category: 'Competition',
    subcategory: 'Bull Riding', readTime: '4 min read', heroImage: '/img/c.jpg',
    articleType: 'News', author: { name: 'Reporter', role: 'Staff Writer' },
  } as unknown as Article;
}

describe('audit — the table of contents does not skip a level under the article h1', () => {
  it('renders its panel heading as h2, not h3', () => {
    const html = renderToStaticMarkup(
      React.createElement(TableOfContents, { items: [{ id: 's1', text: 'Section One', level: 2 }] } as never),
    );
    expect(levels(html)).toEqual([2]);
    expect(html).toMatch(/<h2[^>]*>[\s\S]*Contents of This Guide/);
  });

  it('REGRESSION: an article h1 followed by the contents panel skips nothing', () => {
    const toc = renderToStaticMarkup(
      React.createElement(TableOfContents, { items: [{ id: 's1', text: 'One', level: 2 }] } as never),
    );
    // The real page order: article h1, then the contents panel, then body h2s.
    expect(jumps(levels(`<h1>Headline</h1>${toc}<h2>Body section</h2>`))).toEqual([]);
  });
});

describe('audit — an article-body callout does not skip a level under a body section', () => {
  const blocks = [
    { type: 'heading', level: 2, text: 'Body Section' },
    { type: 'callout', variant: 'takeaway', title: 'Editorial Insight', text: 'Body of the callout.' },
    { type: 'paragraph', text: 'Closing paragraph.' },
  ] as unknown as ContentBlock[];

  it('renders a callout title as h3', () => {
    const html = renderToStaticMarkup(React.createElement(ArticleBody, { article: article(blocks) }));
    expect(html).toMatch(/<h3[^>]*>[\s\S]*Editorial Insight/);
    expect(html).not.toMatch(/<h4[^>]*>[\s\S]*Editorial Insight/);
  });

  it('REGRESSION: no level is skipped between a body section and its callout', () => {
    const html = renderToStaticMarkup(React.createElement(ArticleBody, { article: article(blocks) }));
    expect(levels(html)).toEqual([2, 3]);
    expect(jumps(levels(html))).toEqual([]);
  });

  it('a callout with no title emits no heading at all', () => {
    const untitled = [{ type: 'callout', variant: 'info', text: 'No title here.' }] as unknown as ContentBlock[];
    expect(levels(renderToStaticMarkup(React.createElement(ArticleBody, { article: article(untitled) })))).toEqual([]);
  });
});

describe('audit — a category archive names its listing region', () => {
  const render = (articles: Article[]) =>
    renderToStaticMarkup(
      React.createElement(CategoryArchiveView, {
        articles,
        categoryName: 'NFR Competition',
        description: 'Everything in this section.',
        sectionPath: '/competition/',
      } as never),
    );

  it('REGRESSION: the page h1 is followed by an h2 before the h3 cards', () => {
    const html = render([card('1', 'First Story'), card('2', 'Second Story')]);
    const ls = levels(html);
    expect(ls[0], 'the archive title is the page h1').toBe(1);
    expect(ls[1], 'a section heading must come before the h3 cards').toBe(2);
    expect(jumps(ls)).toEqual([]);
  });

  it('the listing heading is available to assistive technology but not shown', () => {
    const html = render([card('1', 'First Story')]);
    // `sr-only` keeps it out of the visual design while screen readers announce it.
    expect(html).toMatch(/<h2 class="sr-only">Articles in NFR Competition<\/h2>/);
  });

  it('skips nothing when the archive is empty', () => {
    expect(jumps(levels(render([])))).toEqual([]);
  });
});
