'use client';

import React, { useState } from 'react';
import { SourceReference } from '../../../types';
import { ADMIN_SOURCES } from '../../../data/mockAdminData';
import { AdminModal } from '../AdminModal';

interface ArticleSourcesPanelProps {
  sources: SourceReference[];
  onChange: (sources: SourceReference[]) => void;
}

export const ArticleSourcesPanel: React.FC<ArticleSourcesPanelProps> = ({
  sources,
  onChange,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [sourceDirectoryOpen, setSourceDirectoryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Quick add form state
  const [newTitle, setNewTitle] = useState('');
  const [newPublisher, setNewPublisher] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newClassification, setNewClassification] = useState<'Official' | 'Independent Reference' | 'Historical Archive'>('Official');

  const handleRemoveSource = (id: string) => {
    onChange(sources.filter((s) => s.id !== id));
  };

  const handleAttachExisting = (srcItem: (typeof ADMIN_SOURCES)[0]) => {
    if (sources.some((s) => s.id === srcItem.id)) return;

    const attached: SourceReference = {
      id: srcItem.id,
      title: srcItem.title,
      publisher: srcItem.publisher,
      url: srcItem.url,
      date: srcItem.verificationDate,
      note: `${srcItem.type} citation verified ${srcItem.verificationDate}`,
      classification: srcItem.classification,
      status: srcItem.status,
    };
    onChange([...sources, attached]);
    setSourceDirectoryOpen(false);
  };

  const handleAddNewSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPublisher.trim()) return;

    const newSource: SourceReference = {
      id: `src-${Date.now()}`,
      title: newTitle.trim(),
      publisher: newPublisher.trim(),
      url: newUrl.trim() || undefined,
      note: newNote.trim() || undefined,
      date: 'Current Season',
      classification: newClassification,
      status: 'verified',
    };

    onChange([...sources, newSource]);
    setNewTitle('');
    setNewPublisher('');
    setNewUrl('');
    setNewNote('');
    setModalOpen(false);
  };

  const filteredDirectory = ADMIN_SOURCES.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.publisher.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-white border border-stone-200 rounded-sm p-5 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
        <div>
          <h4 className="font-serif font-bold text-stone-900 text-sm">
            Sources &amp; Judicial Evidence
          </h4>
          <p className="text-[11px] text-stone-500 font-sans">
            Attach official rulebooks, PRCA scoring archives, or historical documents to satisfy E-E-A-T.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSourceDirectoryOpen(true)}
            className="px-2.5 py-1 text-xs font-mono font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xs transition-colors"
          >
            Attach from Directory
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-2.5 py-1 text-xs font-mono font-medium text-[#D4A757] bg-[#0F1115] hover:bg-stone-800 rounded-xs transition-colors"
          >
            + New Source
          </button>
        </div>
      </div>

      {/* Sources List */}
      {sources.length > 0 ? (
        <div className="divide-y divide-stone-200 border border-stone-200 rounded-xs overflow-hidden">
          {sources.map((src) => (
            <div key={src.id} className="p-3 bg-white flex items-start justify-between gap-3 text-xs font-sans hover:bg-stone-50/50">
              <div className="space-y-0.5 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-stone-900">{src.title}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-xs font-semibold ${
                    src.status === 'verified' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {src.status === 'verified' ? 'Verified Official' : 'Needs Review'}
                  </span>
                  {src.classification && (
                    <span className="text-[10px] font-mono text-stone-400">
                      [{src.classification}]
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-stone-600">
                  <span>Publisher: <strong>{src.publisher}</strong></span>
                  {src.date && <span className="text-stone-400 ml-2">&bull; {src.date}</span>}
                </div>
                {src.note && (
                  <p className="text-[11px] text-stone-500 italic mt-0.5">
                    Citation note: {src.note}
                  </p>
                )}
                {src.url && (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-mono text-[#8B5E3C] hover:underline block pt-0.5"
                  >
                    {src.url}
                  </a>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleRemoveSource(src.id)}
                className="text-stone-400 hover:text-rose-600 p-1"
                title="Detach Source"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 bg-stone-50 border border-dashed border-stone-200 rounded-xs text-xs text-stone-500 text-center italic">
          No external sources or judicial rulebooks attached yet. Use the buttons above to link primary evidence.
        </div>
      )}

      {/* DIRECTORY BROWSE MODAL */}
      {sourceDirectoryOpen && (
        <AdminModal
          isOpen={true}
          title="Attach Verified Source from Directory"
          onClose={() => setSourceDirectoryOpen(false)}
        >
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Search source by title or publisher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
            />

            <div className="divide-y divide-stone-200 border border-stone-200 rounded-xs max-h-60 overflow-y-auto">
              {filteredDirectory.map((item) => {
                const isAttached = sources.some((s) => s.id === item.id);
                return (
                  <div key={item.id} className="p-3 flex items-center justify-between text-xs hover:bg-stone-50">
                    <div>
                      <div className="font-semibold text-stone-900">{item.title}</div>
                      <div className="text-[11px] text-stone-500 font-mono">
                        {item.publisher} &bull; {item.type}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isAttached}
                      onClick={() => handleAttachExisting(item)}
                      className={`px-3 py-1 text-xs rounded-xs font-medium transition-colors ${
                        isAttached
                          ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                          : 'bg-[#0F1115] text-[#D4A757] hover:bg-stone-800'
                      }`}
                    >
                      {isAttached ? 'Attached' : 'Attach Source'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </AdminModal>
      )}

      {/* QUICK NEW SOURCE MODAL */}
      {modalOpen && (
        <AdminModal
          isOpen={true}
          title="Create New Source Citation"
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handleAddNewSource} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Source Document Title
              </label>
              <input
                type="text"
                placeholder="e.g. WPRA Rulebook 2026 Edition"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Publishing Entity / Provenance
              </label>
              <input
                type="text"
                placeholder="e.g. Women’s Professional Rodeo Association"
                value={newPublisher}
                onChange={(e) => setNewPublisher(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Source URL (Verification Link)
              </label>
              <input
                type="text"
                placeholder="https://wpra.com/rules..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Classification Type
              </label>
              <select
                value={newClassification}
                onChange={(e) => setNewClassification(e.target.value as any)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              >
                <option value="Official">Official Sanctioning Body</option>
                <option value="Independent Reference">Independent Reference / Media</option>
                <option value="Historical Archive">Historical Statistical Archive</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-medium mb-1">
                Specific Citation Note / Rule Section
              </label>
              <input
                type="text"
                placeholder="e.g. Section 4.1.2 — 5-second penalty for barrel knockdown"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs transition-colors"
              >
                Attach Source
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  );
};
