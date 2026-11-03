'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminTabs } from '../../components/admin/AdminTabs';
import type { SeoDashboard, FindingListResult, FindingRow } from '../../lib/cms/seoService';
import {
  runSeoAuditAction, updateFindingAction, recheckFindingAction, setRuleEnabledAction, updateSeoThresholdsAction,
} from '../../app/admin/seo-actions';

interface RuleRow { code: string; title: string | null; category: string; severity: string; enabled: boolean; description: string | null }
interface Thresholds { seoTitleMin: number; seoTitleMax: number; metaDescMin: number; metaDescMax: number; minBodyWords: number }
interface Filters { status?: string; severity?: string; category?: string; q?: string; page?: number }
interface Props {
  dashboard: SeoDashboard; findings: FindingListResult; filters: Filters; rules: RuleRow[]; thresholds: Thresholds;
  canRun: boolean; canManage: boolean; canConfig: boolean;
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-rose-100 border-rose-300 text-rose-800', HIGH: 'bg-orange-100 border-orange-300 text-orange-800',
  MEDIUM: 'bg-amber-100 border-amber-300 text-amber-800', LOW: 'bg-stone-100 border-stone-300 text-stone-600',
  INFO: 'bg-sky-100 border-sky-300 text-sky-800', WARNING: 'bg-amber-100 border-amber-300 text-amber-800', NOTICE: 'bg-stone-100 border-stone-300 text-stone-600',
};
const KIND_LABEL: Record<string, string> = { DEFECT: 'Defect', RECOMMENDATION: 'Recommendation', OPPORTUNITY: 'Opportunity', NOT_PERFORMED: 'Not performed' };

const Tile: React.FC<{ label: string; value: React.ReactNode; accent?: string }> = ({ label, value, accent }) => (
  <div className="bg-white border border-stone-200 rounded-sm p-3">
    <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">{label}</div>
    <div className={`text-2xl font-bold ${accent || 'text-stone-900'}`}>{value}</div>
  </div>
);

