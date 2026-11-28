'use client';

import React, { useState, useEffect } from 'react';
import type { Branding } from '../../lib/cms/brandingShared';
import { usePathname } from 'next/navigation';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { AdminNotificationPanel } from './AdminNotificationPanel';
import { AdminBreadcrumbItem } from './AdminBreadcrumbs';
import { BusyAnnouncer, BusyProvider, RouteBusy } from '../ui/GlobalBusy';

export interface AdminUserInfo {
  name: string;
  email: string;
  roleLabel: string;
}

export const AdminLayout: React.FC<{
  children: React.ReactNode;
  user: AdminUserInfo;
  visibleModules?: string[];
  /** Resolved Site Identity branding for the admin chrome (Stage 06-R, R-06). */
  branding?: Branding | null;
}> = ({ children, user, visibleModules, branding }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const pathname = usePathname() ?? '/admin';

  // Scroll to top on sub-route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  // Derive dynamic breadcrumbs
  const getBreadcrumbs = (): AdminBreadcrumbItem[] => {
    const path = pathname.replace(/^\/admin\/?/, '');
    if (!path) return [{ label: 'Overview' }];

    const segments = path.split('/').filter(Boolean);
    return segments.map((seg, idx) => {
      const formatted = seg
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const subPath = '/admin/' + segments.slice(0, idx + 1).join('/') + '/';
      return {
        label: formatted,
        path: idx === segments.length - 1 ? undefined : subPath,
      };
    });
  };

  return (
    /*
      THE WHOLE CMS IS INSIDE THE BUSY PROVIDER.

      Every admin screen runs server actions, and a click with no visible
      response reads as a click that did nothing — which is how a save gets
      pressed twice. The provider renders the hairline progress bar itself;
      `RouteBusy` raises it for navigations, and any screen can raise it for its
      own work through `useBusy()`.
    */
    <BusyProvider>
    <RouteBusy />
    <BusyAnnouncer />
    <div className="min-h-screen bg-[#F4F6F8] text-stone-900 flex font-sans antialiased">
      {/* Sidebar Navigation */}
      <AdminSidebar
        branding={branding}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        visibleModules={visibleModules}
      />
      {/* user available for sidebar/topbar identity */}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <AdminTopbar
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          breadcrumbs={getBreadcrumbs()}
          user={user}
        />

        {/* Workspace Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>

        {/* Admin Footer */}
        <footer className="h-12 border-t border-stone-200 bg-white px-6 flex items-center justify-between text-xs text-ink-muted font-sans">
          <span>NFRGuide Custom Editorial CMS</span>
          <span className="font-mono text-[11px] text-ink-muted">
            Signed in as {user.email} &middot; {user.roleLabel}
          </span>
        </footer>
      </div>

      {/* Notification Slide-Over Drawer */}
      <AdminNotificationPanel
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
    </BusyProvider>
  );
};
