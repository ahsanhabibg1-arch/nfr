'use client';

import React, { useId, useState, useTransition } from 'react';
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

/**
 * Stage 09 Task E/H — say what the server will actually do.
 *
 * These describe the measured behaviour of `infoPageService` (pinned by
 * tests/stage09-infopage-publication.test.ts), not an intended workflow:
 *   - a PUBLISHED page cannot be edited in place (D-09; separate draft and
 *     published content needs schema change S-1, which is not approved);
 *   - unpublishing takes the CMS version off the public site — a CMS-only page
 *     then 404s, a built-in (legacy) slug falls back to its built-in text, which
 *     is still pending legal review;
 *   - saving over a PENDING_REVIEW or APPROVED page resets it to DRAFT and
 *     clears the approval.
 */
export const PUBLISHED_EDIT_BLOCKED =
  'Published pages cannot be edited in place: there is no separate draft copy yet (decision D-09 / schema change S-1 pending). Unpublish first to edit — that removes this version from the public site.';

function builtInTextState(row: Pick<InfoPageRow, 'hardcodedReview'>): string {
  return row.hardcodedReview === 'approved' ? 'its built-in text' : 'its built-in text, which is still pending legal review';
}

export function unpublishConsequence(row: Pick<InfoPageRow, 'slug' | 'isLegacy' | 'hardcodedReview'>): string {
  return row.isLegacy
    ? `Unpublish "${row.slug}"? This CMS version leaves the public site immediately and /${row.slug}/ falls back to ${builtInTextState(row)}.`
    : `Unpublish "${row.slug}"? This page leaves the public site immediately and its URL will return "not found" until it is published again.`;
}

export function saveDraftMessage(previousStatus: string | null, creating: boolean): string {
  if (creating) return 'Page created as draft.';
  if (previousStatus === 'APPROVED' || previousStatus === 'PENDING_REVIEW') {
    return 'Draft saved. The page was returned to Draft and its previous review/approval was reset — it must be submitted and approved again.';
  }
  return 'Draft saved.';
}

