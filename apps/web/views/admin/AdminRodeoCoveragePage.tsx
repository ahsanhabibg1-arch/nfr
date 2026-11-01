'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { AdminModal } from '../../components/admin/AdminModal';
import type { HubRow, EventRow, EditionRow, VenueRow, DisciplineRef } from '../../lib/cms/rodeoService';
import {
  createHubAction, updateHubAction, deleteHubAction,
  createEventAction, updateEventAction, deleteEventAction,
  createEditionAction, updateEditionAction, deleteEditionAction,
  createVenueAction, updateVenueAction, deleteVenueAction,
} from '../../app/admin/rodeo-actions';

interface Props {
  hubs: HubRow[]; events: EventRow[]; editions: EditionRow[]; venues: VenueRow[]; disciplines: DisciplineRef[];
  eventOptions: { id: string; name: string }[]; venueOptions: { id: string; name: string }[];
  canManage: boolean;
}

type Tab = 'hubs' | 'events' | 'editions' | 'venues' | 'disciplines';
const btn = 'px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs';
const inp = 'w-full p-2 bg-stone-50 border border-stone-200 rounded-xs';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-1';
const th = 'py-2.5 px-4';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div><label className={lbl}>{label}</label>{children}</div>
);

export const AdminRodeoCoveragePage: React.FC<Props> = ({ hubs, events, editions, venues, disciplines, eventOptions, venueOptions, canManage }) => {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('hubs');
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 6000); };
  const run = (p: Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    startTransition(async () => { const r = await p; flash(r.ok ? okMsg : r.error || 'Error'); if (r.ok) router.refresh(); });

  // modal state: which entity + edit id
  const [modal, setModal] = useState<null | Tab>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [hub, setHub] = useState({ title: '', region: '', circuitType: '', description: '' });
  const [ev, setEv] = useState({ name: '', location: '', status: '', organizerName: '', description: '', isFlagship: false });
  const [ed, setEd] = useState({ eventId: '', editionSlug: '', label: '', year: '', purseBenchmark: '', venueId: '' });
  const [ven, setVen] = useState({ name: '', city: '', state: '', country: '' });

  const openHub = (h?: HubRow) => { setEditId(h?.id ?? null); setHub({ title: h?.title ?? '', region: h?.region ?? '', circuitType: h?.circuitType ?? '', description: '' }); setModal('hubs'); };
  const openEvent = (e?: EventRow) => { setEditId(e?.id ?? null); setEv({ name: e?.name ?? '', location: e?.location ?? '', status: e?.status ?? '', organizerName: '', description: '', isFlagship: e?.isFlagship ?? false }); setModal('events'); };
  const openEdition = (e?: EditionRow) => { setEditId(e?.id ?? null); setEd({ eventId: e?.eventId ?? (eventOptions[0]?.id ?? ''), editionSlug: e?.editionSlug ?? '', label: e?.label ?? '', year: e?.year ? String(e.year) : '', purseBenchmark: e?.purseBenchmark ?? '', venueId: '' }); setModal('editions'); };
  const openVenue = (v?: VenueRow) => { setEditId(v?.id ?? null); setVen({ name: v?.name ?? '', city: v?.city ?? '', state: v?.state ?? '', country: '' }); setModal('venues'); };
  const close = () => { setModal(null); setEditId(null); };

  const save = () => startTransition(async () => {
    let r: { ok: boolean; error?: string };
    if (modal === 'hubs') r = editId ? await updateHubAction(editId, hub) : await createHubAction(hub);
    else if (modal === 'events') r = editId ? await updateEventAction(editId, ev) : await createEventAction(ev);
    else if (modal === 'editions') {
      const base = { label: ed.label, year: ed.year ? Number(ed.year) : undefined, purseBenchmark: ed.purseBenchmark || undefined, venueId: ed.venueId || undefined };
      r = editId ? await updateEditionAction(editId, base) : await createEditionAction({ eventId: ed.eventId, editionSlug: ed.editionSlug, ...base });
    } else if (modal === 'venues') r = editId ? await updateVenueAction(editId, ven) : await createVenueAction(ven);
    else return;
    if (r.ok) { close(); flash('Saved.'); router.refresh(); } else flash(r.error || 'Error');
  });

  const tabs = [
    { id: 'hubs', label: 'Hubs', count: hubs.length },
    { id: 'events', label: 'Recurring Events', count: events.length },
    { id: 'editions', label: 'Editions', count: editions.length },
    { id: 'venues', label: 'Venues', count: venues.length },
    { id: 'disciplines', label: 'Disciplines', count: disciplines.length },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Rodeo Coverage" description="Hubs, recurring events and their annual editions, venues and disciplines. A recurring event is the stable identity; an edition is one year's occurrence. Entities referenced by articles cannot be deleted." actions={<a href="/admin/landing-seo/" className="px-3.5 py-1.5 text-xs font-sans font-semibold text-white bg-[#0F1115] hover:bg-stone-800 rounded-xs">Landing SEO &amp; FAQ →</a>} />
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs">{notice}</div>}
      {!canManage && <div className="p-3 bg-stone-50 border border-stone-200 text-stone-600 text-xs rounded-xs">You have read-only access to rodeo coverage. Editing requires the <code>rodeo.manage</code> permission.</div>}
      <AdminTabs tabs={tabs} activeTab={tab} onChange={(t) => setTab(t as Tab)} />

      {tab === 'hubs' && (
        <div className="space-y-3">
          {canManage && <button onClick={() => openHub()} className={btn}>+ Add Hub</button>}
          <Table head={['Title', 'Slug', 'Region', 'Circuit', 'Articles', '']}>
            {hubs.map((h) => (
              <tr key={h.id} className="hover:bg-stone-50/60">
                <td className={`${th} font-semibold text-stone-900`}>{h.title}</td>
                <td className={`${th} font-mono text-[11px] text-stone-500`}>{h.slug}</td>
                <td className={`${th} text-stone-600`}>{h.region || '—'}</td>
                <td className={`${th} text-stone-600`}>{h.circuitType || '—'}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{h.articleCount}</td>
                <Actions canManage={canManage} onEdit={() => openHub(h)} onDelete={h.articleCount === 0 ? () => run(deleteHubAction(h.id), 'Hub deleted.') : undefined} blockReason={h.articleCount > 0 ? `${h.articleCount} article(s)` : undefined} />
              </tr>
            ))}
          </Table>
        </div>
      )}

      {tab === 'events' && (
        <div className="space-y-3">
          {canManage && <button onClick={() => openEvent()} className={btn}>+ Add Recurring Event</button>}
          <Table head={['Event', 'Location', 'Status', 'Editions', 'Articles', '']}>
            {events.map((e) => (
              <tr key={e.id} className="hover:bg-stone-50/60">
                <td className={`${th} font-semibold text-stone-900`}>{e.name}{e.isFlagship && <span className="ml-2 text-[9px] font-mono text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded">FLAGSHIP</span>}</td>
                <td className={`${th} text-stone-600`}>{e.location || '—'}</td>
                <td className={`${th} text-stone-600`}>{e.status || '—'}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{e.editionCount}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{e.articleCount}</td>
                <Actions canManage={canManage} onEdit={() => openEvent(e)} onDelete={e.editionCount === 0 && e.articleCount === 0 ? () => run(deleteEventAction(e.id), 'Event deleted.') : undefined} blockReason={e.editionCount > 0 ? `${e.editionCount} edition(s)` : e.articleCount > 0 ? `${e.articleCount} article(s)` : undefined} />
              </tr>
            ))}
          </Table>
          <p className="text-[11px] text-stone-400">Deleting a recurring event is blocked while it still has editions or is referenced by articles — remove those first.</p>
        </div>
      )}

      {tab === 'editions' && (
        <div className="space-y-3">
          {canManage && eventOptions.length > 0 && <button onClick={() => openEdition()} className={btn}>+ Add Edition</button>}
          {eventOptions.length === 0 && <p className="text-xs text-stone-500">Create a recurring event first — editions belong to an event.</p>}
          <Table head={['Event', 'Edition', 'Year', 'Venue', 'Purse', 'Articles', '']}>
            {editions.map((e) => (
              <tr key={e.id} className="hover:bg-stone-50/60">
                <td className={`${th} font-semibold text-stone-900`}>{e.eventName}</td>
                <td className={`${th} text-stone-700`}>{e.label} <span className="font-mono text-[10px] text-stone-400">{e.editionSlug}</span></td>
                <td className={`${th} text-stone-600`}>{e.year ?? '—'}</td>
                <td className={`${th} text-stone-600`}>{e.venueName || '—'}</td>
                <td className={`${th} text-stone-600`}>{e.purseBenchmark || '—'}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{e.articleCount}</td>
                <Actions canManage={canManage} onEdit={() => openEdition(e)} onDelete={e.articleCount === 0 ? () => run(deleteEditionAction(e.id), 'Edition deleted.') : undefined} blockReason={e.articleCount > 0 ? `${e.articleCount} article(s)` : undefined} />
              </tr>
            ))}
          </Table>
        </div>
      )}

      {tab === 'venues' && (
        <div className="space-y-3">
          {canManage && <button onClick={() => openVenue()} className={btn}>+ Add Venue</button>}
          <Table head={['Venue', 'City', 'State', 'Editions', '']}>
            {venues.map((v) => (
              <tr key={v.id} className="hover:bg-stone-50/60">
                <td className={`${th} font-semibold text-stone-900`}>{v.name}</td>
                <td className={`${th} text-stone-600`}>{v.city || '—'}</td>
                <td className={`${th} text-stone-600`}>{v.state || '—'}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{v.editionCount}</td>
                <Actions canManage={canManage} onEdit={() => openVenue(v)} onDelete={v.editionCount === 0 ? () => run(deleteVenueAction(v.id), 'Venue deleted.') : undefined} blockReason={v.editionCount > 0 ? `${v.editionCount} edition(s)` : undefined} />
              </tr>
            ))}
          </Table>
        </div>
      )}

      {tab === 'disciplines' && (
        <div className="space-y-3">
          <Table head={['Discipline', 'Slug', 'Articles']}>
            {disciplines.map((d) => (
              <tr key={d.id} className="hover:bg-stone-50/60">
                <td className={`${th} font-semibold text-stone-900`}>{d.name}</td>
                <td className={`${th} font-mono text-[11px] text-stone-500`}>{d.slug}</td>
                <td className={`${th} text-right font-mono text-stone-600`}>{d.articleCount}</td>
              </tr>
            ))}
          </Table>
          <p className="text-[11px] text-stone-400">The seven disciplines are foundational site taxonomy and are managed in the schema/seed, not deleted here.</p>
        </div>
      )}

      {modal === 'hubs' && (
        <AdminModal isOpen onClose={close} title={editId ? 'Edit Hub' : 'Add Hub'} footerActions={<ModalFooter onClose={close} onSave={save} pending={isPending} />}>
          <div className="space-y-3 text-xs font-sans">
            <Field label="Title"><input value={hub.title} onChange={(e) => setHub({ ...hub, title: e.target.value })} className={inp} /></Field>
            <Field label="Region"><input value={hub.region} onChange={(e) => setHub({ ...hub, region: e.target.value })} className={inp} /></Field>
            <Field label="Circuit type"><input value={hub.circuitType} onChange={(e) => setHub({ ...hub, circuitType: e.target.value })} className={inp} /></Field>
            <Field label="Description"><textarea rows={2} value={hub.description} onChange={(e) => setHub({ ...hub, description: e.target.value })} className={inp} /></Field>
          </div>
        </AdminModal>
      )}

      {modal === 'events' && (
        <AdminModal isOpen onClose={close} title={editId ? 'Edit Recurring Event' : 'Add Recurring Event'} footerActions={<ModalFooter onClose={close} onSave={save} pending={isPending} />}>
          <div className="space-y-3 text-xs font-sans">
            <Field label="Name"><input value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })} className={inp} /></Field>
            <Field label="Location"><input value={ev.location} onChange={(e) => setEv({ ...ev, location: e.target.value })} className={inp} /></Field>
            <Field label="Status"><input value={ev.status} onChange={(e) => setEv({ ...ev, status: e.target.value })} placeholder="e.g. Active, Historical" className={inp} /></Field>
            <Field label="Organizer"><input value={ev.organizerName} onChange={(e) => setEv({ ...ev, organizerName: e.target.value })} className={inp} /></Field>
            <Field label="Description"><textarea rows={2} value={ev.description} onChange={(e) => setEv({ ...ev, description: e.target.value })} className={inp} /></Field>
            <label className="flex items-center gap-2"><input type="checkbox" checked={ev.isFlagship} onChange={(e) => setEv({ ...ev, isFlagship: e.target.checked })} /> <span className="text-stone-700">Flagship event</span></label>
          </div>
        </AdminModal>
      )}

      {modal === 'editions' && (
        <AdminModal isOpen onClose={close} title={editId ? 'Edit Edition' : 'Add Edition'} footerActions={<ModalFooter onClose={close} onSave={save} pending={isPending} />}>
          <div className="space-y-3 text-xs font-sans">
            {!editId && (
              <>
                <Field label="Recurring event"><select value={ed.eventId} onChange={(e) => setEd({ ...ed, eventId: e.target.value })} className={inp}>{eventOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
                <Field label="Edition slug (unique per event, e.g. 2025)"><input value={ed.editionSlug} onChange={(e) => setEd({ ...ed, editionSlug: e.target.value })} className={inp} /></Field>
              </>
            )}
            <Field label="Label"><input value={ed.label} onChange={(e) => setEd({ ...ed, label: e.target.value })} placeholder="e.g. 2025 National Finals Rodeo" className={inp} /></Field>
            <Field label="Year"><input type="number" value={ed.year} onChange={(e) => setEd({ ...ed, year: e.target.value })} className="w-32 p-2 bg-stone-50 border border-stone-200 rounded-xs" /></Field>
            <Field label="Venue"><select value={ed.venueId} onChange={(e) => setEd({ ...ed, venueId: e.target.value })} className={inp}><option value="">— none —</option>{venueOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
            <Field label="Purse benchmark"><input value={ed.purseBenchmark} onChange={(e) => setEd({ ...ed, purseBenchmark: e.target.value })} placeholder="e.g. $11.5M (verify before publishing)" className={inp} /></Field>
            <p className="text-[10px] text-stone-400">Do not enter unverified purse figures or results. Leave blank if unconfirmed.</p>
          </div>
        </AdminModal>
      )}

      {modal === 'venues' && (
        <AdminModal isOpen onClose={close} title={editId ? 'Edit Venue' : 'Add Venue'} footerActions={<ModalFooter onClose={close} onSave={save} pending={isPending} />}>
          <div className="space-y-3 text-xs font-sans">
            <Field label="Name"><input value={ven.name} onChange={(e) => setVen({ ...ven, name: e.target.value })} className={inp} /></Field>
            <Field label="City"><input value={ven.city} onChange={(e) => setVen({ ...ven, city: e.target.value })} className={inp} /></Field>
            <Field label="State"><input value={ven.state} onChange={(e) => setVen({ ...ven, state: e.target.value })} className={inp} /></Field>
            <Field label="Country"><input value={ven.country} onChange={(e) => setVen({ ...ven, country: e.target.value })} className={inp} /></Field>
          </div>
        </AdminModal>
      )}
    </div>
  );
};

