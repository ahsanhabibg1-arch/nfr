'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ROUTES, articleUrl } from '../../config/routes';
import type { AdminArticleRow, ArticleListResult } from '../../lib/cms/adminQueries';
import { transitionArticleAction, deleteArticleAction } from '../../app/admin/article-actions';

interface Props {
  result: ArticleListResult;
  filters: { q: string; status: string; category: string; sort: string };
  categories: { slug: string; name: string }[];
  canPublish: boolean;
  canDelete: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-800', in_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800', scheduled: 'bg-purple-100 text-purple-800',
  draft: 'bg-stone-100 text-stone-700', archived: 'bg-stone-200 text-stone-600',
};
const STATUS_TABS = ['', 'published', 'in_review', 'approved', 'scheduled', 'draft', 'archived'];

export const AdminArticlesPage: React.FC<Props> = ({ result, filters, categories, canPublish, canDelete }) => {
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

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs font-sans text-stone-600">
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
