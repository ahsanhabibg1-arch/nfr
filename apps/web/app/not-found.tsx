import type { Metadata } from 'next';
import { PublicChrome } from '@/components/PublicChrome';
import { NotFoundPage } from '@/views/NotFoundView';
import { resolveBranding } from '@/lib/cms/branding';

/**
 * D-A5 — the global 404 had no metadata of its own, so it inherited the root
 * layout's title ("NFRGuide — Independent Rodeo Editorial & Championship
 * Coverage"). A missing page that announces itself as the publication's
 * homepage is misleading to a reader, to a crawler and in browser history. The
 * route already returns HTTP 404 and renders its own `h1`, so only the title
 * and description were wrong. `noindex, follow` keeps the page out of the index
 * while letting a crawler continue through the recovery links.
 */
export const metadata: Metadata = {
  title: 'Page not found — NFRGuide',
  description: 'The page you requested could not be found. Browse the five NFRGuide sections to continue.',
  robots: { index: false, follow: true },
};

/**
 * Release gate (Gate C) — the 404 renders its OWN `PublicChrome`, so it does not
 * inherit the branding the public layout resolves. Without this it always drew
 * the built-in wordmark, even with a logo published: the one application-owned
 * page whose header silently disagreed with every other page.
 *
 * Resolved defensively, exactly like the admin login: a 404 must render even if
 * settings are unavailable, so any failure falls back to the wordmark rather
 * than turning a missing page into a server error.
 */
export default async function NotFound() {
  let branding = null;
  try { branding = await resolveBranding('light'); } catch { branding = null; }
  return (
    <PublicChrome branding={branding}>
      <NotFoundPage />
    </PublicChrome>
  );
}
