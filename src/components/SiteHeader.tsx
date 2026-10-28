import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../config/routes';

interface SiteHeaderProps {
  onOpenSearch: () => void;
}

const NAV_ROUTES = [
  { name: 'NFR Competition', path: ROUTES.COMPETITION },
  { name: 'NFR Entertainment', path: ROUTES.ENTERTAINMENT },
  { name: 'NFR Events & Shopping', path: ROUTES.EVENTS_SHOPPING },
  { name: 'NFR Plan & Watch', path: ROUTES.PLAN_WATCH },
  { name: 'More Rodeo', path: ROUTES.MORE_RODEO },
];

export const SiteHeader: React.FC<SiteHeaderProps> = ({ onOpenSearch }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleQuickAccessClick = () => {
    if (location.pathname === '/') {
      const el = document.getElementById('quick-access');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    navigate('/plan-watch/');
  };

  return (
    <>
      {/* Sticky Editorial Header */}
      <header className="sticky top-0 z-40 w-full bg-[#0F1115]/95 backdrop-blur-md border-b border-white/10 transition-colors">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/"
              className="text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A757] rounded-sm py-1"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="font-serif text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase group-hover:text-[#D4A757] transition-colors">
                  NFR<span className="text-[#D4A757]">Guide</span>
                </span>
                <span className="hidden xl:inline text-[10px] tracking-widest uppercase font-mono text-stone-400 border-l border-white/20 pl-2 ml-1">
                  Independent Publication
                </span>
              </div>
            </Link>
          </div>

          {/* Zone 2: Five Primary Navigation Links */}
          <nav 
            className="hidden lg:flex items-center gap-7 text-xs font-semibold tracking-wider uppercase font-sans text-stone-300"
            aria-label="Primary Navigation"
          >
            {NAV_ROUTES.map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`whitespace-nowrap shrink-0 py-2 transition-colors relative hover:text-white ${
                    isActive ? 'text-[#D4A757] font-bold' : 'text-stone-300'
                  }`}
                >
                  {item.name}
                  {isActive && (
                    <span 
                      className="absolute bottom-0 left-0 w-full h-[2px] bg-[#D4A757]" 
                      aria-hidden="true" 
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Zone 3: Actions (Search + Quick Access / Mobile Toggle) */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Search Trigger */}
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-stone-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-sm transition-colors cursor-pointer"
              aria-label="Open search dialog"
            >
              <svg className="w-4 h-4 text-[#D4A757]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden sm:inline font-sans text-[11px] uppercase tracking-wider">Search</span>
              <kbd className="hidden md:inline text-[9px] font-mono text-stone-400 bg-white/10 px-1.5 py-0.5 rounded">
                ⌘K
              </kbd>
            </button>

            {/* Quick Access Button */}
            <button
              onClick={handleQuickAccessClick}
              className="hidden sm:inline-flex items-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-black bg-[#D4A757] hover:bg-[#C59642] rounded-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              Quick Access
            </button>

            {/* Mobile Menu Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-stone-300 hover:text-white transition-colors"
              aria-label="Open mobile navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Accessible Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-50 lg:hidden flex justify-end bg-black/75 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div 
            className="w-full max-w-xs sm:max-w-sm h-full bg-[#0F1115] border-l border-white/10 text-white flex flex-col p-6 shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Top */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="font-serif text-xl font-bold uppercase text-white"
              >
                NFR<span className="text-[#D4A757]">Guide</span>
              </Link>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-stone-400 hover:text-white"
                aria-label="Close mobile menu"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mobile Search Button */}
            <div className="my-5">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenSearch();
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-sm text-xs font-sans text-stone-300"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#D4A757]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search editorial archive...
                </span>
                <span className="font-mono text-[10px] text-stone-500">⌘K</span>
              </button>
            </div>

            {/* Primary Section Links */}
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">
                Primary Sections
              </div>
              {NAV_ROUTES.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`w-full py-3 px-3 text-sm font-sans tracking-wide uppercase rounded transition-colors flex items-center justify-between ${
                      isActive
                        ? 'bg-white/10 text-[#D4A757] font-bold'
                        : 'text-stone-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span>{item.name}</span>
                    <span className="text-stone-600">&rarr;</span>
                  </Link>
                );
              })}
            </div>

            {/* Quick Access Utility */}
            <div className="mt-6 pt-6 border-t border-white/10 space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">
                Quick Spectator Hubs
              </div>
              <Link
                to="/competition/"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full py-2.5 px-3 text-left text-xs text-stone-300 hover:text-white hover:bg-white/5 rounded"
              >
                &bull; The Seven Championship Disciplines
              </Link>
              <Link
                to="/plan-watch/"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full py-2.5 px-3 text-left text-xs text-stone-300 hover:text-white hover:bg-white/5 rounded"
              >
                &bull; How to Watch &amp; Stream Live
              </Link>
              <Link
                to="/articles/inside-the-chutes-nfr-roughstock-intensity/"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full py-2.5 px-3 text-left text-xs text-stone-300 hover:text-white hover:bg-white/5 rounded"
              >
                &bull; Inside the Chutes Feature Dispatch
              </Link>
            </div>

            {/* Footer inside mobile menu */}
            <div className="mt-auto pt-6 border-t border-white/10 text-[11px] text-stone-500 font-sans">
              <p>Independent rodeo editorial publication.</p>
              <p className="mt-1 text-stone-600">Not affiliated with PRCA or Las Vegas Events.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
