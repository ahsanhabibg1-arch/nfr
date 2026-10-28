import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { SearchModal } from './SearchModal';
import { Article, Discipline } from '../types';
import { ROUTES } from '../config/routes';

export const Layout: React.FC = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  // Global Keyboard Shortcut: ⌘K or Ctrl+K for search
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, []);

  const handleSelectArticle = (article: Article) => {
    setSearchOpen(false);
    navigate(ROUTES.ARTICLE(article.slug));
  };

  const handleSelectDiscipline = (discipline: Discipline) => {
    setSearchOpen(false);
    navigate(ROUTES.DISCIPLINE(discipline.slug));
  };

  return (
    <div className="min-h-screen bg-[#0F1115] text-[#1E293B] flex flex-col font-sans selection:bg-[#D4A757]/30 selection:text-white">
      {/* Editorial Top Notice Bar */}
      <aside aria-label="Editorial Notice" className="w-full bg-[#0F1115] text-stone-400 border-b border-white/5 py-1.5 px-4 text-[11px] font-sans">
        <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-1 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="text-[#D4A757] font-semibold uppercase tracking-wider">Independent Publication</span>
            <span aria-hidden="true">&middot;</span>
            <span>Unsponsored rodeo journalism &amp; championship intelligence</span>
          </div>
          <div className="flex items-center gap-3 text-stone-500">
            <span>Las Vegas &amp; Global Circuits</span>
            <span aria-hidden="true">&middot;</span>
            <span className="text-stone-400">Phase 0 Editorial Architecture</span>
          </div>
        </div>
      </aside>

      {/* Sticky Editorial Header */}
      <SiteHeader onOpenSearch={() => setSearchOpen(true)} />

      {/* Page Content Outlet */}
      <main className="flex-1 w-full flex flex-col bg-[#F7F3EA]">
        <Outlet />
      </main>

      {/* Global Site Footer */}
      <SiteFooter />

      {/* Global Instant Search Modal */}
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectArticle={handleSelectArticle}
        onSelectDiscipline={handleSelectDiscipline}
      />
    </div>
  );
};
