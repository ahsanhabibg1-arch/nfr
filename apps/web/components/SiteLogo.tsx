'use client';

import React, { useState } from 'react';
import type { Branding } from '../lib/cms/brandingShared';
import { DEFAULT_LOGO_MAX_HEIGHT } from '../lib/cms/brandingShared';

/**
 * The one way NFRGuide branding is drawn (Stage 06-R, R-06).
 *
 * Presentation only — a plain, non-async component with no data access, so it
 * can be rendered by a server page, a client component or an error boundary
 * alike. Whoever renders it supplies the already-resolved `branding`; a surface
 * that cannot safely reach settings simply passes nothing and gets the
 * wordmark.
 *
 * Proportions are preserved: the image is constrained by HEIGHT only, with
 * `width: auto` and `object-contain`, so a logo of any aspect ratio is scaled
 * rather than stretched, cropped or recoloured. `wordmarkAccent` keeps the
 * existing per-surface accent (the public header's gold "Guide", the admin's
 * gold "CMS") so the fallback is pixel-identical to what shipped before.
 */

export interface SiteLogoProps {
  /** Resolved branding. Omit — or pass a fallback result — for the wordmark. */
  branding?: Branding | null;
  /** Text before the accent in the wordmark fallback. */
  wordmarkLead?: string;
  /** Accented text in the wordmark fallback. */
  wordmarkAccent?: string;
  /** Extra classes for the wordmark text. */
  className?: string;
  /** Accent colour class for the wordmark. */
  accentClassName?: string;
  /** Overrides the configured max height, for compact surfaces. */
  maxHeight?: number;
}

export const SiteLogo: React.FC<SiteLogoProps> = ({
  branding,
  wordmarkLead = 'NFR',
  wordmarkAccent = 'Guide',
  className = '',
  accentClassName = 'text-[#D4A757]',
  maxHeight,
}) => {
  const height = maxHeight ?? branding?.maxHeight ?? DEFAULT_LOGO_MAX_HEIGHT;
  /**
   * FC-05A — a logo whose file has gone must degrade to the wordmark, not to a
   * broken image icon in the header of every page.
   *
   * Deletion of an in-use logo is now refused server-side, but a record written
   * before that guard existed, a restored backup or a storage failure can still
   * leave a dangling reference. One flag, set once on `error`: the component
   * then renders the wordmark and never retries, so there is no request loop.
   */
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const url = branding?.logoUrl;
  if (branding && url && url !== failedUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- height-bounded brand mark; next/image adds no value and would need remote config
      <img
        src={url}
        alt={branding.logoAlt}
        style={{ maxHeight: `${height}px` }}
        className="block w-auto h-auto max-w-full object-contain"
        // No lazy loading: the logo is above the fold on every page, and a
        // late-swapping brand mark is a visible layout shift.
        onError={() => setFailedUrl(url)}
        loading="eager"
        decoding="async"
      />
    );
  }

  return (
    <span className={className}>
      {wordmarkLead}
      <span className={accentClassName}>{wordmarkAccent}</span>
    </span>
  );
};