const Table: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div className="bg-white border border-stone-200 rounded-sm overflow-x-auto">
    <table className="w-full text-left text-xs font-sans">
      <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px] tracking-wider">{head.map((h, i) => <th key={i} className={`py-2.5 px-4 ${i >= head.length - 1 || ['Articles', 'Editions'].includes(h) ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-stone-100">{children}</tbody>
    </table>
  </div>
);

const Actions: React.FC<{ canManage: boolean; onEdit: () => void; onDelete?: () => void; blockReason?: string }> = ({ canManage, onEdit, onDelete, blockReason }) => (
  <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
    {canManage ? <>
      <button onClick={onEdit} className="text-[#8B5E3C] hover:underline font-bold">Edit</button>
      {onDelete ? <button onClick={onDelete} className="text-rose-600 hover:underline">Delete</button>
        : blockReason ? <span className="text-stone-400" title="Referenced — cannot delete">locked ({blockReason})</span> : null}
    </> : <span className="text-stone-400">read-only</span>}
  </td>
);

const ModalFooter: React.FC<{ onClose: () => void; onSave: () => void; pending: boolean }> = ({ onClose, onSave, pending }) => (
  <div className="flex gap-2">
    <button onClick={onClose} className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs">Cancel</button>
    <button onClick={onSave} disabled={pending} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save</button>
  </div>
);

export default AdminRodeoCoveragePage;
