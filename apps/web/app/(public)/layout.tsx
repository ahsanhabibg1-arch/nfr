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

export const revalidate = 300; // Refresh the client search index periodically.

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
    </BuilderEditorModeProvider>
  );
}
