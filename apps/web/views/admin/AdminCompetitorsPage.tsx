'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import type { CompetitorRow, CompetitorDetail } from '../../lib/cms/competitorService';
import {
  createCompetitorAction, updateCompetitorAction, deleteCompetitorAction,
  setCompetitorDisciplinesAction, addParticipationAction, removeParticipationAction,
} from '../../app/admin/competitor-actions';

const inputCls = 'w-full px-3 py-2 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]';
const labelCls = 'block text-[11px] font-mono uppercase text-stone-500 font-medium mb-1';

interface Props {
  competitors: CompetitorRow[];
  detail: CompetitorDetail | null;
  disciplineOptions: { id: string; name: string }[];
  editionOptions: { id: string; label: string }[];
  canManage: boolean;
}

type CoreForm = { fullName: string; knownAs: string; summary: string; hometownCity: string; state: string; country: string; birthYear: string; status: string; heroImage: string; imageCredit: string };
const emptyCore: CoreForm = { fullName: '', knownAs: '', summary: '', hometownCity: '', state: '', country: '', birthYear: '', status: '', heroImage: '', imageCredit: '' };
const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

export const AdminCompetitorsPage: React.FC<Props> = ({ competitors, detail, disciplineOptions, editionOptions, canManage }) => {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCore, setNewCore] = useState<CoreForm>(emptyCore);
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const corePayload = (f: CoreForm) => ({
    fullName: f.fullName, knownAs: f.knownAs || undefined, summary: f.summary || undefined,
    hometownCity: f.hometownCity || undefined, state: f.state || undefined, country: f.country || undefined,
    birthYear: num(f.birthYear), status: (f.status || undefined) as 'active' | 'retired' | undefined,
    heroImage: f.heroImage || undefined, imageCredit: f.imageCredit || undefined,
  });

  const create = () => start(async () => {
    const r = await createCompetitorAction(corePayload(newCore));
    notify(r.ok ? 'Created.' : `Failed: ${r.error}`);
    if (r.ok) { setCreating(false); setNewCore(emptyCore); router.push(`/admin/competitors/?id=${(r as { id: string }).id}`); router.refresh(); }
  });

  return (
    <div className="space-y-6">
      {toast && <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono">{toast}</div>}
      <AdminPageHeader
        title="Competitors"
        description="Rodeo athlete profiles. Only verified facts — no fabricated bios, results, rankings or prize money. Participation is recorded per specific event edition. SEO & FAQs live in Landing-Page SEO & FAQ."
        breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'Competitors' }]}
        actions={canManage ? <button onClick={() => setCreating((s) => !s)} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">{creating ? 'Close' : 'New competitor'}</button> : undefined}
      />

      {creating && canManage && (
        <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
          <h3 className="font-sans font-bold text-sm text-stone-900">New competitor</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className={labelCls}>Full name *</label><input className={inputCls} value={newCore.fullName} onChange={(e) => setNewCore({ ...newCore, fullName: e.target.value })} /></div>
            <div><label className={labelCls}>Known as</label><input className={inputCls} value={newCore.knownAs} onChange={(e) => setNewCore({ ...newCore, knownAs: e.target.value })} /></div>
          </div>
          <button onClick={create} disabled={pending || newCore.fullName.trim().length < 1} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Create & edit</button>
          <p className="text-[11px] text-stone-500">You can add details, disciplines and participation after creating.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <aside className="bg-white border border-stone-200 rounded-xs overflow-hidden">
          <div className="px-3 py-2 bg-stone-50/50 border-b border-stone-200 text-[11px] font-mono uppercase tracking-wider text-stone-500 font-semibold">All competitors ({competitors.length})</div>
          <ul className="max-h-[32rem] overflow-y-auto divide-y divide-stone-100">
            {competitors.length === 0 && <li className="px-3 py-2 text-xs text-stone-400">None yet.</li>}
            {competitors.map((c) => {
              const active = detail?.id === c.id;
              return (
                <li key={c.id}>
                  <Link href={`/admin/competitors/?id=${c.id}`} className={`block px-3 py-2 text-xs ${active ? 'bg-[#1E293B] text-[#D4A757] font-semibold' : 'text-stone-700 hover:bg-stone-50'}`}>
                    <span className="block truncate">{c.fullName}</span>
                    <span className="text-[10px] font-mono text-stone-400">{c.disciplineCount} disc · {c.participationCount} part · {c.articleCount} art</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>

        <section>
          {!detail ? (
            <div className="bg-stone-50 border border-stone-200 rounded-xs p-8 text-center text-sm text-stone-500">{canManage ? 'Select a competitor to edit, or create a new one.' : 'You can view competitors but lack permission to edit them.'}</div>
          ) : (
            <CompetitorEditor key={detail.id} detail={detail} disciplineOptions={disciplineOptions} editionOptions={editionOptions} notify={notify} refresh={() => router.refresh()} />
          )}
        </section>
      </div>
    </div>
  );
};

function CompetitorEditor({ detail, disciplineOptions, editionOptions, notify, refresh }: { detail: CompetitorDetail; disciplineOptions: { id: string; name: string }[]; editionOptions: { id: string; label: string }[]; notify: (m: string) => void; refresh: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const d = detail.fields;
  const [core, setCore] = useState<CoreForm>({
    fullName: d.fullName, knownAs: d.knownAs ?? '', summary: d.summary ?? '', hometownCity: d.hometownCity ?? '',
    state: d.state ?? '', country: d.country ?? '', birthYear: d.birthYear?.toString() ?? '', status: d.status ?? '',
    heroImage: d.heroImage ?? '', imageCredit: d.imageCredit ?? '',
  });
  const [disc, setDisc] = useState<string[]>(detail.disciplineIds);
  const [pEdition, setPEdition] = useState('');
  const [pResult, setPResult] = useState('');
  const [pPlacement, setPPlacement] = useState('');

  const corePayload = () => ({
    fullName: core.fullName, knownAs: core.knownAs || undefined, summary: core.summary || undefined,
    hometownCity: core.hometownCity || undefined, state: core.state || undefined, country: core.country || undefined,
    birthYear: num(core.birthYear), status: (core.status || undefined) as 'active' | 'retired' | undefined,
    heroImage: core.heroImage || undefined, imageCredit: core.imageCredit || undefined,
  });

  const saveCore = () => start(async () => { const r = await updateCompetitorAction(detail.id, corePayload()); notify(r.ok ? 'Saved.' : `Failed: ${r.error}`); if (r.ok) refresh(); });
  const saveDisc = () => start(async () => { const r = await setCompetitorDisciplinesAction(detail.id, disc); notify(r.ok ? 'Disciplines saved.' : `Failed: ${r.error}`); if (r.ok) refresh(); });
  const addPart = () => start(async () => {
    const r = await addParticipationAction(detail.id, { editionId: pEdition, result: pResult || undefined, placement: num(pPlacement) });
    notify(r.ok ? 'Participation saved.' : `Failed: ${r.error}`);
    if (r.ok) { setPEdition(''); setPResult(''); setPPlacement(''); refresh(); }
  });
  const removePart = (editionId: string) => start(async () => { const r = await removeParticipationAction(detail.id, editionId); notify(r.ok ? 'Removed.' : `Failed: ${r.error}`); if (r.ok) refresh(); });
  const del = () => start(async () => { const r = await deleteCompetitorAction(detail.id); notify(r.ok ? 'Deleted.' : `Failed: ${r.error}`); if (r.ok) { router.push('/admin/competitors/'); router.refresh(); } });

  const toggleDisc = (id: string) => setDisc((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-sans font-bold text-sm text-stone-900">{detail.fields.fullName}</h3>
          <Link href={`/competitors/${detail.slug}/`} target="_blank" className="text-[11px] font-mono text-[#8B5E3C] underline">View page ↗</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className={labelCls}>Full name *</label><input className={inputCls} value={core.fullName} onChange={(e) => setCore({ ...core, fullName: e.target.value })} /></div>
          <div><label className={labelCls}>Known as</label><input className={inputCls} value={core.knownAs} onChange={(e) => setCore({ ...core, knownAs: e.target.value })} /></div>
          <div><label className={labelCls}>Hometown city</label><input className={inputCls} value={core.hometownCity} onChange={(e) => setCore({ ...core, hometownCity: e.target.value })} /></div>
          <div><label className={labelCls}>State / Province</label><input className={inputCls} value={core.state} onChange={(e) => setCore({ ...core, state: e.target.value })} /></div>
          <div><label className={labelCls}>Country</label><input className={inputCls} value={core.country} onChange={(e) => setCore({ ...core, country: e.target.value })} /></div>
          <div><label className={labelCls}>Birth year</label><input type="number" className={inputCls} value={core.birthYear} onChange={(e) => setCore({ ...core, birthYear: e.target.value })} /></div>
          <div><label className={labelCls}>Status</label><select className={inputCls} value={core.status} onChange={(e) => setCore({ ...core, status: e.target.value })}><option value="">—</option><option value="active">active</option><option value="retired">retired</option></select></div>
          <div><label className={labelCls}>Hero image URL</label><input className={inputCls} value={core.heroImage} onChange={(e) => setCore({ ...core, heroImage: e.target.value })} /></div>
          <div className="md:col-span-2"><label className={labelCls}>Image credit</label><input className={inputCls} value={core.imageCredit} onChange={(e) => setCore({ ...core, imageCredit: e.target.value })} /></div>
          <div className="md:col-span-2"><label className={labelCls}>Summary</label><textarea rows={3} className={inputCls} value={core.summary} onChange={(e) => setCore({ ...core, summary: e.target.value })} /></div>
        </div>
        <div className="flex gap-2">
          <button onClick={saveCore} disabled={pending || core.fullName.trim().length < 1} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save details</button>
          <button onClick={del} disabled={pending} className="px-4 py-2 border border-rose-300 text-rose-600 text-xs rounded-xs">Delete</button>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
        <h3 className="font-sans font-bold text-sm text-stone-900">Disciplines</h3>
        <div className="flex flex-wrap gap-2">
          {disciplineOptions.map((o) => (
            <label key={o.id} className={`px-3 py-1 text-xs rounded-xs cursor-pointer border ${disc.includes(o.id) ? 'bg-[#1E293B] text-[#D4A757] border-[#1E293B]' : 'bg-white text-stone-700 border-stone-300'}`}>
              <input type="checkbox" className="hidden" checked={disc.includes(o.id)} onChange={() => toggleDisc(o.id)} />{o.name}
            </label>
          ))}
        </div>
        <button onClick={saveDisc} disabled={pending} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save disciplines</button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
        <h3 className="font-sans font-bold text-sm text-stone-900">Event participation <span className="text-[11px] font-mono text-stone-400">(edition-level only)</span></h3>
        {detail.participations.length === 0 && <p className="text-xs text-stone-400">No participation recorded.</p>}
        <ul className="divide-y divide-stone-200">
          {detail.participations.map((p) => (
            <li key={p.editionId} className="py-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-stone-900">{p.eventName} — {p.label}</p>
                {(p.placement != null || p.result) && <p className="text-xs text-stone-500">{p.placement != null ? `#${p.placement}` : ''}{p.placement != null && p.result ? ' · ' : ''}{p.result ?? ''}</p>}
              </div>
              <button onClick={() => removePart(p.editionId)} disabled={pending} className="text-[11px] font-mono text-rose-600 underline shrink-0">remove</button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-3 border-t border-stone-200">
          <select className={`${inputCls} md:col-span-2`} value={pEdition} onChange={(e) => setPEdition(e.target.value)}><option value="">Select edition…</option>{editionOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          <input className={inputCls} placeholder="Placement (#)" type="number" value={pPlacement} onChange={(e) => setPPlacement(e.target.value)} />
          <input className={inputCls} placeholder="Result (optional)" value={pResult} onChange={(e) => setPResult(e.target.value)} />
        </div>
        <button onClick={addPart} disabled={pending || !pEdition} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Add / update participation</button>
      </div>
    </div>
  );
}

export default AdminCompetitorsPage;
