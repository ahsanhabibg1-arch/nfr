'use client';

import React, { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteConfigRow } from '@/lib/cms/siteConfigService';
import type { FooterConfig, FooterColumn } from '@/lib/cms/siteConfigService';
import { saveSiteConfigDraftAction, publishSiteConfigAction, resetSiteConfigDraftAction } from '@/app/admin/site-config-actions';

const inp = 'w-full p-2 bg-stone-50 border border-stone-200 rounded text-xs';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-1';

interface Props { config: SiteConfigRow | undefined; canManage: boolean; }

const emptyCol: FooterColumn = { title: '', links: [] };

export const AdminFooterEditor: React.FC<Props> = ({ config, canManage }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 6000); };

  const initial = (config?.draft ?? {}) as FooterConfig;
  const [tagline, setTagline] = useState(initial.tagline ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [copyright, setCopyright] = useState(initial.copyright ?? '');
  const [statusText, setStatusText] = useState(initial.statusText ?? '');
  const [socialLinks, setSocialLinks] = useState<{ platform: string; url: string }[]>(initial.socialLinks ?? []);
  const [columns, setColumns] = useState<FooterColumn[]>(initial.columns ?? []);

  const gather = useCallback((): FooterConfig => ({
    tagline: tagline || undefined,
    description: description || undefined,
    copyright: copyright || undefined,
    statusText: statusText || undefined,
    socialLinks: socialLinks.length > 0 ? socialLinks : undefined,
    columns: columns.length > 0 ? columns : undefined,
  }), [tagline, description, copyright, statusText, socialLinks, columns]);

  const saveDraft = () => startTransition(async () => {
    const r = await saveSiteConfigDraftAction('footer', gather());
    flash(r.ok ? 'Draft saved.' : r.error || 'Error');
    if (r.ok) router.refresh();
  });

  const publish = () => startTransition(async () => {
    await saveSiteConfigDraftAction('footer', gather());
    const r = await publishSiteConfigAction('footer');
    flash(r.ok ? 'Published!' : r.error || 'Error');
    if (r.ok) router.refresh();
  });

  const reset = () => {
    if (!window.confirm('Discard draft and revert to published version?')) return;
    startTransition(async () => {
      const r = await resetSiteConfigDraftAction('footer');
      flash(r.ok ? 'Reverted.' : r.error || 'Error');
      if (r.ok) router.refresh();
    });
  };

  const addSocial = () => setSocialLinks([...socialLinks, { platform: '', url: '' }]);
  const removeSocial = (i: number) => setSocialLinks(socialLinks.filter((_: { platform: string; url: string }, j: number) => j !== i));
  const updateSocial = (i: number, field: 'platform' | 'url', value: string) => {
    const next = [...socialLinks]; next[i] = { ...next[i], [field]: value }; setSocialLinks(next);
  };

  const addColumn = () => setColumns([...columns, { ...emptyCol }]);
  const removeColumn = (i: number) => setColumns(columns.filter((_: FooterColumn, j: number) => j !== i));
  const updateColumnTitle = (i: number, title: string) => {
    const next = [...columns]; next[i] = { ...next[i], title }; setColumns(next);
  };
  const addLink = (ci: number) => {
    const next = [...columns]; next[ci] = { ...next[ci], links: [...next[ci].links, { label: '', url: '' }] }; setColumns(next);
  };
  const removeLink = (ci: number, li: number) => {
    const next = [...columns]; next[ci] = { ...next[ci], links: next[ci].links.filter((_, j) => j !== li) }; setColumns(next);
  };
  const updateLink = (ci: number, li: number, field: string, value: string | boolean) => {
    const next = [...columns];
    next[ci] = { ...next[ci], links: next[ci].links.map((lk: { label: string; url: string; isExternal?: boolean }, j: number) => j === li ? { ...lk, [field]: value } : lk) };
    setColumns(next);
  };

  return (
    <div className="space-y-4">
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded">{notice}</div>}
      {!canManage && <div className="p-3 bg-stone-50 border border-stone-200 text-stone-600 text-xs rounded">Read-only.</div>}

      {canManage && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">Configure the site-wide footer content, social links, and columns.</p>
          <div className="flex gap-2">
            <button onClick={reset} disabled={isPending} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded disabled:opacity-50">Revert to Published</button>
            <button onClick={saveDraft} disabled={isPending} className="px-3 py-1.5 text-xs text-stone-600 border border-stone-300 rounded disabled:opacity-50">Save Draft</button>
            <button onClick={publish} disabled={isPending} className="px-3 py-1.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded disabled:opacity-50">Publish</button>
          </div>
        </div>
      )}

      {config?.publishedAt && <div className="text-[10px] text-stone-400">Last published: {new Date(config.publishedAt).toLocaleString()}</div>}

      <div className="bg-white border border-stone-200 rounded p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase text-stone-600">General</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className={lbl}>Tagline</label><input value={tagline} onChange={(e) => setTagline(e.target.value)} className={inp} placeholder="Your short brand tagline" /></div>
          <div><label className={lbl}>Copyright</label><input value={copyright} onChange={(e) => setCopyright(e.target.value)} className={inp} placeholder="© 2026 NFRGuide" /></div>
        </div>
        <div><label className={lbl}>Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inp} rows={2} placeholder="Brief site description for the footer" /></div>
        <div><label className={lbl}>Status Text</label><input value={statusText} onChange={(e) => setStatusText(e.target.value)} className={inp} placeholder="e.g. Season 2026 in progress" /></div>
      </div>

      <div className="bg-white border border-stone-200 rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase text-stone-600">Social Links</h3>
          {canManage && <button onClick={addSocial} className="text-[10px] text-[#D4A757] font-semibold">+ Add</button>}
        </div>
        {socialLinks.map((sl, i) => (
          <div key={i} className="flex gap-2 items-end">
            <div className="flex-1"><label className={lbl}>Platform</label><input value={sl.platform} onChange={(e) => updateSocial(i, 'platform', e.target.value)} className={inp} placeholder="facebook" /></div>
            <div className="flex-[2]"><label className={lbl}>URL</label><input value={sl.url} onChange={(e) => updateSocial(i, 'url', e.target.value)} className={inp} placeholder="https://..." /></div>
            {canManage && <button onClick={() => removeSocial(i)} className="text-[10px] text-rose-600 hover:underline pb-2">Remove</button>}
          </div>
        ))}
        {socialLinks.length === 0 && <p className="text-[10px] text-stone-400">No social links configured.</p>}
      </div>

      <div className="bg-white border border-stone-200 rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase text-stone-600">Footer Columns</h3>
          {canManage && <button onClick={addColumn} className="text-[10px] text-[#D4A757] font-semibold">+ Add Column</button>}
        </div>
        {columns.map((col, ci) => (
          <div key={ci} className="border border-stone-200 rounded p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input value={col.title} onChange={(e) => updateColumnTitle(ci, e.target.value)} className={`${inp} flex-1`} placeholder="Column title" />
              {canManage && <button onClick={() => removeColumn(ci)} className="text-[10px] text-rose-600 hover:underline">Remove Column</button>}
            </div>
            {col.links.map((lk, li) => (
              <div key={li} className="flex gap-2 items-end pl-3">
                <div className="flex-1"><label className={lbl}>Label</label><input value={lk.label} onChange={(e) => updateLink(ci, li, 'label', e.target.value)} className={inp} /></div>
                <div className="flex-[2]"><label className={lbl}>URL</label><input value={lk.url} onChange={(e) => updateLink(ci, li, 'url', e.target.value)} className={inp} /></div>
                <label className="flex items-center gap-1 text-[10px] text-stone-500 pb-2"><input type="checkbox" checked={lk.isExternal ?? false} onChange={(e) => updateLink(ci, li, 'isExternal', e.target.checked)} />Ext</label>
                {canManage && <button onClick={() => removeLink(ci, li)} className="text-[10px] text-rose-600 hover:underline pb-2">×</button>}
              </div>
            ))}
            {canManage && <button onClick={() => addLink(ci)} className="text-[10px] text-[#D4A757] pl-3">+ Add Link</button>}
          </div>
        ))}
        {columns.length === 0 && <p className="text-[10px] text-stone-400">No footer columns configured.</p>}
      </div>
    </div>
  );
};
