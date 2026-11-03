'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ROUTES } from '../../config/routes';
import { AdminBreadcrumbs, AdminBreadcrumbItem } from './AdminBreadcrumbs';
import type { AdminUserInfo } from './AdminLayout';
import { logoutAction } from '../../app/admin/auth-actions';

interface AdminTopbarProps {
  onOpenMobileSidebar: () => void;
  onOpenNotifications: () => void;
  breadcrumbs?: AdminBreadcrumbItem[];
  user: AdminUserInfo;
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({
  onOpenMobileSidebar,
  onOpenNotifications,
  breadcrumbs = [],
  user,
}) => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const handleAdminSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`${ROUTES.ADMIN_ARTICLES}?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <header className="sticky top-0 z-20 w-full h-16 bg-white border-b border-stone-200 px-4 sm:px-6 flex items-center justify-between gap-4 font-sans">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-2 text-stone-600 hover:text-stone-900 rounded-xs hover:bg-stone-100"
          aria-label="Open sidebar menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="hidden sm:block truncate">
          <AdminBreadcrumbs items={breadcrumbs} />
        </div>
      </div>

      {/* Center: Global Search Interface */}
      <form onSubmit={handleAdminSearch} className="flex-1 max-w-md hidden md:block">
        <div className="relative">
          <svg className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles, rodeo hubs, media assets, or SEO issues..."
            className="w-full pl-9 pr-4 py-1.5 text-xs text-stone-900 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none focus:border-[#D4A757]"
          />
        </div>
      </form>

      {/* Right: Actions, Notifications, User Profile */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Quick New Article Button */}
        <Link
          href={ROUTES.ADMIN_ARTICLE_NEW}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors"
        >
          <span className="text-base leading-none">+</span>
          <span className="hidden sm:inline">New Article</span>
        </Link>

        {/* Notifications Icon Button */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-xs transition-colors"
          aria-label="Open notifications"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {/* No unread indicator: there is no notification source yet (Batch A). */}
        </button>

        {/* User Profile Avatar / Menu */}
        <div className="relative">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-2 p-1 rounded-xs hover:bg-stone-100 transition-colors"
            aria-expanded={profileDropdownOpen}
          >
            <div className="w-7 h-7 rounded-full bg-[#1E293B] text-[#D4A757] font-serif font-bold text-xs flex items-center justify-center">
              {initials}
            </div>
            <div className="hidden xl:block text-left text-xs leading-tight">
              <span className="font-semibold text-stone-900 block">{user.name}</span>
              <span className="text-[10px] text-stone-500 font-mono">{user.roleLabel}</span>
            </div>
          </button>

          {profileDropdownOpen && (
            <div
              className="absolute right-0 mt-2 w-56 bg-white border border-stone-200 rounded-xs shadow-lg py-2 z-50 text-xs font-sans animate-fade-in"
              onClick={() => setProfileDropdownOpen(false)}
            >
              <div className="px-4 py-2 border-b border-stone-100">
                <p className="font-semibold text-stone-900">{user.name}</p>
                <p className="text-[11px] text-stone-500 font-mono">{user.email}</p>
                <span className="inline-block mt-1 text-[10px] uppercase font-mono px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded">
                  Role: {user.roleLabel}
                </span>
              </div>

              <Link href={ROUTES.ADMIN_TEAM} className="block px-4 py-2 text-stone-700 hover:bg-stone-50">
                Team &amp; Permissions
              </Link>
              <Link href="/" className="block px-4 py-2 text-[#8B5E3C] hover:bg-stone-50 font-medium">
                View Public Site &rarr;
              </Link>
              <div className="border-t border-stone-100 mt-1 pt-1">
                {/* stopPropagation: the parent closes the menu on any click, which
                    would unmount this form before its logout action dispatches. */}
                <form action={logoutAction} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="submit"
                    className="w-full text-left px-4 py-2 text-rose-600 hover:bg-rose-50 font-medium"
                  >
                    Sign Out
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