export const AdminInfoPagesPage: React.FC<Props> = ({ pages }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ slug: '', title: '', body: '', seoTitle: '', metaDescription: '' });
  const fid = useId();

  const flash = (text: string, ok: boolean) => { setNotice({ text, ok }); setTimeout(() => setNotice(null), 8000); };

  // Stage 09 Task H: a failure is reported as a failure, not in the success style.
  const run = (p: Promise<{ ok: boolean; error?: string }>, msg: string) =>
    startTransition(async () => { const r = await p; flash(r.ok ? msg : r.error || 'Error', r.ok); if (r.ok) router.refresh(); });

  const unpublish = (row: InfoPageRow) => {
    if (typeof window !== 'undefined' && !window.confirm(unpublishConsequence(row))) return;
    run(
      unpublishInfoPageAction(row.slug),
      row.isLegacy
        ? `Unpublished — /${row.slug}/ now shows ${builtInTextState(row)}; the CMS version is a draft again.`
        : `Unpublished — /${row.slug}/ is no longer public; the page is a draft again.`,
    );
  };

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
    const previousStatus = pages.find((p) => p.slug === slug)?.dbStatus ?? null;
    run(
      saveInfoPageDraftAction({ slug, title: form.title, body: form.body, seoTitle: form.seoTitle || null, metaDescription: form.metaDescription || null }),
      saveDraftMessage(previousStatus, creating),
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
      {notice && (
        <div
          role={notice.ok ? 'status' : 'alert'}
          className={`p-3 border text-xs rounded-xs ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}
        >
          {notice.text}
        </div>
      )}

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
                  <button
                    onClick={() => openEditor(row)}
                    disabled={isPending || (row.dbStatus === 'PUBLISHED')}
                    title={row.dbStatus === 'PUBLISHED' ? PUBLISHED_EDIT_BLOCKED : undefined}
                    aria-describedby={row.dbStatus === 'PUBLISHED' ? `${fid}-published-edit` : undefined}
                    className="text-[#8B5E3C] hover:underline font-bold disabled:opacity-40"
                  >
                    Edit
                  </button>
                  {row.dbStatus === 'DRAFT' && <button onClick={() => run(submitForReviewAction(row.slug), 'Submitted for review.')} disabled={isPending} className="text-sky-700 hover:underline">Submit</button>}
                  {row.dbStatus === 'PENDING_REVIEW' && <button onClick={() => run(approveInfoPageAction(row.slug), 'Approved.')} disabled={isPending} className="text-emerald-700 hover:underline">Approve</button>}
                  {row.dbStatus === 'APPROVED' && <button onClick={() => run(publishInfoPageAction(row.slug), 'Published.')} disabled={isPending} className="text-emerald-700 hover:underline font-bold">Publish</button>}
                  {row.dbStatus === 'PUBLISHED' && <button onClick={() => unpublish(row)} disabled={isPending} className="text-rose-600 hover:underline">Unpublish</button>}
                  {row.dbStatus && row.dbStatus !== 'DRAFT' && row.dbStatus !== 'PUBLISHED' && <button onClick={() => run(revertToDraftAction(row.slug), 'Reverted to draft.')} disabled={isPending} className="text-stone-500 hover:underline">Revert</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages.some((p) => p.dbStatus === 'PUBLISHED') && (
        <p id={`${fid}-published-edit`} className="text-[11px] text-stone-500">{PUBLISHED_EDIT_BLOCKED}</p>
      )}

      {creating && (
        <div className="bg-white border border-stone-200 rounded-sm p-4 space-y-4">
          <h3 className="text-sm font-bold text-stone-900">Create New Info Page</h3>
          <div><label htmlFor={`${fid}-c-slug`} className={lbl}>Slug (URL path)</label><input id={`${fid}-c-slug`} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="e.g. faq" className={inp} /></div>
          <div><label htmlFor={`${fid}-c-title`} className={lbl}>Title</label><input id={`${fid}-c-title`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inp} /></div>
          <div><label htmlFor={`${fid}-c-body`} className={lbl}>Body (plain text or HTML)</label><textarea id={`${fid}-c-body`} rows={12} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={inp} /></div>
          <div><label htmlFor={`${fid}-c-seotitle`} className={lbl}>SEO Title (optional override)</label><input id={`${fid}-c-seotitle`} value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} className={inp} /></div>
          <div><label htmlFor={`${fid}-c-desc`} className={lbl}>Meta Description</label><textarea id={`${fid}-c-desc`} rows={2} value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} className={inp} /></div>
          <div className="flex gap-2">
            <button onClick={saveDraft} disabled={isPending || !form.slug || !form.title || !form.body} className={`${btn} bg-[#0F1115] text-[#D4A757]`}>Create Draft</button>
            <button onClick={() => setCreating(false)} className={`${btn} border border-stone-300 text-stone-700`}>Cancel</button>
          </div>
        </div>
      )}

      {editing && (
        <div className="bg-white border border-stone-200 rounded-sm p-4 space-y-4">
          <h3 className="text-sm font-bold text-stone-900">Editing: {editing}</h3>
          {(() => {
            const prev = pages.find((p) => p.slug === editing)?.dbStatus;
            return prev === 'APPROVED' || prev === 'PENDING_REVIEW' ? (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xs p-2" role="note">
                This page is {prev === 'APPROVED' ? 'approved' : 'pending review'}. Saving returns it to Draft and resets its review/approval.
              </p>
            ) : null;
          })()}
          <div><label htmlFor={`${fid}-e-title`} className={lbl}>Title</label><input id={`${fid}-e-title`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inp} /></div>
          <div><label htmlFor={`${fid}-e-body`} className={lbl}>Body (plain text or HTML)</label><textarea id={`${fid}-e-body`} rows={12} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={inp} /></div>
          <div><label htmlFor={`${fid}-e-seotitle`} className={lbl}>SEO Title (optional override)</label><input id={`${fid}-e-seotitle`} value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} className={inp} /></div>
          <div><label htmlFor={`${fid}-e-desc`} className={lbl}>Meta Description</label><textarea id={`${fid}-e-desc`} rows={2} value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} className={inp} /></div>
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
