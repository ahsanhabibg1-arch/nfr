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

describe('seoValidator detailed findings (Batch 25 SEO Assistant)', () => {
  it('returns every check in a structured findings array with presentation metadata', () => {
    const r = validateArticle(base);
    expect(r.findings.length).toBeGreaterThanOrEqual(16);
    // Every finding carries the fields the panel renders.
    for (const f of r.findings) {
      expect(f.displayCategory).toBeTruthy();
      expect(typeof f.blocksPublication).toBe('boolean');
      expect(typeof f.evaluated).toBe('boolean');
      expect(typeof f.fieldLabel).toBe('string');
    }
    // Blocker/compliance checks are flagged as publication blockers; warnings/notices are not.
    const headline = r.findings.find((f) => f.id === 'val-headline-req')!;
    expect(headline.blocksPublication).toBe(true);
    const seoTitle = r.findings.find((f) => f.id === 'val-seo-title-len')!;
    expect(seoTitle.blocksPublication).toBe(false);
  });

  it('maps a blocking failure to a Go-to-Field anchor and category', () => {
    const r = validateArticle({ ...base, imageAltText: '' });
    const alt = r.findings.find((f) => f.id === 'val-alt-required')!;
    expect(alt.passed).toBe(false);
    expect(alt.blocksPublication).toBe(true);
    expect(alt.fieldAnchor).toBe('field-08-imagealt');
    expect(alt.displayCategory).toBe('Images & Accessibility');
    // And it is surfaced in the compliance (gate) list.
    expect(r.compliance.some((c) => c.id === 'val-alt-required')).toBe(true);
  });

  it('marks the scheduled-time check NOT evaluated when the article is not scheduled, and evaluates it when scheduled', () => {
    const notScheduled = validateArticle(base);
    const s1 = notScheduled.findings.find((f) => f.id === 'val-scheduled-time')!;
    expect(s1.evaluated).toBe(false);
    expect(notScheduled.notEvaluated.some((f) => f.id === 'val-scheduled-time')).toBe(true);
    // Not-evaluated checks never block publication.
    expect(notScheduled.canPublish).toBe(true);

    const scheduledPast = validateArticle({ ...base, workflowStatus: 'scheduled', scheduledAt: new Date(Date.now() - 1000).toISOString() });
    const s2 = scheduledPast.findings.find((f) => f.id === 'val-scheduled-time')!;
    expect(s2.evaluated).toBe(true);
    expect(s2.passed).toBe(false);
    expect(scheduledPast.canPublish).toBe(false); // a past schedule is a compliance blocker
  });

  it('counts passed/total over evaluated checks only and reports warnings for an otherwise-valid article', () => {
    const r = validateArticle(base);
    expect(r.totalChecks).toBe(r.findings.filter((f) => f.evaluated).length);
    expect(r.passedChecks).toBeLessThanOrEqual(r.totalChecks);
    // `base` has a short SEO title / meta description → non-blocking warnings exist.
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.every((w) => w.blocksPublication === false)).toBe(true);
  });

  it('an empty article reports blockers but still returns a full findings list (no crash)', () => {
    const r = validateArticle({});
    expect(r.canPublish).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
    expect(r.findings.length).toBeGreaterThanOrEqual(16);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
