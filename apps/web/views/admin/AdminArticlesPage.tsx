'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ROUTES, articleUrl } from '../../config/routes';
import type { AdminArticleRow, ArticleListResult } from '../../lib/cms/adminQueries';
import { transitionArticleAction, deleteArticleAction } from '../../app/admin/article-actions';
import { discardDraftSnapshotAction } from '../../app/admin/draft-recovery-actions';

interface Props {
  result: ArticleListResult;
  filters: { q: string; status: string; category: string; sort: string };
  categories: { slug: string; name: string }[];
  canPublish: boolean;
  canDelete: boolean;
  /** This editor's recovery drafts; populated only while that tab is open. */
  recoveryDrafts?: RecoveryDraftRow[];
  /** Always supplied, so the tab can carry a badge before it is opened. */
  recoveryCount?: number;
}

export interface RecoveryDraftRow {
  id: string;
  composerKey: string;
  articleId: string | null;
  title: string;
  slug: string;
  wordCount: number;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-800', in_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800', scheduled: 'bg-purple-100 text-purple-800',
  draft: 'bg-stone-100 text-stone-700', archived: 'bg-stone-200 text-stone-600',
};
const STATUS_TABS = ['', 'published', 'in_review', 'approved', 'scheduled', 'draft', 'archived'];

/**
 * The recovery tab is NOT a workflow status.
 *
 * Every other tab narrows the article list; this one asks a different question
 * — which composer sessions never became articles — against a different table.
 * It is kept beside them because that is where an author looks for their work,
 * and separated by a rule in the tab strip because it is a different kind of
 * thing from PUBLISHED or IN REVIEW.
 */
const RECOVERY_TAB = 'unsaved';

/** Mirrors `SNAPSHOT_RETENTION_DAYS`; stated in words for an editor to read. */
const SNAPSHOT_RETENTION_NOTE = '30 days after you last touch them';

