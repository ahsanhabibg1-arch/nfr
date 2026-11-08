'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import {
  saveInfoPageDraftAction, submitForReviewAction,
  approveInfoPageAction, publishInfoPageAction, revertToDraftAction,
  unpublishInfoPageAction,
} from '../../app/admin/info-page-actions';

const inp = 'w-full p-2 bg-stone-50 border border-stone-200 rounded-xs text-sm';
const lbl = 'block text-[10px] font-mono uppercase text-stone-500 mb-1';
const btn = 'px-3 py-1.5 text-xs font-semibold rounded-xs disabled:opacity-50';

export interface InfoPageRow {
  slug: string;
  isLegacy: boolean;
  defaultTitle: string | null;
  defaultDescription: string | null;
  hardcodedReview: string | null;
  dbId: string | null;
  dbTitle: string | null;
  dbBody: string | null;
  dbSeoTitle: string | null;
  dbMetaDescription: string | null;
  dbStatus: string | null;
  dbUpdatedAt: string | null;
}

interface Props { pages: InfoPageRow[]; }

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-stone-600 bg-stone-100',
  PENDING_REVIEW: 'text-amber-800 bg-amber-50',
  APPROVED: 'text-sky-800 bg-sky-50',
  PUBLISHED: 'text-emerald-800 bg-emerald-50',
};

