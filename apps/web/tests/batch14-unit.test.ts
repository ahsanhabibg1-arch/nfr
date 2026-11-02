import { describe, it, expect } from 'vitest';
import { isCoveragePublic } from '../lib/cms/competitionService';

/**
 * Batch 14 — pure public-eligibility rule (no DB): coverage is public ONLY when it is
 * both PUBLISHED and VERIFIED. Any other combination stays private.
 */
describe('Batch 14 — coverage public-eligibility rule', () => {
  it('requires PUBLISHED + VERIFIED together', () => {
    expect(isCoveragePublic('PUBLISHED', 'VERIFIED')).toBe(true);
    expect(isCoveragePublic('PUBLISHED', 'UNVERIFIED')).toBe(false);
    expect(isCoveragePublic('PUBLISHED', 'CORRECTION_REQUIRED')).toBe(false);
    expect(isCoveragePublic('APPROVED', 'VERIFIED')).toBe(false);
    expect(isCoveragePublic('DRAFT', 'VERIFIED')).toBe(false);
    expect(isCoveragePublic('ARCHIVED', 'VERIFIED')).toBe(false);
  });
});
