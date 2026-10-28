'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminModal } from '../../components/admin/AdminModal';
import { AFFILIATE_PARTNERS, COMMERCIAL_LINKS } from '../../data/mockAdminData';
import { AffiliatePartner, CommercialLink } from '../../types/admin';

interface AdSlotConfig {
  id: string;
  name: string;
  location: string;
  dimensions: string;
  provider: 'AdSense Responsive' | 'Direct Sponsor' | 'Affiliate Native Tile';
  status: 'active' | 'paused';
  fillRateEstimate: string;
}

const INITIAL_AD_SLOTS: AdSlotConfig[] = [
  {
    id: 'slot-01',
    name: 'Homepage Top Leaderboard',
    location: 'Below Section A Hero',
    dimensions: '728 × 90 / 970 × 250',
    provider: 'AdSense Responsive',
    status: 'active',
    fillRateEstimate: '94%',
  },
  {
    id: 'slot-02',
    name: 'Article Inline Mid-Content Slot',
    location: 'Inside Article Body (Paragraph 4)',
    dimensions: '300 × 250 / Fluid',
    provider: 'AdSense Responsive',
    status: 'active',
    fillRateEstimate: '88%',
  },
  {
    id: 'slot-03',
    name: 'Spectator Guide Sponsor Tile',
    location: 'Section E (Plan & Watch)',
    dimensions: '336 × 280',
    provider: 'Direct Sponsor',
    status: 'active',
    fillRateEstimate: '100%',
  },
  {
    id: 'slot-04',
    name: 'Cowboy Christmas Shopping Showcase',
    location: 'Section G Native Showcase',
    dimensions: 'Native Grid Unit',
    provider: 'Affiliate Native Tile',
    status: 'active',
    fillRateEstimate: '100%',
  },
];

