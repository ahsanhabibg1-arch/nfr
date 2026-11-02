'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import {
  createSessionAction, deleteSessionAction, createResultAction, deleteResultAction,
  createStandingAction, deleteStandingAction, setVerificationAction, setCoverageStatusAction,
} from '../../app/admin/competition-actions';

const inputCls = 'w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-0.5';
const badge = (s: string, v: string) => `text-[10px] font-mono px-1.5 py-0.5 rounded-xs ${v === 'VERIFIED' && s === 'PUBLISHED' ? 'bg-green-100 text-green-800' : v === 'VERIFIED' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500'}`;

interface Opt { id: string; name?: string; fullName?: string }
interface Edition { id: string; label: string }
interface Detail { editionId: string; sessions: Sess[]; results: Res[]; standings: Stand[]; competitors: { id: string; fullName: string }[] }
interface Sess { id: string; title: string; sessionType: string; startAt: string | null; timezone: string | null; roundNumber: number | null; status: string; coverageStatus: string; verification: string; discipline: string | null; venue: string | null }
interface Res { id: string; discipline: string; competitor: string; resultType: string; scoreNumeric: string | null; timeSeconds: string | null; placement: number | null; isTie: boolean; coverageStatus: string; verification: string; correctionOfId: string | null }
interface Stand { id: string; category: string; discipline: string | null; competitor: string; rankPosition: number | null; aggregateValue: string | null; earnings: string | null; coverageStatus: string; verification: string }

export const AdminCompetitionPage: React.FC<{ editions: Edition[]; disciplines: Opt[]; detail: Detail | null; canManage: boolean }> = ({ editions, disciplines, detail, canManage }) => {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const act = (p: Promise<{ ok: boolean; error?: string }>, okMsg: string) => start(async () => { const r = await p; notify(r.ok ? okMsg : `Failed: ${r.error}`); if (r.ok) router.refresh(); });

  const verify = (kind: 'session' | 'result' | 'standing', id: string, v: 'VERIFIED' | 'UNVERIFIED') => act(setVerificationAction(kind, id, v), 'Verification updated.');
  const publish = (kind: 'session' | 'result' | 'standing', id: string, s: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED') => act(setCoverageStatusAction(kind, id, s), 'Status updated.');

  return (
    <div className="space-y-6">
      {toast && <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono">{toast}</div>}
      <AdminPageHeader title="Competition Coverage" description="Edition-scoped schedules, results and standings. Public visibility requires VERIFIED + PUBLISHED. Never publish unverified or fabricated data; unknown times/scores stay empty." breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'Competition Coverage' }]} />

      <div className="bg-white border border-stone-200 rounded-xs p-3 flex items-center gap-3">
        <span className={lbl}>Edition</span>
        <select className={`${inputCls} max-w-md`} value={detail?.editionId ?? ''} onChange={(e) => router.push(e.target.value ? `/admin/competition/?edition=${e.target.value}` : '/admin/competition/')}>
          <option value="">Select an edition…</option>
          {editions.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </div>

      {!detail ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xs p-8 text-center text-sm text-stone-500">{canManage ? 'Select an edition to manage its coverage.' : 'You can view this module but lack rodeo.manage to edit.'}</div>
      ) : (
        <div className="space-y-6">
          <Schedule d={detail} disciplines={disciplines} pending={pending} act={act} verify={verify} publish={publish} />
          <Results d={detail} disciplines={disciplines} pending={pending} act={act} verify={verify} publish={publish} />
          <Standings d={detail} disciplines={disciplines} pending={pending} act={act} verify={verify} publish={publish} />
        </div>
      )}
    </div>
  );
};

