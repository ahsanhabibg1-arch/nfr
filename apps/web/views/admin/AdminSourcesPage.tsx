'use client';

import React, { useState } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { AdminModal } from '../../components/admin/AdminModal';
import { ADMIN_SOURCES } from '../../data/mockAdminData';

export const AdminSourcesPage: React.FC = () => {
  const [sources, setSources] = useState(ADMIN_SOURCES);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<typeof ADMIN_SOURCES[0] | null>(null);


  const handleOpenEdit = (src: typeof ADMIN_SOURCES[0]) => {
    setSelectedSource(src);
    setEditModalOpen(true);
  };

  const handleOpenNew = () => {
    setSelectedSource(null);
    setEditModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Sources, Citations &amp; Judicial References"
        description="Maintain verified primary sources, official rulebooks, historical arena archives, and sanctioning body regulations cited across NFRGuide."
        actions={
          <button
            onClick={handleOpenNew}
            className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors"
          >
            + Add Verified Source
          </button>
        }
      />

      {/* Sources Table */}
      <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-stone-200 flex items-center justify-between text-xs text-stone-500 font-sans">
          <span>Active Citation Directory ({sources.length} Verified Records)</span>
          <span className="font-mono text-[11px]">Audit Cycle: October 2026</span>
        </div>

        <table className="w-full text-left text-xs font-sans border-collapse">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
              <th className="py-3 px-4">Source Title &amp; URL</th>
              <th className="py-3 px-4">Publisher / Sanctioning Body</th>
              <th className="py-3 px-4">Classification</th>
              <th className="py-3 px-4">Last Verified</th>
              <th className="py-3 px-4">Linked Articles</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {sources.map((src) => (
              <tr key={src.id} className="hover:bg-stone-50 transition-colors">
                <td className="py-3 px-4 font-bold text-stone-900 max-w-sm">
                  <span className="font-serif text-sm block leading-snug">{src.title}</span>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-mono text-[11px] text-[#8B5E3C] hover:underline block mt-0.5 truncate"
                  >
                    {src.url} &rarr;
                  </a>
                </td>
                <td className="py-3 px-4 text-stone-700 font-medium">{src.publisher}</td>
                <td className="py-3 px-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-xs bg-[#F7F3EA] border border-stone-300 text-stone-800">
                    {src.classification}
                  </span>
                </td>
                <td className="py-3 px-4 text-stone-500 font-mono text-[11px]">{src.verificationDate}</td>
                <td className="py-3 px-4 text-stone-600 font-mono tabular-nums">{src.linkedArticleCount} stories</td>
                <td className="py-3 px-4">
                  <AdminStatusBadge status="Verified" />
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => handleOpenEdit(src)}
                    className="text-[#8B5E3C] hover:underline font-bold"
                  >
                    Edit &rarr;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit / Create Modal */}
      {editModalOpen && (
        <AdminModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title={selectedSource ? `Edit Source: ${selectedSource.title}` : 'Add New Verified Reference'}
          subtitle="All cited sources must adhere to professional journalistic integrity standards."
          footerActions={
            <div className="flex gap-2">
              <button
                onClick={() => setEditModalOpen(false)}
                className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs text-stone-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert('Source record updated in demonstration state.');
                  setEditModalOpen(false);
                }}
                className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs uppercase tracking-wider"
              >
                Save Source
              </button>
            </div>
          }
        >
          <div className="space-y-4 font-sans text-xs">
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Source Title</label>
              <input
                type="text"
                defaultValue={selectedSource?.title || ''}
                placeholder="e.g. PRCA Official Rule Book 2026"
                className="w-full p-2 border border-stone-300 rounded-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Publisher or Organization</label>
              <input
                type="text"
                defaultValue={selectedSource?.publisher || ''}
                placeholder="e.g. Professional Rodeo Cowboys Association"
                className="w-full p-2 border border-stone-300 rounded-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Verification URL</label>
              <input
                type="url"
                defaultValue={selectedSource?.url || ''}
                placeholder="https://..."
                className="w-full p-2 border border-stone-300 rounded-xs font-mono text-[11px]"
              />
            </div>
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Classification</label>
              <select
                defaultValue={selectedSource?.classification || 'Official'}
                className="w-full p-2 border border-stone-300 rounded-xs bg-stone-50"
              >
                <option value="Official">Official Sanctioning Body</option>
                <option value="Independent Reference">Independent Reference</option>
                <option value="Historical Archive">Historical Archive</option>
              </select>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
};
