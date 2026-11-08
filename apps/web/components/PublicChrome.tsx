'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { SearchModal } from './SearchModal';
import { Discipline, SearchIndexItem } from '../types';
import { ROUTES } from '../config/routes';
import type { PublicNavigation } from '../lib/cms/navTypes';
import type { FooterConfig } from '../lib/cms/siteConfigService';
import { AnnouncementBanner, type PublicAnnouncement } from './public/AnnouncementBanner';
import { GlobalBlockRenderer, type PublicGlobalBlock } from './public/GlobalBlockRenderer';

/**
 * Client chrome for the public site: owns the search-modal state and the global
 * ⌘K / Ctrl+K shortcut. The search index, disciplines and navigation menus are
 * fetched server-side (DB-backed, with a static fallback) and passed in as props.
 */
export interface PublicChromeProps {
  children: React.ReactNode;
  searchArticles?: SearchIndexItem[];
  searchDisciplines?: Discipline[];
  nav?: PublicNavigation;
  /** Published Site Experience → Footer config. */
  footer?: FooterConfig;
  /** Active announcements, shown under the header on every public page. */
  announcements?: PublicAnnouncement[];
  /** Global blocks placed "above the footer (all pages)". */
  footerTopBlocks?: PublicGlobalBlock[];
}

export const PublicChrome: React.FC<PublicChromeProps> = ({
  children,
  searchArticles = [],
  searchDisciplines = [],
  nav,
  footer,
  announcements = [],
  footerTopBlocks = [],
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F3EA]">
      <SiteHeader onOpenSearch={() => setSearchOpen(true)} navItems={nav?.header} />
      {announcements.length > 0 && <AnnouncementBanner announcements={announcements} />}
      <main className="flex-1">{children}</main>
      {footerTopBlocks.length > 0 && <GlobalBlockRenderer blocks={footerTopBlocks} />}
      <SiteFooter sections={nav?.footerSections} academy={nav?.footerAcademy} config={footer} />
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        searchArticles={searchArticles}
        searchDisciplines={searchDisciplines}
        onSelectArticle={(a) => {
          setSearchOpen(false);
          router.push(ROUTES.ARTICLE(a.slug));
        }}
        onSelectDiscipline={(d) => {
          setSearchOpen(false);
          router.push(ROUTES.DISCIPLINE(d.slug));
        }}
        onSubmitQuery={(q) => {
          setSearchOpen(false);
          router.push(`/search/?q=${encodeURIComponent(q)}`);
        }}
      />
    </div>
  );
};

export default PublicChrome;
