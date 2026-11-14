'use client';

import React, { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { InfoPageBodyEditor } from '../../components/admin/editor/InfoPageBodyEditor';
import { MediaPickerModal } from '../../components/admin/editor/MediaPickerModal';
import {
  applyDirectory, filterCounts, PAGE_FILTERS, FILTER_LABELS, PAGE_SORTS, SORT_LABELS,
  type PageFilter, type PageSort,
} from '../../lib/cms/infoPageDirectory';
import {
  saveInfoPageDraftAction, submitForReviewAction,
  approveInfoPageAction, publishInfoPageAction, revertToDraftAction,
  unpublishInfoPageAction, archiveInfoPageAction, restoreInfoPageAction,
  deleteInfoPageAction, listInfoPageRevisionsAction, restoreInfoPageRevisionAction,
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
  /** What a visitor can reach, as opposed to what the draft says. */
  isLive: boolean;
  /** Live, but a newer draft is waiting behind it. */
  hasUnpublishedChanges: boolean;
  isProtected: boolean;
  isArchived: boolean;
  pageType: string;
  /** Optimistic-lock token, sent back on save so a stale edit is refused. */
  version: number;
  /** The hero asset REFERENCE, and its URL for the thumbnail only. */
  heroMediaId: string | null;
  heroUrl: string | null;
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
/**
 * Replaces the former PUBLISHED_EDIT_BLOCKED warning, which S-1 made untrue.
 * Published pages are now edited in place; what an operator needs to know is
 * that saving does not reach readers until the draft is published again.
 */
export const PUBLISHED_EDIT_EXPLAINER =
  'A live page can be edited while it stays up: your changes are saved to a draft and visitors keep seeing the published version until the draft is approved and published.';

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
  const [form, setForm] = useState({ slug: '', title: '', body: '', seoTitle: '', metaDescription: '', heroMediaId: '' as string, heroUrl: '' as string });
  const [heroPicker, setHeroPicker] = useState(false);
  /** The version the editor loaded, sent back on save as the optimistic lock. */
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PageFilter>('all');
  const [sort, setSort] = useState<PageSort>('updated-desc');
  const [revisions, setRevisions] = useState<{ slug: string; rows: { revisionNo: number; actorName: string; summary: string; createdAt: string | Date }[] } | null>(null);
  const fid = useId();

  // Counts come from the same predicates the list uses, so a filter can never
  // promise a number it does not then show.
  const counts = filterCounts(pages);
  const visible = applyDirectory(pages, { query, filter, sort });

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

  const showRevisions = (slug: string) =>
    startTransition(async () => {
      const r = await listInfoPageRevisionsAction(slug);
      if (!r.ok) { flash(r.error || 'Could not load revisions.', false); return; }
      setRevisions({ slug, rows: r.revisions ?? [] });
    });

  const restoreRevision = (slug: string, revisionNo: number) => {
    if (typeof window !== 'undefined' && !window.confirm(
      `Load revision ${revisionNo} into the draft? The live page is NOT changed — you would still need to submit, approve and publish it.`,
    )) return;
    setRevisions(null);
    run(restoreInfoPageRevisionAction(slug, revisionNo), `Revision ${revisionNo} loaded into the draft. The live page is unchanged.`);
  };

  const openEditor = (row: InfoPageRow) => {
    setCreating(false);
    setEditing(row.slug);
    setEditingVersion(row.version || null);
    setForm({
      slug: row.slug,
      title: row.dbTitle || row.defaultTitle || '',
      body: row.dbBody || '',
      seoTitle: row.dbSeoTitle || '',
      metaDescription: row.dbMetaDescription || row.defaultDescription || '',
      heroMediaId: row.heroMediaId || '',
      heroUrl: row.heroUrl || '',
    });
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setEditingVersion(null);
    setForm({ slug: '', title: '', body: '', seoTitle: '', metaDescription: '', heroMediaId: '', heroUrl: '' });
  };

  const saveDraft = () => {
    const slug = creating ? form.slug : editing;
    if (!slug) return;
    const previousStatus = pages.find((p) => p.slug === slug)?.dbStatus ?? null;
    run(
      saveInfoPageDraftAction(
        {
          slug, title: form.title, body: form.body,
          seoTitle: form.seoTitle || null, metaDescription: form.metaDescription || null,
          heroMediaId: form.heroMediaId || null,
        },
        // Omitted when creating: there is no prior version to quote.
        creating ? undefined : (editingVersion ?? undefined),
      ),
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

      {/* ---- directory controls (PM-01) ---- */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-stone-200 rounded-sm p-3">
        <div className="flex-1 min-w-[14rem]">
          <label htmlFor={`${fid}-q`} className={lbl}>Search</label>
          <input
            id={`${fid}-q`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, slug or type (legacy, cms, system, protected…)"
            className={inp}
          />
        </div>
        <div>
          <label htmlFor={`${fid}-filter`} className={lbl}>Show</label>
          <select id={`${fid}-filter`} value={filter} onChange={(e) => setFilter(e.target.value as PageFilter)} className={`${inp} w-56`}>
            {PAGE_FILTERS.map((f) => (
              <option key={f} value={f}>{FILTER_LABELS[f]} ({counts[f]})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fid}-sort`} className={lbl}>Sort</label>
          <select id={`${fid}-sort`} value={sort} onChange={(e) => setSort(e.target.value as PageSort)} className={`${inp} w-48`}>
            {PAGE_SORTS.map((o) => <option key={o} value={o}>{SORT_LABELS[o]}</option>)}
          </select>
        </div>
        <p role="status" className="text-[11px] text-stone-500 pb-2">
          {visible.length} of {pages.length} page{pages.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="bg-white border border-stone-200 rounded-sm overflow-x-auto">
        <table className="w-full text-left text-xs font-sans">
          <thead><tr className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase text-[10px] tracking-wider">
            <th className="py-2 px-4">Slug</th>
            <th className="py-2 px-4">Title</th>
            <th className="py-2 px-4">Type</th>
            <th className="py-2 px-4">Live</th>
            <th className="py-2 px-4">Draft Status</th>
            <th className="py-2 px-4">Updated</th>
            <th className="py-2 px-4 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-stone-100">
            {visible.map((row) => (
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
                {/*
                  Live state is reported separately from the draft's status
                  because they are now genuinely different things: a page can be
                  live while its draft sits back at DRAFT because someone is
                  editing it. Showing only the status made that page look
                  unpublished when readers could still see it.
                */}
                <td className="py-2 px-4">
                  {row.isArchived ? (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-stone-700 bg-stone-200">Archived</span>
                  ) : row.isLive ? (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-emerald-800 bg-emerald-50">
                      Live{row.hasUnpublishedChanges ? ' · edits pending' : ''}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-stone-600 bg-stone-100">Not live</span>
                  )}
                  {row.isProtected && (
                    <span className="ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded text-amber-800 bg-amber-50" title="Protected: cannot be archived, deleted or re-slugged.">Protected</span>
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
                  {/*
                    Editing a live page is the whole point of the S-1 work, so
                    this is no longer disabled. Only an ARCHIVED page is blocked,
                    because it must be restored before it can be worked on.
                  */}
                  <button
                    onClick={() => openEditor(row)}
                    disabled={isPending || row.isArchived}
                    title={row.isArchived ? 'Restore this page before editing it.' : undefined}
                    className="text-[#8B5E3C] hover:underline font-bold disabled:opacity-40"
                  >
                    Edit
                  </button>
                  {row.dbStatus === 'DRAFT' && <button onClick={() => run(submitForReviewAction(row.slug), 'Submitted for review.')} disabled={isPending} className="text-sky-700 hover:underline">Submit</button>}
                  {row.dbStatus === 'PENDING_REVIEW' && <button onClick={() => run(approveInfoPageAction(row.slug), 'Approved.')} disabled={isPending} className="text-emerald-700 hover:underline">Approve</button>}
                  {row.dbStatus === 'APPROVED' && <button onClick={() => run(publishInfoPageAction(row.slug), 'Published.')} disabled={isPending} className="text-emerald-700 hover:underline font-bold">Publish</button>}
                  {row.isLive && <button onClick={() => unpublish(row)} disabled={isPending} className="text-rose-600 hover:underline">Unpublish</button>}
                  {row.dbStatus && row.dbStatus !== 'DRAFT' && <button onClick={() => run(revertToDraftAction(row.slug), 'Reverted to draft. The live page is unchanged.')} disabled={isPending} className="text-stone-500 hover:underline">Revert</button>}
                  {row.dbId && (
                    <a href={`/admin/info-pages/${row.slug}/preview/`} className="text-sky-700 hover:underline">Preview</a>
                  )}
                  {row.dbId && <button onClick={() => showRevisions(row.slug)} disabled={isPending} className="text-stone-600 hover:underline">Revisions</button>}
                  {row.dbId && !row.isProtected && !row.isArchived && (
                    <button onClick={() => run(archiveInfoPageAction(row.slug), 'Archived. The page is off the public site; its content and history are kept.')} disabled={isPending} className="text-amber-700 hover:underline">Archive</button>
                  )}
                  {row.isArchived && (
                    <button onClick={() => run(restoreInfoPageAction(row.slug), 'Restored as a draft. Publish it when you are ready.')} disabled={isPending} className="text-emerald-700 hover:underline">Restore</button>
                  )}
                  {row.isArchived && !row.isProtected && (
                    <button
                      onClick={() => { if (confirm(`Permanently delete "${row.slug}" and its entire revision history? This cannot be undone.`)) run(deleteInfoPageAction(row.slug), 'Page deleted.'); }}
                      disabled={isPending}
                      className="text-rose-700 hover:underline"
                    >Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="p-6 text-center text-xs text-stone-500">
            {query.trim()
              ? `No page matches “${query.trim()}” in ${FILTER_LABELS[filter].toLowerCase()}.`
              : `No page is currently ${FILTER_LABELS[filter].toLowerCase()}.`}
          </p>
        )}
      </div>
      {pages.some((p) => p.isLive) && (
        <p id={`${fid}-published-edit`} className="text-[11px] text-stone-500">{PUBLISHED_EDIT_EXPLAINER}</p>
      )}

      <MediaPickerModal
        isOpen={heroPicker}
        onClose={() => setHeroPicker(false)}
        onSelect={(media) => {
          setHeroPicker(false);
          /*
            A hero must be a Media Library RECORD, not a pasted URL: the alt
            text, caption, credit and rights status all come from that record,
            and a custom URL has none of them. Saving one would produce a legal
            page carrying an image with no rights provenance.
          */
          if (!media.id) {
            flash('Choose an image from the Media Library — a custom URL has no alt text, credit or rights record.', false);
            return;
          }
          setForm((f) => ({ ...f, heroMediaId: media.id!, heroUrl: media.url }));
        }}
      />

      {/* ---- revision history ---- */}
      {revisions && (
        <div className="bg-white border border-stone-200 rounded-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-stone-900">
              Revisions — <span className="font-mono text-xs text-stone-600">{revisions.slug}</span>
            </h2>
            <button onClick={() => setRevisions(null)} className="text-xs text-stone-500 hover:underline">Close</button>
          </div>
          <p className="text-[11px] text-stone-500">
            Restoring loads that version into the <strong>draft</strong>. The live page is not changed, so a restore is
            reviewed and published like any other edit.
          </p>
          {revisions.rows.length === 0 ? (
            <p className="text-xs text-stone-500">No revisions recorded yet.</p>
          ) : (
            <table className="w-full text-left text-xs font-sans">
              <thead><tr className="text-stone-500 uppercase text-[10px] tracking-wider border-b border-stone-200">
                <th className="py-1.5 pr-3">#</th><th className="py-1.5 pr-3">What changed</th>
                <th className="py-1.5 pr-3">By</th><th className="py-1.5 pr-3">When</th><th />
              </tr></thead>
              <tbody className="divide-y divide-stone-100">
                {revisions.rows.map((r) => (
                  <tr key={r.revisionNo}>
                    <td className="py-1.5 pr-3 font-mono text-stone-600">{r.revisionNo}</td>
                    <td className="py-1.5 pr-3 text-stone-800">{r.summary}</td>
                    <td className="py-1.5 pr-3 text-stone-500">{r.actorName}</td>
                    <td className="py-1.5 pr-3 text-stone-500">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => restoreRevision(revisions.slug, r.revisionNo)} disabled={isPending} className="text-[#8B5E3C] hover:underline font-semibold">
                        Load into draft
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {creating && (
        <div className="bg-white border border-stone-200 rounded-sm p-4 space-y-4">
          <h3 className="text-sm font-bold text-stone-900">Create New Info Page</h3>
          <div><label htmlFor={`${fid}-c-slug`} className={lbl}>Slug (URL path)</label><input id={`${fid}-c-slug`} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="e.g. faq" className={inp} /></div>
          <div><label htmlFor={`${fid}-c-title`} className={lbl}>Title</label><input id={`${fid}-c-title`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inp} /></div>
          <div>
            <span className={lbl}>Body</span>
            <InfoPageBodyEditor
              documentKey="create"
              value={form.body}
              onChange={(html) => setForm((f) => ({ ...f, body: html }))}
            />
          </div>
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
          <div>
            <span className={lbl}>Body</span>
            {/*
              `documentKey` re-seeds the editor when the host switches page.
              Without it the editor would keep the previous page's content,
              because it owns its own document once mounted.
            */}
            <InfoPageBodyEditor
              documentKey={editing ?? 'new'}
              value={form.body}
              onChange={(html) => setForm((f) => ({ ...f, body: html }))}
            />
          </div>
          <div>
            <span className={lbl}>Hero image</span>
            <div className="flex items-center gap-3">
              {form.heroUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={form.heroUrl} alt="" className="h-16 w-24 object-cover rounded-xs border border-stone-200" />
                : <div className="h-16 w-24 rounded-xs border border-dashed border-stone-300 grid place-items-center text-[10px] text-stone-400">None</div>}
              <button type="button" onClick={() => setHeroPicker(true)} className={`${btn} border border-stone-300 text-stone-700`}>
                {form.heroUrl ? 'Replace' : 'Choose from Media Library'}
              </button>
              {form.heroUrl && (
                <button type="button" onClick={() => setForm((f) => ({ ...f, heroMediaId: '', heroUrl: '' }))} className={`${btn} text-rose-600`}>Remove</button>
              )}
            </div>
            <p className="text-[10px] text-stone-500 mt-1">
              Alt text, caption, credit and rights come from the Media Library record, so a correction made there reaches the next publication.
            </p>
          </div>
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
