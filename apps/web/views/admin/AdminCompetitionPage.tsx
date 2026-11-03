'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import {
  createSessionAction, updateSessionAction, deleteSessionAction,
  createResultAction, updateResultAction, correctResultAction, deleteResultAction,
  createStandingAction, updateStandingAction, deleteStandingAction,
  setVerificationAction, setCoverageStatusAction,
} from '../../app/admin/competition-actions';

const ic = 'w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-0.5';
const badge = (s: string, v: string) => `text-[10px] font-mono px-1.5 py-0.5 rounded-xs ${v === 'VERIFIED' && s === 'PUBLISHED' ? 'bg-green-100 text-green-800' : v === 'VERIFIED' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500'}`;
type R<T = unknown> = Promise<{ ok: boolean; error?: string } & T>;

interface Opt { id: string; name?: string }
interface Edition { id: string; label: string }
interface Sess { id: string; title: string; sessionType: string; disciplineId: string | null; startAt: string | null; timezone: string | null; roundNumber: number | null; status: string; coverageStatus: string; verification: string; discipline: string | null; venue: string | null; sourceRef: string | null; sourceUrl: string | null; notes: string | null }
interface Res { id: string; disciplineId: string; discipline: string; competitorId: string; competitor: string; resultType: string; scoreNumeric: string | null; timeSeconds: string | null; placement: number | null; isTie: boolean; coverageStatus: string; verification: string; correctionOfId: string | null; sourceRef: string | null; sourceUrl: string | null; notes: string | null }
interface Stand { id: string; category: string; disciplineId: string | null; discipline: string | null; competitorId: string; competitor: string; rankPosition: number | null; aggregateValue: string | null; earnings: string | null; coverageStatus: string; verification: string; sourceRef: string | null; sourceUrl: string | null }
interface Detail { editionId: string; sessions: Sess[]; results: Res[]; standings: Stand[]; competitors: { id: string; fullName: string }[] }
interface Filters { fDiscipline: string; fStatus: string; fVerify: string; fCompetitor: string; fCategory: string }

export const AdminCompetitionPage: React.FC<{ editions: Edition[]; disciplines: Opt[]; detail: Detail | null; canManage: boolean; filters: Filters }> = ({ editions, disciplines, detail, canManage, filters }) => {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const act = (p: R, okMsg: string, after?: () => void) => start(async () => { const r = await p; notify(r.ok ? okMsg : `Failed: ${r.error}`); if (r.ok) { after?.(); router.refresh(); } });

  const verify = (kind: 'session' | 'result' | 'standing', id: string, v: 'VERIFIED' | 'UNVERIFIED') => act(setVerificationAction(kind, id, v), 'Verification updated.');
  const publish = (kind: 'session' | 'result' | 'standing', id: string, s: 'PUBLISHED' | 'DRAFT') => act(setCoverageStatusAction(kind, id, s), 'Status updated.');

  const setFilter = (over: Partial<Filters>) => {
    const next = { ...filters, ...over }; const p = new URLSearchParams();
    if (detail?.editionId) p.set('edition', detail.editionId);
    if (next.fDiscipline) p.set('fDiscipline', next.fDiscipline);
    if (next.fStatus) p.set('fStatus', next.fStatus);
    if (next.fVerify) p.set('fVerify', next.fVerify);
    if (next.fCompetitor) p.set('fCompetitor', next.fCompetitor);
    if (next.fCategory) p.set('fCategory', next.fCategory);
    router.push(`/admin/competition/?${p.toString()}`);
  };
  const anyFilter = !!(filters.fDiscipline || filters.fStatus || filters.fVerify || filters.fCompetitor || filters.fCategory);

  return (
    <div className="space-y-6">
      {toast && <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono">{toast}</div>}
      <AdminPageHeader title="Competition Coverage" description="Edition-scoped schedules, results and standings. Public requires VERIFIED + PUBLISHED. Edit records in place; correct published results without overwriting the original; never publish unverified or fabricated data." breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'Competition Coverage' }]} />

      <div className="bg-white border border-stone-200 rounded-xs p-3 flex items-center gap-3">
        <span className={lbl}>Edition</span>
        <select className={`${ic} max-w-md`} value={detail?.editionId ?? ''} onChange={(e) => router.push(e.target.value ? `/admin/competition/?edition=${e.target.value}` : '/admin/competition/')}>
          <option value="">Select an edition…</option>
          {editions.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </div>

      {!detail ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xs p-8 text-center text-sm text-stone-500">{canManage ? 'Select an edition to manage its coverage.' : 'You can view this module but lack rodeo.manage to edit.'}</div>
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white border border-stone-200 rounded-xs p-3 flex flex-wrap items-end gap-2">
            <div><label className={lbl}>Discipline</label><select className={ic} value={filters.fDiscipline} onChange={(e) => setFilter({ fDiscipline: e.target.value })}><option value="">All</option>{disciplines.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div><label className={lbl}>Competitor</label><select className={ic} value={filters.fCompetitor} onChange={(e) => setFilter({ fCompetitor: e.target.value })}><option value="">All</option>{detail.competitors.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
            <div><label className={lbl}>Editorial status</label><select className={ic} value={filters.fStatus} onChange={(e) => setFilter({ fStatus: e.target.value })}><option value="">All</option>{['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED'].map((s) => <option key={s}>{s}</option>)}</select></div>
            <div><label className={lbl}>Verification</label><select className={ic} value={filters.fVerify} onChange={(e) => setFilter({ fVerify: e.target.value })}><option value="">All</option>{['UNVERIFIED', 'VERIFIED', 'CORRECTION_REQUIRED'].map((s) => <option key={s}>{s}</option>)}</select></div>
            <div><label className={lbl}>Standing category</label><select className={ic} value={filters.fCategory} onChange={(e) => setFilter({ fCategory: e.target.value })}><option value="">All</option>{['ROUND', 'AGGREGATE', 'CHAMPIONSHIP', 'SEASON'].map((s) => <option key={s}>{s}</option>)}</select></div>
            {anyFilter && <button onClick={() => router.push(`/admin/competition/?edition=${detail.editionId}`)} className="px-3 py-1.5 text-xs text-stone-500 underline">Reset filters</button>}
          </div>

          <Schedule d={detail} disciplines={disciplines} pending={pending} act={act} verify={verify} publish={publish} />
          <Results d={detail} disciplines={disciplines} pending={pending} act={act} verify={verify} publish={publish} />
          <Standings d={detail} disciplines={disciplines} pending={pending} act={act} verify={verify} publish={publish} />
        </>
      )}
    </div>
  );
};