export const AdminArticlesPage: React.FC<Props> = ({
  result, filters, categories, canPublish, canDelete,
  recoveryDrafts = [], recoveryCount = 0,
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.q);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const navigate = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged = { q: filters.q, status: filters.status, category: filters.category, sort: filters.sort, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    if (!('page' in patch)) p.delete('page');
    router.push(`/admin/articles/${p.toString() ? `?${p}` : ''}`);
  };

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 6000); };
  const runBulk = (fn: () => Promise<string>) => startTransition(async () => { const m = await fn(); setSelectedIds([]); flash(m); router.refresh(); });

  const bulkPublish = () => runBulk(async () => {
    let ok = 0, failed = 0;
    for (const id of selectedIds) { const r = await transitionArticleAction(id, 'PUBLISHED'); r.ok ? ok++ : failed++; }
    return `Published ${ok}.${failed ? ` ${failed} skipped (must be Approved/Scheduled and pass the publication gate).` : ''}`;
  });
  const bulkDelete = () => runBulk(async () => {
    let ok = 0, failed = 0;
    for (const id of selectedIds) { const r = await deleteArticleAction(id); r.ok ? ok++ : failed++; }
    return `Deleted ${ok}.${failed ? ` ${failed} failed.` : ''}`;
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Article Directory &amp; Publishing Queue"
        description="Database-backed, server-side search / filter / sort / pagination. Actions are authenticated and permission-checked."
        actions={<Link href={ROUTES.ADMIN_ARTICLE_NEW} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs">+ Create New Article</Link>}
      />

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-200 pb-2 text-xs font-sans">
        {STATUS_TABS.map((s) => (
          <button key={s || 'all'} onClick={() => navigate({ status: s })}
            className={`px-3 py-1.5 rounded-xs font-semibold uppercase tracking-wider ${filters.status === s ? 'bg-[#0F1115] text-[#D4A757]' : 'text-stone-600 hover:bg-stone-100'}`}>
            {s === 'scheduled' ? 'scheduled (manual publish)' : s ? s.replace('_', ' ') : 'All'}
          </button>
        ))}

        <span aria-hidden className="mx-1 h-5 w-px bg-stone-200" />
        <button
          onClick={() => navigate({ status: RECOVERY_TAB })}
          data-testid="articles-tab-unsaved"
          title="Work from the composer that was never saved as an article"
          className={`px-3 py-1.5 rounded-xs font-semibold uppercase tracking-wider inline-flex items-center gap-2 ${
            filters.status === RECOVERY_TAB ? 'bg-[#0F1115] text-[#D4A757]' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          Unsaved drafts
          {recoveryCount > 0 && (
            <span
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full ${
                filters.status === RECOVERY_TAB ? 'bg-[#D4A757] text-[#0F1115]' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {recoveryCount}
              <span className="sr-only"> recoverable draft{recoveryCount === 1 ? '' : 's'}</span>
            </span>
          )}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-stone-200 rounded-xs p-3">
        <form onSubmit={(e) => { e.preventDefault(); navigate({ q: search }); }} className="flex-1 min-w-[220px]">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, excerpt or author…  (Enter)"
            className="w-full text-xs font-sans p-2 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none" />
        </form>
        <select value={filters.category} onChange={(e) => navigate({ category: e.target.value })} className="text-xs p-2 bg-stone-50 border border-stone-200 rounded-xs">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <select value={filters.sort} onChange={(e) => navigate({ sort: e.target.value })} className="text-xs p-2 bg-stone-50 border border-stone-200 rounded-xs">
          <option value="updated">Sort: Updated</option>
          <option value="created">Sort: Created</option>
          <option value="published">Sort: Published</option>
        </select>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-stone-500">{selectedIds.length} selected</span>
            {canPublish && <button onClick={bulkPublish} disabled={isPending} className="px-2.5 py-1 text-xs text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xs border border-emerald-300 disabled:opacity-50">Publish</button>}
            {canDelete && <button onClick={bulkDelete} disabled={isPending} className="px-2.5 py-1 text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xs border border-rose-300 disabled:opacity-50">Delete</button>}
          </div>
        )}
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs flex items-center justify-between">
          <span>{notice}</span><button onClick={() => setNotice(null)} className="font-bold">&times;</button>
        </div>
      )}

      {/*
        ---- RECOVERY DRAFTS ----

        A composer session that was never saved as an article. It is shown as
        its own table rather than squeezed into the article one, because almost
        none of those columns apply: there is no status, no category to speak
        of, no author byline and nothing published. What matters here is what
        was being written, how much of it there is, and when it was last seen.

        The actions are deliberately two: RESUME, which puts the work back in
        the composer, and DISCARD, which throws it away — with a confirmation,
        because this is the only copy of that work in existence.
      */}
      {filters.status === RECOVERY_TAB ? (
        <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
          <p className="px-4 py-3 border-b border-stone-200 bg-stone-50 text-[11px] text-stone-600 font-sans">
            Work from the article composer that was never saved as an article — kept privately for you,
            for {SNAPSHOT_RETENTION_NOTE}. Resuming puts it back in the editor; it becomes an article
            only when you save it.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Draft</th>
                  <th className="py-3 px-4">Body</th>
                  <th className="py-3 px-4">Kind</th>
                  <th className="py-3 px-4">Last kept</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {recoveryDrafts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-stone-400 font-mono text-xs">
                      Nothing to recover — every composer session you opened was saved.
                    </td>
                  </tr>
                ) : recoveryDrafts.map((d) => (
                  <tr key={d.id} className="hover:bg-stone-50/80" data-testid="recovery-row">
                    <td className="py-3 px-4 max-w-md">
                      <span className="font-serif font-bold text-stone-900 line-clamp-1 text-sm">{d.title}</span>
                      {d.slug && <span className="font-mono text-[10px] text-ink-muted block mt-0.5 truncate">/{d.slug}/</span>}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-stone-600 font-mono text-[11px]">
                      {d.wordCount.toLocaleString()} word{d.wordCount === 1 ? '' : 's'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold bg-stone-100 text-stone-700">
                        {d.articleId ? 'EDIT OF A SAVED ARTICLE' : 'NEVER SAVED'}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-stone-500 font-mono text-[11px]">
                      {new Date(d.updatedAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-3">
                      <Link
                        href={
                          d.articleId
                            ? `${ROUTES.ADMIN_ARTICLE_EDIT(d.articleId)}?recover=${d.id}`
                            : `${ROUTES.ADMIN_ARTICLE_NEW}?recover=${d.id}`
                        }
                        className="text-[#8B5E3C] hover:text-stone-900 font-bold"
                      >
                        Resume
                      </Link>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          // The only copy of this work: an accidental click
                          // here cannot be undone from anywhere.
                          if (!window.confirm(`Discard the recovery draft "${d.title}"? This cannot be undone.`)) return;
                          startTransition(async () => {
                            const res = await discardDraftSnapshotAction({ id: d.id });
                            setNotice(res.ok ? 'Recovery draft discarded.' : res.error);
                            router.refresh();
                          });
                        }}
                        className="text-stone-500 hover:text-rose-600 font-medium disabled:opacity-40"
                      >
                        Discard
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4 w-10">
                  <input type="checkbox"
                    onChange={(e) => setSelectedIds(e.target.checked ? result.rows.map((r) => r.id) : [])}
                    checked={selectedIds.length > 0 && selectedIds.length === result.rows.length}
                    className="rounded border-stone-300 text-[#D4A757] focus:ring-[#D4A757]" />
                </th>
                <th className="py-3 px-4">Article Title &amp; Slug</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Author</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Published</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {result.rows.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-stone-400 font-mono text-xs">No articles match the current filters.</td></tr>
              ) : result.rows.map((art: AdminArticleRow) => {
                const selected = selectedIds.includes(art.id);
                return (
                  <tr key={art.id} className={`hover:bg-stone-50/80 ${selected ? 'bg-amber-50/30' : ''}`}>
                    <td className="py-3 px-4">
                      <input type="checkbox" checked={selected}
                        onChange={() => setSelectedIds((p) => p.includes(art.id) ? p.filter((i) => i !== art.id) : [...p, art.id])}
                        className="rounded border-stone-300 text-[#D4A757] focus:ring-[#D4A757]" />
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <Link href={ROUTES.ADMIN_ARTICLE_EDIT(art.id)} className="font-serif font-bold text-stone-900 hover:text-[#8B5E3C] line-clamp-1 text-sm">{art.title}</Link>
                      <span className="font-mono text-[10px] text-ink-muted block mt-0.5 truncate">
                        {articleUrl(art)}
                        {art.slug.startsWith('fixture-') && (
                          <span className="ml-2 px-1 rounded-xs bg-amber-100 text-amber-900 font-semibold" title="Synthetic test fixture — not editorial content; hidden from public pages in production">FIXTURE</span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap"><span className="font-semibold text-stone-700">{art.category}</span>{art.subcategory && <span className="text-stone-400 block text-[10px]">{art.subcategory}</span>}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-stone-600">{art.authorName}</td>
                    <td className="py-3 px-4 whitespace-nowrap"><span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold ${STATUS_STYLES[art.workflowStatus] ?? 'bg-stone-100'}`}>{art.workflowStatus === 'scheduled' ? 'SCHEDULED — MANUAL PUBLISH REQUIRED' : art.workflowStatus.toUpperCase()}</span></td>
                    <td className="py-3 px-4 whitespace-nowrap text-stone-500 font-mono text-[11px]">{art.publishedAt ?? '—'}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                      {art.workflowStatus === 'published' && <Link href={articleUrl(art)} target="_blank" className="text-stone-500 hover:text-stone-900 font-medium">Live</Link>}
                      <Link href={ROUTES.ADMIN_ARTICLE_EDIT(art.id)} className="text-[#8B5E3C] hover:text-stone-900 font-bold">Edit</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Pagination — article pages only; the recovery list is short by design. */}
      <div hidden={filters.status === RECOVERY_TAB} className="flex items-center justify-between text-xs font-sans text-stone-600">
        <span>{result.total} article(s) · page {result.page} of {result.totalPages}</span>
        <div className="flex items-center gap-1.5">
          <button disabled={result.page <= 1} onClick={() => navigate({ page: String(result.page - 1) })} className="px-3 py-1.5 border border-stone-300 rounded-xs disabled:opacity-40 hover:bg-stone-50">Previous</button>
          <button disabled={result.page >= result.totalPages} onClick={() => navigate({ page: String(result.page + 1) })} className="px-3 py-1.5 border border-stone-300 rounded-xs disabled:opacity-40 hover:bg-stone-50">Next</button>
        </div>
      </div>
    </div>
  );
};

export default AdminArticlesPage;
