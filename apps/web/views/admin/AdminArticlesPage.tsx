'use client';

import React, { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminTabs } from '../../components/admin/AdminTabs';
import { ROUTES } from '../../config/routes';
import type { ArticleWorkflowStatus } from '../../types';
import type { AdminArticleRow } from '../../lib/cms/adminQueries';
import { transitionArticleAction, deleteArticleAction } from '../../app/admin/article-actions';

interface Props {
  rows: AdminArticleRow[];
  canPublish: boolean;
  canDelete: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-800',
  in_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  scheduled: 'bg-purple-100 text-purple-800',
  draft: 'bg-stone-100 text-stone-700',
  archived: 'bg-stone-200 text-stone-600',
};

export const AdminArticlesPage: React.FC<Props> = ({ rows, canPublish, canDelete }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | ArticleWorkflowStatus>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = useMemo(() => ({
    all: rows.length,
    published: rows.filter((r) => r.workflowStatus === 'published').length,
    in_review: rows.filter((r) => r.workflowStatus === 'in_review').length,
    approved: rows.filter((r) => r.workflowStatus === 'approved').length,
    scheduled: rows.filter((r) => r.workflowStatus === 'scheduled').length,
    draft: rows.filter((r) => r.workflowStatus === 'draft').length,
  }), [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (activeTab !== 'all' && r.workflowStatus !== activeTab) return false;
    const q = searchQuery.toLowerCase();
    return !q || r.title.toLowerCase().includes(q) || r.authorName.toLowerCase().includes(q);
  }), [rows, activeTab, searchQuery]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 5000); };

  const runBulk = (fn: () => Promise<string>) => {
    startTransition(async () => {
      const msg = await fn();
      setSelectedIds([]);
      flash(msg);
      router.refresh();
    });
  };

  const bulkPublish = () => runBulk(async () => {
    let ok = 0, failed = 0;
    for (const id of selectedIds) {
      const res = await transitionArticleAction(id, 'PUBLISHED');
      if (res.ok) ok++; else failed++;
    }
    return `Published ${ok} article(s).${failed ? ` ${failed} could not be published (must be Approved/Scheduled and pass publication checks).` : ''}`;
  });

  const bulkDelete = () => runBulk(async () => {
    let ok = 0, failed = 0;
    for (const id of selectedIds) {
      const res = await deleteArticleAction(id);
      if (res.ok) ok++; else failed++;
    }
    return `Deleted ${ok} article(s).${failed ? ` ${failed} failed.` : ''}`;
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Article Directory &amp; Publishing Queue"
        description="Database-backed article library. Actions are authenticated and permission-checked server-side."
        actions={
          <Link
            href={ROUTES.ADMIN_ARTICLE_NEW}
            className="px-4 py-2 bg-[#0F1115] text-[#D4A757] hover:bg-stone-800 text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors shadow-xs inline-flex items-center gap-1.5"
          >
            + Create New Article
          </Link>
        }
      />

      <AdminTabs
        tabs={[
          { id: 'all', label: 'All Articles', count: counts.all },
          { id: 'published', label: 'Published', count: counts.published },
          { id: 'in_review', label: 'In Review', count: counts.in_review },
          { id: 'approved', label: 'Approved', count: counts.approved },
          { id: 'scheduled', label: 'Scheduled', count: counts.scheduled },
          { id: 'draft', label: 'Drafts', count: counts.draft },
        ]}
        activeTab={activeTab}
        onChange={(t) => setActiveTab(t as typeof activeTab)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-stone-200 rounded-xs p-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title or author…"
          className="flex-1 min-w-[220px] text-xs font-sans p-2 bg-stone-50 border border-stone-200 rounded-xs focus:bg-white focus:outline-none"
        />
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-stone-500 font-sans">{selectedIds.length} selected</span>
            {canPublish && (
              <button onClick={bulkPublish} disabled={isPending} className="px-2.5 py-1 text-xs text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xs border border-emerald-300 disabled:opacity-50">
                Publish Selected
              </button>
            )}
            {canDelete && (
              <button onClick={bulkDelete} disabled={isPending} className="px-2.5 py-1 text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xs border border-rose-300 disabled:opacity-50">
                Delete Selected
              </button>
            )}
          </div>
        )}
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-sans rounded-xs flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="font-bold">&times;</button>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-sm shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    onChange={(e) => setSelectedIds(e.target.checked ? filtered.map((r) => r.id) : [])}
                    checked={selectedIds.length > 0 && selectedIds.length === filtered.length}
                    className="rounded border-stone-300 text-[#D4A757] focus:ring-[#D4A757]"
                  />
                </th>
                <th className="py-3 px-4">Article Title &amp; Slug</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Author</th>
                <th className="py-3 px-4">Workflow Status</th>
                <th className="py-3 px-4">Published</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-stone-400 font-mono text-xs">No articles match the selected tab and filter.</td></tr>
              ) : filtered.map((art) => {
                const selected = selectedIds.includes(art.id);
                return (
                  <tr key={art.id} className={`hover:bg-stone-50/80 transition-colors ${selected ? 'bg-amber-50/30' : ''}`}>
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => setSelectedIds((p) => p.includes(art.id) ? p.filter((i) => i !== art.id) : [...p, art.id])}
                        className="rounded border-stone-300 text-[#D4A757] focus:ring-[#D4A757]"
                      />
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <Link href={ROUTES.ADMIN_ARTICLE_EDIT(art.id)} className="font-serif font-bold text-stone-900 hover:text-[#8B5E3C] line-clamp-1 text-sm">
                        {art.title}
                      </Link>
                      <span className="font-mono text-[10px] text-stone-400 block mt-0.5 truncate">/articles/{art.slug}/</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-stone-700">{art.category}</span>
                      {art.subcategory && <span className="text-stone-400 block text-[10px]">{art.subcategory}</span>}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-stone-600">{art.authorName}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-semibold ${STATUS_STYLES[art.workflowStatus] ?? 'bg-stone-100 text-stone-700'}`}>
                        {art.workflowStatus.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-stone-500 font-mono text-[11px]">{art.publishedAt ?? '—'}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                      {art.workflowStatus === 'published' && (
                        <Link href={ROUTES.ARTICLE(art.slug)} target="_blank" className="text-stone-500 hover:text-stone-900 font-medium">Live View</Link>
                      )}
                      <Link href={ROUTES.ADMIN_ARTICLE_EDIT(art.id)} className="text-[#8B5E3C] hover:text-stone-900 font-bold">Edit</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminArticlesPage;
