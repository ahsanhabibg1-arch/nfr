'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import type { VenueFullRow } from '../../lib/cms/rodeoService';
import { createVenueAction, updateVenueAction, deleteVenueAction } from '../../app/admin/rodeo-actions';

const inputCls = 'w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]';
const labelCls = 'block text-[11px] font-mono uppercase text-stone-500 font-medium mb-1';

type Form = {
  name: string; nickname: string; summary: string; description: string; websiteUrl: string;
  capacity: string; openedYear: string; latitude: string; longitude: string; city: string; state: string; country: string;
};
const emptyForm: Form = { name: '', nickname: '', summary: '', description: '', websiteUrl: '', capacity: '', openedYear: '', latitude: '', longitude: '', city: '', state: '', country: '' };
function toForm(v: VenueFullRow): Form {
  return {
    name: v.name, nickname: v.nickname ?? '', summary: v.summary ?? '', description: v.description ?? '', websiteUrl: v.websiteUrl ?? '',
    capacity: v.capacity?.toString() ?? '', openedYear: v.openedYear?.toString() ?? '', latitude: v.latitude?.toString() ?? '', longitude: v.longitude?.toString() ?? '',
    city: v.city ?? '', state: v.state ?? '', country: v.country ?? '',
  };
}
const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

export const AdminVenuesPage: React.FC<{ venues: VenueFullRow[]; canManage: boolean }> = ({ venues, canManage }) => {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [f, setF] = useState<Form>(emptyForm);
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const openNew = () => { setF(emptyForm); setEditing('new'); };
  const openEdit = (v: VenueFullRow) => { setF(toForm(v)); setEditing(v.id); };

  const payload = () => ({
    name: f.name, nickname: f.nickname || undefined, summary: f.summary || undefined, description: f.description || undefined,
    websiteUrl: f.websiteUrl || undefined, capacity: num(f.capacity), openedYear: num(f.openedYear),
    latitude: num(f.latitude), longitude: num(f.longitude), city: f.city || undefined, state: f.state || undefined, country: f.country || undefined,
  });

  const save = () => start(async () => {
    const r = editing === 'new' ? await createVenueAction(payload()) : await updateVenueAction(editing as string, payload());
    notify(r.ok ? 'Saved.' : `Failed: ${r.error}`);
    if (r.ok) { setEditing(null); router.refresh(); }
  });
  const del = (id: string) => start(async () => {
    const r = await deleteVenueAction(id);
    notify(r.ok ? 'Deleted.' : `Failed: ${r.error}`);
    if (r.ok) { setEditing(null); router.refresh(); }
  });

  return (
    <div className="space-y-6">
      {toast && <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono">{toast}</div>}
      <AdminPageHeader
        title="Venues"
        description="Rodeo venues with optional verified details (capacity, opening year, location, coordinates). SEO & FAQs are managed in Landing-Page SEO & FAQ."
        breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'Venues' }]}
        actions={canManage ? <button onClick={openNew} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">New venue</button> : undefined}
      />

      {editing && canManage && (
        <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
          <h3 className="font-sans font-bold text-sm text-stone-900">{editing === 'new' ? 'New venue' : 'Edit venue'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className={labelCls}>Name *</label><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><label className={labelCls}>Nickname</label><input className={inputCls} value={f.nickname} onChange={(e) => setF({ ...f, nickname: e.target.value })} /></div>
            <div><label className={labelCls}>City</label><input className={inputCls} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
            <div><label className={labelCls}>State / Province</label><input className={inputCls} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} /></div>
            <div><label className={labelCls}>Country</label><input className={inputCls} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} /></div>
            <div><label className={labelCls}>Official website</label><input className={inputCls} value={f.websiteUrl} onChange={(e) => setF({ ...f, websiteUrl: e.target.value })} placeholder="https://" /></div>
            <div><label className={labelCls}>Capacity</label><input type="number" className={inputCls} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></div>
            <div><label className={labelCls}>Opened year</label><input type="number" className={inputCls} value={f.openedYear} onChange={(e) => setF({ ...f, openedYear: e.target.value })} /></div>
            <div><label className={labelCls}>Latitude</label><input type="number" step="any" className={inputCls} value={f.latitude} onChange={(e) => setF({ ...f, latitude: e.target.value })} /></div>
            <div><label className={labelCls}>Longitude</label><input type="number" step="any" className={inputCls} value={f.longitude} onChange={(e) => setF({ ...f, longitude: e.target.value })} /></div>
            <div className="md:col-span-2"><label className={labelCls}>Summary</label><textarea rows={2} className={inputCls} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></div>
            <div className="md:col-span-2"><label className={labelCls}>Description (plain text)</label><textarea rows={4} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={pending || f.name.trim().length < 1} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save</button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 border border-stone-300 text-stone-600 text-xs rounded-xs">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-xs overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50/50 text-[11px] font-mono uppercase text-stone-500">
            <tr><th className="text-left px-4 py-2">Venue</th><th className="text-left px-4 py-2">Location</th><th className="text-left px-4 py-2">Editions</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {venues.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-stone-400 text-xs">No venues yet.</td></tr>}
            {venues.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-2.5"><span className="font-medium text-stone-900">{v.name}</span>{v.nickname && <span className="text-stone-400 text-xs"> · {v.nickname}</span>}<br /><Link href={`/venues/${v.slug}/`} target="_blank" className="text-[10px] font-mono text-[#8B5E3C] underline">/venues/{v.slug}/ ↗</Link></td>
                <td className="px-4 py-2.5 text-stone-600 text-xs">{[v.city, v.state, v.country].filter(Boolean).join(', ') || '—'}</td>
                <td className="px-4 py-2.5 text-stone-600 text-xs">{v.editionCount}</td>
                <td className="px-4 py-2.5 text-right text-[11px] font-mono">
                  {canManage && <button onClick={() => openEdit(v)} className="text-stone-600 underline mr-3">edit</button>}
                  {canManage && <button onClick={() => del(v.id)} disabled={pending || v.editionCount > 0} title={v.editionCount > 0 ? 'Remove edition links first' : ''} className="text-rose-600 underline disabled:opacity-30">delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminVenuesPage;
