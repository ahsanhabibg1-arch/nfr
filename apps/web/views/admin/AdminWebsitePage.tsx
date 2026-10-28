'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminModal } from '../../components/admin/AdminModal';
import { HOMEPAGE_SECTIONS_CONFIG } from '../../data/mockAdminData';
import { ALL_ARTICLES } from '../../data/mockEditorialData';
import { HomepageSectionConfig } from '../../types/admin';

interface NavMenuItem {
  id: string;
  label: string;
  path: string;
  target: '_self' | '_blank';
  isExternal: boolean;
  order: number;
  location: 'header' | 'footer_editorial' | 'footer_logistics' | 'footer_governance';
}

const INITIAL_NAV_ITEMS: NavMenuItem[] = [
  { id: 'nav-01', label: 'Competition', path: '/competition/', target: '_self', isExternal: false, order: 1, location: 'header' },
  { id: 'nav-02', label: 'Entertainment', path: '/entertainment/', target: '_self', isExternal: false, order: 2, location: 'header' },
  { id: 'nav-03', label: 'Events & Shopping', path: '/events-shopping/', target: '_self', isExternal: false, order: 3, location: 'header' },
  { id: 'nav-04', label: 'Plan & Watch', path: '/plan-watch/', target: '_self', isExternal: false, order: 4, location: 'header' },
  { id: 'nav-05', label: 'More Rodeo', path: '/rodeo-events/', target: '_self', isExternal: false, order: 5, location: 'header' },
  { id: 'nav-06', label: 'Bareback Riding Guide', path: '/disciplines/bareback-riding/', target: '_self', isExternal: false, order: 1, location: 'footer_editorial' },
  { id: 'nav-07', label: 'Bull Riding Guide', path: '/disciplines/bull-riding/', target: '_self', isExternal: false, order: 2, location: 'footer_editorial' },
  { id: 'nav-08', label: 'Saddle Bronc Guide', path: '/disciplines/saddle-bronc-riding/', target: '_self', isExternal: false, order: 3, location: 'footer_editorial' },
  { id: 'nav-09', label: 'Arena Travel & Parking', path: '/articles/thomas-and-mack-spectator-arena-guide/', target: '_self', isExternal: false, order: 1, location: 'footer_logistics' },
  { id: 'nav-10', label: 'Hotel & Shuttle Routes', path: '/articles/hotel-district-breakdown-las-vegas-resort-corridor/', target: '_self', isExternal: false, order: 2, location: 'footer_logistics' },
  { id: 'nav-11', label: 'Editorial Independence Charter', path: '/articles/inside-the-chutes-nfr-roughstock-intensity/', target: '_self', isExternal: false, order: 1, location: 'footer_governance' },
  { id: 'nav-12', label: 'PRCA Non-Affiliation Notice', path: '/', target: '_self', isExternal: false, order: 2, location: 'footer_governance' },
];