type Common = { d: Detail; disciplines: Opt[]; pending: boolean; act: (p: R, m: string, after?: () => void) => void; verify: (k: 'session' | 'result' | 'standing', id: string, v: 'VERIFIED' | 'UNVERIFIED') => void; publish: (k: 'session' | 'result' | 'standing', id: string, s: 'PUBLISHED' | 'DRAFT') => void };

function Controls({ kind, id, coverageStatus, verification, pending, verify, publish, onEdit, onCorrect, del }: { kind: 'session' | 'result' | 'standing'; id: string; coverageStatus: string; verification: string; pending: boolean; onEdit: () => void; onCorrect?: () => void } & Pick<Common, 'verify' | 'publish'> & { del: () => void }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
      <button onClick={onEdit} disabled={pending} className="text-stone-600 underline">edit</button>
      {onCorrect && <button onClick={onCorrect} disabled={pending} className="text-blue-700 underline">correct</button>}
      {verification !== 'VERIFIED'
        ? <button onClick={() => verify(kind, id, 'VERIFIED')} disabled={pending} className="text-amber-700 underline">verify</button>
        : <button onClick={() => verify(kind, id, 'UNVERIFIED')} disabled={pending} className="text-stone-500 underline">unverify</button>}
      {coverageStatus !== 'PUBLISHED'
        ? <button onClick={() => publish(kind, id, 'PUBLISHED')} disabled={pending || verification !== 'VERIFIED'} title={verification !== 'VERIFIED' ? 'Verify first' : ''} className="text-green-700 underline disabled:opacity-30">publish</button>
        : <button onClick={() => publish(kind, id, 'DRAFT')} disabled={pending} className="text-stone-500 underline">unpublish</button>}
      <button onClick={del} disabled={pending} className="text-rose-600 underline">del</button>
    </div>
  );
}

