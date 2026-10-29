'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminModal } from '../../components/admin/AdminModal';
import type { SourceRow } from '../../lib/cms/sourceService';
import { createSourceAction, updateSourceAction, setSourceStatusAction, deleteSourceAction } from '../../app/admin/source-actions';

interface Props { sources: SourceRow[]; canManage: boolean; }
type Form = { title: string; url: string; publisher: string; type: string; classification: 'official' | 'independent' | 'historical'; note: string };
const EMPTY: Form = { title: '', url: '', publisher: '', type: '', classification: 'independent', note: '' };

export const AdminSourcesPage: React.FC<Props> = ({ sources, canManage }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 5000); };
  const openCreate = () => { setEditingId(null); setForm(EMPTY); setError(null); setModalOpen(true); };
  const openEdit = (s: SourceRow) => {
    setEditingId(s.id);
    setForm({ title: s.title, url: s.url, publisher: s.publisher ?? '', type: s.type ?? '', classification: s.classification === 'OFFICIAL' ? 'official' : s.classification === 'HISTORICAL_ARCHIVE' ? 'historical' : 'independent', note: '' });
    setError(null); setModalOpen(true);
  };

  const submit = () => startTransition(async () => {
    const res = editingId ? await updateSourceAction(editingId, form) : await createSourceAction(form);
    if (!res.ok) { setError(res.error); return; }
    setModalOpen(false); flash(editingId ? 'Source updated.' : 'Source added.'); router.refresh();
  });
  const verify = (s: SourceRow) => startTransition(async () => {
    const res = await setSourceStatusAction(s.id, s.status === 'VERIFIED' ? 'NEEDS_REVIEW' : 'VERIFIED');
    if (!res.ok) flash(res.error); else router.refresh();
  });
  const remove = (s: SourceRow) => {
    if (!confirm(`Delete source "${s.title}"? This cannot be undone.`)) return;
    startTransition(async () => { const res = await deleteSourceAction(s.id); flash(res.ok ? 'Source deleted.' : res.error); if (res.ok) router.refresh(); });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Sources &amp; References"
        description="Database-backed primary-source registry with URL-protocol validation and article citation tracking."
        actions={canManage ? <button onClick={openCreate} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs">+ Add Source</button> : undefined}
      />

      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs">{notice}</div>}

      <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-x-auto">
        <table className="w-full text-left text-xs font-sans border-collapse">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
              <th className="py-3 px-4">Source</th><th className="py-3 px-4">Publisher</th><th className="py-3 px-4">Classification</th>
              <th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Cited</th><th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {sources.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-stone-400">No sources yet.</td></tr> :
              sources.map((s) => (
                <tr key={s.id} className="hover:bg-stone-50/60">
                  <td className="py-3 px-4"><div className="font-semibold text-stone-900">{s.title}</div><a href={s.url} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-[#8B5E3C] hover:underline truncate block max-w-xs">{s.url}</a></td>
                  <td className="py-3 px-4 text-stone-600">{s.publisher ?? '—'}</td>
                  <td className="py-3 px-4 text-stone-600">{s.classification.replace('_', ' ').toLowerCase()}</td>
                  <td className="py-3 px-4"><span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold ${s.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' : s.status === 'EXPIRED' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{s.status.replace('_', ' ')}</span>{s.verificationDate && <span className="block text-[10px] text-stone-400 mt-0.5">{s.verificationDate}</span>}</td>
                  <td className="py-3 px-4 text-right font-mono text-stone-600">{s.linkedArticles}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                    {canManage ? <>
                      <button onClick={() => verify(s)} disabled={isPending} className="text-emerald-700 hover:underline font-medium">{s.status === 'VERIFIED' ? 'Unverify' : 'Verify'}</button>
                      <button onClick={() => openEdit(s)} className="text-[#8B5E3C] hover:underline font-bold">Edit</button>
                      <button onClick={() => remove(s)} disabled={isPending} className="text-rose-600 hover:underline">Delete</button>
                    </> : <span className="text-stone-400">read-only</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <AdminModal isOpen onClose={() => setModalOpen(false)} title={editingId ? 'Edit Source' : 'Add Source'}
          footerActions={<div className="flex gap-2"><button onClick={() => setModalOpen(false)} className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs text-stone-600">Cancel</button><button onClick={submit} disabled={isPending} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">{isPending ? 'Saving…' : 'Save Source'}</button></div>}>
          <div className="space-y-3 font-sans text-xs">
            {error && <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xs">{error}</div>}
            <Field label="Title *"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></Field>
            <Field label="URL * (http/https/mailto/tel)"><input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs font-mono text-[11px]" /></Field>
            <Field label="Publisher / Organization"><input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type"><input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Rulebook, Archive…" className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></Field>
              <Field label="Classification"><select value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value as Form['classification'] })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs"><option value="independent">Independent Reference</option><option value="official">Official</option><option value="historical">Historical Archive</option></select></Field>
            </div>
            <p className="text-[11px] text-stone-400">New sources start as &ldquo;Needs Review&rdquo;. Mark &ldquo;Verified&rdquo; only with editorial evidence — the verification date is recorded at that moment.</p>
          </div>
        </AdminModal>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div><label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">{label}</label>{children}</div>
);

export default AdminSourcesPage;
