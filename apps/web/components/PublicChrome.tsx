'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { SearchModal } from './SearchModal';
import { Discipline, SearchIndexItem } from '../types';
import { ROUTES } from '../config/routes';
import type { PublicNavigation } from '../lib/cms/navTypes';

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
}

export const PublicChrome: React.FC<PublicChromeProps> = ({
  children,
  searchArticles = [],
  searchDisciplines = [],
  nav,
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
      <main className="flex-1">{children}</main>
      <SiteFooter sections={nav?.footerSections} academy={nav?.footerAcademy} />
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
      />
    </div>
  );
};

export default PublicChrome;