export const AdminWebsitePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'homepage' | 'navigation' | 'announcements'>('homepage');
  const [sections, setSections] = useState<HomepageSectionConfig[]>(HOMEPAGE_SECTIONS_CONFIG);
  const [navItems, setNavItems] = useState<NavMenuItem[]>(INITIAL_NAV_ITEMS);
  const [activeNavGroup, setActiveNavGroup] = useState<'header' | 'footer_editorial' | 'footer_logistics' | 'footer_governance'>('header');
  
  // Section edit modal state
  const [editingSection, setEditingSection] = useState<HomepageSectionConfig | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Nav item modal state
  const [navModalOpen, setNavModalOpen] = useState(false);
  const [newNavLabel, setNewNavLabel] = useState('');
  const [newNavPath, setNewNavPath] = useState('');

  const showNotification = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3000);
  };

  const handleToggleVisibility = (id: string) => {
    setSections(prev =>
      prev.map(sec => (sec.id === id ? { ...sec, isVisible: !sec.isVisible } : sec))
    );
    showNotification('Homepage section visibility updated');
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === sections.length - 1)) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newSections = [...sections];
    const [moved] = newSections.splice(index, 1);
    newSections.splice(targetIndex, 0, moved);
    
    // update order numbers
    const reordered = newSections.map((item, idx) => ({ ...item, order: idx + 1 }));
    setSections(reordered);
    showNotification(`Section moved ${direction}`);
  };

  const handleSaveSectionEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSection) return;
    setSections(prev =>
      prev.map(sec => (sec.id === editingSection.id ? { ...editingSection, lastUpdated: 'Just now' } : sec))
    );
    setEditingSection(null);
    showNotification('Section configuration saved successfully');
  };

  const handleAddNavItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNavLabel.trim() || !newNavPath.trim()) return;
    
    const newItem: NavMenuItem = {
      id: `nav-${Date.now()}`,
      label: newNavLabel.trim(),
      path: newNavPath.trim(),
      target: '_self',
      isExternal: newNavPath.startsWith('http'),
      order: navItems.filter(n => n.location === activeNavGroup).length + 1,
      location: activeNavGroup,
    };

    setNavItems(prev => [...prev, newItem]);
    setNewNavLabel('');
    setNewNavPath('');
    setNavModalOpen(false);
    showNotification(`Added "${newItem.label}" to navigation menu`);
  };

  const handleDeleteNavItem = (id: string) => {
    setNavItems(prev => prev.filter(n => n.id !== id));
    showNotification('Menu item removed');
  };

  const filteredNavItems = navItems.filter(n => n.location === activeNavGroup);

  return (
    <div className="space-y-6">
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono animate-fade-in flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {saveToast}
        </div>
      )}

      <AdminPageHeader
        title="Website & Navigation"
        description="Curate homepage layout, reorder editorial sections, and manage global header and footer navigation menus."
        breadcrumbs={[
          { label: 'Admin', path: '/admin/' },
          { label: 'Website & Navigation' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 text-xs font-sans font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-xs transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Preview Live Site
            </Link>
          </div>
        }
      />

      <AdminTabs
        tabs={[
          { id: 'homepage', label: 'Homepage Sections', count: sections.length },
          { id: 'navigation', label: 'Navigation Menus', count: navItems.length },
          { id: 'announcements', label: 'Alert Banners & Notice Strips' },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
      />

      {/* TAB 1: HOMEPAGE SECTIONS */}
      {activeTab === 'homepage' && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-xs text-xs text-amber-900 flex items-start justify-between gap-4">
            <div>
              <span className="font-semibold block mb-0.5">Homepage Section Architecture (Concept C)</span>
              The public homepage renders 10 structured sections from Section A (Hero) to Section J (Footer). Use this control plane to reorder sections, toggle visibility, and configure editorial feed algorithms.
            </div>
            <Link
              href="/"
              className="shrink-0 text-stone-900 underline font-medium hover:text-amber-800"
            >
              View Front Page →
            </Link>
          </div>

          <div className="bg-white border border-stone-200 rounded-xs shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-200 bg-stone-50/50 flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
                Homepage Flow Sequence ({sections.length} Sections)
              </span>
              <span className="text-[11px] text-stone-500">
                Drag or use arrows to change live page priority
              </span>
            </div>

            <div className="divide-y divide-stone-200">
              {sections.map((section, idx) => (
                <div
                  key={section.id}
                  className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                    !section.isVisible ? 'bg-stone-50/60 opacity-60' : 'hover:bg-stone-50/50'
                  }`}
                >
                  <div className="flex items-start md:items-center gap-3">
                    {/* Order Controls */}
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => handleMoveSection(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 text-stone-400 hover:text-stone-800 disabled:opacity-20 transition-colors"
                        title="Move Up"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <span className="text-xs font-mono font-bold text-stone-700 w-5 text-center">
                        {section.order}
                      </span>
                      <button
                        onClick={() => handleMoveSection(idx, 'down')}
                        disabled={idx === sections.length - 1}
                        className="p-1 text-stone-400 hover:text-stone-800 disabled:opacity-20 transition-colors"
                        title="Move Down"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-stone-400 uppercase">
                          {section.sectionCode}
                        </span>
                        <h4 className="text-sm font-semibold text-stone-900 font-sans">
                          {section.name}
                        </h4>
                        {!section.isVisible && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded-xs">
                            Hidden from Readers
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-stone-500">
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#8B5E3C]">
                          Mode: {section.mode}
                        </span>
                        <span>•</span>
                        <span>Updated: {section.lastUpdated}</span>
                        {section.featuredArticleId && (
                          <>
                            <span>•</span>
                            <span className="text-stone-700 font-medium">
                              Pin: {(ALL_ARTICLES.find(a => a.id === section.featuredArticleId)?.title || section.featuredArticleId).slice(0, 36)}...
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    <button
                      onClick={() => handleToggleVisibility(section.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-xs border transition-colors ${
                        section.isVisible
                          ? 'border-stone-300 text-stone-700 bg-white hover:bg-stone-50'
                          : 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                    >
                      {section.isVisible ? 'Hide' : 'Show'}
                    </button>
                    <button
                      onClick={() => setEditingSection({ ...section })}
                      className="px-3 py-1.5 text-xs font-medium text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-xs transition-colors"
                    >
                      Configure
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: NAVIGATION MENUS */}
      {activeTab === 'navigation' && (
        <div className="space-y-6">
          {/* Sub-menu groups */}
          <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-3">
            {[
              { id: 'header', label: 'Primary Header Bar' },
              { id: 'footer_editorial', label: 'Footer — Editorial Guides' },
              { id: 'footer_logistics', label: 'Footer — Fan Logistics' },
              { id: 'footer_governance', label: 'Footer — Governance & Legal' },
            ].map((grp) => (
              <button
                key={grp.id}
                onClick={() => setActiveNavGroup(grp.id as typeof activeNavGroup)}
                className={`px-3 py-1.5 text-xs font-medium rounded-xs transition-colors ${
                  activeNavGroup === grp.id
                    ? 'bg-[#1E293B] text-white shadow-2xs font-semibold'
                    : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
                }`}
              >
                {grp.label}
              </button>
            ))}

            <button
              onClick={() => setNavModalOpen(true)}
              className="ml-auto px-3 py-1.5 text-xs font-medium text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 text-[#D4A757]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Link
            </button>
          </div>

          <div className="bg-white border border-stone-200 rounded-xs shadow-2xs overflow-hidden">
            <div className="px-4 py-3 bg-stone-50/50 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
                Menu Items for: {activeNavGroup.replace('_', ' ').toUpperCase()} ({filteredNavItems.length})
              </span>
              <span className="text-[11px] text-stone-500 font-mono">
                Order determines left-to-right or top-to-bottom display
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5 w-12 text-center">#</th>
                    <th className="px-4 py-2.5">Display Label</th>
                    <th className="px-4 py-2.5">Target Path / URL</th>
                    <th className="px-4 py-2.5">Window Target</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {filteredNavItems.map((item) => (
                    <tr key={item.id} className="hover:bg-stone-50/50">
                      <td className="px-4 py-3 font-mono text-center font-bold text-stone-400">
                        {item.order}
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-900">
                        {item.label}
                      </td>
                      <td className="px-4 py-3 font-mono text-stone-600">
                        <Link href={item.path} className="hover:underline text-stone-700">
                          {item.path}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-stone-500 font-mono text-[11px]">
                        {item.target === '_blank' ? 'New Tab' : 'Current Window'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDeleteNavItem(item.id)}
                          className="text-stone-400 hover:text-rose-600 transition-colors p-1"
                          title="Remove menu link"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="bg-white border border-stone-200 rounded-xs p-6 max-w-2xl space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <h3 className="text-sm font-semibold text-stone-900">
              Live Broadcast / Critical Alert Strip
            </h3>
          </div>
          <p className="text-xs text-stone-600 leading-relaxed">
            Configure the slim alert strip rendered above the primary masthead during peak NFR go-rounds (December 3–12, 2026).
          </p>

          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Banner Message Text
              </label>
              <input
                type="text"
                defaultValue="DECEMBER 3–12, 2026 • 68TH NATIONAL FINALS RODEO • LAS VEGAS, NEVADA"
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                CTA Button Text & Link
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  defaultValue="Complete Schedule"
                  className="px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
                />
                <input
                  type="text"
                  defaultValue="/plan-watch/"
                  className="px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
                />
              </div>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <input type="checkbox" id="bannerActive" defaultChecked className="rounded-xs text-[#D4A757]" />
              <label htmlFor="bannerActive" className="text-xs text-stone-700">
                Display alert banner publicly on all reader pages
              </label>
            </div>
            <div className="pt-3">
              <button
                onClick={() => showNotification('Notice strip preferences saved')}
                className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-sans font-semibold rounded-xs hover:bg-stone-800 transition-colors"
              >
                Save Alert Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION EDIT MODAL */}
      {editingSection && (
        <AdminModal
          isOpen={true}
          title={`Configure: ${editingSection.name}`}
          onClose={() => setEditingSection(null)}
        >
          <form onSubmit={handleSaveSectionEdit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Feed Algorithm & Curation Mode
              </label>
              <select
                value={editingSection.mode}
                onChange={(e) => setEditingSection({ ...editingSection, mode: e.target.value as any })}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              >
                <option value="Manual Curation">Manual Curation (Editorial Hand-Picked)</option>
                <option value="Automatic Feed">Automatic Feed (Chronological by Category)</option>
                <option value="Hybrid Dynamic">Hybrid Dynamic (Pinned Lead + Fresh Recents)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Featured Lead Article (Optional Pin)
              </label>
              <select
                value={editingSection.featuredArticleId || ''}
                onChange={(e) => setEditingSection({ ...editingSection, featuredArticleId: e.target.value || undefined })}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              >
                <option value="">-- No Pin / Use Latest Published --</option>
                {ALL_ARTICLES.map((art) => (
                  <option key={art.id} value={art.id}>
                    [{art.category}] {art.title.slice(0, 50)}...
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="secVisible"
                checked={editingSection.isVisible}
                onChange={(e) => setEditingSection({ ...editingSection, isVisible: e.target.checked })}
                className="rounded-xs text-[#D4A757]"
              />
              <label htmlFor="secVisible" className="text-xs text-stone-700 font-medium">
                Render section on public homepage
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setEditingSection(null)}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs transition-colors"
              >
                Save Configuration
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {/* NAV ITEM ADD MODAL */}
      {navModalOpen && (
        <AdminModal
          isOpen={true}
          title={`Add Navigation Link to ${activeNavGroup.replace('_', ' ').toUpperCase()}`}
          onClose={() => setNavModalOpen(false)}
        >
          <form onSubmit={handleAddNavItem} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Menu Label
              </label>
              <input
                type="text"
                placeholder="e.g. Barrel Racing Analysis"
                value={newNavLabel}
                onChange={(e) => setNewNavLabel(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Target Route or External URL
              </label>
              <input
                type="text"
                placeholder="/disciplines/barrel-racing/ or https://..."
                value={newNavPath}
                onChange={(e) => setNewNavPath(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setNavModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs transition-colors"
              >
                Add Menu Link
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  );
};
