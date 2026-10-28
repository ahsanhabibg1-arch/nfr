import { describe, it, expect } from 'vitest';
import {
  isArticlePubliclyEligible,
  filterPublicArticles,
} from '../utils/contentEligibility';
import { Article } from '../types';

const pub = { id: 'p', status: 'published', workflowStatus: 'published' } as Partial<Article>;
const draft = { id: 'd', status: 'draft', workflowStatus: 'draft' } as Partial<Article>;
const review = { id: 'r', workflowStatus: 'in_review' } as Partial<Article>;
const scheduled = { id: 's', workflowStatus: 'scheduled' } as Partial<Article>;

describe('content eligibility policy', () => {
  it('only published content is publicly eligible', () => {
    expect(isArticlePubliclyEligible(pub)).toBe(true);
    expect(isArticlePubliclyEligible(draft)).toBe(false);
    expect(isArticlePubliclyEligible(review)).toBe(false);
    expect(isArticlePubliclyEligible(scheduled)).toBe(false);
    expect(isArticlePubliclyEligible(null)).toBe(false);
  });

  it('filterPublicArticles drops every non-published record', () => {
    const out = filterPublicArticles([pub, draft, review, scheduled] as Article[]);
    expect(out.map((a) => a.id)).toEqual(['p']);
  });
});