type Common = { d: Detail; disciplines: Opt[]; pending: boolean; act: (p: Promise<{ ok: boolean; error?: string }>, m: string) => void; verify: (k: 'session' | 'result' | 'standing', id: string, v: 'VERIFIED' | 'UNVERIFIED') => void; publish: (k: 'session' | 'result' | 'standing', id: string, s: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED') => void };

function Controls({ kind, id, coverageStatus, verification, pending, verify, publish, del }: { kind: 'session' | 'result' | 'standing'; id: string; coverageStatus: string; verification: string; pending: boolean } & Pick<Common, 'verify' | 'publish'> & { del: () => void }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
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

function Schedule({ d, disciplines, pending, act, verify, publish }: Common) {
  const [f, setF] = useState({ title: '', sessionType: 'performance', disciplineId: '', roundNumber: '', startAt: '', timezone: 'America/Los_Angeles' });
  const add = () => act(createSessionAction({ editionId: d.editionId, title: f.title, sessionType: f.sessionType, disciplineId: f.disciplineId || undefined, roundNumber: f.roundNumber ? Number(f.roundNumber) : undefined, startAt: f.startAt ? new Date(f.startAt).toISOString() : undefined, timezone: f.timezone || undefined }), 'Session added.');
  return (
    <section className="bg-white border border-stone-200 rounded-xs p-4 space-y-3">
      <h3 className="font-sans font-bold text-sm text-stone-900">Schedule ({d.sessions.length})</h3>
      <ul className="divide-y divide-stone-100">
        {d.sessions.map((s) => (
          <li key={s.id} className="py-2 flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-sm text-stone-900">{s.title} <span className="text-stone-400 text-xs">· {s.sessionType}{s.roundNumber != null ? ` · R${s.roundNumber}` : ''}{s.discipline ? ` · ${s.discipline}` : ''}</span></p>
              <p className="text-[11px] text-stone-500">{s.startAt ? new Date(s.startAt).toISOString().replace('T', ' ').slice(0, 16) : 'time TBD'}{s.timezone ? ` ${s.timezone}` : ''} · {s.status} · <span className={badge(s.coverageStatus, s.verification)}>{s.verification}/{s.coverageStatus}</span></p></div>
            <Controls kind="session" id={s.id} coverageStatus={s.coverageStatus} verification={s.verification} pending={pending} verify={verify} publish={publish} del={() => act(deleteSessionAction(s.id), 'Deleted.')} />
          </li>
        ))}
        {d.sessions.length === 0 && <li className="py-2 text-xs text-stone-400">No sessions yet.</li>}
      </ul>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 pt-2 border-t border-stone-200">
        <div className="md:col-span-2"><label className={lbl}>Title *</label><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className={lbl}>Type *</label><input className={inputCls} value={f.sessionType} onChange={(e) => setF({ ...f, sessionType: e.target.value })} /></div>
        <div><label className={lbl}>Discipline</label><select className={inputCls} value={f.disciplineId} onChange={(e) => setF({ ...f, disciplineId: e.target.value })}><option value="">—</option>{disciplines.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        <div><label className={lbl}>Round</label><input type="number" className={inputCls} value={f.roundNumber} onChange={(e) => setF({ ...f, roundNumber: e.target.value })} /></div>
        <div><label className={lbl}>Start (local)</label><input type="datetime-local" className={inputCls} value={f.startAt} onChange={(e) => setF({ ...f, startAt: e.target.value })} /></div>
      </div>
      <button onClick={add} disabled={pending || !f.title || !f.sessionType} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Add session</button>
    </section>
  );
}

function Results({ d, disciplines, pending, act, verify, publish }: Common) {
  const [f, setF] = useState({ disciplineId: '', competitorId: '', resultType: 'TIME', value: '', placement: '' });
  const add = () => {
    const base = { editionId: d.editionId, disciplineId: f.disciplineId, competitorId: f.competitorId, resultType: f.resultType as 'TIME' | 'SCORE' | 'NO_TIME' | 'NO_SCORE' | 'DISQUALIFIED' | 'WITHDRAWN', placement: f.placement ? Number(f.placement) : undefined };
    const withVal = f.resultType === 'TIME' ? { ...base, timeSeconds: f.value || undefined } : f.resultType === 'SCORE' ? { ...base, scoreNumeric: f.value || undefined } : base;
    act(createResultAction(withVal), 'Result added.');
  };
  return (
    <section className="bg-white border border-stone-200 rounded-xs p-4 space-y-3">
      <h3 className="font-sans font-bold text-sm text-stone-900">Results ({d.results.length})</h3>
      <ul className="divide-y divide-stone-100">
        {d.results.map((r) => (
          <li key={r.id} className="py-2 flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-sm text-stone-900">{r.placement != null ? `#${r.placement} ` : ''}{r.competitor} <span className="text-stone-400 text-xs">· {r.discipline} · {r.resultType}{r.timeSeconds ? ` ${r.timeSeconds}s` : ''}{r.scoreNumeric ? ` ${r.scoreNumeric}pts` : ''}{r.isTie ? ' · tie' : ''}{r.correctionOfId ? ' · correction' : ''}</span></p>
              <p className="text-[11px]"><span className={badge(r.coverageStatus, r.verification)}>{r.verification}/{r.coverageStatus}</span></p></div>
            <Controls kind="result" id={r.id} coverageStatus={r.coverageStatus} verification={r.verification} pending={pending} verify={verify} publish={publish} del={() => act(deleteResultAction(r.id), 'Deleted.')} />
          </li>
        ))}
        {d.results.length === 0 && <li className="py-2 text-xs text-stone-400">No results yet.</li>}
      </ul>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 pt-2 border-t border-stone-200">
        <div><label className={lbl}>Discipline *</label><select className={inputCls} value={f.disciplineId} onChange={(e) => setF({ ...f, disciplineId: e.target.value })}><option value="">—</option>{disciplines.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        <div className="md:col-span-2"><label className={lbl}>Competitor *</label><select className={inputCls} value={f.competitorId} onChange={(e) => setF({ ...f, competitorId: e.target.value })}><option value="">— eligible —</option>{d.competitors.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
        <div><label className={lbl}>Type</label><select className={inputCls} value={f.resultType} onChange={(e) => setF({ ...f, resultType: e.target.value })}><option>TIME</option><option>SCORE</option><option>NO_TIME</option><option>NO_SCORE</option><option>DISQUALIFIED</option><option>WITHDRAWN</option></select></div>
        <div><label className={lbl}>Value</label><input className={inputCls} placeholder={f.resultType === 'TIME' ? 'seconds' : f.resultType === 'SCORE' ? 'points' : 'n/a'} disabled={f.resultType !== 'TIME' && f.resultType !== 'SCORE'} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></div>
        <div><label className={lbl}>Place</label><input type="number" className={inputCls} value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value })} /></div>
      </div>
      <button onClick={add} disabled={pending || !f.disciplineId || !f.competitorId} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Add result</button>
      {d.competitors.length === 0 && <p className="text-[11px] text-amber-700">No eligible competitors — add participations in the Competitors module first.</p>}
    </section>
  );
}

function Standings({ d, disciplines, pending, act, verify, publish }: Common) {
  const [f, setF] = useState({ category: 'AGGREGATE', disciplineId: '', competitorId: '', rankPosition: '', aggregateValue: '', earnings: '' });
  const add = () => act(createStandingAction({ editionId: d.editionId, category: f.category as 'ROUND' | 'AGGREGATE' | 'CHAMPIONSHIP' | 'SEASON', disciplineId: f.disciplineId || undefined, competitorId: f.competitorId, rankPosition: f.rankPosition ? Number(f.rankPosition) : undefined, aggregateValue: f.aggregateValue || undefined, earnings: f.earnings || undefined }), 'Standing added.');
  return (
    <section className="bg-white border border-stone-200 rounded-xs p-4 space-y-3">
      <h3 className="font-sans font-bold text-sm text-stone-900">Standings ({d.standings.length})</h3>
      <ul className="divide-y divide-stone-100">
        {d.standings.map((s) => (
          <li key={s.id} className="py-2 flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-sm text-stone-900">{s.rankPosition != null ? `#${s.rankPosition} ` : ''}{s.competitor} <span className="text-stone-400 text-xs">· {s.category}{s.discipline ? ` · ${s.discipline}` : ''}{s.aggregateValue ? ` · ${s.aggregateValue}` : ''}{s.earnings ? ` · $${s.earnings}` : ''}</span></p>
              <p className="text-[11px]"><span className={badge(s.coverageStatus, s.verification)}>{s.verification}/{s.coverageStatus}</span></p></div>
            <Controls kind="standing" id={s.id} coverageStatus={s.coverageStatus} verification={s.verification} pending={pending} verify={verify} publish={publish} del={() => act(deleteStandingAction(s.id), 'Deleted.')} />
          </li>
        ))}
        {d.standings.length === 0 && <li className="py-2 text-xs text-stone-400">No standings yet.</li>}
      </ul>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 pt-2 border-t border-stone-200">
        <div><label className={lbl}>Category</label><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option>ROUND</option><option>AGGREGATE</option><option>CHAMPIONSHIP</option><option>SEASON</option></select></div>
        <div><label className={lbl}>Discipline</label><select className={inputCls} value={f.disciplineId} onChange={(e) => setF({ ...f, disciplineId: e.target.value })}><option value="">—</option>{disciplines.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        <div className="md:col-span-2"><label className={lbl}>Competitor *</label><select className={inputCls} value={f.competitorId} onChange={(e) => setF({ ...f, competitorId: e.target.value })}><option value="">— eligible —</option>{d.competitors.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
        <div><label className={lbl}>Rank</label><input type="number" className={inputCls} value={f.rankPosition} onChange={(e) => setF({ ...f, rankPosition: e.target.value })} /></div>
        <div><label className={lbl}>Earnings $</label><input className={inputCls} value={f.earnings} onChange={(e) => setF({ ...f, earnings: e.target.value })} /></div>
      </div>
      <button onClick={add} disabled={pending || !f.competitorId} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Add standing</button>
    </section>
  );
}

export default AdminCompetitionPage;
