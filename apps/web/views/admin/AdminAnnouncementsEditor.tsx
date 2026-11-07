'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminModal } from '@/components/admin/AdminModal';
import type { AnnouncementRow } from '@/lib/cms/announcementService';
import { createAnnouncementAction, updateAnnouncementAction, deleteAnnouncementAction, toggleAnnouncementAction } from '@/app/admin/announcement-actions';

const inp = 'w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-1';

interface Props { announcements: AnnouncementRow[]; canManage: boolean; }

type FormState = { type: 'BREAKING' | 'INFO'; text: string; linkUrl: string; linkLabel: string; articleId: string; priority: number; enabled: boolean; startsAt: string; endsAt: string; };
const empty: FormState = { type: 'INFO', text: '', linkUrl: '', linkLabel: '', articleId: '', priority: 0, enabled: false, startsAt: '', endsAt: '' };

export const AdminAnnouncementsEditor: React.FC<Props> = ({ announcements, canManage }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 6000); };
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);

  const openNew = () => { setEditId(null); setForm(empty); setModal(true); };
  const openEdit = (r: AnnouncementRow) => {
    setEditId(r.id);
    setForm({
      type: r.type, text: r.text, linkUrl: r.linkUrl ?? '', linkLabel: r.linkLabel ?? '',
      articleId: r.articleId ?? '', priority: r.priority, enabled: r.enabled,
      startsAt: r.startsAt?.slice(0, 16) ?? '', endsAt: r.endsAt?.slice(0, 16) ?? '',
    });
    setModal(true);
  };

  const save = () => startTransition(async () => {
    const input = {
      ...form,
      linkUrl: form.linkUrl || undefined,
      linkLabel: form.linkLabel || undefined,
      articleId: form.articleId || undefined,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
    };
    const r = editId ? await updateAnnouncementAction(editId, input) : await createAnnouncementAction(input);
    if (r.ok) { setModal(false); flash('Saved.'); router.refresh(); } else flash(r.error || 'Error');
  });

  const del = (id: string, text: string) => {
    if (!window.confirm(`Delete announcement "${text.slice(0, 40)}"?`)) return;
    startTransition(async () => { const r = await deleteAnnouncementAction(id); flash(r.ok ? 'Deleted.' : r.error || 'Error'); if (r.ok) router.refresh(); });
  };

  const toggle = (id: string, enabled: boolean) => {
    startTransition(async () => { const r = await toggleAnnouncementAction(id, enabled); flash(r.ok ? (enabled ? 'Enabled.' : 'Disabled.') : r.error || 'Error'); if (r.ok) router.refresh(); });
  };

  const isActive = (a: AnnouncementRow) => {
    if (!a.enabled) return false;
    const now = Date.now();
    if (a.startsAt && new Date(a.startsAt).getTime() > now) return false;
    if (a.endsAt && new Date(a.endsAt).getTime() <= now) return false;
    return true;
  };

  return (
    <div className="space-y-4">
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded">{notice}</div>}
      {!canManage && <div className="p-3 bg-stone-50 border border-stone-200 text-stone-600 text-xs rounded">Read-only.</div>}

      {canManage && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">Announcements appear as banners at the top of the public site.</p>
          <button onClick={openNew} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded">+ New Announcement</button>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px] tracking-wider">
            <th className="py-2 px-4">Type</th><th className="py-2 px-4">Text</th><th className="py-2 px-4">Status</th><th className="py-2 px-4">Window</th><th className="py-2 px-4 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-stone-100">
            {announcements.length === 0 && <tr><td colSpan={5} className="py-6 px-4 text-center text-stone-400">No announcements yet.</td></tr>}
            {announcements.map((a) => (
              <tr key={a.id} className={`hover:bg-stone-50/60 ${!a.enabled ? 'opacity-50' : ''}`}>
                <td className="py-2 px-4"><span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${a.type === 'BREAKING' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}`}>{a.type}</span></td>
                <td className="py-2 px-4 max-w-[300px] truncate font-medium text-stone-900">{a.text}</td>
                <td className="py-2 px-4"><span className={`text-[9px] font-mono ${isActive(a) ? 'text-emerald-600' : 'text-stone-400'}`}>{isActive(a) ? 'ACTIVE' : a.enabled ? 'SCHEDULED' : 'DISABLED'}</span></td>
                <td className="py-2 px-4 text-[10px] text-stone-500">{a.startsAt ? new Date(a.startsAt).toLocaleDateString() : '—'} → {a.endsAt ? new Date(a.endsAt).toLocaleDateString() : '∞'}</td>
                <td className="py-2 px-4 text-right">
                  {canManage && (
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => toggle(a.id, !a.enabled)} className="text-[10px] text-stone-500 hover:underline">{a.enabled ? 'Disable' : 'Enable'}</button>
                      <button onClick={() => openEdit(a)} className="text-[10px] text-[#D4A757] hover:underline">Edit</button>
                      <button onClick={() => del(a.id, a.text)} className="text-[10px] text-rose-600 hover:underline">Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <AdminModal title={editId ? 'Edit Announcement' : 'New Announcement'} onClose={() => setModal(false)}>
          <div className="space-y-3">
            <div><label className={lbl}>Type</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FormState['type'] })} className={inp}><option value="INFO">Informational</option><option value="BREAKING">Breaking</option></select></div>
            <div><label className={lbl}>Text</label><textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} className={inp} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Link URL (optional)</label><input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} className={inp} placeholder="/path or https://" /></div>
              <div><label className={lbl}>Link Label</label><input value={form.linkLabel} onChange={(e) => setForm({ ...form, linkLabel: e.target.value })} className={inp} placeholder="Read more" /></div>
            </div>
            <div><label className={lbl}>Priority (0–100)</label><input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className={inp} min={0} max={100} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Starts at</label><input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={inp} /></div>
              <div><label className={lbl}>Ends at</label><input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className={inp} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              <label className="text-xs text-stone-700">Enabled (visible on public site)</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModal(false)} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded">Cancel</button>
              <button onClick={save} disabled={isPending || !form.text.trim()} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded disabled:opacity-50">{editId ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
};
