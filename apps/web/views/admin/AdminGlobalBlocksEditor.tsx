'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminModal } from '@/components/admin/AdminModal';
import type { GlobalBlockRow } from '@/lib/cms/globalBlockService';

const ALLOWED_PLACEMENTS = [
  'homepage-top', 'homepage-bottom', 'article-end',
  'rodeo-hub-top', 'event-detail', 'edition-detail', 'footer-top',
] as const;
import { createGlobalBlockAction, updateGlobalBlockAction, deleteGlobalBlockAction, toggleGlobalBlockAction } from '@/app/admin/global-block-actions';

const inp = 'w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-1';

interface Props { blocks: GlobalBlockRow[]; canManage: boolean; }

type FormState = {
  internalName: string; type: 'MESSAGE' | 'CTA' | 'FEATURED_STORY'; enabled: boolean;
  content: string; mediaUrl: string; mediaAlt: string; ctaLabel: string; ctaUrl: string;
  articleId: string; placements: string[]; priority: number; startsAt: string; endsAt: string;
};
const empty: FormState = {
  internalName: '', type: 'MESSAGE', enabled: false, content: '', mediaUrl: '', mediaAlt: '',
  ctaLabel: '', ctaUrl: '', articleId: '', placements: [], priority: 0, startsAt: '', endsAt: '',
};

export const AdminGlobalBlocksEditor: React.FC<Props> = ({ blocks, canManage }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 6000); };
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);

  const openNew = () => { setEditId(null); setForm(empty); setModal(true); };
  const openEdit = (r: GlobalBlockRow) => {
    setEditId(r.id);
    setForm({
      internalName: r.internalName, type: r.type, enabled: r.enabled, content: r.content,
      mediaUrl: r.mediaUrl ?? '', mediaAlt: r.mediaAlt ?? '', ctaLabel: r.ctaLabel ?? '',
      ctaUrl: r.ctaUrl ?? '', articleId: r.articleId ?? '', placements: r.placements,
      priority: r.priority, startsAt: r.startsAt?.slice(0, 16) ?? '', endsAt: r.endsAt?.slice(0, 16) ?? '',
    });
    setModal(true);
  };

  const save = () => startTransition(async () => {
    const input = {
      ...form,
      mediaUrl: form.mediaUrl || undefined, mediaAlt: form.mediaAlt || undefined,
      ctaLabel: form.ctaLabel || undefined, ctaUrl: form.ctaUrl || undefined,
      articleId: form.articleId || undefined,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
    };
    const r = editId ? await updateGlobalBlockAction(editId, input) : await createGlobalBlockAction(input);
    if (r.ok) { setModal(false); flash('Saved.'); router.refresh(); } else flash(r.error || 'Error');
  });

  const del = (id: string, name: string) => {
    if (!window.confirm(`Delete global block "${name}"?`)) return;
    startTransition(async () => { const r = await deleteGlobalBlockAction(id); flash(r.ok ? 'Deleted.' : r.error || 'Error'); if (r.ok) router.refresh(); });
  };

  const toggle = (id: string, enabled: boolean) => {
    startTransition(async () => { const r = await toggleGlobalBlockAction(id, enabled); flash(r.ok ? (enabled ? 'Enabled.' : 'Disabled.') : r.error || 'Error'); if (r.ok) router.refresh(); });
  };

  const togglePlacement = (p: string) => {
    setForm((f) => ({ ...f, placements: f.placements.includes(p) ? f.placements.filter((x) => x !== p) : [...f.placements, p] }));
  };

  const TYPE_LABELS: Record<string, string> = { MESSAGE: 'Message', CTA: 'Call to Action', FEATURED_STORY: 'Featured Story' };

  return (
    <div className="space-y-4">
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded">{notice}</div>}
      {!canManage && <div className="p-3 bg-stone-50 border border-stone-200 text-stone-600 text-xs rounded">Read-only.</div>}

      {canManage && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">Reusable content blocks that appear across multiple pages.</p>
          <button onClick={openNew} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded">+ New Global Block</button>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px] tracking-wider">
            <th className="py-2 px-4">Name</th><th className="py-2 px-4">Type</th><th className="py-2 px-4">Placements</th><th className="py-2 px-4">Status</th><th className="py-2 px-4 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-stone-100">
            {blocks.length === 0 && <tr><td colSpan={5} className="py-6 px-4 text-center text-stone-400">No global blocks yet.</td></tr>}
            {blocks.map((b) => (
              <tr key={b.id} className={`hover:bg-stone-50/60 ${!b.enabled ? 'opacity-50' : ''}`}>
                <td className="py-2 px-4 font-medium text-stone-900">{b.internalName}</td>
                <td className="py-2 px-4"><span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200">{b.type}</span></td>
                <td className="py-2 px-4 max-w-[200px] text-[10px] text-stone-500 truncate">{b.placements.length > 0 ? b.placements.join(', ') : '—'}</td>
                <td className="py-2 px-4"><span className={`text-[9px] font-mono ${b.enabled ? 'text-emerald-600' : 'text-stone-400'}`}>{b.enabled ? 'ACTIVE' : 'DISABLED'}</span></td>
                <td className="py-2 px-4 text-right">
                  {canManage && (
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => toggle(b.id, !b.enabled)} className="text-[10px] text-stone-500 hover:underline">{b.enabled ? 'Disable' : 'Enable'}</button>
                      <button onClick={() => openEdit(b)} className="text-[10px] text-[#D4A757] hover:underline">Edit</button>
                      <button onClick={() => del(b.id, b.internalName)} className="text-[10px] text-rose-600 hover:underline">Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <AdminModal title={editId ? 'Edit Global Block' : 'New Global Block'} onClose={() => setModal(false)}>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div><label className={lbl}>Internal Name</label><input value={form.internalName} onChange={(e) => setForm({ ...form, internalName: e.target.value })} className={inp} placeholder="e.g. Holiday CTA Banner" /></div>
            <div><label className={lbl}>Type</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FormState['type'] })} className={inp}>
              <option value="MESSAGE">Message</option><option value="CTA">Call to Action</option><option value="FEATURED_STORY">Featured Story</option>
            </select></div>
            <div><label className={lbl}>Content</label><textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className={inp} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>CTA Label</label><input value={form.ctaLabel} onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })} className={inp} /></div>
              <div><label className={lbl}>CTA URL</label><input value={form.ctaUrl} onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })} className={inp} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Media URL</label><input value={form.mediaUrl} onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })} className={inp} /></div>
              <div><label className={lbl}>Media Alt</label><input value={form.mediaAlt} onChange={(e) => setForm({ ...form, mediaAlt: e.target.value })} className={inp} /></div>
            </div>
            <div><label className={lbl}>Priority (0–100)</label><input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className={inp} min={0} max={100} /></div>
            <div>
              <label className={lbl}>Placements</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {ALLOWED_PLACEMENTS.map((p) => (
                  <button key={p} type="button" onClick={() => togglePlacement(p)}
                    className={`text-[10px] px-2 py-1 rounded border transition-colors ${form.placements.includes(p) ? 'bg-[#0F1115] text-[#D4A757] border-[#0F1115]' : 'bg-white text-stone-600 border-stone-300 hover:border-stone-400'}`}
                  >{p}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Starts at</label><input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={inp} /></div>
              <div><label className={lbl}>Ends at</label><input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className={inp} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              <label className="text-xs text-stone-700">Enabled</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(false)} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded">Cancel</button>
              <button onClick={save} disabled={isPending || !form.internalName.trim()} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded disabled:opacity-50">{editId ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
};
