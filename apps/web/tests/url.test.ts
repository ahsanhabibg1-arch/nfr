import { describe, it, expect } from 'vitest';
import { isSafeHref, safeHref } from '../lib/url';

describe('outbound URL protocol allowlist (§14)', () => {
  it('accepts http(s), mailto, tel and site-relative links', () => {
    expect(isSafeHref('https://prorodeo.com/rules')).toBe(true);
    expect(isSafeHref('http://example.com')).toBe(true);
    expect(isSafeHref('mailto:editor@nfrguide.com')).toBe(true);
    expect(isSafeHref('tel:+17025551234')).toBe(true);
    expect(isSafeHref('/articles/foo/')).toBe(true);
    expect(isSafeHref('#section')).toBe(true);
  });

  it('rejects dangerous protocols', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeHref('data:text/html;base64,PHM+')).toBe(false);
    expect(isSafeHref('')).toBe(false);
    expect(isSafeHref(undefined)).toBe(false);
  });

  it('safeHref neutralizes unsafe URLs to #', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#');
    expect(safeHref('https://ok.com')).toBe('https://ok.com');
  });
});
