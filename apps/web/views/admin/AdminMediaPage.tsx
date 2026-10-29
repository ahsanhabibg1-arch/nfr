'use client';

import React, { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import type { MediaRow, MediaListResult } from '../../lib/cms/mediaService';
import {
  updateMediaMetadataAction, confirmRightsAction, setVisibilityAction, deleteMediaAction,
} from '../../app/admin/media-actions';

interface Filters { q?: string; type?: string; visibility?: string; usage?: 'used' | 'unused'; uploadedWithin?: '7d' | '30d' | '365d'; page?: number }
interface Props { result: MediaListResult; filters: Filters; viewerId: string; canUpload: boolean; canDelete: boolean; canEditAny: boolean }

const LICENSE = ['UNCONFIRMED', 'OWNED', 'LICENSED', 'PERMISSION_GRANTED', 'PUBLIC_DOMAIN', 'OTHER'] as const;
const inp = 'w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-xs';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-1';
const fmtBytes = (b: number | null) => (b == null ? '—' : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

export const AdminMediaPage: React.FC<Props> = ({ result, filters, viewerId, canUpload, canDelete, canEditAny }) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selId, setSelId] = useState<string | null>(result.rows[0]?.id ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 6000); };
  const selected = result.rows.find((r) => r.id === selId) ?? null;

  const navigate = (patch: Partial<Filters>) => {
    const p = new URLSearchParams();
    const merged = { ...filters, ...patch };
    if (merged.q) p.set('q', merged.q);
    if (merged.type) p.set('type', merged.type);
    if (merged.visibility) p.set('visibility', merged.visibility);
    if (merged.usage) p.set('usage', merged.usage);
    if (merged.uploadedWithin) p.set('uploadedWithin', merged.uploadedWithin);
    if (merged.page && merged.page > 1) p.set('page', String(merged.page));
    router.push(`/admin/media/?${p.toString()}`);
  };

  // ---- Upload (XHR for real progress) ----
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<{ name: string; pct: number; error?: string; done?: boolean }[]>([]);
  function uploadOne(file: File, idx: number): Promise<void> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/media/upload/');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploads((u) => u.map((x, i) => (i === idx ? { ...x, pct: Math.round((e.loaded / e.total) * 100) } : x))); };
      xhr.onload = () => {
        let r: { ok?: boolean; error?: string } = {};
        try { r = JSON.parse(xhr.responseText); } catch { r = { ok: false, error: 'Bad server response' }; }
        setUploads((u) => u.map((x, i) => (i === idx ? { ...x, pct: 100, done: true, error: r.ok ? undefined : (r.error || 'Upload failed') } : x)));
        resolve();
      };
      xhr.onerror = () => { setUploads((u) => u.map((x, i) => (i === idx ? { ...x, error: 'Network error', done: true } : x))); resolve(); };
      const fd = new FormData(); fd.append('file', file);
      xhr.send(fd);
    });
  }
  async function onFiles(files: FileList) {
    const list = Array.from(files);
    setUploads(list.map((f) => ({ name: f.name, pct: 0 })));
    for (let i = 0; i < list.length; i++) await uploadOne(list[i], i);
    flash('Upload complete. New assets start as Draft with unconfirmed rights.');
    router.refresh();
    setTimeout(() => setUploads([]), 4000);
  }

  // ---- Detail panel form ----
  const [form, setForm] = useState<Record<string, string>>({});
  const [license, setLicense] = useState<string>('UNCONFIRMED');
  const syncedFor = useRef<string | null>(null);
  if (selected && syncedFor.current !== selected.id) {
    syncedFor.current = selected.id;
    setForm({
      title: selected.title ?? '', seoTitle: selected.seoTitle ?? '', altText: selected.altText ?? '',
      caption: selected.caption ?? '', credit: selected.credit ?? '', copyrightHolder: selected.copyrightHolder ?? '',
      licenseSourceUrl: selected.licenseSourceUrl ?? '', usageRestrictions: selected.usageRestrictions ?? '', sourceAttribution: selected.sourceAttribution ?? '',
    });
    setLicense(selected.licenseType);
  }
  const canEditSel = canEditAny || selected?.uploadedById === viewerId;
  const run = (p: Promise<{ ok: boolean; error?: string }>, ok: string) =>
    startTransition(async () => { const r = await p; flash(r.ok ? ok : r.error || 'Error'); if (r.ok) router.refresh(); });

  const Badge: React.FC<{ r: MediaRow }> = ({ r }) => (
    <>
      <span className={`text-[9px] font-mono px-1 rounded border ${r.visibility === 'PUBLIC' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : r.visibility === 'DRAFT' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-stone-100 border-stone-300 text-stone-500'}`}>{r.visibility}</span>
      {!r.rightsConfirmed && r.storageProvider !== 'legacy-local' && <span className="ml-1 text-[9px] font-mono px-1 rounded border bg-rose-50 border-rose-200 text-rose-700" title="Usage rights not confirmed">RIGHTS?</span>}
    </>
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Media Asset Library" description="Database-backed digital asset management — secure uploads, image processing, licensing metadata and reuse across editorial content. New uploads are Draft + rights-unconfirmed until an editor verifies usage rights."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex border border-stone-200 rounded-xs overflow-hidden bg-white">
              <button onClick={() => setView('grid')} className={`p-1.5 ${view === 'grid' ? 'bg-[#0F1115] text-[#D4A757]' : 'text-stone-500'}`} title="Grid">▦</button>
              <button onClick={() => setView('list')} className={`p-1.5 ${view === 'list' ? 'bg-[#0F1115] text-[#D4A757]' : 'text-stone-500'}`} title="List">≣</button>
            </div>
            {canUpload && <button onClick={() => fileRef.current?.click()} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold uppercase tracking-wider rounded-xs">+ Upload Media</button>}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files && onFiles(e.target.files)} />
          </div>
        }
      />
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs">{notice}</div>}

      {uploads.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-sm p-3 space-y-2">
          {uploads.map((u, i) => (
            <div key={i} className="text-xs">
              <div className="flex justify-between font-mono"><span className="truncate max-w-[70%]">{u.name}</span><span className={u.error ? 'text-rose-600' : 'text-stone-500'}>{u.error ? u.error : u.done ? 'done' : `${u.pct}%`}</span></div>
              <div className="h-1 bg-stone-100 rounded"><div className={`h-1 rounded ${u.error ? 'bg-rose-400' : 'bg-[#D4A757]'}`} style={{ width: `${u.pct}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); navigate({ q: String(fd.get('q') || ''), page: 1 }); }} className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={filters.q ?? ''} placeholder="Search filename, title, alt, credit…" className="text-xs p-2 bg-white border border-stone-200 rounded-xs w-64" />
        <select value={filters.type ?? ''} onChange={(e) => navigate({ type: e.target.value || undefined, page: 1 })} className="text-xs p-2 bg-white border border-stone-200 rounded-xs">
          <option value="">All types</option><option value="jpg">JPEG</option><option value="png">PNG</option><option value="webp">WebP</option>
        </select>
        <select value={filters.visibility ?? ''} onChange={(e) => navigate({ visibility: e.target.value || undefined, page: 1 })} className="text-xs p-2 bg-white border border-stone-200 rounded-xs">
          <option value="">All states</option><option value="PUBLIC">Public</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option>
        </select>
        <select value={filters.usage ?? ''} onChange={(e) => navigate({ usage: (e.target.value || undefined) as Filters['usage'], page: 1 })} className="text-xs p-2 bg-white border border-stone-200 rounded-xs">
          <option value="">Any usage</option><option value="used">In use</option><option value="unused">Unused</option>
        </select>
        <select value={filters.uploadedWithin ?? ''} onChange={(e) => navigate({ uploadedWithin: (e.target.value || undefined) as Filters['uploadedWithin'], page: 1 })} className="text-xs p-2 bg-white border border-stone-200 rounded-xs">
          <option value="">Any upload date</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="365d">Last year</option>
        </select>
        <span className="text-[11px] text-stone-500 ml-auto">{result.total} asset(s)</span>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Assets */}
        <div className="lg:col-span-8 space-y-3">
          {result.rows.length === 0 && <div className="p-8 text-center text-stone-400 text-sm bg-white border border-stone-200 rounded-sm">No media assets match these filters.</div>}
          {view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {result.rows.map((r) => (
                <button key={r.id} onClick={() => setSelId(r.id)} className={`group text-left bg-white border rounded-sm overflow-hidden ${selId === r.id ? 'border-[#D4A757] ring-1 ring-[#D4A757]' : 'border-stone-200'}`}>
                  <div className="aspect-[4/3] bg-stone-100 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.thumbUrl} alt={r.altText ?? r.filename} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] font-semibold text-stone-800 truncate">{r.title || r.filename}</p>
                    <div className="mt-1 flex items-center gap-1"><Badge r={r} /></div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-stone-200 rounded-sm overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px]"><th className="py-2 px-3">Asset</th><th className="py-2 px-3">Type</th><th className="py-2 px-3">Dims</th><th className="py-2 px-3">Size</th><th className="py-2 px-3">State</th><th className="py-2 px-3 text-right">Used</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {result.rows.map((r) => (
                    <tr key={r.id} onClick={() => setSelId(r.id)} className={`cursor-pointer hover:bg-stone-50 ${selId === r.id ? 'bg-amber-50/40' : ''}`}>
                      <td className="py-2 px-3 font-semibold text-stone-800 truncate max-w-[220px]">{r.title || r.filename}</td>
                      <td className="py-2 px-3 font-mono text-stone-500">{r.mimeType?.replace('image/', '') ?? '—'}</td>
                      <td className="py-2 px-3 text-stone-500">{r.width && r.height ? `${r.width}×${r.height}` : '—'}</td>
                      <td className="py-2 px-3 text-stone-500">{fmtBytes(r.bytes)}</td>
                      <td className="py-2 px-3"><Badge r={r} /></td>
                      <td className="py-2 px-3 text-right font-mono text-stone-500">{r.usageCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination */}
          {result.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs">
              <button disabled={result.page <= 1} onClick={() => navigate({ page: result.page - 1 })} className="px-3 py-1.5 border border-stone-300 rounded-xs disabled:opacity-40">← Previous</button>
              <span className="text-stone-500">Page {result.page} of {result.totalPages}</span>
              <button disabled={result.page >= result.totalPages} onClick={() => navigate({ page: result.page + 1 })} className="px-3 py-1.5 border border-stone-300 rounded-xs disabled:opacity-40">Next →</button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-4">
          {!selected ? (
            <div className="bg-white border border-stone-200 rounded-sm p-6 text-center text-stone-400 text-xs">Select an asset to view and edit its metadata.</div>
          ) : (
            <div className="bg-white border border-stone-200 rounded-sm p-4 space-y-3 sticky top-20">
              <div className="aspect-video bg-stone-100 rounded-xs overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.thumbUrl} alt={selected.altText ?? selected.filename} className="w-full h-full object-contain" />
              </div>
              <div className="text-[11px] font-mono text-stone-500 break-all">{selected.filename}</div>
              <div className="flex flex-wrap gap-2 text-[11px] text-stone-600">
                <span>{selected.width}×{selected.height}</span><span>·</span><span>{fmtBytes(selected.bytes)}</span><span>·</span><span>{selected.mimeType?.replace('image/', '')}</span><span>·</span><span>{selected.usageCount} use(s)</span>
              </div>

              {/* Rights */}
              <div className="p-2 bg-stone-50 border border-stone-200 rounded-xs space-y-2">
                <div className={lbl}>Usage rights {selected.rightsConfirmed ? <span className="text-emerald-700">confirmed</span> : <span className="text-rose-700">unconfirmed</span>}</div>
                <select value={license} onChange={(e) => setLicense(e.target.value)} disabled={!canEditSel} className={inp}>
                  {LICENSE.map((l) => <option key={l} value={l}>{l.replace('_', ' ')}</option>)}
                </select>
                {canEditSel && (
                  <div className="flex gap-2">
                    <button onClick={() => run(confirmRightsAction(selected.id, license as never, true), 'Rights confirmed.')} disabled={pending} className="flex-1 px-2 py-1 bg-emerald-700 text-white rounded-xs text-[11px] disabled:opacity-50">Confirm rights</button>
                    {selected.rightsConfirmed && <button onClick={() => run(confirmRightsAction(selected.id, license as never, false), 'Rights unconfirmed.')} className="px-2 py-1 border border-stone-300 rounded-xs text-[11px]">Revoke</button>}
                  </div>
                )}
              </div>

              {/* Metadata */}
              {([['title', 'Title'], ['seoTitle', 'Image SEO title'], ['altText', 'ALT text'], ['caption', 'Caption'], ['credit', 'Credit / photographer'], ['copyrightHolder', 'Copyright holder'], ['licenseSourceUrl', 'License source URL'], ['usageRestrictions', 'Usage restrictions'], ['sourceAttribution', 'Source attribution']] as const).map(([k, label]) => (
                <div key={k}><label className={lbl}>{label}</label><input value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} disabled={!canEditSel} className={inp} /></div>
              ))}

              <div className="flex flex-wrap gap-2 pt-1">
                {canEditSel && <button onClick={() => run(updateMediaMetadataAction(selected.id, form), 'Metadata saved.')} disabled={pending} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Save metadata</button>}
                {canEditSel && (
                  <select value={selected.visibility} onChange={(e) => run(setVisibilityAction(selected.id, e.target.value as never), 'Visibility updated.')} className="text-xs p-1.5 border border-stone-300 rounded-xs">
                    <option value="DRAFT">Draft</option><option value="PUBLIC">Public</option><option value="ARCHIVED">Archived</option>
                  </select>
                )}
                {canDelete && <button onClick={() => { if (confirm('Delete this asset? This cannot be undone.')) run(deleteMediaAction(selected.id), 'Asset deleted.'); }} className="px-3 py-1.5 border border-rose-300 text-rose-600 text-xs rounded-xs ml-auto">Delete</button>}
              </div>
              <p className="text-[10px] text-stone-400">Asset-level metadata is reusable. Article-specific ALT text is edited on the article itself and is not overwritten by these values.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminMediaPage;