export const AdminInfoPagesPage: React.FC<Props> = ({ pages }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ slug: '', title: '', body: '', seoTitle: '', metaDescription: '' });

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 6000); };

  const run = (p: Promise<{ ok: boolean; error?: string }>, msg: string) =>
    startTransition(async () => { const r = await p; flash(r.ok ? msg : r.error || 'Error'); if (r.ok) router.refresh(); });

  const openEditor = (row: InfoPageRow) => {
    setCreating(false);
    setEditing(row.slug);
    setForm({
      slug: row.slug,
      title: row.dbTitle || row.defaultTitle || '',
      body: row.dbBody || '',
      seoTitle: row.dbSeoTitle || '',
      metaDescription: row.dbMetaDescription || row.defaultDescription || '',
    });
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm({ slug: '', title: '', body: '', seoTitle: '', metaDescription: '' });
  };

  const saveDraft = () => {
    const slug = creating ? form.slug : editing;
    if (!slug) return;
    run(
      saveInfoPageDraftAction({ slug, title: form.title, body: form.body, seoTitle: form.seoTitle || null, metaDescription: form.metaDescription || null }),
      creating ? 'Page created as draft.' : 'Draft saved.',
    );
    setEditing(null);
    setCreating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <AdminPageHeader title="Info & Legal Pages" description="Manage the site's informational and legal policy pages. Each page follows a DRAFT → PENDING REVIEW → APPROVED → PUBLISHED workflow. Only published pages override the built-in defaults." />
        <button onClick={openCreate} disabled={isPending || creating} className={`${btn} bg-[#0F1115] text-[#D4A757] shrink-0`}>+ Create New Page</button>
      </div>
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs">{notice}</div>}

      <div className="bg-white border border-stone-200 rounded-sm overflow-x-auto">
        <table className="w-full text-left text-xs font-sans">
          <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px] tracking-wider">
            <th className="py-2 px-4">Slug</th>
            <th className="py-2 px-4">Title</th>
            <th className="py-2 px-4">Type</th>
            <th className="py-2 px-4">CMS Status</th>
            <th className="py-2 px-4">Updated</th>
            <th className="py-2 px-4 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-stone-100">
            {pages.map((row) => (
              <tr key={row.slug} className="hover:bg-stone-50/60">
                <td className="py-2 px-4 font-mono text-stone-600">{row.slug}</td>
                <td className="py-2 px-4 font-semibold text-stone-900">{row.dbTitle || row.defaultTitle || row.slug}</td>
                <td className="py-2 px-4">
                  {row.isLegacy ? (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-sky-800 bg-sky-50">Legacy</span>
                  ) : (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-violet-800 bg-violet-50">CMS</span>
                  )}
                </td>
                <td className="py-2 px-4">
                  {row.dbStatus ? (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${STATUS_COLORS[row.dbStatus] || ''}`}>
                      {STATUS_LABELS[row.dbStatus] || row.dbStatus}
                    </span>
                  ) : <span className="text-stone-400">—</span>}
                </td>
                <td className="py-2 px-4 text-stone-500">{row.dbUpdatedAt ? new Date(row.dbUpdatedAt).toLocaleDateString() : '—'}</td>
                <td className="py-2 px-4 text-right space-x-2 whitespace-nowrap">
                  <button onClick={() => openEditor(row)} disabled={isPending || (row.dbStatus === 'PUBLISHED')} className="text-[#8B5E3C] hover:underline font-bold disabled:opacity-40">Edit</button>
                  {row.dbStatus === 'DRAFT' && <button onClick={() => run(submitForReviewAction(row.slug), 'Submitted for review.')} disabled={isPending} className="text-sky-700 hover:underline">Submit</button>}
                  {row.dbStatus === 'PENDING_REVIEW' && <button onClick={() => run(approveInfoPageAction(row.slug), 'Approved.')} disabled={isPending} className="text-emerald-700 hover:underline">Approve</button>}
                  {row.dbStatus === 'APPROVED' && <button onClick={() => run(publishInfoPageAction(row.slug), 'Published.')} disabled={isPending} className="text-emerald-700 hover:underline font-bold">Publish</button>}
                  {row.dbStatus === 'PUBLISHED' && <button onClick={() => run(unpublishInfoPageAction(row.slug), 'Unpublished — now a draft.')} disabled={isPending} className="text-rose-600 hover:underline">Unpublish</button>}
                  {row.dbStatus && row.dbStatus !== 'DRAFT' && row.dbStatus !== 'PUBLISHED' && <button onClick={() => run(revertToDraftAction(row.slug), 'Reverted to draft.')} disabled={isPending} className="text-stone-500 hover:underline">Revert</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="bg-white border border-stone-200 rounded-sm p-4 space-y-4">
          <h3 className="text-sm font-bold text-stone-900">Create New Info Page</h3>
          <div><label className={lbl}>Slug (URL path)</label><input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="e.g. faq" className={inp} /></div>
          <div><label className={lbl}>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inp} /></div>
          <div><label className={lbl}>Body (plain text or HTML)</label><textarea rows={12} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={inp} /></div>
          <div><label className={lbl}>SEO Title (optional override)</label><input value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} className={inp} /></div>
          <div><label className={lbl}>Meta Description</label><textarea rows={2} value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} className={inp} /></div>
          <div className="flex gap-2">
            <button onClick={saveDraft} disabled={isPending || !form.slug || !form.title || !form.body} className={`${btn} bg-[#0F1115] text-[#D4A757]`}>Create Draft</button>
            <button onClick={() => setCreating(false)} className={`${btn} border border-stone-300 text-stone-700`}>Cancel</button>
          </div>
        </div>
      )}

      {editing && (
        <div className="bg-white border border-stone-200 rounded-sm p-4 space-y-4">
          <h3 className="text-sm font-bold text-stone-900">Editing: {editing}</h3>
          <div><label className={lbl}>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inp} /></div>
          <div><label className={lbl}>Body (plain text or HTML)</label><textarea rows={12} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={inp} /></div>
          <div><label className={lbl}>SEO Title (optional override)</label><input value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} className={inp} /></div>
          <div><label className={lbl}>Meta Description</label><textarea rows={2} value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} className={inp} /></div>
          <div className="flex gap-2">
            <button onClick={saveDraft} disabled={isPending} className={`${btn} bg-[#0F1115] text-[#D4A757]`}>Save Draft</button>
            <button onClick={() => setEditing(null)} className={`${btn} border border-stone-300 text-stone-700`}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminInfoPagesPage;