// ---------- Schedule ----------
function Schedule({ d, disciplines, pending, act, verify, publish }: Common) {
  const [edit, setEdit] = useState<string | 'new' | null>(null);
  const blank = { title: '', sessionType: 'performance', disciplineId: '', roundNumber: '', startAt: '', timezone: 'America/Los_Angeles', sourceUrl: '' };
  const [f, setF] = useState(blank);
  const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');
  const open = (s?: Sess) => { setEdit(s ? s.id : 'new'); setF(s ? { title: s.title, sessionType: s.sessionType, disciplineId: s.disciplineId ?? '', roundNumber: s.roundNumber?.toString() ?? '', startAt: toLocal(s.startAt), timezone: s.timezone ?? '', sourceUrl: s.sourceUrl ?? '' } : blank); };
  const payload = () => ({ title: f.title, sessionType: f.sessionType, disciplineId: f.disciplineId || undefined, roundNumber: f.roundNumber ? Number(f.roundNumber) : undefined, startAt: f.startAt ? new Date(f.startAt).toISOString() : undefined, timezone: f.timezone || undefined, sourceUrl: f.sourceUrl || undefined });
  const save = () => edit === 'new' ? act(createSessionAction({ editionId: d.editionId, ...payload() }), 'Session added.', () => setEdit(null)) : act(updateSessionAction(edit as string, payload()), 'Session updated.', () => setEdit(null));
  return (
    <section className="bg-white border border-stone-200 rounded-xs p-4 space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-sans font-bold text-sm text-stone-900">Schedule ({d.sessions.length})</h3><button onClick={() => open()} className="text-xs text-[#8B5E3C] underline">+ add session</button></div>
      {edit && <EditBox onCancel={() => setEdit(null)} onSave={save} pending={pending} disabled={!f.title}>
        <div className="md:col-span-2"><label className={lbl}>Title *</label><input className={ic} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className={lbl}>Type *</label><input className={ic} value={f.sessionType} onChange={(e) => setF({ ...f, sessionType: e.target.value })} /></div>
        <div><label className={lbl}>Discipline</label><select className={ic} value={f.disciplineId} onChange={(e) => setF({ ...f, disciplineId: e.target.value })}><option value="">—</option>{disciplines.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        <div><label className={lbl}>Round</label><input type="number" className={ic} value={f.roundNumber} onChange={(e) => setF({ ...f, roundNumber: e.target.value })} /></div>
        <div><label className={lbl}>Start (local)</label><input type="datetime-local" className={ic} value={f.startAt} onChange={(e) => setF({ ...f, startAt: e.target.value })} /></div>
        <div><label className={lbl}>Timezone (IANA)</label><input className={ic} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></div>
        <div className="md:col-span-2"><label className={lbl}>Source URL</label><input className={ic} value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} /></div>
      </EditBox>}
      <ul className="divide-y divide-stone-100">
        {d.sessions.map((s) => (
          <li key={s.id} className="py-2 flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-sm text-stone-900">{s.title} <span className="text-stone-400 text-xs">· {s.sessionType}{s.roundNumber != null ? ` · R${s.roundNumber}` : ''}{s.discipline ? ` · ${s.discipline}` : ''}</span></p>
              <p className="text-[11px] text-stone-500">{s.startAt ? new Date(s.startAt).toISOString().replace('T', ' ').slice(0, 16) : 'time TBD'} · {s.status} · <span className={badge(s.coverageStatus, s.verification)}>{s.verification}/{s.coverageStatus}</span></p></div>
            <Controls kind="session" id={s.id} coverageStatus={s.coverageStatus} verification={s.verification} pending={pending} verify={verify} publish={publish} onEdit={() => open(s)} del={() => act(deleteSessionAction(s.id), 'Deleted.')} />
          </li>
        ))}
        {d.sessions.length === 0 && <li className="py-2 text-xs text-stone-400">No sessions match.</li>}
      </ul>
    </section>
  );
}

