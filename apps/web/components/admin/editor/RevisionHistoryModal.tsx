'use client';

import React, { useState } from 'react';
import { ArticleRevision, Article } from '../../../types';
import { AdminModal } from '../AdminModal';

interface RevisionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  revisions: ArticleRevision[];
  currentArticle: Partial<Article>;
  onRestore: (revisionId: string) => void;
}

export const RevisionHistoryModal: React.FC<RevisionHistoryModalProps> = ({
  isOpen,
  onClose,
  revisions,
  currentArticle,
  onRestore,
}) => {
  const [selectedRevId, setSelectedRevId] = useState<string | null>(
    revisions.length > 0 ? revisions[0].id : null
  );
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedRev = revisions.find((r) => r.id === selectedRevId);

  return (
    <AdminModal
      isOpen={isOpen}
      title="Article Revision History & Audit Log"
      onClose={onClose}
      className="max-w-4xl"
    >
      <div className="space-y-4">
        {/* How revisions work (DB-backed — Batch 19 relabel of the former Phase-0 notice) */}
        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xs text-xs text-stone-700 flex items-start gap-2">
          <svg className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <span className="font-semibold block text-stone-900">Revision history</span>
            Each saved edit and workflow transition is stored as a revision in the database. Restoring one overwrites the current draft with that snapshot and records a restore event in the audit trail.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Left Column: Revision Timeline */}
          <div className="md:col-span-5 border border-stone-200 rounded-xs overflow-hidden max-h-[420px] overflow-y-auto divide-y divide-stone-200">
            {revisions.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500">
                No prior revisions recorded for this article yet.
              </div>
            ) : (
              revisions.map((rev) => {
                const isSelected = rev.id === selectedRevId;
                return (
                  <button
                    key={rev.id}
                    type="button"
                    onClick={() => setSelectedRevId(rev.id)}
                    className={`w-full text-left p-3 transition-colors ${
                      isSelected ? 'bg-[#1E293B] text-white' : 'hover:bg-stone-50 text-stone-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                      <span className={isSelected ? 'text-[#D4A757]' : 'text-stone-500'}>
                        {rev.timestamp}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded-xs uppercase text-[9px] ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'
                      }`}>
                        {rev.status}
                      </span>
                    </div>
                    <div className="font-semibold text-xs truncate">
                      {rev.actorName} &bull; <span className={isSelected ? 'text-stone-300 font-normal' : 'text-stone-500 font-normal'}>{rev.actorRole}</span>
                    </div>
                    <p className={`text-[11px] line-clamp-2 mt-1 leading-snug ${
                      isSelected ? 'text-stone-200' : 'text-stone-600'
                    }`}>
                      {rev.summary}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {/* Right Column: Revision Details & Diff */}
          <div className="md:col-span-7 border border-stone-200 rounded-xs p-4 bg-stone-50/50 flex flex-col justify-between">
            {selectedRev ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
                      Snapshot Metadata
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-stone-200 text-stone-700 rounded-xs">
                      ID: {selectedRev.id}
                    </span>
                  </div>
                  <h4 className="font-serif font-bold text-stone-900 text-base mt-2">
                    {selectedRev.snapshot.title || 'Untitled Snapshot'}
                  </h4>
                  {selectedRev.snapshot.deck && (
                    <p className="text-xs text-stone-600 font-sans mt-1 italic">
                      Deck: {selectedRev.snapshot.deck}
                    </p>
                  )}
                </div>

                <div className="space-y-2 text-xs font-sans">
                  <div className="p-2.5 bg-white border border-stone-200 rounded-xs">
                    <span className="text-[10px] font-mono uppercase text-stone-400 block mb-0.5">Summary of Changes:</span>
                    <p className="text-stone-800">{selectedRev.summary}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-white border border-stone-200 rounded-xs">
                      <span className="text-[10px] font-mono uppercase text-stone-400 block">Status:</span>
                      <span className="font-semibold text-stone-800 capitalize">{selectedRev.status}</span>
                    </div>
                    <div className="p-2 bg-white border border-stone-200 rounded-xs">
                      <span className="text-[10px] font-mono uppercase text-stone-400 block">Author:</span>
                      <span className="font-semibold text-stone-800">{selectedRev.actorName}</span>
                    </div>
                  </div>

                  {selectedRev.snapshot.structuredBody && (
                    <div className="p-2 bg-white border border-stone-200 rounded-xs font-mono text-[11px] text-stone-600">
                      Blocks Count: <strong>{selectedRev.snapshot.structuredBody.length} blocks</strong>
                    </div>
                  )}
                </div>

                {/* Restore Trigger */}
                <div className="pt-4 border-t border-stone-200 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setConfirmRestoreId(selectedRev.id)}
                    className="px-4 py-2 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Restore This Revision
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-stone-400 text-center py-12">
                Select a revision from the timeline to inspect snapshot data.
              </div>
            )}
          </div>
        </div>

        {/* Restore Confirmation Dialog */}
        {confirmRestoreId && (
          <div className="p-4 bg-rose-50 border border-rose-300 rounded-xs space-y-3 animate-fade-in">
            <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
              <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Confirm Revision Rollback
            </div>
            <p className="text-xs text-rose-800">
              Are you sure you want to restore this revision? Any unsaved edits in your current working draft will be overwritten with the snapshot content.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRestoreId(null)}
                className="px-3 py-1.5 text-xs text-stone-700 bg-white border border-stone-300 rounded-xs hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onRestore(confirmRestoreId);
                  setConfirmRestoreId(null);
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-xs"
              >
                Yes, Restore Revision
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminModal>
  );
};
