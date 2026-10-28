import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { AdminNotificationPanel } from './AdminNotificationPanel';
import { AdminBreadcrumbItem } from './AdminBreadcrumbs';

export const AdminLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();

  // Scroll to top on sub-route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  // Derive dynamic breadcrumbs
  const getBreadcrumbs = (): AdminBreadcrumbItem[] => {
    const path = location.pathname.replace(/^\/admin\/?/, '');
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
    <div className="min-h-screen bg-[#F4F6F8] text-stone-900 flex font-sans antialiased">
      {/* Sidebar Navigation */}
      <AdminSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <AdminTopbar
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          breadcrumbs={getBreadcrumbs()}
        />

        {/* Workspace Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>

        {/* Admin Footer */}
        <footer className="h-12 border-t border-stone-200 bg-white px-6 flex items-center justify-between text-xs text-stone-500 font-sans">
          <span>NFRGuide Custom Editorial CMS &middot; Phase 0 Foundation</span>
          <span className="font-mono text-[11px] text-stone-400">Environment: Local Sandbox (Non-Production Auth)</span>
        </footer>
      </div>

      {/* Notification Slide-Over Drawer */}
      <AdminNotificationPanel
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
  );
};