// ---------- Results ----------
function Results({ d, disciplines, pending, act, verify, publish }: Common) {
  const [mode, setMode] = useState<{ kind: 'edit' | 'correct' | 'new'; id?: string } | null>(null);
  const blank = { disciplineId: '', competitorId: '', resultType: 'TIME', value: '', placement: '', sourceUrl: '', notes: '' };
  const [f, setF] = useState(blank);
  const open = (kind: 'edit' | 'correct' | 'new', r?: Res) => { setMode({ kind, id: r?.id }); setF(r ? { disciplineId: r.disciplineId, competitorId: r.competitorId, resultType: r.resultType, value: r.timeSeconds ?? r.scoreNumeric ?? '', placement: r.placement?.toString() ?? '', sourceUrl: r.sourceUrl ?? '', notes: kind === 'correct' ? '' : (r.notes ?? '') } : blank); };
  const payload = () => {
    const base = { disciplineId: f.disciplineId, competitorId: f.competitorId, resultType: f.resultType as 'TIME' | 'SCORE' | 'NO_TIME' | 'NO_SCORE' | 'DISQUALIFIED' | 'WITHDRAWN', placement: f.placement ? Number(f.placement) : undefined, sourceUrl: f.sourceUrl || undefined, notes: f.notes || undefined };
    return f.resultType === 'TIME' ? { ...base, timeSeconds: f.value || undefined } : f.resultType === 'SCORE' ? { ...base, scoreNumeric: f.value || undefined } : base;
  };
  const save = () => {
    if (mode?.kind === 'new') return act(createResultAction({ editionId: d.editionId, ...payload() }), 'Result added.', () => setMode(null));
    if (mode?.kind === 'edit') return act(updateResultAction(mode.id!, payload()), 'Result updated.', () => setMode(null));
    if (mode?.kind === 'correct') return act(correctResultAction(mode.id!, payload()), 'Correction recorded (original archived; verify to publish).', () => setMode(null));
  };
  return (
    <section className="bg-white border border-stone-200 rounded-xs p-4 space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-sans font-bold text-sm text-stone-900">Results ({d.results.length})</h3><button onClick={() => open('new')} className="text-xs text-[#8B5E3C] underline">+ add result</button></div>
      {mode && <EditBox title={mode.kind === 'correct' ? 'Correction (creates a new linked result; original is archived)' : undefined} onCancel={() => setMode(null)} onSave={save} pending={pending} disabled={!f.disciplineId || !f.competitorId || (mode.kind === 'correct' && !f.notes.trim())}>
        <div><label className={lbl}>Discipline *</label><select className={ic} value={f.disciplineId} onChange={(e) => setF({ ...f, disciplineId: e.target.value })}><option value="">—</option>{disciplines.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        <div className="md:col-span-2"><label className={lbl}>Competitor *</label><select className={ic} value={f.competitorId} onChange={(e) => setF({ ...f, competitorId: e.target.value })}><option value="">— eligible —</option>{d.competitors.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
        <div><label className={lbl}>Type</label><select className={ic} value={f.resultType} onChange={(e) => setF({ ...f, resultType: e.target.value })}>{['TIME', 'SCORE', 'NO_TIME', 'NO_SCORE', 'DISQUALIFIED', 'WITHDRAWN'].map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className={lbl}>Value</label><input className={ic} placeholder={f.resultType === 'TIME' ? 'seconds' : f.resultType === 'SCORE' ? 'points' : 'n/a'} disabled={f.resultType !== 'TIME' && f.resultType !== 'SCORE'} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></div>
        <div><label className={lbl}>Place</label><input type="number" className={ic} value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value })} /></div>
        <div className="md:col-span-3"><label className={lbl}>Source URL</label><input className={ic} value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} /></div>
        <div className="md:col-span-3"><label className={lbl}>{mode.kind === 'correct' ? 'Correction reason / note *' : 'Note'}</label><input className={ic} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={mode.kind === 'correct' ? 'Why is this being corrected? (required)' : ''} /></div>
      </EditBox>}
      <ul className="divide-y divide-stone-100">
        {d.results.map((r) => (
          <li key={r.id} className="py-2 flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-sm text-stone-900">{r.placement != null ? `#${r.placement} ` : ''}{r.competitor} <span className="text-stone-400 text-xs">· {r.discipline} · {r.resultType}{r.timeSeconds ? ` ${r.timeSeconds}s` : ''}{r.scoreNumeric ? ` ${r.scoreNumeric}pts` : ''}{r.correctionOfId ? ' · correction' : ''}</span></p>
              <p className="text-[11px]"><span className={badge(r.coverageStatus, r.verification)}>{r.verification}/{r.coverageStatus}</span></p></div>
            <Controls kind="result" id={r.id} coverageStatus={r.coverageStatus} verification={r.verification} pending={pending} verify={verify} publish={publish} onEdit={() => open('edit', r)} onCorrect={() => open('correct', r)} del={() => act(deleteResultAction(r.id), 'Deleted.')} />
          </li>
        ))}
        {d.results.length === 0 && <li className="py-2 text-xs text-stone-400">No results match.</li>}
      </ul>
      {d.competitors.length === 0 && <p className="text-[11px] text-amber-700">No eligible competitors — add participations in the Competitors module first.</p>}
    </section>
  );
}

