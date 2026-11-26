'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminTabs } from '@/components/admin/AdminTabs';
import {
  bulkDeleteAction, bulkStatusAction, confirmRedirectCsvAction, createRedirectAction,
  deleteRedirectAction, dryRunRedirectCsvAction, exportRedirectsAction, redirectDetailsAction, redirectDiagnosticsAction,
  setRedirectStatusAction, updateRedirectAction,
} from '@/app/admin/redirect-actions';

type RedirectRow = { id: string; sourcePath: string; targetPath: string; statusCode: number; status: 'ACTIVE' | 'DISABLED'; origin: 'AUTOMATIC' | 'MANUAL' | 'LEGACY'; note: string | null; createdAt: Date | string; updatedAt: Date | string };
type Filters = { q?: string; statusCode?: number; status?: 'ACTIVE' | 'DISABLED'; origin?: 'AUTOMATIC' | 'MANUAL' | 'LEGACY'; page?: number; sort?: 'updated-desc' | 'updated-asc' | 'source-asc' };
type Rule = { sourcePath: string; targetPath: string; statusCode: number; status: 'ACTIVE' | 'DISABLED'; note: string };
type DryRun = { rows: { row: number; input: Rule; error?: string }[]; valid: number; invalid: number; token: string };
type RedirectDetails = RedirectRow & {
  createdBy: { name: string | null } | null;
  updatedBy: { name: string | null } | null;
  audit: { id: string; action: string; detail: string | null; createdAt: Date | string; actor: { name: string } | null }[];
};
type Diagnostics = Awaited<ReturnType<typeof import('@/lib/cms/redirectAdminService').getDiagnostics>>;
type Props = {
  list: { rows: RedirectRow[]; page: number; pages: number; total: number; summary: Record<'total' | 'active' | 'disabled' | 'automatic' | 'manual' | 'legacy', number> };
  filters: Filters;
  filterWarning?: string;
  audit: { id: string; action: string; entityId: string | null; detail: string | null; createdAt: Date | string; actor: { name: string } | null }[];
  sampleCsv: string;
  permissions: { manage: boolean; import: boolean; export: boolean; delete: boolean; diagnostics: boolean };
};

const emptyRule: Rule = { sourcePath: '', targetPath: '', statusCode: 301, status: 'ACTIVE', note: '' };
const field = 'w-full p-2 bg-white border border-stone-300 rounded-xs text-xs focus:outline-2 focus:outline-[#D4A757]';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

