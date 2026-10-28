import React, { useState } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminModal } from '../../components/admin/AdminModal';
import { useSEO } from '../../utils/seo';

type OrgTab = 'categories' | 'types' | 'tags' | 'profiles';

interface ArticleTypeConfig {
  id: string;
  name: string;
  slug: string;
  description: string;
  templateLayout: string;
  schemaType: string;
  articlesCount: number;
}

const ARTICLE_TYPES: ArticleTypeConfig[] = [
  {
    id: 'typ-01',
    name: 'Feature Dispatch',
    slug: 'feature',
    description: 'Long-form narrative journalism, deep competitor profiles, and behind-the-scenes arena stories.',
    templateLayout: 'Standard Magazine with Drop-Caps & Pull Quotes',
    schemaType: 'Article',
    articlesCount: 4,
  },
  {
    id: 'typ-02',
    name: 'Technical Analysis',
    slug: 'analysis',
    description: 'In-depth scoring physics, judicial breakdown tables, and 10-round aggregate statistics.',
    templateLayout: 'Data-Heavy with Comparison Tables & Formula Callouts',
    schemaType: 'Article',
    articlesCount: 3,
  },
  {
    id: 'typ-03',
    name: 'Spectator Guide',
    slug: 'guide',
    description: 'Practical, actionable visitor guidance covering travel, hotels, transit, and streaming.',
    templateLayout: 'Step-by-Step with Advice Blocks & Warnings',
    schemaType: 'Guide',
    articlesCount: 4,
  },
  {
    id: 'typ-04',
    name: 'Competition News',
    slug: 'news',
    description: 'Nightly round results, injury reports, and stock contracting announcements.',
    templateLayout: 'Inverted Pyramid with Timestamps',
    schemaType: 'NewsArticle',
    articlesCount: 2,
  },
];

const TAXONOMY_TAGS = [
  { name: 'Bull Riding', count: 5, category: 'Roughstock' },
  { name: 'Saddle Bronc', count: 4, category: 'Roughstock' },
  { name: 'Thomas & Mack', count: 8, category: 'Venue' },
  { name: '10-Round Average', count: 3, category: 'Scoring' },
  { name: 'Cowboy Christmas', count: 3, category: 'Lifestyle' },
  { name: 'Broadcast & Streaming', count: 3, category: 'Spectator' },
  { name: 'Clear Bag Policy', count: 2, category: 'Logistics' },
  { name: 'Calgary Stampede', count: 2, category: 'International' },
];

