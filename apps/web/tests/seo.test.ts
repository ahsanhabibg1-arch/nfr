import { describe, it, expect } from 'vitest';
import { buildMetadata, articleJsonLd, SITE_URL } from '../lib/seo';
import { Article } from '../types';

describe('SEO metadata builders', () => {
  it('emits a canonical URL from the single SITE_URL policy', () => {
    const m = buildMetadata({ title: 'NFR Competition — Coverage', description: 'd', path: '/competition/' });
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/competition/`);
  });

  it('suffixes the brand once and respects noindex', () => {
    const m = buildMetadata({ title: 'A Story', description: 'd', path: '/articles/a/', noindex: true });
    expect((m.title as { absolute: string }).absolute).toBe('A Story — NFRGuide');
    expect(m.robots).toMatchObject({ index: false, follow: false });

    const brandAlready = buildMetadata({ title: 'Home — NFRGuide', description: 'd', path: '/' });
    expect((brandAlready.title as { absolute: string }).absolute).toBe('Home — NFRGuide');
  });

  it('articleJsonLd reflects the real content type', () => {
    const article = {
      id: '1', slug: 's', title: 'T', deck: 'd', content: [], category: 'NFR Competition',
      readTime: '5 min', publishedAt: 'Dec 2026', heroImage: '/x.jpg', imageCredit: 'c',
      author: { name: 'A', role: 'R' }, articleType: 'news',
    } as unknown as Article;
    expect(articleJsonLd(article)['@type']).toBe('NewsArticle');
    expect((articleJsonLd({ ...article, articleType: 'feature' } as Article) as Record<string, unknown>)['@type']).toBe('Article');
  });
});
