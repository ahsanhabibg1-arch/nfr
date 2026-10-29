'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AdminModal } from '../AdminModal';
import { listMediaForPickerAction } from '../../../app/admin/media-actions';
import type { MediaRow } from '../../../lib/cms/mediaService';

export interface SelectedMediaData {
  url: string;
  seoTitle: string;
  altText: string;
  caption: string;
  credit: string;
  rightsStatus: 'Staff Photo' | 'Editorial Pool' | 'PRCA Archive' | 'Licensed Creative' | 'Unresolved';
}

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (media: SelectedMediaData) => void;
}

// Map the asset's confirmed license to the article's image-rights field. An asset
// with UNCONFIRMED rights maps to 'Unresolved' so the existing publication gate
// (and the Batch 05 media rights gate) both correctly block publishing.
function toRights(row: MediaRow): SelectedMediaData['rightsStatus'] {
  if (!row.rightsConfirmed && row.storageProvider !== 'legacy-local') return 'Unresolved';
  switch (row.licenseType) {
    case 'OWNED': return 'Staff Photo';
    case 'LICENSED': return 'Licensed Creative';
    case 'PERMISSION_GRANTED': return 'Editorial Pool';
    default: return 'Licensed Creative';
  }
}

export const MediaPickerModal: React.FC<MediaPickerModalProps> = ({ isOpen, onClose, onSelect }) => {
  const [assets, setAssets] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (q: string) => {
    setLoading(true); setError(null);
    const r = await listMediaForPickerAction(q);
    if (r.ok) { setAssets(r.rows); setSelectedId((currentId) => r.rows.some((row) => row.id === currentId) ? currentId : (r.rows[0]?.id ?? null)); }
    else setError(r.error);
    setLoading(false);
  };
  useEffect(() => { if (isOpen) load(''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isOpen]);

  if (!isOpen) return null;
  const current = assets.find((a) => a.id === selectedId) || null;

  const onUpload = async (files: FileList) => {
    setUploading(true); setError(null);
    for (const f of Array.from(files)) {
      const fd = new FormData(); fd.append('file', f);
      const res = await fetch('/api/admin/media/upload/', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({ ok: false, error: 'Upload failed' }));
      if (!j.ok) { setError(j.error || 'Upload failed'); break; }
    }
    setUploading(false);
    await load(search);
  };

  const apply = () => {
    if (useCustom && customUrl.trim()) {
      onSelect({ url: customUrl.trim(), seoTitle: 'Editorial Image', altText: '', caption: '', credit: '', rightsStatus: 'Unresolved' });
    } else if (current) {
      onSelect({
        url: current.url, seoTitle: current.seoTitle || current.title || '', altText: current.altText || '',
        caption: current.caption || '', credit: current.credit || '', rightsStatus: toRights(current),
      });
    }
    onClose();
  };

  return (
    <AdminModal isOpen title="Select Featured Editorial Media & Verify Rights" onClose={onClose} className="max-w-4xl"
      footerActions={<div className="flex gap-2"><button onClick={onClose} className="px-3 py-1.5 border border-stone-300 rounded-xs text-xs">Cancel</button><button onClick={apply} disabled={!useCustom && !current} className="px-3.5 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs disabled:opacity-50">Use this image</button></div>}>
      <div className="space-y-4 font-sans text-xs">
        <div className="p-3 bg-stone-50 border border-stone-200 rounded-xs text-stone-600">
          Pick an asset from the database-backed library. Assets with <strong>unconfirmed usage rights</strong> cannot be published — confirm their license in the Media Library first. Article-specific ALT text remains editable on the article and is not overwritten globally.
        </div>
        {error && <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xs">{error}</div>}

        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(search); }} placeholder="Search library…" className="flex-1 px-3 py-2 text-xs border border-stone-300 rounded-xs" />
          <button onClick={() => load(search)} className="px-3 py-2 border border-stone-300 rounded-xs">Search</button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="px-3 py-2 bg-[#0F1115] text-[#D4A757] rounded-xs font-semibold disabled:opacity-50">{uploading ? 'Uploading…' : '+ Upload'}</button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files && onUpload(e.target.files)} />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-stone-800 font-medium pb-2 border-b border-stone-200">
          <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} /> Provide a custom image URL instead
        </label>

        {useCustom ? (
          <div className="space-y-2 p-4 bg-stone-50 border border-stone-200 rounded-xs">
            <label className="block text-xs font-mono uppercase text-stone-500">Image URL</label>
            <input type="text" placeholder="https://…" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xs" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {customUrl && <img src={customUrl} alt="preview" className="w-full max-h-48 object-cover rounded-xs border border-stone-300 mt-2" />}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-7 grid grid-cols-2 gap-3 max-h-80 overflow-y-auto p-1">
              {loading && <div className="col-span-2 text-center text-stone-400 py-8">Loading…</div>}
              {!loading && assets.length === 0 && <div className="col-span-2 text-center text-stone-400 py-8">No assets. Upload one above.</div>}
              {assets.map((a) => (
                <div key={a.id} onClick={() => setSelectedId(a.id)} className={`cursor-pointer border-2 rounded-xs overflow-hidden relative ${selectedId === a.id ? 'border-[#D4A757] ring-2 ring-[#D4A757]/30' : 'border-stone-200 hover:border-stone-400'}`}>
                  <div className="aspect-[16/10] bg-stone-900 overflow-hidden relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.thumbUrl} alt={a.altText ?? a.filename} className="w-full h-full object-cover" loading="lazy" />
                    {!a.rightsConfirmed && a.storageProvider !== 'legacy-local' && <span className="absolute top-1 left-1 text-[9px] font-mono px-1 bg-rose-600 text-white rounded">RIGHTS?</span>}
                  </div>
                  <div className="p-2 bg-white"><span className="font-semibold text-stone-900 block truncate text-[11px]">{a.title || a.filename}</span></div>
                </div>
              ))}
            </div>
            <div className="md:col-span-5">
              {current ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={current.thumbUrl} alt={current.altText ?? current.filename} className="w-full rounded-xs border border-stone-200" />
                  <p className="text-[11px] text-stone-600"><strong>{current.title || current.filename}</strong></p>
                  <p className="text-[11px] text-stone-500">{current.width}×{current.height} · {current.licenseType.replace('_', ' ')} · {current.rightsConfirmed ? 'rights confirmed' : 'rights unconfirmed'}</p>
                  {current.credit && <p className="text-[11px] text-stone-500">Credit: {current.credit}</p>}
                </div>
              ) : <div className="text-stone-400 text-center py-8">Select an asset</div>}
            </div>
          </div>
        )}
      </div>
    </AdminModal>
  );
};

export default MediaPickerModal;