export const AdminEditorialOrgPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<OrgTab>('categories');
  const [modalOpen, setModalOpen] = useState(false);
  const [newTagText, setNewTagText] = useState('');

  useSEO({
    title: 'Editorial Organization & Taxonomy — CMS',
    description: 'Configure categories, tags, article types, and SEO templates.',
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Editorial Organization &amp; Taxonomy"
        description="Configure canonical publishing categories, semantic tags, article type templates, and automated schema profiles."
        actions={
          <button
            onClick={() => setModalOpen(true)}
            className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors"
          >
            + Create New Tag / Category
          </button>
        }
      />

      <AdminTabs
        tabs={[
          { id: 'categories', label: 'Primary Sections (5)', count: 5 },
          { id: 'types', label: 'Configurable Article Types (4)', count: 4 },
          { id: 'tags', label: 'Content Tags (8)', count: 8 },
          { id: 'profiles', label: 'SEO Schemas & Defaults', count: 3 },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as OrgTab)}
      />

      {/* Tab 1: Categories */}
      {activeTab === 'categories' && (
        <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-stone-200 text-xs text-stone-500 font-sans">
            <span>Primary editorial categories are the fundamental five pillars of NFRGuide.com navigation.</span>
          </div>
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Section Name &amp; URL Slug</th>
                <th className="py-3 px-4">Editorial Beat Description</th>
                <th className="py-3 px-4">Published Dispatches</th>
                <th className="py-3 px-4 text-right">Route</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              <tr className="hover:bg-stone-50">
                <td className="py-3 px-4 font-bold text-stone-900 font-serif text-sm">
                  NFR Competition
                  <span className="block font-mono text-[10px] text-stone-400">/competition/</span>
                </td>
                <td className="py-3 px-4 text-stone-600">Arena action, 7 disciplines, 10-round aggregate, rules &amp; scoring.</td>
                <td className="py-3 px-4 text-stone-600 tabular-nums">4 articles</td>
                <td className="py-3 px-4 text-right">
                  <a href="/competition/" target="_blank" className="text-[#8B5E3C] font-semibold hover:underline">
                    View Landing &rarr;
                  </a>
                </td>
              </tr>
              <tr className="hover:bg-stone-50">
                <td className="py-3 px-4 font-bold text-stone-900 font-serif text-sm">
                  NFR Entertainment
                  <span className="block font-mono text-[10px] text-stone-400">/entertainment/</span>
                </td>
                <td className="py-3 px-4 text-stone-600">Country residencies, South Point buckle shows, and nightlife.</td>
                <td className="py-3 px-4 text-stone-600 tabular-nums">2 articles</td>
                <td className="py-3 px-4 text-right">
                  <a href="/entertainment/" target="_blank" className="text-[#8B5E3C] font-semibold hover:underline">
                    View Landing &rarr;
                  </a>
                </td>
              </tr>
              <tr className="hover:bg-stone-50">
                <td className="py-3 px-4 font-bold text-stone-900 font-serif text-sm">
                  NFR Events &amp; Shopping
                  <span className="block font-mono text-[10px] text-stone-400">/events-shopping/</span>
                </td>
                <td className="py-3 px-4 text-stone-600">Cowboy Christmas, Junior NFR, Miss Rodeo America, and Western craftsmanship.</td>
                <td className="py-3 px-4 text-stone-600 tabular-nums">2 articles</td>
                <td className="py-3 px-4 text-right">
                  <a href="/events-shopping/" target="_blank" className="text-[#8B5E3C] font-semibold hover:underline">
                    View Landing &rarr;
                  </a>
                </td>
              </tr>
              <tr className="hover:bg-stone-50">
                <td className="py-3 px-4 font-bold text-stone-900 font-serif text-sm">
                  NFR Plan &amp; Watch
                  <span className="block font-mono text-[10px] text-stone-400">/plan-watch/</span>
                </td>
                <td className="py-3 px-4 text-stone-600">Broadcast channels, streaming passes, hotel corridors, and venue navigation.</td>
                <td className="py-3 px-4 text-stone-600 tabular-nums">4 articles</td>
                <td className="py-3 px-4 text-right">
                  <a href="/plan-watch/" target="_blank" className="text-[#8B5E3C] font-semibold hover:underline">
                    View Landing &rarr;
                  </a>
                </td>
              </tr>
              <tr className="hover:bg-stone-50">
                <td className="py-3 px-4 font-bold text-stone-900 font-serif text-sm">
                  More Rodeo
                  <span className="block font-mono text-[10px] text-stone-400">/rodeo-events/</span>
                </td>
                <td className="py-3 px-4 text-stone-600">International ProRodeo tour stops, Texas circuits, and Canadian crown jewels.</td>
                <td className="py-3 px-4 text-stone-600 tabular-nums">2 articles</td>
                <td className="py-3 px-4 text-right">
                  <a href="/rodeo-events/" target="_blank" className="text-[#8B5E3C] font-semibold hover:underline">
                    View Landing &rarr;
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Article Types */}
      {activeTab === 'types' && (
        <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-stone-200 text-xs text-stone-500 font-sans">
            <span><strong>Configurable Article Types:</strong> Modular types that dictate layout structure, JSON-LD schema, and reader rendering rules.</span>
          </div>
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Article Type</th>
                <th className="py-3 px-4">Purpose &amp; Description</th>
                <th className="py-3 px-4">Template Layout</th>
                <th className="py-3 px-4">Schema.org Entity</th>
                <th className="py-3 px-4 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {ARTICLE_TYPES.map((t) => (
                <tr key={t.id} className="hover:bg-stone-50 transition-colors">
                  <td className="py-3 px-4 font-bold text-stone-900">
                    <span className="font-serif text-sm block">{t.name}</span>
                    <span className="text-[10px] font-mono text-stone-400">type: {t.slug}</span>
                  </td>
                  <td className="py-3 px-4 text-stone-600">{t.description}</td>
                  <td className="py-3 px-4 text-stone-700">{t.templateLayout}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-[#8B5E3C]">{t.schemaType}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{t.articlesCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Content Tags */}
      {activeTab === 'tags' && (
        <div className="bg-white border border-stone-200 rounded-sm p-6 shadow-2xs">
          <h3 className="text-xs uppercase tracking-wider font-bold text-stone-900 font-sans mb-3">
            Active Demonstration Tags
          </h3>
          <div className="flex flex-wrap gap-2 mb-6">
            {TAXONOMY_TAGS.map((tag) => (
              <span
                key={tag.name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F7F3EA] border border-stone-300 rounded-xs text-xs font-sans text-stone-800"
              >
                <span className="font-semibold">{tag.name}</span>
                <span className="text-[10px] font-mono text-stone-400">({tag.count})</span>
              </span>
            ))}
          </div>

          <div className="p-4 bg-stone-50 border border-stone-200 rounded-xs max-w-md space-y-2">
            <h4 className="text-xs font-bold text-stone-900 font-sans">Quick Add Tag</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTagText}
                onChange={(e) => setNewTagText(e.target.value)}
                placeholder="Enter new tag..."
                className="flex-1 p-1.5 text-xs border border-stone-300 rounded-xs bg-white"
              />
              <button
                onClick={() => {
                  if (newTagText) {
                    alert(`Tag "${newTagText}" staged in prototype state.`);
                    setNewTagText('');
                  }
                }}
                className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs uppercase tracking-wider"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: SEO Profiles */}
      {activeTab === 'profiles' && (
        <div className="bg-white border border-stone-200 rounded-sm p-6 shadow-2xs space-y-4">
          <h3 className="text-xs uppercase tracking-wider font-bold text-stone-900 font-sans">
            SEO Schema Presets
          </h3>
          <p className="text-xs text-stone-500 font-sans">
            Presets automatically applied by the client-side useSEO hook and future server-side metadata generator.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans text-xs">
            <div className="p-4 bg-[#F7F3EA] border border-stone-200 rounded-xs">
              <h4 className="font-bold text-stone-900 mb-1">Standard Article Profile</h4>
              <p className="text-stone-600 text-[11px] mb-2">Used by Feature, Analysis, and News dispatches.</p>
              <span className="font-mono text-[10px] text-[#8B5E3C] block">Schema: @type Article / NewsArticle</span>
            </div>
            <div className="p-4 bg-[#F7F3EA] border border-stone-200 rounded-xs">
              <h4 className="font-bold text-stone-900 mb-1">Guide / How-To Profile</h4>
              <p className="text-stone-600 text-[11px] mb-2">Used by Plan &amp; Watch and Discipline overviews.</p>
              <span className="font-mono text-[10px] text-[#8B5E3C] block">Schema: @type Guide / FAQ</span>
            </div>
            <div className="p-4 bg-[#F7F3EA] border border-stone-200 rounded-xs">
              <h4 className="font-bold text-stone-900 mb-1">Event Edition Profile</h4>
              <p className="text-stone-600 text-[11px] mb-2">Used by Rodeo Hubs and Crown Jewel events.</p>
              <span className="font-mono text-[10px] text-[#8B5E3C] block">Schema: @type SportsEvent</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <AdminModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Create Taxonomy Entity"
          subtitle="Add a category, subtopic, or semantic tag."
          footerActions={
            <div className="flex gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs text-stone-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert('Taxonomy record staged in demonstration memory.');
                  setModalOpen(false);
                }}
                className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs uppercase tracking-wider"
              >
                Save
              </button>
            </div>
          }
        >
          <div className="space-y-3 font-sans text-xs">
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Taxonomy Type</label>
              <select className="w-full p-2 border border-stone-300 rounded-xs bg-stone-50">
                <option>Tag</option>
                <option>Subcategory</option>
                <option>Article Type</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Label Name</label>
              <input type="text" placeholder="e.g. Bareback Rigging" className="w-full p-2 border border-stone-300 rounded-xs" />
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
};
