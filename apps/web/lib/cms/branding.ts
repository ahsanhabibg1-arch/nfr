import 'server-only';
import { cache } from 'react';
import { getPublished, type SiteIdentityConfig } from './siteConfigService';
import { selectLogo, type Branding, type BrandingTheme } from './brandingShared';

/**
 * Site Identity & Branding resolver — the SERVER half (Stage 06-R, R-06).
 *
 * The selection rule itself lives in `./brandingShared`, which carries no
 * `server-only` marker so `components/SiteLogo.tsx` and the client chrome can
 * share the exact same implementation. This file adds only the part that needs
 * the database.
 *
 * THE RULE THIS FILE ENFORCES: branding must never be able to take the site —
 * or the admin login — down. Every failure mode (settings row absent, database
 * unreachable, JSON malformed, media deleted, URL invalid) lands on the same
 * safe answer: the built-in NFRGuide wordmark. It never throws and never
 * rejects.
 *
 * `cache()` is React's per-request memo, so a page rendering the header, the
 * footer and the Organization JSON-LD resolves branding ONCE per request.
 */

export type { Branding, BrandingTheme } from './brandingShared';
export { selectLogo, isSafeLogoUrl, DEFAULT_LOGO_MAX_HEIGHT } from './brandingShared';

/** The published identity config, or `{}` if it cannot be read. Never throws. */
export const getPublishedIdentity = cache(async (): Promise<SiteIdentityConfig> => {
  try {
    return (await getPublished<SiteIdentityConfig>('identity')) ?? {};
  } catch {
    // Settings being unavailable is not an error a visitor should ever see.
    return {};
  }
});

/** Branding for a surface. Always resolves; falls back to the wordmark. */
export async function resolveBranding(theme: BrandingTheme = 'light'): Promise<Branding> {
  return selectLogo(await getPublishedIdentity(), theme);
}
