import React from 'react';
import { PublicChrome } from '@/components/PublicChrome';
import { getPublishedSearchIndex, getAllDisciplines } from '@/lib/content';
import { getPublicNavigation } from '@/lib/cms/navigationService';
import { getPublished, type FooterConfig } from '@/lib/cms/siteConfigService';
import { getActiveAnnouncements } from '@/lib/cms/announcementService';
import { getActiveBlocksForPlacement } from '@/lib/cms/globalBlockService';
import { isStaffDraftPreview } from '@/lib/cms/previewGuard';
import { BuilderEditorModeProvider } from '@/components/blocks/BuilderEditorMode';
import { BuilderCanvasBridge } from '@/components/builder/BuilderCanvasBridge';
import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { getPublicVerificationTags, getPublicTracking, SEARCH_META_TAG } from '@/lib/cms/searchEngineService';
import { SiteTracking } from '@/components/analytics/SiteTracking';

export const revalidate = 300; // Refresh the client search index periodically.
/**
 * The cached reads for the public head.
 *
 * Cached HERE rather than inside the service, because `unstable_cache` needs
 * Next's per-request incremental cache: a service function wrapped in it
 * cannot be called from a test, a script or a job, which is a high price for a
 * caching detail. Tagging both means one `updateTag` in the admin action makes
 * a saved verification tag appear on the public site immediately instead of
 * when the ISR window happens to elapse.
 */
const cachedVerificationTags = unstable_cache(
  () => getPublicVerificationTags(),
  ['public-verification-tags'],
  { tags: [SEARCH_META_TAG] },
);
const cachedTracking = unstable_cache(
  () => getPublicTracking(),
  ['public-tracking-ids'],
  { tags: [SEARCH_META_TAG] },
);

/**
 * Search engine OWNERSHIP VERIFICATION tags, from the admin settings.
 *
 * WHY HERE AND NOT IN THE ROOT LAYOUT. These tags only need to be on the
 * public site — a verification service fetches the home page — and the root
 * layout also wraps `/admin`, which has no business carrying them. This layout
 * already reads the database and already revalidates, so the tags cost nothing
 * extra and refresh on the same schedule as everything else on the page.
 *
 * `getPublicVerificationTags` re-checks the allowlist and the token shape at
 * render time, so even a hand-edited database row cannot put an arbitrary meta
 * tag into the head.
 *
 * It returns only ENABLED records, which is what makes "disable" in the admin
 * actually remove the tag rather than merely grey out a row.
 */
export async function generateMetadata(): Promise<Metadata> {
  const tags = await cachedVerificationTags();
  if (tags.length === 0) return {};
  return {
    other: Object.fromEntries(tags.map((t) => [t.name, t.content])),
  };
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  /**
   * Builder editor mode is established here, once, for every public route
   * (Stage 06 Task 4).
   *
   * `isStaffDraftPreview()` requires BOTH Next.js draft mode and the
   * `system.config` permission, so a visitor is never in editor mode and never
   * receives the canvas bridge. Doing it in the layout rather than in each page
   * means a route added by a later stage inherits the behaviour instead of
   * silently losing it.
   */
  const editorMode = await isStaffDraftPreview();

  const [searchArticles, searchDisciplines, nav, footer, announcements, footerTopBlocks] = await Promise.all([
    getPublishedSearchIndex(),
    getAllDisciplines(),
    getPublicNavigation(),
    getPublished<FooterConfig>('footer'),
    getActiveAnnouncements(2), // "two highest-priority announcements" — shown on every public page
    getActiveBlocksForPlacement('footer-top'),
  ]);

  return (
    <BuilderEditorModeProvider enabled={editorMode}>
      <PublicChrome
        searchArticles={searchArticles}
        searchDisciplines={searchDisciplines}
        nav={nav}
        footer={footer}
        announcements={announcements}
        footerTopBlocks={footerTopBlocks}
      >
        {children}
      </PublicChrome>
      {editorMode && <BuilderCanvasBridge />}
      {/*
        Third-party tracking, and ONLY when an administrator has switched it
        on with a valid id. Saving an id is configuration; enabling it loads
        script into every reader's browser, which is a different decision —
        so the two are separate and this renders nothing by default.
      */}
      <SiteTracking {...(await cachedTracking())} />
    </BuilderEditorModeProvider>
  );
}
