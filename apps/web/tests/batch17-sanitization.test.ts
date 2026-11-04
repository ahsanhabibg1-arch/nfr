import { describe, it, expect } from 'vitest';
import { isSafeHref, safeHref } from '../lib/url';
import { serializeJsonLd } from '../lib/seo';

/**
 * Batch 17 §D — content-safety verification.
 *
 * The article body is a structured block model rendered as escaped React children
 * (components/editorial/ArticleBody.tsx), and outbound URLs pass through the safeHref
 * allowlist. There is NO dangerouslySetInnerHTML sink except JSON-LD, which is escaped
 * by serializeJsonLd. These tests lock in that protection against regression: hostile
 * markup/URLs must never be treated as trusted.
 */

describe('Batch 17 — outbound URL allowlist (safeHref)', () => {
  it('rejects dangerous URL schemes', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      expect(isSafeHref(bad)).toBe(false);
      expect(safeHref(bad)).toBe('#');
    }
  });

  it('allows safe editorial links (http/https/mailto/tel, relative, fragment)', () => {
    for (const good of [
      'https://nfrguide.com/articles/x/',
      'http://example.com',
      'mailto:editor@nfrguide.com',
      'tel:+17025551234',
      '/competitors/',
      '#section',
      '?q=rodeo',
      'relative/path',
    ]) {
      expect(isSafeHref(good)).toBe(true);
      expect(safeHref(good)).toBe(good);
    }
  });

  it('treats empty/nullish hrefs as unsafe', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(isSafeHref(v)).toBe(false);
      expect(safeHref(v)).toBe('#');
    }
  });
});

describe('Batch 17 — JSON-LD serialization cannot break out of <script>', () => {
  it('escapes <, >, & so a </script> payload is neutralized', () => {
    const out = serializeJsonLd({ name: 'Evil </script><script>alert(1)</script>', url: 'https://x/?a=1&b=2' });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('\\u003c'); // <
    expect(out).toContain('\\u003e'); // >
    expect(out).toContain('\\u0026'); // &
    // Still valid, equivalent JSON once unescaped.
    expect(JSON.parse(out.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&')).name)
      .toBe('Evil </script><script>alert(1)</script>');
  });

  it('escapes U+2028 / U+2029 line terminators', () => {
    const out = serializeJsonLd({ text: `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c` });
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });
});
