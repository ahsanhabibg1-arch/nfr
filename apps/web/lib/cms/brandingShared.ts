/**
 * Branding types and PURE logic, with no `server-only` marker (Stage 06-R, R-06).
 *
 * Split for the same reason `slotProps.ts` was split out of `slotUtils.ts`: the
 * resolver half must reach the database, but `components/SiteLogo.tsx` and the
 * client chrome that renders it must not import a `server-only` module — doing
 * so fails the build outright. Keeping ONE implementation of the selection rule
 * here, imported by both sides, is what stops the server and the browser from
 * disagreeing about which logo is active.
 *
 * Nothing in this file performs I/O or reads the environment.
 */

export type BrandingTheme = 'light' | 'dark';

export interface Branding {
  /** Absolute-path logo URL for this theme, or null to use the wordmark. */
  logoUrl: string | null;
  /** Accessible name. Always non-empty when `logoUrl` is set. */
  logoAlt: string;
  /** Rendered cap, in px. */
  maxHeight: number;
  /** True when nothing valid was configured and the wordmark should render. */
  usesFallback: boolean;
}

/** Shape of the stored `identity` config, duplicated structurally to stay pure. */
export interface SiteIdentityLogoFields {
  logoUrl?: string;
  logoAlt?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  logoMaxHeight?: number;
}

export const DEFAULT_LOGO_MAX_HEIGHT = 40;
const DEFAULT_ALT = 'NFRGuide';

/**
 * Only same-origin, path-absolute Media Library URLs are accepted.
 *
 * Branding is interpolated into an `<img src>` on every page including the
 * admin login, so an arbitrary external URL would be a stored exfiltration
 * vector and a third-party dependency on a page that must always render.
 * `javascript:`, `data:`, absolute `http(s):` and protocol-relative `//host`
 * all fail by construction.
 *
 * Checked on READ as well as on write: a row can predate the schema, be edited
 * directly in the database, or be restored from an older backup.
 */
export function isSafeLogoUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (!/^\/(api\/media|media)\/[A-Za-z0-9._\-/]+$/.test(url)) return false;
  // `.` is legal in a filename, so the pattern above happily admits
  // `/api/media/../../etc/passwd`. Reject traversal on SEGMENTS, not characters.
  return !url.split('/').includes('..');
}

/**
 * Pick the logo for a theme. Deterministic priority (R-06 §12.3):
 *   1. the valid theme override, 2. the valid primary logo, 3. the wordmark.
 *
 * Total: every malformed input lands on the wordmark rather than throwing,
 * because branding must never be able to break a page.
 */
export function selectLogo(
  config: SiteIdentityLogoFields | null | undefined,
  theme: BrandingTheme,
): Branding {
  const cfg = config ?? {};
  const override = theme === 'dark' ? cfg.logoDarkUrl : cfg.logoLightUrl;
  const chosen = isSafeLogoUrl(override) ? override : isSafeLogoUrl(cfg.logoUrl) ? cfg.logoUrl : null;

  const rawHeight = cfg.logoMaxHeight;
  const maxHeight =
    typeof rawHeight === 'number' && Number.isFinite(rawHeight)
      ? Math.min(160, Math.max(16, Math.round(rawHeight)))
      : DEFAULT_LOGO_MAX_HEIGHT;

  if (!chosen) return { logoUrl: null, logoAlt: DEFAULT_ALT, maxHeight, usesFallback: true };

  // A logo is never decorative: an empty alt would leave the publication
  // unannounced, so the brand name is used rather than an empty string.
  const alt = typeof cfg.logoAlt === 'string' && cfg.logoAlt.trim() ? cfg.logoAlt.trim() : DEFAULT_ALT;
  return { logoUrl: chosen, logoAlt: alt, maxHeight, usesFallback: false };
}