export function AdminRedirectsPage({ list, filters, filterWarning, audit, sampleCsv, permissions }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'redirects' | 'import' | 'diagnostics' | 'audit'>('redirects');
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<RedirectRow | 'new' | null>(null);
  const [details, setDetails] = useState<RedirectDetails | null>(null);
  const [rule, setRule] = useState<Rule>(emptyRule);
  const [fieldErrors, setFieldErrors] = useState<{ source?: string; target?: string; form?: string }>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [csv, setCsv] = useState('');
  const [dry, setDry] = useState<DryRun | null>(null);
  const allSelected = list.rows.length > 0 && list.rows.every((r) => selected.includes(r.id));
  const selectedRows = useMemo(() => list.rows.filter((r) => selected.includes(r.id)), [list.rows, selected]);
  const flash = (ok: boolean, text: string) => { setNotice({ ok, text }); setTimeout(() => setNotice(null), 7000); };
  const loadDiagnostics = (page: number) => start(async () => {
    const result = await redirectDiagnosticsAction(page);
    if (result.ok) { setDiagnostics(result.diagnostics); setDiagnosticsError(''); }
    else setDiagnosticsError(result.error);
  });
  const go = (patch: Partial<Filters>) => {
    const merged = { ...filters, ...patch }; const p = new URLSearchParams();
    for (const k of ['q', 'statusCode', 'status', 'origin', 'sort'] as const) if (merged[k]) p.set(k, String(merged[k]));
    if ((merged.page || 1) > 1) p.set('page', String(merged.page));
    router.push(`/admin/seo/redirects/?${p}`);
  };
  const run = (task: Promise<{ ok: boolean; error?: string }>, success: string) => start(async () => {
    const result = await task; flash(result.ok, result.ok ? success : result.error || 'Operation failed.');
    if (result.ok) { setEditing(null); setSelected([]); router.refresh(); }
  });
  const openNew = () => { setRule(emptyRule); setFieldErrors({}); setEditing('new'); };
  const openEdit = (row: RedirectRow) => { setRule({ sourcePath: row.sourcePath, targetPath: row.targetPath, statusCode: row.statusCode, status: row.status, note: row.note || '' }); setFieldErrors({}); setEditing(row); };
  const viewDetails = (id: string) => start(async () => {
    const result = await redirectDetailsAction(id);
    if (result.ok) setDetails({ ...result.row, audit: result.audit });
    else flash(false, result.error);
  });
  const submit = () => start(async () => {
    const result = editing === 'new'
      ? await createRedirectAction(rule)
      : await updateRedirectAction((editing as RedirectRow).id, rule);
    if (!result.ok) {
      const sourceError = ['invalid_source', 'canonical_conflict', 'duplicate_source'].includes(result.code) ? result.error : undefined;
      const targetError = ['invalid_target', 'target_not_live', 'cycle', 'bad_status'].includes(result.code) ? result.error : undefined;
      setFieldErrors({ source: sourceError, target: targetError, form: sourceError || targetError ? undefined : result.error });
      flash(false, result.error);
      return;
    }
    setFieldErrors({});
    flash(true, editing === 'new' ? 'Redirect created.' : 'Redirect updated.');
    setEditing(null);
    setSelected([]);
    router.refresh();
  });

  return <div className="space-y-6">
    <AdminPageHeader title="URL Redirects Engine" description="Manage validated internal URL migrations, exact HTTP status codes, imports, diagnostics and history. Public requests are never logged here."
      actions={permissions.manage ? <button onClick={openNew} className="px-3 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">Create redirect</button> : undefined} />
    {notice && <div role="status" aria-live="polite" className={`p-3 border text-xs rounded-xs ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{notice.text}</div>}
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {([['Total', list.summary.total], ['Active', list.summary.active], ['Disabled', list.summary.disabled], ['Automatic', list.summary.automatic], ['Manual', list.summary.manual], ['Legacy', list.summary.legacy]] as const).map(([label, value]) => <div key={label} className="bg-white border border-stone-200 rounded-sm p-3"><div className="text-[10px] font-mono uppercase text-ink-muted">{label}</div><div className="text-2xl font-bold">{value}</div></div>)}
    </div>
    <AdminTabs tabs={[{ id: 'redirects', label: 'Redirects', count: list.total }, { id: 'import', label: 'CSV import/export' }, { id: 'diagnostics', label: 'Diagnostics', count: diagnostics?.total }, { id: 'audit', label: 'Audit history', count: audit.length }]} activeTab={tab} onChange={(id) => { const next = id as typeof tab; setTab(next); if (next === 'diagnostics' && permissions.diagnostics && !diagnostics) loadDiagnostics(1); }} />

    {tab === 'redirects' && <div className="space-y-3">
      {filterWarning && <p role="status" className="text-xs text-amber-800">{filterWarning}</p>}
      <form onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get('q') || ''), page: 1 }); }} className="flex flex-wrap gap-2">
        <input name="q" type="search" maxLength={200} aria-label="Search redirects" defaultValue={filters.q} placeholder="Search source or destination" className={`${field} sm:w-64`} />
        <select aria-label="Filter HTTP status" value={filters.statusCode || ''} onChange={(e) => go({ statusCode: Number(e.target.value) || undefined, page: 1 })} className={`${field} w-auto`}><option value="">All HTTP</option>{[301,302,307,308].map((x) => <option key={x}>{x}</option>)}</select>
        <select aria-label="Filter state" value={filters.status || ''} onChange={(e) => go({ status: (e.target.value || undefined) as Filters['status'], page: 1 })} className={`${field} w-auto`}><option value="">All states</option><option>ACTIVE</option><option>DISABLED</option></select>
        <select aria-label="Filter origin" value={filters.origin || ''} onChange={(e) => go({ origin: (e.target.value || undefined) as Filters['origin'], page: 1 })} className={`${field} w-auto`}><option value="">All origins</option><option>AUTOMATIC</option><option>MANUAL</option><option>LEGACY</option></select>
        <select aria-label="Sort redirects" value={filters.sort} onChange={(e) => go({ sort: e.target.value as Filters['sort'], page: 1 })} className={`${field} w-auto`}><option value="updated-desc">Newest update</option><option value="updated-asc">Oldest update</option><option value="source-asc">Source A-Z</option></select>
        <button className="px-3 py-2 border border-stone-300 rounded-xs text-xs">Search</button><button type="button" onClick={() => router.push('/admin/seo/redirects/')} className="px-3 py-2 text-xs text-stone-600">Clear</button>
      </form>
      {selected.length > 0 && <div className="flex flex-wrap items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-xs text-xs"><strong>{selected.length} selected</strong>
        {permissions.manage && <><button disabled={pending} onClick={() => run(bulkStatusAction(selected, 'ACTIVE'), 'Selected redirects activated.')} className="px-2 py-1 bg-white border rounded-xs">Activate</button><button disabled={pending} onClick={() => run(bulkStatusAction(selected, 'DISABLED'), 'Selected redirects deactivated.')} className="px-2 py-1 bg-white border rounded-xs">Deactivate</button></>}
        {permissions.export && <button onClick={() => start(async () => { const r = await exportRedirectsAction({}, selected); if (r.ok) download('nfrguide-redirects-selected.csv', r.csv); else flash(false, r.error); })} className="px-2 py-1 bg-white border rounded-xs">Export selected</button>}
        {permissions.delete && <button onClick={() => { if (confirm('Permanently delete the selected disabled redirects? Audit history remains.')) run(bulkDeleteAction(selected), 'Selected redirects deleted.'); }} className="px-2 py-1 bg-rose-700 text-white rounded-xs">Delete disabled</button>}
      </div>}
      <div className="bg-white border border-stone-200 rounded-sm overflow-x-auto max-w-full"><table className="w-full min-w-[900px] text-left text-xs"><thead><tr className="bg-stone-50 border-b text-[10px] uppercase text-stone-600"><th className="p-3"><input aria-label="Select all redirects" type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? list.rows.map((r) => r.id) : [])} /></th><th>Source</th><th>Destination</th><th>HTTP</th><th>State</th><th>Origin</th><th>Updated</th><th>Actions</th></tr></thead><tbody className="divide-y">
        {list.rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-ink-muted">No redirects match these filters.</td></tr>}
        {list.rows.map((row) => <tr key={row.id} className="hover:bg-stone-50"><td className="p-3"><input aria-label={`Select ${row.sourcePath}`} type="checkbox" checked={selected.includes(row.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, row.id] : selected.filter((x) => x !== row.id))} /></td><td className="py-3 pr-3 font-mono break-all max-w-56">{row.sourcePath}</td><td className="py-3 pr-3 font-mono break-all max-w-56">{row.targetPath}</td><td>{row.statusCode}</td><td><span className={`px-1.5 py-0.5 border rounded ${row.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-600'}`}>{row.status}</span></td><td>{row.origin}</td><td>{new Date(row.updatedAt).toLocaleDateString()}</td><td><div className="flex gap-2 whitespace-nowrap"><button onClick={() => viewDetails(row.id)} className="underline">Details</button><button onClick={() => setTab('diagnostics')} className="underline">Diagnostics</button>{permissions.manage && <><button onClick={() => openEdit(row)} className="underline">Edit</button><button onClick={() => run(setRedirectStatusAction(row.id, row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'), row.status === 'ACTIVE' ? 'Redirect deactivated.' : 'Redirect activated.')} className="underline">{row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button></>}{permissions.delete && row.status === 'DISABLED' && <button onClick={() => { if (confirm(`Delete ${row.sourcePath}?`)) run(deleteRedirectAction(row.id), 'Redirect deleted.'); }} className="text-rose-700 underline">Delete</button>}</div></td></tr>)}
      </tbody></table></div>
      <div className="flex justify-between text-xs"><button disabled={list.page <= 1} onClick={() => go({ page: list.page - 1 })} className="px-3 py-1 border rounded-xs disabled:opacity-40">Previous</button><span>Page {list.page} of {list.pages}</span><button disabled={list.page >= list.pages} onClick={() => go({ page: list.page + 1 })} className="px-3 py-1 border rounded-xs disabled:opacity-40">Next</button></div>
    </div>}

    {tab === 'import' && <div className="grid lg:grid-cols-2 gap-4">
      <section className="bg-white border rounded-sm p-4 space-y-3"><h2 className="font-bold">Export</h2><p className="text-xs text-ink-muted">Exports current filters with CSV escaping and spreadsheet-formula protection.</p><div className="flex gap-2"><button disabled={!permissions.export} onClick={() => start(async () => { const r = await exportRedirectsAction(filters); if (r.ok) download('nfrguide-redirects.csv', r.csv); else flash(false, r.error); })} className="px-3 py-2 bg-[#0F1115] text-[#D4A757] text-xs rounded-xs disabled:opacity-40">Export filtered CSV</button><button onClick={() => download('nfrguide-redirects-sample.csv', sampleCsv)} className="px-3 py-2 border text-xs rounded-xs">Download sample</button></div></section>
      <section className="bg-white border rounded-sm p-4 space-y-3"><h2 className="font-bold">Import with mandatory dry run</h2><input type="file" accept=".csv,text/csv" disabled={!permissions.import} aria-label="Choose redirects CSV" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setDry(null); } }} className="text-xs" /><p className="text-[11px] text-ink-muted">Maximum 256 KiB and 500 rows. Existing sources are never overwritten.</p><button disabled={!permissions.import || !csv || pending} onClick={() => start(async () => { const r = await dryRunRedirectCsvAction(csv); if (r.ok) { setDry(r.result as DryRun); flash(true, `Dry run: ${r.result.valid} valid, ${r.result.invalid} invalid.`); } else flash(false, r.error); })} className="px-3 py-2 border text-xs rounded-xs disabled:opacity-40">Run dry validation</button>
        {dry && <div className="space-y-2"><div className={`p-2 text-xs border ${dry.invalid ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>{dry.valid} valid / {dry.invalid} invalid</div><div className="max-h-64 overflow-auto text-[11px]">{dry.rows.map((r) => <div key={r.row} className="py-1 border-b"><strong>Row {r.row}</strong> {r.input.sourcePath} → {r.input.targetPath} {r.error && <span className="text-rose-700">— {r.error}</span>}</div>)}</div><button disabled={!!dry.invalid || pending} onClick={() => { if (confirm(`Import ${dry.valid} validated redirects?`)) run(confirmRedirectCsvAction(csv, dry.token), `${dry.valid} redirects imported.`); }} className="px-3 py-2 bg-emerald-700 text-white text-xs rounded-xs disabled:opacity-40">Confirm import</button></div>}
      </section>
    </div>}

    {tab === 'diagnostics' && !permissions.diagnostics && <p role="alert" className="text-xs text-rose-700">You do not have permission to run diagnostics.</p>}
    {tab === 'diagnostics' && permissions.diagnostics && diagnosticsError && <p role="alert" className="text-xs text-rose-700">{diagnosticsError}</p>}
    {tab === 'diagnostics' && permissions.diagnostics && !diagnostics && !diagnosticsError && <p role="status" className="text-xs text-ink-muted">{pending ? 'Scanning redirects…' : 'Diagnostics have not been loaded.'}</p>}
    {tab === 'diagnostics' && diagnostics && <div className="space-y-3"><p className="text-xs text-ink-muted">Read-only scan of {diagnostics.scanned} redirect records, with {diagnostics.total} findings across the bounded scan.{diagnostics.truncated ? ' More records exist; this scan intentionally stops at its safety limit.' : ''}</p><div className="bg-white border rounded-sm overflow-x-auto"><table className="w-full min-w-[700px] text-xs"><thead><tr className="bg-stone-50 text-left"><th className="p-3">Severity</th><th>Issue</th><th>Source</th><th>Destination</th><th>Explanation</th><th>Action</th></tr></thead><tbody className="divide-y">{diagnostics.rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-ink-muted">No diagnostic issues in the bounded scan.</td></tr>}{diagnostics.rows.map((x, i) => <tr key={`${x.redirectId}-${x.code}-${i}`}><td className="p-3 uppercase">{x.severity}</td><td>{x.code.replaceAll('_', ' ')}</td><td className="font-mono break-all">{x.sourcePath}</td><td className="font-mono break-all">{x.targetPath}</td><td>{x.message}</td><td><button onClick={() => viewDetails(x.redirectId)} className="underline whitespace-nowrap">View rule</button></td></tr>)}</tbody></table></div><div className="flex justify-between text-xs"><button disabled={diagnostics.page <= 1} onClick={() => loadDiagnostics(diagnostics.page - 1)} className="px-3 py-1 border rounded-xs disabled:opacity-40">Previous findings</button><span>Findings page {diagnostics.page} of {diagnostics.pages}</span><button disabled={diagnostics.page >= diagnostics.pages} onClick={() => loadDiagnostics(diagnostics.page + 1)} className="px-3 py-1 border rounded-xs disabled:opacity-40">Next findings</button></div></div>}
    {tab === 'audit' && <div className="bg-white border rounded-sm divide-y">{audit.length === 0 && <p className="p-8 text-center text-xs text-ink-muted">No redirect administration events yet.</p>}{audit.map((x) => <div key={x.id} className="p-3 text-xs grid sm:grid-cols-[160px_180px_1fr] gap-2"><span>{new Date(x.createdAt).toLocaleString()}</span><strong>{x.action}</strong><span className="break-all">{x.actor?.name || 'System'} {x.detail || ''}</span></div>)}</div>}

    {editing && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="redirect-form-title"><div className="bg-white w-full max-w-xl rounded-sm p-5 space-y-4 max-h-[90vh] overflow-auto"><div className="flex justify-between"><h2 id="redirect-form-title" className="font-bold">{editing === 'new' ? 'Create redirect' : 'Edit redirect'}</h2><button onClick={() => setEditing(null)} aria-label="Close">×</button></div><div><label className="text-xs font-semibold" htmlFor="redirect-source">Source path</label><input id="redirect-source" aria-invalid={!!fieldErrors.source} aria-describedby={fieldErrors.source ? 'redirect-source-error' : undefined} value={rule.sourcePath} onChange={(e) => { setRule({ ...rule, sourcePath: e.target.value }); setFieldErrors({}); }} placeholder="/old-path/" className={field} />{fieldErrors.source && <p id="redirect-source-error" className="text-xs text-rose-700" role="alert">{fieldErrors.source}</p>}</div><div><label className="text-xs font-semibold" htmlFor="redirect-target">Live destination path</label><input id="redirect-target" aria-invalid={!!fieldErrors.target} aria-describedby={fieldErrors.target ? 'redirect-target-error' : undefined} value={rule.targetPath} onChange={(e) => { setRule({ ...rule, targetPath: e.target.value }); setFieldErrors({}); }} placeholder="/articles/live-page/" className={field} />{fieldErrors.target && <p id="redirect-target-error" className="text-xs text-rose-700" role="alert">{fieldErrors.target}</p>}</div><div className="grid sm:grid-cols-2 gap-3"><div><label className="text-xs font-semibold" htmlFor="redirect-code">HTTP status</label><select id="redirect-code" value={rule.statusCode} onChange={(e) => { setRule({ ...rule, statusCode: Number(e.target.value) }); setFieldErrors({}); }} className={field}><option value={301}>301 — permanent, method may change</option><option value={302}>302 — temporary, method may change</option><option value={307}>307 — temporary, preserve method</option><option value={308}>308 — permanent, preserve method</option></select></div><div><label className="text-xs font-semibold" htmlFor="redirect-state">Initial state</label><select id="redirect-state" value={rule.status} onChange={(e) => setRule({ ...rule, status: e.target.value as Rule['status'] })} className={field}><option>ACTIVE</option><option>DISABLED</option></select></div></div><div><label className="text-xs font-semibold" htmlFor="redirect-note">Administrative note</label><textarea id="redirect-note" maxLength={1000} value={rule.note} onChange={(e) => { setRule({ ...rule, note: e.target.value }); setFieldErrors({}); }} className={field} rows={3} /></div><p className="text-[11px] text-ink-muted">Only internal, live public destinations are accepted. Canonical pages, reserved routes, loops and external URLs are blocked.</p>{fieldErrors.form && <p className="text-xs text-rose-700" role="alert">{fieldErrors.form}</p>}<div className="flex justify-end gap-2"><button onClick={() => setEditing(null)} className="px-3 py-2 border text-xs rounded-xs">Cancel</button><button disabled={pending} onClick={submit} className="px-3 py-2 bg-[#0F1115] text-[#D4A757] text-xs rounded-xs disabled:opacity-40">{pending ? 'Saving…' : 'Save redirect'}</button></div></div></div>}

    {details && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="redirect-details-title"><div className="bg-white w-full max-w-2xl rounded-sm p-5 space-y-4 max-h-[90vh] overflow-auto"><div className="flex justify-between"><h2 id="redirect-details-title" className="font-bold">Redirect details</h2><button onClick={() => setDetails(null)} aria-label="Close details">×</button></div><dl className="grid sm:grid-cols-2 gap-3 text-xs"><dt className="font-semibold">Source</dt><dd className="font-mono break-all">{details.sourcePath}</dd><dt className="font-semibold">Destination</dt><dd className="font-mono break-all">{details.targetPath}</dd><dt className="font-semibold">HTTP status</dt><dd>{details.statusCode}</dd><dt className="font-semibold">State / origin</dt><dd>{details.status} / {details.origin}</dd><dt className="font-semibold">Created by</dt><dd>{details.createdBy?.name || 'System / legacy'}</dd><dt className="font-semibold">Updated by</dt><dd>{details.updatedBy?.name || 'System / legacy'}</dd><dt className="font-semibold">Administrative note</dt><dd className="break-all">{details.note || '—'}</dd></dl><section><h3 className="font-semibold text-sm mb-2">Audit history</h3>{details.audit.length === 0 ? <p className="text-xs text-ink-muted">No redirect-specific audit entries.</p> : <ul className="space-y-2 text-xs">{details.audit.map((entry) => <li key={entry.id} className="border-t pt-2"><strong>{entry.action}</strong> · {entry.actor?.name || 'System'} · {new Date(entry.createdAt).toLocaleString()}<p className="break-all">{entry.detail || ''}</p></li>)}</ul>}</section><button onClick={() => setDetails(null)} className="px-3 py-2 border text-xs rounded-xs">Close</button></div></div>}
  </div>;
}
