import React from 'react';
import { PublicChrome } from '@/components/PublicChrome';
import { getPublishedSearchIndex, getAllDisciplines } from '@/lib/content';
import { getPublicNavigation } from '@/lib/cms/navigationService';
import { getPublished, type FooterConfig } from '@/lib/cms/siteConfigService';
import { getActiveAnnouncements } from '@/lib/cms/announcementService';
import { getActiveBlocksForPlacement } from '@/lib/cms/globalBlockService';

export const revalidate = 300; // Refresh the client search index periodically.

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [searchArticles, searchDisciplines, nav, footer, announcements, footerTopBlocks] = await Promise.all([
    getPublishedSearchIndex(),
    getAllDisciplines(),
    getPublicNavigation(),
    getPublished<FooterConfig>('footer'),
    getActiveAnnouncements(2), // "two highest-priority announcements" — shown on every public page
    getActiveBlocksForPlacement('footer-top'),
  ]);

  return (
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
  );
}
