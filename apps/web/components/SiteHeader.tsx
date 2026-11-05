'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ROUTES } from '../config/routes';
import type { NavLink } from '../lib/cms/navTypes';
import { AccountMenu } from './account/AccountMenu';

interface SiteHeaderProps {
  onOpenSearch: () => void;
  navItems?: NavLink[];
}

// Static fallback mirrors the five canonical primary sections; used when the
// DB-backed navigation is empty or unavailable.
const NAV_FALLBACK: NavLink[] = [
  { name: 'NFR Competition', path: ROUTES.COMPETITION },
  { name: 'NFR Entertainment', path: ROUTES.ENTERTAINMENT },
  { name: 'NFR Events & Shopping', path: ROUTES.EVENTS_SHOPPING },
  { name: 'NFR Plan & Watch', path: ROUTES.PLAN_WATCH },
  { name: 'More Rodeo', path: ROUTES.MORE_RODEO },
].map((r) => ({ label: r.name, url: r.path, isExternal: false }));

const SEARCH_PLACEHOLDER = 'Search NFR events, rodeo, competitors...';

export const SiteHeader: React.FC<SiteHeaderProps> = ({ onOpenSearch, navItems }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  const navLinks = navItems && navItems.length > 0 ? navItems : NAV_FALLBACK;

  const searchFormRef = useRef<HTMLFormElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);

  // Focus the input when the search expands (deferred so the width transition starts first).
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const closeSearch = useCallback((returnFocus = false) => {
    setSearchOpen(false);
    if (returnFocus) searchTriggerRef.current?.focus();
  }, []);

  // Close the expanded search on an outside click. The listener is attached on the NEXT
  // tick so the click that OPENED the search (its mousedown fires before our click handler
  // in a real pointer sequence) can't immediately close it again.
  useEffect(() => {
    if (!searchOpen) return;
    const onDocPointerDown = (e: MouseEvent) => {
      if (searchFormRef.current && !searchFormRef.current.contains(e.target as Node)) closeSearch();
    };
    const id = window.setTimeout(() => document.addEventListener('mousedown', onDocPointerDown), 0);
    return () => { window.clearTimeout(id); document.removeEventListener('mousedown', onDocPointerDown); };
  }, [searchOpen, closeSearch]);

  const doSearch = () => {
    const q = query.trim();
    if (q) router.push(`/search/?q=${encodeURIComponent(q)}`); // existing route + query contract
    setSearchOpen(false);
    setQuery('');
  };
  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); doSearch(); };

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); closeSearch(true); }
  };

  return (
    <>
      {/* Sticky Editorial Header */}
      <header className="sticky top-0 z-40 w-full bg-[#0F1115]/95 backdrop-blur-md border-b border-white/10 transition-colors">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
          {/* Zone 1: Brand Wordmark */}
          <Link
            href="/"
            className="shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A757] rounded-sm py-1"
          >
            <span className="font-serif text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase group-hover:text-[#D4A757] transition-colors">
              NFR<span className="text-[#D4A757]">Guide</span>
            </span>
          </Link>

          {/* Zone 2: Five Primary Navigation Links (centered) */}
          <nav
            className="hidden xl:flex flex-1 items-center justify-center gap-6 2xl:gap-8 text-xs font-semibold tracking-wider uppercase font-sans text-stone-300"
            aria-label="Primary Navigation"
          >
            {navLinks.map((item) => {
              const isActive = !item.isExternal && (pathname === item.url || pathname.startsWith(item.url));
              return (
                <Link
                  key={item.url}
                  href={item.url}
                  target={item.isExternal ? '_blank' : undefined}
                  rel={item.isExternal ? 'noopener noreferrer' : undefined}
                  className={`whitespace-nowrap shrink-0 py-2 transition-colors relative hover:text-white ${
                    isActive ? 'text-[#D4A757] font-bold' : 'text-stone-300'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[#D4A757]" aria-hidden="true" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Zone 3: Actions (animated desktop search + mobile toggle) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Animated expandable search (desktop/tablet-wide). Submits to the existing
                /search/ route; ⌘K global modal (PublicChrome) still works for power users. */}
            <form
              ref={searchFormRef}
              role="search"
              onSubmit={submitSearch}
              className="hidden xl:flex items-center"
            >
              <div
                className={`overflow-hidden transition-[width,opacity] duration-[260ms] ease-out motion-reduce:transition-none ${
                  searchOpen ? 'w-44 2xl:w-64 opacity-100' : 'w-0 opacity-0'
                }`}
              >
                <input
                  ref={searchInputRef}
                  type="search"
                  name="q"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder={SEARCH_PLACEHOLDER}
                  aria-label="Search NFRGuide"
                  aria-hidden={!searchOpen}
                  tabIndex={searchOpen ? 0 : -1}
                  className="w-44 2xl:w-64 bg-white/5 border border-white/10 rounded-sm pl-3 pr-2 py-1.5 text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-[#D4A757]"
                />
              </div>
              <button
                ref={searchTriggerRef}
                // Always type="button" — a dynamic submit type would make the browser submit
                // the form on the very click that opens it (reloading + resetting the state).
                // Closed → open; open → run the search. Enter in the input also submits (form).
                type="button"
                onClick={() => { if (searchOpen) doSearch(); else setSearchOpen(true); }}
                aria-expanded={searchOpen}
                className="flex items-center gap-2 px-2.5 py-1.5 ml-1 text-[11px] uppercase tracking-wider font-semibold text-stone-300 hover:text-white rounded-sm transition-colors cursor-pointer"
              >
                {/* Icon-only button would need aria-label; the visible "Search" text is the
                    accessible name (WCAG 2.5.3), and aria-expanded conveys open/closed state. */}
                <svg className="w-4 h-4 text-[#D4A757] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="font-sans">Search</span>
              </button>
            </form>

            {/* Reader/Staff account menu (desktop) */}
            <AccountMenu variant="desktop" />

            {/* Mobile Menu Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="xl:hidden p-2 text-stone-300 hover:text-white transition-colors"
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
          className="fixed inset-0 z-50 xl:hidden flex justify-end bg-black/75 backdrop-blur-sm animate-fade-in"
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
                href="/"
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
                className="w-full flex items-center gap-2 px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-sm text-xs font-sans text-stone-300"
              >
                <svg className="w-4 h-4 text-[#D4A757]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search editorial archive...
              </button>
            </div>

            {/* Primary Section Links */}
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">
                Primary Sections
              </div>
              {navLinks.map((item) => {
                const isActive = !item.isExternal && pathname === item.url;
                return (
                  <Link
                    key={item.url}
                    href={item.url}
                    target={item.isExternal ? '_blank' : undefined}
                    rel={item.isExternal ? 'noopener noreferrer' : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`w-full py-3 px-3 text-sm font-sans tracking-wide uppercase rounded transition-colors flex items-center justify-between ${
                      isActive
                        ? 'bg-white/10 text-[#D4A757] font-bold'
                        : 'text-stone-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="text-stone-600">&rarr;</span>
                  </Link>
                );
              })}
            </div>

            {/* Reader/Staff account menu (mobile) */}
            <AccountMenu variant="mobile" />

            {/* Spectator Hubs — quick internal links inside the mobile drawer */}
            <div className="mt-6 pt-6 border-t border-white/10 space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-2">
                Quick Spectator Hubs
              </div>
              <Link
                href="/competition/"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full py-2.5 px-3 text-left text-xs text-stone-300 hover:text-white hover:bg-white/5 rounded"
              >
                &bull; The Seven Championship Disciplines
              </Link>
              <Link
                href="/plan-watch/"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full py-2.5 px-3 text-left text-xs text-stone-300 hover:text-white hover:bg-white/5 rounded"
              >
                &bull; How to Watch
              </Link>
              <Link
                href="/rodeo-events/"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full py-2.5 px-3 text-left text-xs text-stone-300 hover:text-white hover:bg-white/5 rounded"
              >
                &bull; Rodeo Events Directory
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
