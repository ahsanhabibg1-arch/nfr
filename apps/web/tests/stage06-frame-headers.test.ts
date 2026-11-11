import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Stage 06 Task 11 — framing headers are relaxed to same-origin and no further.
 *
 * WHY THIS FILE EXISTS. Stage 06 had to change two security settings so the
 * Builder canvas could embed our own draft pages:
 *
 *   X-Frame-Options:  DENY  ->  SAMEORIGIN
 *   CSP frame-ancestors: 'none' -> 'self'
 *   CSP frame-src:       'none' -> 'self'
 *
 * Before this stage NO test asserted any of them, so the values could drift in
 * either direction unnoticed. A relaxation that nothing pins is how a
 * `SAMEORIGIN` becomes a wildcard two stages later, with a plausible-sounding
 * reason in the commit message.
 *
 * These assertions are the ratchet: same-origin framing is permitted, and
 * anything broader fails. Cross-origin framing — the whole clickjacking threat
 * these headers address — remains refused.
 *
 * Asserted against the config SOURCE rather than a live response because
 * `next.config.mjs` headers cannot be invoked without a running server, and the
 * live behaviour is covered in the browser by
 * `e2e/stage06-visual-builder.spec.ts`. The assertions are on the exact
 * directive values, not on the presence of a word.
 */

const config = fs.readFileSync(path.resolve(__dirname, '..', 'next.config.mjs'), 'utf8');

/**
 * The value of a CSP directive as written in the config array.
 *
 * The directives are double-quoted strings whose values contain single quotes
 * (`"frame-ancestors 'self'"`), so the capture must run to the closing DOUBLE
 * quote. My first attempt excluded single quotes from the capture class and
 * matched nothing — it reported `null` for every directive, including ones that
 * were plainly present.
 */
function directive(name: string): string | null {
  const m = config.match(new RegExp(`"${name}\\s+([^"]+)"`));
  return m ? m[1].trim() : null;
}

function headerValue(key: string): string | null {
  const m = config.match(new RegExp(`key:\\s*'${key}',\\s*value:\\s*'([^']+)'`));
  return m ? m[1].trim() : null;
}

describe('Stage 06 — X-Frame-Options permits same-origin framing only', () => {
  it('is set to SAMEORIGIN', () => {
    expect(headerValue('X-Frame-Options')).toBe('SAMEORIGIN');
  });

  it('is not ALLOWALL or a permissive ALLOW-FROM', () => {
    const v = headerValue('X-Frame-Options');
    expect(v).not.toMatch(/ALLOWALL/i);
    expect(v).not.toMatch(/ALLOW-FROM/i);
  });

  it('is still present — removing it entirely would permit any framing', () => {
    expect(config).toContain("key: 'X-Frame-Options'");
  });
});

describe('Stage 06 — CSP framing directives permit same-origin only', () => {
  it("frame-ancestors is 'self'", () => {
    expect(directive('frame-ancestors')).toBe("'self'");
  });

  it("frame-src is 'self'", () => {
    expect(directive('frame-src')).toBe("'self'");
  });

  it('neither directive allows a wildcard or an external host', () => {
    for (const name of ['frame-ancestors', 'frame-src']) {
      const v = directive(name) ?? '';
      expect(v, `${name} must not be a wildcard`).not.toContain('*');
      expect(v, `${name} must not name an external scheme`).not.toMatch(/https?:/);
      expect(v, `${name} must not allow data: or blob: documents`).not.toMatch(/data:|blob:/);
    }
  });

  it('both directives are still declared — an omitted directive falls back to default-src', () => {
    expect(directive('frame-ancestors')).not.toBeNull();
    expect(directive('frame-src')).not.toBeNull();
  });
});

describe('Stage 06 — the rest of the security baseline is untouched', () => {
  const unchanged: [string, string][] = [
    ['default-src', "'self'"],
    ['base-uri', "'self'"],
    ['object-src', "'none'"],
    ['form-action', "'self'"],
    ['connect-src', "'self'"],
  ];

  for (const [name, expected] of unchanged) {
    it(`${name} is still ${expected}`, () => {
      expect(directive(name)).toBe(expected);
    });
  }

  it('keeps nosniff, Referrer-Policy and HSTS', () => {
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff');
    expect(headerValue('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headerValue('Strict-Transport-Security')).toContain('max-age=');
  });

  it('keeps HSTS without preload, as Batch 17 decided deliberately', () => {
    expect(headerValue('Strict-Transport-Security')).not.toContain('preload');
  });

  it('still denies camera, microphone and geolocation', () => {
    const pp = headerValue('Permissions-Policy') ?? '';
    expect(pp).toContain('camera=()');
    expect(pp).toContain('microphone=()');
    expect(pp).toContain('geolocation=()');
  });

  it('keeps the CSP in report-only mode — Stage 06 did not flip it to enforcing', () => {
    expect(config).toContain("key: 'Content-Security-Policy-Report-Only'");
  });

  it('keeps admin routes out of shared and browser caches', () => {
    expect(config).toContain("source: '/admin/:path*'");
    expect(config).toMatch(/private, no-store, max-age=0/);
  });
});
