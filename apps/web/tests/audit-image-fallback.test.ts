import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Article } from '../types';

/**
 * D-A3 — a missing hero image must never render an `<img>` without a `src`.
 *
 * `Article.heroImage` is optional at publication, so an editor can publish an
 * article with no image. `ImageWithCredit` already had a fallback panel, but it
 * was only reachable through the `onError` handler — and a browser fires no
 * error event for an `<img>` that has no `src` attribute at all, so a card with
 * a blank image rendered a permanently broken image instead.
 *
 * Verified in a real browser before the fix: 4 broken images on the homepage,
 * 1 on a section page and 1 on a category page of the fixture instance (real
 * content had none, because every real article has an image).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const { ImageWithCredit } = await import('../components/ImageWithCredit');
const { EditorialHero } = await import('../components/sections/EditorialHero');

const imgTags = (html: string) => [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);

describe('D-A3 — ImageWithCredit never emits an img without a src', () => {
  for (const [label, src] of [['empty string', ''], ['whitespace only', '   ']] as const) {
    it(`renders the fallback panel for ${label}`, () => {
      const html = renderToStaticMarkup(
        React.createElement(ImageWithCredit, { src, alt: 'Round one recap' }),
      );
      expect(imgTags(html), 'no <img> may be emitted without a usable src').toEqual([]);
      expect(html, 'the existing fallback panel is used').toContain('Image unavailable');
      expect(html, 'the real alt text is still offered to the reader').toContain('Round one recap');
    });
  }

  it('still renders the image when there is one, unchanged', () => {
    const html = renderToStaticMarkup(
      React.createElement(ImageWithCredit, { src: '/img/round-one.jpg', alt: 'Round one recap' }),
    );
    const tags = imgTags(html);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('src="/img/round-one.jpg"');
    expect(tags[0]).toContain('alt="Round one recap"');
    expect(html).not.toContain('Image unavailable');
  });

  it('keeps the caption and credit behaviour intact when the image is missing', () => {
    const html = renderToStaticMarkup(
      React.createElement(ImageWithCredit, { src: '', alt: 'A', credit: 'Staff Photographer', caption: 'In the chutes' }),
    );
    expect(html).toContain('Staff Photographer');
    expect(html).toContain('In the chutes');
  });

  it('invents no placeholder artwork', () => {
    const html = renderToStaticMarkup(React.createElement(ImageWithCredit, { src: '', alt: 'A' }));
    expect(html).not.toMatch(/\.(jpe?g|png|webp|avif|gif)/i);
  });
});

/* ── The homepage hero renders its own <img> tags directly ──────────── */

function article(over: Record<string, unknown> = {}): Article {
  return {
    id: 'a1', slug: 'round-one', title: 'Round One Recap', deck: 'Deck', excerpt: 'Excerpt',
    category: 'Competition', subcategory: 'Bull Riding', readTime: '5 min read',
    heroImage: '/img/hero.jpg', imageCredit: 'Credit',
    author: { name: 'Reporter', role: 'Staff Writer' }, ...over,
  } as unknown as Article;
}

describe('D-A3 — the homepage hero omits its image layers when there is none', () => {
  const render = (lead: Article, secondary: Article[]) =>
    renderToStaticMarkup(
      React.createElement(EditorialHero, { leadArticle: lead, secondaryStories: secondary } as never),
    );

  it('emits no img for a lead article with no hero image', () => {
    const html = render(article({ heroImage: '' }), []);
    expect(imgTags(html)).toEqual([]);
  });

  it('emits no img for a secondary story with no hero image, but keeps the card', () => {
    const html = render(article(), [article({ id: 'b', slug: 'second', title: 'Second Story', heroImage: '' })]);
    expect(imgTags(html)).toHaveLength(1); // the lead's image only
    expect(html, 'the card itself still renders').toContain('Second Story');
  });

  it('every emitted img has a non-empty src', () => {
    const html = render(article(), [article({ id: 'b', slug: 'second', title: 'Second', heroImage: '/img/b.jpg' })]);
    const tags = imgTags(html);
    expect(tags).toHaveLength(2);
    for (const t of tags) expect(t).toMatch(/src="[^"]+"/);
  });
});
