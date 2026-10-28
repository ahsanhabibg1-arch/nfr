import { describe, it, expect } from 'vitest';
import { validateArticle } from '../utils/seoValidator';
import { Article } from '../types';

const base: Partial<Article> = {
  title: 'Valid Championship Dispatch Headline',
  excerpt: 'A valid editorial excerpt describing the rodeo dispatch in sufficient detail.',
  slug: 'valid-dispatch',
  structuredBody: [
    { type: 'paragraph', text: 'Opening paragraph.' },
    { type: 'heading', level: 2, text: 'A Section' },
  ],
  imageRightsStatus: 'Staff Photo',
  imageAltText: 'A descriptive alt text for the featured photograph.',
  disclosure: 'editorial-independent',
};

describe('seoValidator publication gate (Category A/B)', () => {
  it('blocks publication when the headline is missing (Category A)', () => {
    const r = validateArticle({ ...base, title: '' });
    expect(r.canPublish).toBe(false);
    expect(r.blockers.some((b) => b.field === 'title')).toBe(true);
  });

  it('blocks publication when image rights are Unresolved (Category B)', () => {
    const r = validateArticle({ ...base, imageRightsStatus: 'Unresolved' });
    expect(r.canPublish).toBe(false);
    expect(r.compliance.some((c) => c.field === 'imageRightsStatus')).toBe(true);
  });

  it('allows publication when all required fields are satisfied', () => {
    const r = validateArticle(base);
    expect(r.canPublish).toBe(true);
    expect(r.blockers.length).toBe(0);
  });
});
