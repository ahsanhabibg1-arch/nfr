'use client';

import React, { useState } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminModal } from '../../components/admin/AdminModal';
import { MEDIA_ASSETS } from '../../data/mockAdminData';

export const AdminMediaPage: React.FC = () => {
  const [selectedAsset, setSelectedAsset] = useState<typeof MEDIA_ASSETS[0] | null>(MEDIA_ASSETS[0]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);


  const filteredAssets = MEDIA_ASSETS.filter((a) =>
    a.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.seoTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.altText.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Media Asset Library"
        description="High-resolution action photography, licensing rights verification, contextual ALT text, and SEO image asset management."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex border border-stone-200 rounded-xs overflow-hidden bg-white">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 ${viewMode === 'grid' ? 'bg-[#0F1115] text-[#D4A757]' : 'text-stone-500 hover:text-stone-900'}`}
                title="Grid View"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 ${viewMode === 'list' ? 'bg-[#0F1115] text-[#D4A757]' : 'text-stone-500 hover:text-stone-900'}`}
                title="List View"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            <button
              onClick={() => setUploadModalOpen(true)}
              className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors"
            >
              + Upload Media (Demo)
            </button>
          </div>
        }
      />

      {/* Main Grid: Assets Area + Metadata Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Media Browser (Col 1-8) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Quick Search */}
          <div className="flex items-center justify-between p-3 bg-white border border-stone-200 rounded-xs">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assets by filename or SEO title..."
              className="w-full text-xs font-sans p-1.5 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none"
            />
          </div>

          {/* Grid View */}
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredAssets.map((asset) => {
                const isSelected = selectedAsset?.id === asset.id;
                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className={`bg-white border rounded-xs overflow-hidden cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#D4A757] ring-2 ring-[#D4A757]/40 shadow-xs'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="aspect-[16/10] bg-stone-100 overflow-hidden">
                      <img
                        src={asset.url}
                        alt={asset.altText}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-3 font-sans">
                      <h4 className="text-xs font-semibold text-stone-900 truncate">
                        {asset.filename}
                      </h4>
                      <div className="flex items-center justify-between text-[10px] text-stone-500 mt-1">
                        <span>{asset.dimensions}</span>
                        <span className="font-mono">{asset.size}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs font-sans border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Preview</th>
                    <th className="py-2.5 px-3">Filename</th>
                    <th className="py-2.5 px-3">Dimensions</th>
                    <th className="py-2.5 px-3">Rights Status</th>
                    <th className="py-2.5 px-3 text-right">Used In</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredAssets.map((asset) => (
                    <tr
                      key={asset.id}
                      onClick={() => setSelectedAsset(asset)}
                      className={`hover:bg-stone-50 cursor-pointer ${
                        selectedAsset?.id === asset.id ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 w-16">
                        <img src={asset.url} alt="" className="w-12 h-8 object-cover rounded-xs" />
                      </td>
                      <td className="py-2.5 px-3 font-medium text-stone-900">{asset.filename}</td>
                      <td className="py-2.5 px-3 text-stone-600 font-mono text-[11px]">{asset.dimensions}</td>
                      <td className="py-2.5 px-3 text-stone-600">{asset.rightsStatus}</td>
                      <td className="py-2.5 px-3 text-right text-stone-600 font-mono">{asset.usedInCount} stories</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Metadata Inspector (Col 9-12) */}
        <aside className="lg:col-span-4 bg-white border border-stone-200 rounded-sm p-5 shadow-2xs space-y-4 font-sans text-xs">
          {selectedAsset ? (
            <>
              <h3 className="text-xs uppercase tracking-wider font-bold text-stone-900 border-b border-stone-100 pb-2">
                Asset Metadata &amp; SEO Inspector
              </h3>

              <div className="aspect-[16/9] bg-stone-100 rounded-xs overflow-hidden border border-stone-200">
                <img src={selectedAsset.url} alt="" className="w-full h-full object-cover" />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-mono font-bold text-stone-500 mb-1">
                  Filename
                </label>
                <input
                  type="text"
                  readOnly
                  value={selectedAsset.filename}
                  className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs font-mono text-[11px] text-stone-700"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-mono font-bold text-stone-500 mb-1">
                  SEO Title
                </label>
                <input
                  type="text"
                  defaultValue={selectedAsset.seoTitle}
                  className="w-full p-2 bg-white border border-stone-300 rounded-xs text-xs text-stone-800"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-mono font-bold text-stone-500 mb-1">
                  Accessible ALT Text
                </label>
                <textarea
                  rows={2}
                  defaultValue={selectedAsset.altText}
                  className="w-full p-2 bg-white border border-stone-300 rounded-xs text-xs text-stone-800"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-mono font-bold text-stone-500 mb-1">
                  Photographer / Archive Credit
                </label>
                <input
                  type="text"
                  defaultValue={selectedAsset.credit}
                  className="w-full p-2 bg-white border border-stone-300 rounded-xs text-xs text-stone-800"
                />
              </div>

              <div className="pt-3 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500">
                <span>Rights: <strong>{selectedAsset.rightsStatus}</strong></span>
                <span>Active References: <strong>{selectedAsset.usedInCount}</strong></span>
              </div>
            </>
          ) : (
            <div className="text-center py-10 text-stone-400">
              Select an image asset to inspect metadata.
            </div>
          )}
        </aside>
      </div>

      {/* Upload Modal (Prototype) */}
      {uploadModalOpen && (
        <AdminModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          title="Upload Editorial Media Asset"
          subtitle="Prototype file staging interface."
          footerActions={
            <div className="flex gap-2">
              <button
                onClick={() => setUploadModalOpen(false)}
                className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs text-stone-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert('Demonstration uploads are not permanently stored until object storage (GCS/S3) is provisioned.');
                  setUploadModalOpen(false);
                }}
                className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs uppercase tracking-wider"
              >
                Upload File (Demo)
              </button>
            </div>
          }
        >
          <div className="space-y-4 font-sans text-xs">
            <div className="p-8 border-2 border-dashed border-stone-300 rounded-xs text-center bg-stone-50">
              <svg className="w-8 h-8 text-stone-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="font-semibold text-stone-700">Drag high-resolution rodeo imagery here</p>
              <p className="text-[11px] text-stone-400 mt-1">Supports JPG, PNG, WebP up to 10MB</p>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-xs">
              <strong>Notice:</strong> Demonstration uploads are not permanently stored in Phase 0. Future phases will integrate direct signed URLs with cloud object storage.
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
};