export const AdminMonetizationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'affiliates' | 'commercial_links' | 'ad_slots' | 'disclosures'>('affiliates');
  const [partners, setPartners] = useState<AffiliatePartner[]>(AFFILIATE_PARTNERS);
  const [commercialLinks] = useState<CommercialLink[]>(COMMERCIAL_LINKS);
  const [adSlots, setAdSlots] = useState<AdSlotConfig[]>(INITIAL_AD_SLOTS);
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  
  // New partner form state
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerCat, setNewPartnerCat] = useState<'Lodging' | 'Ticketing' | 'Western Apparel' | 'Equipment & Tack'>('Lodging');
  const [newPartnerModel, setNewPartnerModel] = useState('');
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleToggleSlot = (id: string) => {
    setAdSlots(prev =>
      prev.map(slot => (slot.id === id ? { ...slot, status: slot.status === 'active' ? 'paused' : 'active' } : slot))
    );
    showToast('Ad slot state updated');
  };

  const handleAddPartner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartnerName.trim()) return;

    const newPartner: AffiliatePartner = {
      id: `aff-${Date.now()}`,
      name: newPartnerName.trim(),
      category: newPartnerCat,
      status: 'Active',
      activeLinksCount: 0,
      disclosureTag: 'Verified Partner',
      relAttribute: 'sponsored',
      commissionModel: newPartnerModel || 'Standard Referral CPA',
    };

    setPartners(prev => [...prev, newPartner]);
    setNewPartnerName('');
    setNewPartnerModel('');
    setPartnerModalOpen(false);
    showToast(`Added partner: ${newPartner.name}`);
  };

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono animate-fade-in flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toastMessage}
        </div>
      )}

      <AdminPageHeader
        title="Monetization & Commercial Operations"
        description="Manage affiliate partnerships, commercial link audits, ad placements, and FTC/Search-compliant disclosure statements."
        breadcrumbs={[
          { label: 'Admin', path: '/admin/' },
          { label: 'Monetization' },
        ]}
        actions={
          <button
            onClick={() => setPartnerModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-sans font-semibold text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 text-[#D4A757]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Affiliate Partner
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          title="Active Commercial Partners"
          value={partners.length.toString()}
          change="3 Approved / 0 Paused"
          trend="up"
          description="Lodging, Ticketing & Western goods"
        />
        <AdminStatCard
          title="Tracked Commercial Links"
          value={commercialLinks.length.toString()}
          change="100% Rel=Sponsored Compliant"
          trend="up"
          description="Audited across editorial articles"
        />
        <AdminStatCard
          title="Configured Ad Slots"
          value={adSlots.filter(s => s.status === 'active').length.toString()}
          change="4 Active Positions"
          trend="neutral"
          description="Leaderboard, In-article, Native"
        />
        <AdminStatCard
          title="Search Engine Compliance"
          value="100%"
          change="Zero un-disclosed links"
          trend="up"
          description="Google Webmaster Link Guidelines"
        />
      </div>

      <AdminTabs
        tabs={[
          { id: 'affiliates', label: 'Commercial Partners', count: partners.length },
          { id: 'commercial_links', label: 'Audited Links Directory', count: commercialLinks.length },
          { id: 'ad_slots', label: 'Ad Placements & Slots', count: adSlots.length },
          { id: 'disclosures', label: 'FTC & Independence Disclosures' },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
      />

      {/* TAB 1: PARTNERS */}
      {activeTab === 'affiliates' && (
        <div className="bg-white border border-stone-200 rounded-xs shadow-2xs overflow-hidden">
          <div className="px-4 py-3 bg-stone-50/50 border-b border-stone-200 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
              Approved Commercial Partners Directory ({partners.length})
            </span>
            <span className="text-[11px] text-stone-500 font-mono">
              All commercial links enforce rel="sponsored"
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Partner Entity</th>
                  <th className="px-4 py-2.5">Vertical</th>
                  <th className="px-4 py-2.5">Commercial Model</th>
                  <th className="px-4 py-2.5">Rel Policy</th>
                  <th className="px-4 py-2.5 text-center">Active Links</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {partners.map((partner) => (
                  <tr key={partner.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3 font-semibold text-stone-900">
                      {partner.name}
                      <span className="block text-[11px] font-normal text-stone-500 font-mono">
                        Tag: {partner.disclosureTag}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-stone-100 text-stone-700 rounded-xs">
                        {partner.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-600 font-mono text-[11px]">
                      {partner.commissionModel}
                    </td>
                    <td className="px-4 py-3 font-mono text-emerald-800 text-[11px]">
                      <code className="bg-emerald-50 px-1 py-0.5 border border-emerald-200 rounded-xs">
                        rel="{partner.relAttribute}"
                      </code>
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-stone-800">
                      {partner.activeLinksCount}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-xs font-semibold">
                        {partner.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => showToast(`Audit link health for ${partner.name}`)}
                        className="text-stone-400 hover:text-stone-900 text-[11px] font-mono underline"
                      >
                        Audit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: AUDITED COMMERCIAL LINKS */}
      {activeTab === 'commercial_links' && (
        <div className="bg-white border border-stone-200 rounded-xs shadow-2xs overflow-hidden">
          <div className="px-4 py-3 bg-stone-50/50 border-b border-stone-200 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
              Live Commercial Hyperlink Registry ({commercialLinks.length})
            </span>
            <span className="text-[11px] text-stone-500 font-mono">
              Monitored by automated daily SEO audit job
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-mono text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Anchor Text</th>
                  <th className="px-4 py-2.5">Target URL</th>
                  <th className="px-4 py-2.5">Partner Entity</th>
                  <th className="px-4 py-2.5">Containing Article</th>
                  <th className="px-4 py-2.5">Required Rel Tag</th>
                  <th className="px-4 py-2.5">Last Audited</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {commercialLinks.map((link) => (
                  <tr key={link.id} className="hover:bg-stone-50/50">
                    <td className="px-4 py-3 font-medium text-stone-900">
                      “{link.anchorText}”
                    </td>
                    <td className="px-4 py-3 font-mono text-stone-500 max-w-xs truncate text-[11px]">
                      <a href={link.targetUrl} target="_blank" rel="noreferrer" className="hover:underline text-stone-700">
                        {link.targetUrl}
                      </a>
                    </td>
                    <td className="px-4 py-3 font-semibold text-stone-800">
                      {link.partnerName}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/articles/${link.articleSlug}/`} className="text-stone-700 hover:underline hover:text-[#8B5E3C]">
                        {link.articleTitle.slice(0, 36)}...
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      <code className="bg-emerald-50 text-emerald-800 px-1 py-0.5 border border-emerald-200 rounded-xs">
                        {link.rel}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-stone-500 font-mono text-[11px]">
                      {link.lastAudited}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: AD PLACEMENTS */}
      {activeTab === 'ad_slots' && (
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 rounded-xs shadow-2xs overflow-hidden">
            <div className="px-4 py-3 bg-stone-50/50 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
                Display & Native Ad Placements ({adSlots.length})
              </span>
              <span className="text-[11px] text-stone-500 font-mono">
                Supports Google AdSense and Direct Partner Creatives
              </span>
            </div>

            <div className="divide-y divide-stone-200">
              {adSlots.map((slot) => (
                <div key={slot.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-stone-50/50">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-sans font-bold text-sm text-stone-900">
                        {slot.name}
                      </h4>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold ${
                        slot.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-500'
                      }`}>
                        {slot.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-stone-500 font-mono">
                      <span>Location: {slot.location}</span>
                      <span>•</span>
                      <span>Size: {slot.dimensions}</span>
                      <span>•</span>
                      <span className="text-[#8B5E3C] font-semibold">{slot.provider}</span>
                      <span>•</span>
                      <span>Fill: {slot.fillRateEstimate}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleToggleSlot(slot.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-xs border transition-colors ${
                        slot.status === 'active'
                          ? 'border-stone-300 text-stone-700 bg-white hover:bg-stone-50'
                          : 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                    >
                      {slot.status === 'active' ? 'Pause Slot' : 'Activate Slot'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DISCLOSURES */}
      {activeTab === 'disclosures' && (
        <div className="bg-white border border-stone-200 rounded-xs p-6 max-w-3xl space-y-5">
          <div>
            <h3 className="font-sans font-bold text-sm text-stone-900 mb-1">
              FTC Commercial & Editorial Independence Statements
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              These official notices are permanently rendered in the public footer (Section J) and at the apex of any article carrying sponsored lodging or ticket marketplace recommendations.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Global Commercial Disclaimer Text
              </label>
              <textarea
                rows={3}
                defaultValue="NFRGuide is an independent rodeo editorial publication. We may earn an affiliate commission on verified ticket marketplace or hotel reservations made through our links, at no additional cost to you. All editorial assessments remain strictly independent."
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Non-Affiliation Institutional Disclaimer
              </label>
              <textarea
                rows={3}
                defaultValue="NFRGuide is NOT affiliated with, sponsored by, or endorsed by the Professional Rodeo Cowboys Association (PRCA), Las Vegas Events (LVE), the National Finals Rodeo, or the Thomas & Mack Center. Official marks are used solely for descriptive editorial purposes."
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={() => showToast('Disclosure policies updated successfully')}
                className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-sans font-semibold rounded-xs hover:bg-stone-800 transition-colors"
              >
                Save Disclosures
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PARTNER ADD MODAL */}
      {partnerModalOpen && (
        <AdminModal
          isOpen={true}
          title="Register New Commercial Partner"
          onClose={() => setPartnerModalOpen(false)}
        >
          <form onSubmit={handleAddPartner} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Partner Legal Entity
              </label>
              <input
                type="text"
                placeholder="e.g. Resort World Las Vegas"
                value={newPartnerName}
                onChange={(e) => setNewPartnerName(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Commercial Category
              </label>
              <select
                value={newPartnerCat}
                onChange={(e) => setNewPartnerCat(e.target.value as any)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              >
                <option value="Lodging">Lodging & Resort Corridors</option>
                <option value="Ticketing">Secondary Ticket Resale / Exchange</option>
                <option value="Western Apparel">Western Apparel & Boots</option>
                <option value="Equipment & Tack">Equipment & Tack</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Remuneration Model
              </label>
              <input
                type="text"
                placeholder="e.g. 8% Booking CPA / Editorial Safe"
                value={newPartnerModel}
                onChange={(e) => setNewPartnerModel(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div className="p-3 bg-stone-50 rounded-xs border border-stone-200 text-[11px] text-stone-600 font-mono">
              Notice: All generated links will automatically receive <span className="font-bold text-stone-800">rel="sponsored"</span> to satisfy search engine commercial policies.
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setPartnerModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs transition-colors"
              >
                Register Partner
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  );
};
