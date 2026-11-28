import { describe, it, expect } from 'vitest';
import { selectLogo, isSafeLogoUrl, DEFAULT_LOGO_MAX_HEIGHT } from '@/lib/cms/branding';
import type { SiteIdentityConfig } from '@/lib/cms/siteConfigService';
import { SITE_CONFIG_KEYS } from '@/lib/cms/siteConfigService';
import { COVERAGE_SORTS } from '@/lib/content';
import { RESERVED_SUBCATEGORY_SLUGS, ROUTES } from '@/config/routes';
import { STATIC_PUBLIC_ROUTES } from '@/lib/seo/routeIndex';
import {
  validateRedirectSource,
  validateRedirectDestinationShape,
  isReservedPath,
  isReservedRedirectSource,
  SOURCE_ONLY_RESERVED_PATHS,
} from '@/lib/redirects/paths';
import { publisherOrganization, DEFAULT_PUBLISHER_NAME, SITE_URL } from '@/lib/seo';

/**
 * Stage 06-R — R-06 branding resolution and R-04 coverage-archive invariants.
 *
 * Everything here is PURE, so it runs without a database: the properties these
 * assert (branding can never break a page; a logo URL can never be an arbitrary
 * origin) must hold even when nothing else is available, which is exactly when
 * they matter most.
 */

describe('R-06 — logo URL safety', () => {
  it('accepts only Media Library paths served by this site', () => {
    expect(isSafeLogoUrl('/api/media/2026/11/abc.webp')).toBe(true);
    expect(isSafeLogoUrl('/media/logo.png')).toBe(true);
  });

  it('rejects every way a logo could point somewhere else', () => {
    for (const bad of [
      'https://evil.test/logo.svg',
      'http://nfrguide.com/api/media/x.webp',
      '//evil.test/logo.svg',
      'javascript:alert(1)',
      // eslint-disable-next-line no-script-url
      'JaVaScRiPt:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      '/api/media/../../etc/passwd',
      '/not-media/logo.png',
      '',
      null,
      undefined,
      42,
      {},
    ]) {
      expect(isSafeLogoUrl(bad), String(bad)).toBe(false);
    }
  });
});

describe('R-06 — deterministic resolution priority', () => {
  const primary = '/api/media/2026/11/primary.webp';
  const dark = '/api/media/2026/11/dark.webp';
  const light = '/api/media/2026/11/light.webp';

  it('falls back to the wordmark when nothing is configured', () => {
    for (const cfg of [undefined, null, {} as SiteIdentityConfig]) {
      const b = selectLogo(cfg, 'light');
      expect(b.usesFallback).toBe(true);
      expect(b.logoUrl).toBeNull();
      expect(b.maxHeight).toBe(DEFAULT_LOGO_MAX_HEIGHT);
    }
  });

  it('uses the primary logo when no override applies', () => {
    const b = selectLogo({ logoUrl: primary, logoAlt: 'Brand' }, 'light');
    expect(b.logoUrl).toBe(primary);
    expect(b.logoAlt).toBe('Brand');
    expect(b.usesFallback).toBe(false);
  });

  it('prefers the matching theme override over the primary', () => {
    const cfg: SiteIdentityConfig = { logoUrl: primary, logoDarkUrl: dark, logoLightUrl: light };
    expect(selectLogo(cfg, 'dark').logoUrl).toBe(dark);
    expect(selectLogo(cfg, 'light').logoUrl).toBe(light);
  });

  it('falls through an override that is missing or unsafe', () => {
    expect(selectLogo({ logoUrl: primary, logoDarkUrl: '' }, 'dark').logoUrl).toBe(primary);
    expect(selectLogo({ logoUrl: primary, logoDarkUrl: 'https://evil.test/x.svg' }, 'dark').logoUrl).toBe(primary);
  });

  it('falls all the way back to the wordmark when the PRIMARY is unsafe', () => {
    const b = selectLogo({ logoUrl: 'https://evil.test/x.svg', logoAlt: 'Brand' }, 'light');
    expect(b.usesFallback).toBe(true);
    expect(b.logoUrl).toBeNull();
  });

  it('never returns an empty alt — a logo is not decorative', () => {
    for (const alt of ['', '   ', undefined]) {
      expect(selectLogo({ logoUrl: primary, logoAlt: alt }, 'light').logoAlt).toBe('NFRGuide');
    }
  });

  it('clamps the rendered height, whatever is stored', () => {
    expect(selectLogo({ logoUrl: primary, logoMaxHeight: 5 }, 'light').maxHeight).toBe(16);
    expect(selectLogo({ logoUrl: primary, logoMaxHeight: 9999 }, 'light').maxHeight).toBe(160);
    expect(selectLogo({ logoUrl: primary, logoMaxHeight: 64 }, 'light').maxHeight).toBe(64);
    // Garbage in a JSON column must not produce NaN in a style attribute.
    expect(selectLogo({ logoUrl: primary, logoMaxHeight: Number.NaN }, 'light').maxHeight).toBe(DEFAULT_LOGO_MAX_HEIGHT);
  });

  it('tolerates a config object full of wrong types without throwing', () => {
    const junk = { logoUrl: 7, logoAlt: [], logoMaxHeight: 'tall', logoDarkUrl: {} } as unknown as SiteIdentityConfig;
    const b = selectLogo(junk, 'dark');
    expect(b.usesFallback).toBe(true);
    expect(b.logoAlt).toBe('NFRGuide');
  });
});

