import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ROUTES } from '../../config/routes';

interface NavModuleItem {
  id: string;
  name: string;
  path: string;
  icon: (props: { className?: string }) => React.ReactElement;
  badge?: string;
}

interface NavGroup {
  groupTitle: string;
  items: NavModuleItem[];
}

interface AdminSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const MODULE_GROUPS: NavGroup[] = [
  {
    groupTitle: 'Core',
    items: [
      {
        id: 'overview',
        name: 'Overview',
        path: ROUTES.ADMIN,
        icon: (p) => (
          <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        ),
      },
    ],
  },
  {
    groupTitle: 'Editorial & Content',
    items: [
      {
        id: 'articles',
        name: 'Articles',
        path: ROUTES.ADMIN_ARTICLES,
        badge: '8',
        icon: (p) => (
          <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2.5 2.5 0 00-2.5-2.5H15" />
          </svg>
        ),
      },
      {
        id: 'rodeo-coverage',
        name: 'Rodeo Coverage',
        path: ROUTES.ADMIN_RODEO_COVERAGE,
        icon: (p) => (
          <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        id: 'editorial-organization',
        name: 'Organization & Taxonomy',
        path: ROUTES.ADMIN_EDITORIAL_ORG,
        icon: (p) => (
          <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        ),
      },
      {
        id: 'media',
        name: 'Media Library',
        path: ROUTES.ADMIN_MEDIA,
        icon: (p) => (
          <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    groupTitle: 'Intelligence & Quality',
    items: [
      {
        id: 'sources',
        name: 'Sources & References',
        path: ROUTES.ADMIN_SOURCES,
        icon: (p) => (
          <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        ),
      },
      {
        id: 'seo',
        name: 'SEO Intelligence',
        path: ROUTES.ADMIN_SEO,
        badge: '1 Alert',
        icon: (p) => (
          <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
      {
        id: 'analytics',
        name: 'Analytics & Search',
        path: ROUTES.ADMIN_ANALYTICS,
        icon: (p) => (
          <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    groupTitle: 'Distribution & Platform',
    items: [
      {
        id: 'website',
        name: 'Website & Navigation',
        path: ROUTES.ADMIN_WEBSITE,
        icon: (p) => (
          <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        id: 'monetization',
        name: 'Monetization & Ads',
        path: ROUTES.ADMIN_MONETIZATION,
        icon: (p) => (
          <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        id: 'team',
        name: 'Team & Permissions',
        path: ROUTES.ADMIN_TEAM,
        icon: (p) => (
          <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ),
      },
      {
        id: 'settings',
        name: 'System Settings',
        path: ROUTES.ADMIN_SETTINGS,
        icon: (p) => (
          <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
    ],
  },
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) => {
  const location = useLocation();
  const [logoutNotice, setLogoutNotice] = useState(false);

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between bg-[#0F1115] text-stone-300 border-r border-white/10 select-none">
      {/* Brand & Collapse Header */}
      <div>
        <div className="h-16 px-4 flex items-center justify-between border-b border-white/10">
          <Link
            to={ROUTES.ADMIN}
            onClick={onCloseMobile}
            className="flex items-center gap-2 group overflow-hidden"
          >
            <span className="font-serif text-xl font-black text-white tracking-tight uppercase">
              NFR<span className="text-[#D4A757]">CMS</span>
            </span>
            {!collapsed && (
              <span className="text-[9px] font-mono uppercase tracking-widest text-[#D4A757] bg-white/5 border border-[#D4A757]/30 px-1 py-0.5 rounded-xs">
                DEMO
              </span>
            )}
          </Link>

          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1.5 text-stone-400 hover:text-white rounded-xs hover:bg-white/5 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {collapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              )}
            </svg>
          </button>
        </div>

        {/* Navigation Group Items */}
        <nav className="p-3 space-y-5 overflow-y-auto max-h-[calc(100vh-140px)] scrollbar-none font-sans">
          {MODULE_GROUPS.map((group) => (
            <div key={group.groupTitle} className="space-y-1">
              {!collapsed && (
                <div className="px-3 text-[10px] uppercase font-mono tracking-widest text-stone-500 font-semibold mb-1">
                  {group.groupTitle}
                </div>
              )}
              {group.items.map((item) => {
                const isActive =
                  item.path === ROUTES.ADMIN
                    ? location.pathname === ROUTES.ADMIN
                    : location.pathname.startsWith(item.path);

                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    onClick={onCloseMobile}
                    title={collapsed ? item.name : undefined}
                    className={`flex items-center justify-between px-3 py-2 rounded-xs text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-[#1E293B] text-[#D4A757] font-semibold shadow-2xs border-l-2 border-[#D4A757]'
                        : 'text-stone-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {item.icon({ className: `w-4 h-4 shrink-0 ${isActive ? 'text-[#D4A757]' : 'text-stone-400'}` })}
                      {!collapsed && <span className="truncate">{item.name}</span>}
                    </div>

                    {!collapsed && item.badge && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs bg-white/10 text-stone-300">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Footer Profile & Live Site link */}
      <div className="p-3 border-t border-white/10 space-y-2 bg-[#0A0C0E]">
        <Link
          to="/"
          className="flex items-center gap-2 px-3 py-2 text-xs font-sans text-[#D4A757] hover:text-white rounded-xs hover:bg-white/5 transition-colors"
          title="Switch to public reader website"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          {!collapsed && <span>View Public Site</span>}
        </Link>

        <button
          onClick={() => setLogoutNotice(true)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-sans text-stone-400 hover:text-rose-400 rounded-xs hover:bg-white/5 transition-colors text-left"
          title="Sign out placeholder"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && <span>Sign Out (Demo)</span>}
        </button>

        {logoutNotice && !collapsed && (
          <div className="p-2 bg-amber-950/40 border border-amber-800/40 rounded-xs text-[10px] text-amber-200">
            Sign-out is non-operational until real authentication is implemented.
            <button
              onClick={() => setLogoutNotice(false)}
              className="block mt-1 underline text-amber-100"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-200 ${
          collapsed ? 'w-18' : 'w-64'
        }`}
      >
        <div className={`fixed top-0 left-0 bottom-0 z-30 transition-all duration-200 ${
          collapsed ? 'w-18' : 'w-64'
        }`}>
          {sidebarContent}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex bg-black/70 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-72 h-full bg-[#0F1115] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </div>
          <div className="flex-1" onClick={onCloseMobile} />
        </div>
      )}
    </>
  );
};
