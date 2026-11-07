'use client';

import React, { useState } from 'react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminWebsiteNavPage } from './AdminWebsiteNavPage';
import { AdminPageLayoutEditor } from './AdminPageLayoutEditor';
import { AdminAnnouncementsEditor } from './AdminAnnouncementsEditor';
import { AdminGlobalBlocksEditor } from './AdminGlobalBlocksEditor';
import { AdminFooterEditor } from './AdminFooterEditor';
import { AdminAppearanceEditor } from './AdminAppearanceEditor';
import type { NavItemRow } from '@/lib/cms/navigationService';
import type { SectionSlot, PropDef, BlockCategory } from '@/lib/cms/sectionRegistry';
import type { AnnouncementRow } from '@/lib/cms/announcementService';
import type { GlobalBlockRow } from '@/lib/cms/globalBlockService';
import type { SiteConfigRow } from '@/lib/cms/siteConfigService';

interface SectionDef {
  type: string;
  label: string;
  description?: string;
  category: BlockCategory;
  icon?: string;
  required?: boolean;
  maxInstances?: number;
  duplicatable?: boolean;
  defaultProps: Record<string, unknown>;
  editableProps: PropDef[];
}

interface LayoutRow {
  pageKey: string;
  draftSections: SectionSlot[];
  publishedAt: string | null;
}

interface Props {
  items: NavItemRow[];
  canNav: boolean;
  layouts: LayoutRow[];
  registries: Record<string, SectionDef[]>;
  canLayout: boolean;
  knownPageKeys: { key: string; label: string }[];
  announcements: AnnouncementRow[];
  globalBlocks: GlobalBlockRow[];
  siteConfigs: SiteConfigRow[];
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'layout', label: 'Page Builder' },
  { id: 'nav', label: 'Header & Nav' },
  { id: 'footer', label: 'Footer' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'global-blocks', label: 'Global Blocks' },
  { id: 'appearance', label: 'Appearance' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export const AdminWebsitePage: React.FC<Props> = ({
  items, canNav, layouts, registries, canLayout, knownPageKeys,
  announcements, globalBlocks, siteConfigs,
}) => {
  const [tab, setTab] = useState<TabId>('overview');
  const canManage = canLayout;

  const footerConfig = siteConfigs.find((c) => c.key === 'footer');
  const appearanceConfig = siteConfigs.find((c) => c.key === 'appearance');

  const unpublishedDrafts = layouts.filter((l) => !l.publishedAt || l.draftSections.length > 0);
  const activeAnnouncements = announcements.filter((a) => a.enabled);
  const activeGlobalBlocks = globalBlocks.filter((b) => b.enabled);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Site Experience"
        description="Manage page layouts, navigation, footer, announcements, global blocks and appearance."
      />

      <div className="flex gap-0.5 border-b border-stone-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-[11px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'border-[#D4A757] text-[#0F1115]'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <OverviewCard label="Page Layouts" value={`${layouts.length} saved`} detail={`${unpublishedDrafts.length} with drafts`} onClick={() => setTab('layout')} />
            <OverviewCard label="Navigation" value={`${items.length} items`} detail={`${items.filter((i) => i.visible).length} visible`} onClick={() => setTab('nav')} />
            <OverviewCard label="Announcements" value={`${announcements.length} total`} detail={`${activeAnnouncements.length} active`} onClick={() => setTab('announcements')} />
            <OverviewCard label="Global Blocks" value={`${globalBlocks.length} total`} detail={`${activeGlobalBlocks.length} active`} onClick={() => setTab('global-blocks')} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white border border-stone-200 rounded p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase text-stone-600">Quick Actions</h3>
              <div className="space-y-1">
                <button onClick={() => setTab('layout')} className="text-xs text-[#D4A757] hover:underline block">Edit Homepage Layout</button>
                <button onClick={() => setTab('appearance')} className="text-xs text-[#D4A757] hover:underline block">Configure Intro Banner</button>
                <button onClick={() => setTab('footer')} className="text-xs text-[#D4A757] hover:underline block">Edit Footer</button>
                <button onClick={() => setTab('announcements')} className="text-xs text-[#D4A757] hover:underline block">Create Announcement</button>
              </div>
            </div>
            <div className="bg-white border border-stone-200 rounded p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase text-stone-600">Publication Status</h3>
              <div className="space-y-1 text-xs text-stone-600">
                <div>Footer: <span className={footerConfig?.publishedAt ? 'text-emerald-600' : 'text-amber-600'}>{footerConfig?.publishedAt ? 'Published' : 'Not configured'}</span></div>
                <div>Appearance: <span className={appearanceConfig?.publishedAt ? 'text-emerald-600' : 'text-amber-600'}>{appearanceConfig?.publishedAt ? 'Published' : 'Not configured'}</span></div>
                <div>Navigation: <span className={items.length > 0 ? 'text-emerald-600' : 'text-amber-600'}>{items.length > 0 ? 'Active' : 'Using defaults'}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'layout' && <AdminPageLayoutEditor layouts={layouts} registries={registries} canManage={canLayout} knownPageKeys={knownPageKeys} />}
      {tab === 'nav' && <AdminWebsiteNavPage items={items} canManage={canNav} />}
      {tab === 'footer' && <AdminFooterEditor config={footerConfig} canManage={canManage} />}
      {tab === 'announcements' && <AdminAnnouncementsEditor announcements={announcements} canManage={canManage} />}
      {tab === 'global-blocks' && <AdminGlobalBlocksEditor blocks={globalBlocks} canManage={canManage} />}
      {tab === 'appearance' && <AdminAppearanceEditor config={appearanceConfig} canManage={canManage} />}
    </div>
  );
};

const OverviewCard: React.FC<{ label: string; value: string; detail: string; onClick: () => void }> = ({ label, value, detail, onClick }) => (
  <button onClick={onClick} className="bg-white border border-stone-200 rounded p-4 text-left hover:border-[#D4A757] transition-colors">
    <div className="text-[10px] font-mono uppercase text-stone-400">{label}</div>
    <div className="text-lg font-bold text-stone-900 mt-1">{value}</div>
    <div className="text-[10px] text-stone-500 mt-0.5">{detail}</div>
  </button>
);

export default AdminWebsitePage;
