'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { SearchModal } from './SearchModal';
import { Article, Discipline } from '../types';
import { ROUTES } from '../config/routes';

/**
 * Client chrome for the public site: owns the search-modal state and the global
 * ⌘K / Ctrl+K shortcut, wraps server-rendered page content between the header
 * and footer. Replaces the Phase 0 React Router <Layout> + <Outlet>.
 */
export const PublicChrome: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
      <SiteHeader onOpenSearch={() => setSearchOpen(true)} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectArticle={(a: Article) => {
          setSearchOpen(false);
          router.push(ROUTES.ARTICLE(a.slug));
        }}
        onSelectDiscipline={(d: Discipline) => {
          setSearchOpen(false);
          router.push(ROUTES.DISCIPLINE(d.slug));
        }}
      />
    </div>
  );
};

export default PublicChrome;
