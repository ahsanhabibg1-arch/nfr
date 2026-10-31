import { describe, it, expect } from 'vitest';
import { validateCommercialUrl } from '../lib/monetization/url';
import { relString, relLabel } from '../lib/monetization/rel';

/**
 * Batch 08 — pure monetization unit tests (no DB). URL validation (SSRF/dangerous
 * protocols) and paid-link `rel` policy (§7/§24/§27).
 */
describe('Batch 08 — commercial URL validation', () => {
  it('accepts public https/http URLs', () => {
    expect(validateCommercialUrl('https://partner.example.com/product?ref=1').ok).toBe(true);
    expect(validateCommercialUrl('http://shop.example.org/item').ok).toBe(true);
  });

  it('rejects dangerous protocols', () => {
    for (const u of ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:msgbox', 'file:///etc/passwd', 'ftp://host/x']) {
      expect(validateCommercialUrl(u).ok, u).toBe(false);
    }
  });

  it('rejects private / local / metadata hosts (SSRF)', () => {
    for (const u of [
      'http://localhost/x',
      'http://127.0.0.1/x',
      'http://10.0.0.5/x',
      'http://192.168.1.1/x',
      'http://169.254.169.254/latest/meta-data',
      'http://172.16.0.1/x',
      'http://metadata.google.internal/x',
      'http://intranet/x',
    ]) {
      expect(validateCommercialUrl(u).ok, u).toBe(false);
    }
  });

  it('rejects empty / malformed', () => {
    expect(validateCommercialUrl('').ok).toBe(false);
    expect(validateCommercialUrl('not a url').ok).toBe(false);
    expect(validateCommercialUrl(null).ok).toBe(false);
  });
});

describe('Batch 08 — paid-link rel policy', () => {
  it('defaults to sponsored nofollow with safety attrs', () => {
    expect(relString('SPONSORED_NOFOLLOW')).toBe('sponsored nofollow noopener noreferrer');
  });
  it('sponsored-only for sponsored content', () => {
    expect(relString('SPONSORED')).toBe('sponsored noopener noreferrer');
  });
  it('label strips safety attrs', () => {
    expect(relLabel('SPONSORED_NOFOLLOW')).toBe('sponsored nofollow');
  });
});