// ---------- Standings ----------
function Standings({ d, disciplines, pending, act, verify, publish }: Common) {
  const [edit, setEdit] = useState<string | 'new' | null>(null);
  const blank = { category: 'AGGREGATE', disciplineId: '', competitorId: '', rankPosition: '', aggregateValue: '', earnings: '', sourceUrl: '' };
  const [f, setF] = useState(blank);
  const open = (s?: Stand) => { setEdit(s ? s.id : 'new'); setF(s ? { category: s.category, disciplineId: s.disciplineId ?? '', competitorId: s.competitorId, rankPosition: s.rankPosition?.toString() ?? '', aggregateValue: s.aggregateValue ?? '', earnings: s.earnings ?? '', sourceUrl: s.sourceUrl ?? '' } : blank); };
  const payload = () => ({ category: f.category as 'ROUND' | 'AGGREGATE' | 'CHAMPIONSHIP' | 'SEASON', disciplineId: f.disciplineId || undefined, competitorId: f.competitorId, rankPosition: f.rankPosition ? Number(f.rankPosition) : undefined, aggregateValue: f.aggregateValue || undefined, earnings: f.earnings || undefined, sourceUrl: f.sourceUrl || undefined });
  const save = () => edit === 'new' ? act(createStandingAction({ editionId: d.editionId, ...payload() }), 'Standing added.', () => setEdit(null)) : act(updateStandingAction(edit as string, payload()), 'Standing updated.', () => setEdit(null));
  return (
    <section className="bg-white border border-stone-200 rounded-xs p-4 space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-sans font-bold text-sm text-stone-900">Standings ({d.standings.length})</h3><button onClick={() => open()} className="text-xs text-[#8B5E3C] underline">+ add standing</button></div>
      {edit && <EditBox onCancel={() => setEdit(null)} onSave={save} pending={pending} disabled={!f.competitorId}>
        <div><label className={lbl}>Category</label><select className={ic} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['ROUND', 'AGGREGATE', 'CHAMPIONSHIP', 'SEASON'].map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className={lbl}>Discipline</label><select className={ic} value={f.disciplineId} onChange={(e) => setF({ ...f, disciplineId: e.target.value })}><option value="">—</option>{disciplines.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        <div className="md:col-span-2"><label className={lbl}>Competitor *</label><select className={ic} value={f.competitorId} onChange={(e) => setF({ ...f, competitorId: e.target.value })}><option value="">— eligible —</option>{d.competitors.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
        <div><label className={lbl}>Rank</label><input type="number" className={ic} value={f.rankPosition} onChange={(e) => setF({ ...f, rankPosition: e.target.value })} /></div>
        <div><label className={lbl}>Aggregate</label><input className={ic} value={f.aggregateValue} onChange={(e) => setF({ ...f, aggregateValue: e.target.value })} /></div>
        <div><label className={lbl}>Earnings $</label><input className={ic} value={f.earnings} onChange={(e) => setF({ ...f, earnings: e.target.value })} /></div>
        <div className="md:col-span-3"><label className={lbl}>Source URL</label><input className={ic} value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} /></div>
      </EditBox>}
      <ul className="divide-y divide-stone-100">
        {d.standings.map((s) => (
          <li key={s.id} className="py-2 flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-sm text-stone-900">{s.rankPosition != null ? `#${s.rankPosition} ` : ''}{s.competitor} <span className="text-stone-400 text-xs">· {s.category}{s.discipline ? ` · ${s.discipline}` : ''}{s.aggregateValue ? ` · ${s.aggregateValue}` : ''}{s.earnings ? ` · $${s.earnings}` : ''}</span></p>
              <p className="text-[11px]"><span className={badge(s.coverageStatus, s.verification)}>{s.verification}/{s.coverageStatus}</span></p></div>
            <Controls kind="standing" id={s.id} coverageStatus={s.coverageStatus} verification={s.verification} pending={pending} verify={verify} publish={publish} onEdit={() => open(s)} del={() => act(deleteStandingAction(s.id), 'Deleted.')} />
          </li>
        ))}
        {d.standings.length === 0 && <li className="py-2 text-xs text-stone-400">No standings match.</li>}
      </ul>
    </section>
  );
}

function EditBox({ children, onCancel, onSave, pending, disabled, title }: { children: React.ReactNode; onCancel: () => void; onSave: () => void; pending: boolean; disabled: boolean; title?: string }) {
  return (
    <div className="border border-[#D4A757]/50 bg-amber-50/40 rounded-xs p-3 space-y-2">
      {title && <p className="text-[11px] font-mono text-blue-800">{title}</p>}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{children}</div>
      <div className="flex gap-2"><button onClick={onSave} disabled={pending || disabled} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save</button><button onClick={onCancel} className="px-3 py-1.5 border border-stone-300 text-stone-600 text-xs rounded-xs">Cancel</button></div>
    </div>
  );
}

export default AdminCompetitionPage;
