'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminModal } from '../../components/admin/AdminModal';
import type { NavItemRow } from '../../lib/cms/navigationService';
import type { NavLocation } from '../../lib/cms/navTypes';
import {
  createNavItemAction, updateNavItemAction, deleteNavItemAction,
  setNavVisibleAction, restoreCanonicalNavAction,
} from '../../app/admin/navigation-actions';

const LOCATION_LABELS: Record<NavLocation, string> = {
  header: 'Header — Primary Navigation',
  'footer-sections': 'Footer — Editorial Sections',
  'footer-academy': 'Footer — Spectator Academy',
};
const LOCATIONS: NavLocation[] = ['header', 'footer-sections', 'footer-academy'];
const inp = 'w-full p-2 bg-stone-50 border border-stone-200 rounded-xs';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-1';

interface Props { items: NavItemRow[]; canManage: boolean; }

export const AdminWebsiteNavPage: React.FC<Props> = ({ items, canManage }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 6000); };
  const run = (p: Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    startTransition(async () => { const r = await p; flash(r.ok ? okMsg : r.error || 'Error'); if (r.ok) router.refresh(); });

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [isSystem, setIsSystem] = useState(false);
  const [form, setForm] = useState<{ location: NavLocation; label: string; url: string; sortOrder: number; isExternal: boolean; visible: boolean }>({
    location: 'header', label: '', url: '', sortOrder: 99, isExternal: false, visible: true,
  });

  const openNew = (location: NavLocation) => { setEditId(null); setIsSystem(false); setForm({ location, label: '', url: '', sortOrder: 99, isExternal: false, visible: true }); setModal(true); };
  const openEdit = (r: NavItemRow) => { setEditId(r.id); setIsSystem(r.isSystem); setForm({ location: r.location as NavLocation, label: r.label, url: r.url, sortOrder: r.sortOrder, isExternal: r.isExternal, visible: r.visible }); setModal(true); };
  const save = () => startTransition(async () => {
    const r = editId ? await updateNavItemAction(editId, form) : await createNavItemAction(form);
    if (r.ok) { setModal(false); flash('Saved.'); router.refresh(); } else flash(r.error || 'Error');
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Website & Navigation" description="Database-backed header and footer menus with a built-in static fallback. Canonical primary-section links are protected and can be hidden but not deleted." />
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs">{notice}</div>}
      {!canManage && <div className="p-3 bg-stone-50 border border-stone-200 text-stone-600 text-xs rounded-xs">Read-only. Managing navigation requires the <code>navigation.manage</code> permission (Admin).</div>}

      {canManage && items.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-sm text-xs text-amber-900 space-y-2">
          <p>No navigation rows exist yet — the public site is currently rendering the built-in static menus. Import the canonical links into the database to start managing them.</p>
          <button onClick={() => run(restoreCanonicalNavAction(), 'Canonical links imported.')} disabled={isPending} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Import canonical links</button>
        </div>
      )}

      {canManage && items.length > 0 && (
        <button onClick={() => run(restoreCanonicalNavAction(), 'Canonical links restored.')} disabled={isPending} className="text-xs text-[#8B5E3C] hover:underline">Restore canonical links</button>
      )}

      {LOCATIONS.map((loc) => {
        const group = items.filter((i) => i.location === loc).sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <section key={loc} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">{LOCATION_LABELS[loc]}</h3>
              {canManage && <button onClick={() => openNew(loc)} className="px-2.5 py-1 bg-[#0F1115] text-[#D4A757] text-[11px] font-semibold rounded-xs">+ Add</button>}
            </div>
            <div className="bg-white border border-stone-200 rounded-sm overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px] tracking-wider"><th className="py-2 px-4">Order</th><th className="py-2 px-4">Label</th><th className="py-2 px-4">URL</th><th className="py-2 px-4">State</th><th className="py-2 px-4 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {group.length === 0 && <tr><td colSpan={5} className="py-3 px-4 text-stone-400">No custom rows — static fallback in use for this menu.</td></tr>}
                  {group.map((r) => (
                    <tr key={r.id} className={`hover:bg-stone-50/60 ${!r.visible ? 'opacity-50' : ''}`}>
                      <td className="py-2 px-4 font-mono text-stone-500">{r.sortOrder}</td>
                      <td className="py-2 px-4 font-semibold text-stone-900">{r.label}{r.isSystem && <span className="ml-2 text-[9px] font-mono text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded">CANONICAL</span>}{r.isExternal && <span className="ml-2 text-[9px] font-mono text-sky-700 bg-sky-50 border border-sky-200 px-1 rounded">EXTERNAL</span>}</td>
                      <td className="py-2 px-4 font-mono text-[11px] text-stone-500 max-w-[280px] truncate">{r.url}</td>
                      <td className="py-2 px-4">{r.visible ? <span className="text-emerald-700">Visible</span> : <span className="text-stone-400">Hidden</span>}</td>
                      <td className="py-2 px-4 text-right space-x-2 whitespace-nowrap">
                        {canManage ? <>
                          <button onClick={() => run(setNavVisibleAction(r.id, !r.visible), r.visible ? 'Hidden.' : 'Shown.')} className="text-stone-600 hover:underline">{r.visible ? 'Hide' : 'Show'}</button>
                          <button onClick={() => openEdit(r)} className="text-[#8B5E3C] hover:underline font-bold">Edit</button>
                          {r.isSystem ? <span className="text-stone-400" title="Canonical — cannot delete">locked</span> : <button onClick={() => run(deleteNavItemAction(r.id), 'Deleted.')} className="text-rose-600 hover:underline">Delete</button>}
                        </> : <span className="text-stone-400">read-only</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <p className="text-[11px] text-stone-400">The five primary sections (/competition, /entertainment, /events-shopping, /plan-watch, /rodeo-events) and the seven discipline routes are canonical and are never renamed or removed here.</p>

      {modal && (
        <AdminModal isOpen onClose={() => setModal(false)} title={editId ? 'Edit Navigation Link' : 'Add Navigation Link'}
          footerActions={<div className="flex gap-2"><button onClick={() => setModal(false)} className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs">Cancel</button><button onClick={save} disabled={isPending} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save</button></div>}>
          <div className="space-y-3 text-xs font-sans">
            {isSystem && <p className="p-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xs text-[11px]">This is a canonical link. Its URL and location are locked; you may edit its label, order and visibility.</p>}
            <div><label className={lbl}>Menu location</label>
              <select value={form.location} disabled={isSystem} onChange={(e) => setForm({ ...form, location: e.target.value as NavLocation })} className={`${inp} disabled:opacity-60`}>
                {LOCATIONS.map((l) => <option key={l} value={l}>{LOCATION_LABELS[l]}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Label</label><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inp} /></div>
            <div><label className={lbl}>URL (internal path like /plan-watch/ or full https:// link)</label><input value={form.url} disabled={isSystem} onChange={(e) => setForm({ ...form, url: e.target.value })} className={`${inp} disabled:opacity-60`} /></div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2"><input type="checkbox" disabled={isSystem} checked={form.isExternal} onChange={(e) => setForm({ ...form, isExternal: e.target.checked })} /> External link</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} /> Visible</label>
            </div>
            <div><label className={lbl}>Sort order</label><input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className="w-24 p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
          </div>
        </AdminModal>
      )}
    </div>
  );
};

export default AdminWebsiteNavPage;