export const AdminSEOPage: React.FC<Props> = ({ dashboard, findings, filters, rules, thresholds, canRun, canManage, canConfig }) => {
  const router = useRouter();
  const [tab, setTab] = useState<'overview' | 'issues' | 'rules'>('overview');
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 7000); };
  const [selId, setSelId] = useState<string | null>(findings.rows[0]?.id ?? null);
  const selected = findings.rows.find((f) => f.id === selId) ?? null;

  const run = (p: Promise<{ ok: boolean; error?: string }>, ok: string) =>
    startTransition(async () => { const r = await p; flash(r.ok ? ok : r.error || 'Error'); if (r.ok) router.refresh(); });
  const navigate = (patch: Partial<Filters>) => {
    const p = new URLSearchParams(); const m = { ...filters, ...patch };
    for (const k of ['status', 'severity', 'category', 'q'] as const) if (m[k]) p.set(k, String(m[k]));
    if (m.page && m.page > 1) p.set('page', String(m.page));
    router.push(`/admin/seo/?${p.toString()}`);
  };
  const runAudit = () => startTransition(async () => {
    const r = await runSeoAuditAction({ kind: 'full' });
    flash(r.ok ? `Audit complete: ${r.total} findings (${r.created} new, ${r.reopened} reopened, ${r.resolved} resolved).` : r.error || 'Audit failed');
    if (r.ok) router.refresh();
  });

  const [note, setNote] = useState('');
  const [thr, setThr] = useState(thresholds);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="SEO Intelligence" description="Database-backed, deterministic SEO auditing of real CMS content. Findings are explainable diagnostics and recommendations — they do not block publishing."
        actions={canRun ? <button onClick={runAudit} disabled={pending} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold uppercase tracking-wider rounded-xs disabled:opacity-50">{pending ? 'Running…' : 'Run full audit'}</button> : undefined}
      />
      {notice && <div role="status" aria-live="polite" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs">{notice}</div>}
      {dashboard.scopedToOwn && <div className="p-2 bg-sky-50 border border-sky-200 text-sky-800 text-xs rounded-xs">You are viewing SEO findings for your own articles only.</div>}
      <AdminTabs tabs={[{ id: 'overview', label: 'Overview' }, { id: 'issues', label: 'Issues', count: dashboard.activeIssues }, { id: 'rules', label: 'Rules & Config', count: rules.length }]} activeTab={tab} onChange={(t) => setTab(t as typeof tab)} />

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <Tile label="Active issues" value={dashboard.activeIssues} accent="text-stone-900" />
            <Tile label="Critical" value={dashboard.bySeverity.CRITICAL ?? 0} accent="text-rose-700" />
            <Tile label="High" value={dashboard.bySeverity.HIGH ?? 0} accent="text-orange-700" />
            <Tile label="Medium" value={dashboard.bySeverity.MEDIUM ?? 0} accent="text-amber-700" />
            <Tile label="Low" value={dashboard.bySeverity.LOW ?? 0} accent="text-stone-700" />
            <Tile label="Resolved" value={dashboard.resolved} accent="text-emerald-700" />
            <Tile label="Analyzed article URLs" value={dashboard.analyzedUrls} />
            <Tile label="Total articles" value={dashboard.totalArticles} />
            <Tile label="In progress" value={dashboard.inProgress} />
            <Tile label="Latest audit" value={dashboard.latestRunAt ? new Date(dashboard.latestRunAt).toLocaleDateString() : <span className="text-sm text-ink-muted">never</span>} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-stone-200 rounded-sm p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-3">Active issues by category</h2>
              {Object.keys(dashboard.byCategory).length === 0 ? <p className="text-xs text-ink-muted">No active issues. {dashboard.latestRunAt ? '' : 'Run an audit to analyze content.'}</p> :
                Object.entries(dashboard.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, n]) => (
                  <div key={cat} className="flex items-center gap-2 text-xs py-1"><span className="w-40 text-stone-600 capitalize">{cat.replace('_', ' ')}</span><div className="flex-1 h-2 bg-stone-100 rounded"><div className="h-2 bg-[#D4A757] rounded" style={{ width: `${Math.min(100, n * 8)}%` }} /></div><span className="font-mono text-ink-muted">{n}</span></div>
                ))}
            </div>
            <div className="bg-white border border-stone-200 rounded-sm p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-3">Recent audits</h2>
              {dashboard.recentRuns.length === 0 ? <p className="text-xs text-ink-muted">No audits yet.</p> :
                dashboard.recentRuns.map((r) => (<div key={r.id} className="flex justify-between text-xs py-1 border-b border-stone-100 last:border-0"><span className="text-stone-600">{r.scope}</span><span className="text-ink-muted">{new Date(r.startedAt).toLocaleString()}</span><span className="font-mono text-ink-muted">{r.total} · {r.status}</span></div>))}
            </div>
          </div>
          <div className="p-3 bg-stone-50 border border-stone-200 rounded-xs text-[11px] text-ink-muted">
            Not connected (require external integrations, out of scope): Google rankings, impressions, clicks, CTR, organic traffic, Search Console coverage, AdSense revenue, backlinks. All metrics above are computed from your own CMS database.
          </div>
        </div>
      )}

      {tab === 'issues' && (
        <div className="space-y-3">
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); navigate({ q: String(fd.get('q') || ''), page: 1 }); }} className="flex flex-wrap items-center gap-2">
            <input name="q" type="search" aria-label="Search findings" defaultValue={filters.q ?? ''} placeholder="Search evidence/URL/rule…" className="text-xs p-2 bg-white border border-stone-200 rounded-xs w-56" />
            <select aria-label="Filter by status" value={filters.status ?? ''} onChange={(e) => navigate({ status: e.target.value || undefined, page: 1 })} className="text-xs p-2 bg-white border border-stone-200 rounded-xs"><option value="">Active</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="REOPENED">Reopened</option><option value="RESOLVED">Resolved</option><option value="IGNORED">Dismissed</option></select>
            <select aria-label="Filter by severity" value={filters.severity ?? ''} onChange={(e) => navigate({ severity: e.target.value || undefined, page: 1 })} className="text-xs p-2 bg-white border border-stone-200 rounded-xs"><option value="">All severities</option>{['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select aria-label="Filter by category" value={filters.category ?? ''} onChange={(e) => navigate({ category: e.target.value || undefined, page: 1 })} className="text-xs p-2 bg-white border border-stone-200 rounded-xs"><option value="">All categories</option>{['content', 'editorial', 'technical', 'structured_data', 'internal_link', 'rodeo_entity', 'image'].map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}</select>
            <span className="text-[11px] text-ink-muted ml-auto">{findings.total} finding(s)</span>
          </form>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7 bg-white border border-stone-200 rounded-sm overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px]"><th className="py-2 px-3">Sev</th><th className="py-2 px-3">Finding</th><th className="py-2 px-3">Category</th><th className="py-2 px-3">Status</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {findings.rows.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-ink-muted">No findings match. {dashboard.latestRunAt ? '' : 'Run an audit first.'}</td></tr>}
                  {findings.rows.map((f) => (
                    <tr key={f.id} onClick={() => { setSelId(f.id); setNote(''); }} className={`cursor-pointer hover:bg-stone-50 ${selId === f.id ? 'bg-amber-50/40' : ''}`}>
                      <td className="py-2 px-3"><span className={`text-[9px] font-mono px-1 rounded border ${SEV_COLOR[f.severity] || ''}`}>{f.severity}</span></td>
                      <td className="py-2 px-3"><button type="button" onClick={() => { setSelId(f.id); setNote(''); }} aria-pressed={selId === f.id} className="block text-left font-semibold text-stone-800 hover:underline">{f.title}</button><div className="text-ink-muted truncate max-w-[280px]">{f.evidence}</div></td>
                      <td className="py-2 px-3 text-ink-muted capitalize">{f.category.replace('_', ' ')}</td>
                      <td className="py-2 px-3 text-ink-muted">{f.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {findings.totalPages > 1 && (
                <div className="flex items-center justify-between text-xs p-2 border-t border-stone-100">
                  <button disabled={findings.page <= 1} onClick={() => navigate({ page: findings.page - 1 })} className="px-2 py-1 border border-stone-300 rounded-xs disabled:opacity-40">← Prev</button>
                  <span className="text-ink-muted">Page {findings.page}/{findings.totalPages}</span>
                  <button disabled={findings.page >= findings.totalPages} onClick={() => navigate({ page: findings.page + 1 })} className="px-2 py-1 border border-stone-300 rounded-xs disabled:opacity-40">Next →</button>
                </div>
              )}
            </div>

            <div className="lg:col-span-5">
              {!selected ? <div className="bg-white border border-stone-200 rounded-sm p-6 text-center text-ink-muted text-xs">Select a finding to inspect its evidence and remediation.</div> : (
                <div className="bg-white border border-stone-200 rounded-sm p-4 space-y-3 sticky top-20 text-xs">
                  <div className="flex items-center gap-2"><span className={`text-[9px] font-mono px-1 rounded border ${SEV_COLOR[selected.severity] || ''}`}>{selected.severity}</span><span className="text-[10px] font-mono text-ink-muted">{KIND_LABEL[selected.kind] || selected.kind}</span><span className="font-mono text-[10px] text-ink-muted ml-auto">{selected.ruleCode}</span></div>
                  <h2 className="font-bold text-sm text-stone-900">{selected.title}</h2>
                  <div><div className="text-[10px] font-mono uppercase text-ink-muted">Evidence</div><p className="text-stone-700">{selected.evidence}</p></div>
                  {selected.recommendation && <div><div className="text-[10px] font-mono uppercase text-ink-muted">Recommended action</div><p className="text-stone-700">{selected.recommendation}</p></div>}
                  {selected.affectedUrl && <div><div className="text-[10px] font-mono uppercase text-ink-muted">Affected</div><a href={selected.affectedUrl} target="_blank" rel="noreferrer" className="text-[#8B5E3C] hover:underline font-mono break-all">{selected.affectedUrl}</a></div>}
                  <div className="text-[10px] text-ink-muted">First seen {new Date(selected.firstSeenAt).toLocaleDateString()} · last seen {new Date(selected.lastSeenAt).toLocaleDateString()}</div>
                  {selected.resolutionNote && <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xs p-2">{selected.resolutionNote}</div>}

                  {canManage ? (
                    <div className="space-y-2 pt-2 border-t border-stone-100">
                      <textarea aria-label="Resolution note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution / note (optional)…" rows={2} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" />
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => run(updateFindingAction(selected.id, { status: 'IN_PROGRESS', resolutionNote: note || undefined }), 'Marked in progress.')} className="px-2 py-1 border border-stone-300 rounded-xs">In progress</button>
                        <button onClick={() => run(updateFindingAction(selected.id, { status: 'RESOLVED', resolutionNote: note || undefined }), 'Marked resolved (manual).')} className="px-2 py-1 bg-emerald-700 text-white rounded-xs">Mark resolved</button>
                        <button onClick={() => run(updateFindingAction(selected.id, { status: 'IGNORED', resolutionNote: note || undefined }), 'Dismissed (accepted risk).')} className="px-2 py-1 border border-stone-300 rounded-xs">Dismiss</button>
                        {canRun && <button onClick={() => run(recheckFindingAction(selected.id), 'Re-checked (verified).')} className="px-2 py-1 bg-[#0F1115] text-[#D4A757] rounded-xs ml-auto">Recheck</button>}
                      </div>
                      <p className="text-[10px] text-ink-muted">Manual status is recorded separately from verified technical resolution. A re-audit (Recheck) reconciles the finding against current data.</p>
                    </div>
                  ) : <p className="text-[11px] text-ink-muted pt-2 border-t border-stone-100">You have read-only access to this finding.</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'rules' && (
        <div className="space-y-4">
          {canConfig && (
            <div className="bg-white border border-stone-200 rounded-sm p-4 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700">Editorial thresholds (guidance)</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                {([['seoTitleMin', 'Title min'], ['seoTitleMax', 'Title max'], ['metaDescMin', 'Desc min'], ['metaDescMax', 'Desc max'], ['minBodyWords', 'Min body words']] as const).map(([k, label]) => (
                  <div key={k}><label htmlFor={`seo-threshold-${k}`} className="block text-[10px] font-mono uppercase text-ink-muted mb-1">{label}</label><input id={`seo-threshold-${k}`} type="number" value={thr[k]} onChange={(e) => setThr({ ...thr, [k]: Number(e.target.value) })} className="w-full p-2 bg-stone-50 border border-stone-200 rounded-xs" /></div>
                ))}
              </div>
              <button onClick={() => run(updateSeoThresholdsAction(thr), 'Thresholds saved.')} disabled={pending} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save thresholds</button>
              <p className="text-[10px] text-ink-muted">Length checks are internal editorial guidance, not Google indexing rules.</p>
            </div>
          )}
          <div className="bg-white border border-stone-200 rounded-sm overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px]"><th className="py-2 px-3">Rule</th><th className="py-2 px-3">Category</th><th className="py-2 px-3">Severity</th><th className="py-2 px-3 text-right">Enabled</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {rules.map((r) => (
                  <tr key={r.code} className="hover:bg-stone-50/60">
                    <td className="py-2 px-3"><div className="font-semibold text-stone-800">{r.title || r.code}</div><div className="text-ink-muted font-mono text-[10px]">{r.code}</div></td>
                    <td className="py-2 px-3 text-ink-muted capitalize">{r.category.replace('_', ' ')}</td>
                    <td className="py-2 px-3"><span className={`text-[9px] font-mono px-1 rounded border ${SEV_COLOR[r.severity] || ''}`}>{r.severity}</span></td>
                    <td className="py-2 px-3 text-right">{canConfig ? <input type="checkbox" aria-label={`Enable rule ${r.title || r.code}`} checked={r.enabled} onChange={(e) => run(setRuleEnabledAction(r.code, e.target.checked), 'Rule updated.')} /> : <span className="text-ink-muted">{r.enabled ? 'on' : 'off'}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSEOPage;
