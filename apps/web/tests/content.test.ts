import { describe, it, expect } from 'vitest';
import {
  getPublishedArticles,
  getPublishedArticleBySlug,
  getArticlesBySection,
  getRelatedArticles,
  getAllDisciplines,
  getAllSectionKeys,
} from '../lib/content';
import { ALL_ARTICLES } from '../data/mockEditorialData';

describe('content adapter (real behaviour over seed data)', () => {
  it('returns only publicly eligible (published) articles', () => {
    const published = getPublishedArticles();
    expect(published.length).toBeGreaterThan(0);
    for (const a of published) {
      const status = a.workflowStatus || a.status;
      expect(status).toBe('published');
    }
    // Never returns more than the full catalog.
    expect(published.length).toBeLessThanOrEqual(ALL_ARTICLES.length);
  });

  it('resolves a known published slug and rejects unknown/unpublished', () => {
    const known = getPublishedArticles()[0];
    expect(getPublishedArticleBySlug(known.slug)?.id).toBe(known.id);
    expect(getPublishedArticleBySlug('this-slug-does-not-exist-xyz')).toBeUndefined();
  });

  it('filters section articles to the requested category only', () => {
    const comp = getArticlesBySection('NFR Competition');
    expect(comp.length).toBeGreaterThan(0);
    for (const a of comp) expect(a.category).toBe('NFR Competition');
  });

  it('getRelatedArticles never includes the source article', () => {
    const source = getPublishedArticles()[0];
    const related = getRelatedArticles(source.id, 3);
    expect(related.find((a) => a.id === source.id)).toBeUndefined();
    expect(related.length).toBeLessThanOrEqual(3);
  });

  it('exposes the seven disciplines and five section keys', () => {
    expect(getAllDisciplines().length).toBe(7);
    expect(getAllSectionKeys().length).toBe(5);
  });
});
