import { describe, it, expect } from 'vitest';
import { normalizeQuery, redactForStorage, highlightTokens, MAX_QUERY_LEN } from '../lib/analytics/privacy';
import { highlightSegments, buildExcerpt } from '../lib/search/query';

/**
 * Batch 07 — pure search/privacy unit tests (no database). Covers query
 * normalization, redaction, length bounds, Unicode, special characters, and
 * XSS-safe highlighting (§5/§6/§8/§20).
 */
describe('Batch 07 — query normalization & redaction', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeQuery('  bull   riding\t\n ').text).toBe('bull riding');
  });

  it('bounds length and reports original length', () => {
    const long = 'a'.repeat(500);
    const n = normalizeQuery(long);
    expect(n.text.length).toBe(MAX_QUERY_LEN);
    expect(n.originalLength).toBe(500);
  });

  it('handles null/undefined safely', () => {
    expect(normalizeQuery(undefined).text).toBe('');
    expect(normalizeQuery(null).text).toBe('');
  });

  it('preserves Unicode characters', () => {
    expect(normalizeQuery('rodéo café ñandú').text).toBe('rodéo café ñandú');
  });

  it('redacts emails and long digit runs for storage', () => {
    expect(redactForStorage('contact me at jane.doe@example.com')).toContain('[email]');
    expect(redactForStorage('call 555-123-4567 now')).toContain('[number]');
    expect(redactForStorage('order 1234567890')).toContain('[number]');
  });

  it('strips control characters', () => {
    expect(redactForStorage('bad\u0000query\u0007here')).toBe('badqueryhere');
  });

  it('tokenizes to safe alphanumeric tokens, drops stopwords/short', () => {
    const tokens = highlightTokens('the bull riding a1');
    expect(tokens).toContain('bull');
    expect(tokens).toContain('riding');
    expect(tokens).toContain('a1');
    expect(tokens).not.toContain('the');
    expect(tokens.every((t) => /^[\p{L}\p{N}]+$/u.test(t))).toBe(true);
  });
});

describe('Batch 07 — XSS-safe highlighting', () => {
  it('returns data segments, never raw HTML, and marks matches', () => {
    const segs = highlightSegments('Bull Riding at the NFR', ['bull', 'nfr']);
    expect(segs.some((s) => s.match && s.text.toLowerCase() === 'bull')).toBe(true);
    expect(segs.some((s) => s.match && s.text.toLowerCase() === 'nfr')).toBe(true);
  });

  it('does not treat an HTML/script query as markup (no injection)', () => {
    const malicious = '<script>alert(1)</script>';
    const tokens = highlightTokens(malicious);
    // tokens are alphanumeric only — no angle brackets survive tokenization
    expect(tokens.every((t) => /^[\p{L}\p{N}]+$/u.test(t))).toBe(true);
    const segs = highlightSegments('a <script> tag here', tokens);
    // segment text is plain data; the renderer emits React text nodes, never HTML
    expect(segs.map((s) => s.text).join('')).toContain('<script>');
  });

  it('clips long text and builds an excerpt around the first hit', () => {
    const body = 'Intro words. '.repeat(40) + 'The special keyword appears late in the body text.';
    const ex = buildExcerpt(body, ['keyword']);
    expect(ex.length).toBeLessThanOrEqual(230);
    expect(ex.toLowerCase()).toContain('keyword');
  });
});
