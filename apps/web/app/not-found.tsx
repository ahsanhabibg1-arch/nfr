import type { Metadata } from 'next';
import { PublicChrome } from '@/components/PublicChrome';
import { NotFoundPage } from '@/views/NotFoundView';

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

export default function NotFound() {
  return (
    <PublicChrome>
      <NotFoundPage />
    </PublicChrome>
  );
}