describe('R-06 — configuration ownership', () => {
  it('registers identity as its own SiteConfig key, beside the existing ones', () => {
    expect(SITE_CONFIG_KEYS).toContain('identity');
    // Ownership of the pre-existing concerns is unchanged.
    expect(SITE_CONFIG_KEYS).toContain('footer');
    expect(SITE_CONFIG_KEYS).toContain('appearance');
  });
});

describe('R-04 — /coverage/ route invariants', () => {
  it('is reserved, so no subcategory can ever shadow it', () => {
    expect(RESERVED_SUBCATEGORY_SLUGS.has('coverage')).toBe(true);
  });

  it('is registered in the SEO route index as indexable', () => {
    const entry = STATIC_PUBLIC_ROUTES.find((r) => r.path === '/coverage/');
    expect(entry).toBeTruthy();
    expect(entry!.status).toBe('indexable');
  });

  it('has a shared route constant, so the CTA cannot drift from the page', () => {
    expect(ROUTES.COVERAGE).toBe('/coverage/');
  });

  /**
   * FC-02C — source protection and destination eligibility are different
   * questions, and `/coverage/` needs opposite answers to each. `proxy.ts`
   * resolves redirects BEFORE Next matches a route, so a row sourced at
   * `/coverage/` would shadow the real archive.
   */
  it('cannot be used as a redirect SOURCE, so no row can shadow the archive', () => {
    for (const variant of ['/coverage/', '/coverage', '/COVERAGE/', '/Coverage']) {
      const v = validateRedirectSource(variant);
      expect(v.ok, variant).toBe(false);
      if (!v.ok) expect(v.reason, variant).toBe('reserved');
      expect(isReservedRedirectSource(variant), variant).toBe(true);
    }
  });

  it('REMAINS a legitimate redirect DESTINATION', () => {
    const d = validateRedirectDestinationShape('/coverage/', '/old-archive/');
    expect(d.ok).toBe(true);
    expect(d.path).toBe('/coverage/');
  });

  it('is source-only reserved — not added to the infrastructure list', () => {
    // `isReservedPath` governs BOTH ends; widening it would have blocked the
    // destination case above.
    expect(isReservedPath('/coverage/')).toBe(false);
    expect([...SOURCE_ONLY_RESERVED_PATHS]).toEqual(['/coverage']);
  });

  it('leaves ordinary redirect sources working', () => {
    expect(validateRedirectSource('/old-archive/').ok).toBe(true);
    expect(validateRedirectSource('/coverage-of-nfr/').ok).toBe(true); // prefix must not over-match
  });

  it('exposes a bounded, enumerated sort set', () => {
    expect([...COVERAGE_SORTS].sort()).toEqual(['newest', 'oldest', 'title']);
  });

  it('keeps the reserved-route protection Stage 03 added', () => {
    for (const p of ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/manifest.json']) {
      const v = validateRedirectSource(p);
      expect(v.ok).toBe(false);
      expect(isReservedPath(`${p}/`)).toBe(true);
    }
  });
});


describe('FC-03 — Organization JSON-LD logo', () => {
  const LOGO = '/api/media/2026/11/logo.webp';

  it('omits the logo property entirely when none is configured', () => {
    const org = publisherOrganization({ publisherName: 'NFRGuide' });
    expect(org['@type']).toBe('Organization');
    expect('logo' in org).toBe(false);
  });

  it('emits an ImageObject with an ABSOLUTE url when a logo is published', () => {
    const org = publisherOrganization({ publisherName: 'NFRGuide', publisherLogo: LOGO }) as {
      logo?: { '@type': string; url: string };
    };
    expect(org.logo?.['@type']).toBe('ImageObject');
    expect(org.logo?.url).toBe(`${SITE_URL}${LOGO}`);
    expect(org.logo?.url.startsWith('http')).toBe(true);
  });

  it('treats a blank or whitespace logo as "not configured"', () => {
    for (const v of ['', '   ', undefined]) {
      expect('logo' in publisherOrganization({ publisherLogo: v })).toBe(false);
    }
  });

  it('keeps the existing publisher identity and falls back to the default name', () => {
    const org = publisherOrganization({ publisherLogo: LOGO });
    expect(org.name).toBe(DEFAULT_PUBLISHER_NAME);
    expect(org.url).toBe(SITE_URL);
  });

  it('builds ONE identity shared by every consumer, so they cannot diverge', () => {
    const a = publisherOrganization({ publisherName: 'NFRGuide', publisherLogo: LOGO });
    const b = publisherOrganization({ publisherName: 'NFRGuide', publisherLogo: LOGO });
    expect(a).toEqual(b);
  });

  it('reflects a replaced logo and a removed logo', () => {
    const replaced = publisherOrganization({ publisherLogo: '/api/media/2026/12/new.webp' }) as {
      logo?: { url: string };
    };
    expect(replaced.logo?.url).toContain('/2026/12/new.webp');
    expect('logo' in publisherOrganization({ publisherLogo: undefined })).toBe(false);
  });
});
