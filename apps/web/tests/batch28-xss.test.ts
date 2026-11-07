import { describe, it, expect } from 'vitest';
import { sanitizeLegalHtml } from '../lib/cms/sanitizeHtml';

describe('Batch 28 — legal HTML sanitization (XSS regression)', () => {
  it('strips script tags', () => {
    expect(sanitizeLegalHtml('<p>Hello</p><script>alert("xss")</script>')).toBe('<p>Hello</p>');
  });

  it('strips event handlers', () => {
    expect(sanitizeLegalHtml('<p onmouseover="alert(1)">text</p>')).toBe('<p>text</p>');
    expect(sanitizeLegalHtml('<a href="#" onclick="alert(1)">link</a>')).toBe('<a href="#">link</a>');
  });

  it('strips javascript: URLs', () => {
    const result = sanitizeLegalHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('strips data: URLs', () => {
    const result = sanitizeLegalHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(result).not.toContain('data:');
  });

  it('strips iframe, object, embed, form tags', () => {
    expect(sanitizeLegalHtml('<iframe src="evil.com"></iframe>')).toBe('');
    expect(sanitizeLegalHtml('<object data="evil.swf"></object>')).toBe('');
    expect(sanitizeLegalHtml('<embed src="evil.swf">')).toBe('');
    expect(sanitizeLegalHtml('<form action="evil.com"><input></form>')).toBe('');
  });

  it('strips style tags and inline styles', () => {
    expect(sanitizeLegalHtml('<style>body{display:none}</style>')).toBe('');
    const result = sanitizeLegalHtml('<p style="background:url(javascript:alert(1))">text</p>');
    expect(result).not.toContain('style');
  });

  it('strips img tags (not in allowlist)', () => {
    expect(sanitizeLegalHtml('<img src="x" onerror="alert(1)">')).toBe('');
  });

  it('strips SVG-based XSS', () => {
    expect(sanitizeLegalHtml('<svg onload="alert(1)"><circle></circle></svg>')).toBe('');
  });

  it('strips meta refresh', () => {
    expect(sanitizeLegalHtml('<meta http-equiv="refresh" content="0;url=evil.com">')).toBe('');
  });

  it('preserves safe editorial HTML', () => {
    const safe = '<h2>Privacy Policy</h2><p>We respect your <strong>privacy</strong>.</p><ul><li>Item 1</li><li>Item 2</li></ul><a href="https://example.com" rel="noopener">Link</a>';
    expect(sanitizeLegalHtml(safe)).toBe(safe);
  });

  it('preserves tables', () => {
    const table = '<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table>';
    expect(sanitizeLegalHtml(table)).toBe(table);
  });

  it('preserves blockquote and code', () => {
    const content = '<blockquote>Quote</blockquote><pre><code>code</code></pre>';
    expect(sanitizeLegalHtml(content)).toBe(content);
  });
});
