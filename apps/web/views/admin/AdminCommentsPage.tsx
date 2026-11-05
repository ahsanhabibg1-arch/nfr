'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { moderateCommentAction, deleteCommentAction } from '../../app/admin/comment-actions';

interface Comment {
  id: string; status: string; body: string; createdAt: string;
  author: string; authorEmail: string; articleSlug: string; articleTitle: string; moderationReason: string | null;
}
interface Filters { status: string; q: string }
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'] as const;
const badge = (s: string) => `text-[10px] font-mono px-1.5 py-0.5 rounded-xs ${s === 'APPROVED' ? 'bg-green-100 text-green-800' : s === 'PENDING' ? 'bg-amber-100 text-amber-800' : s === 'REJECTED' ? 'bg-rose-100 text-rose-700' : 'bg-stone-200 text-stone-600'}`;

export const AdminCommentsPage: React.FC<{ comments: Comment[]; counts: Record<string, number>; canDelete: boolean; filters: Filters }> = ({ comments, counts, canDelete, filters }) => {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const run = (p: Promise<{ ok: boolean; error?: string }>, okMsg: string) => start(async () => {
    const r = await p; notify(r.ok ? okMsg : `Failed: ${r.error}`); if (r.ok) router.refresh();
  });
  const setStatus = (s: string) => { const p = new URLSearchParams(); if (s) p.set('status', s); if (filters.q) p.set('q', filters.q); router.push(`/admin/comments/?${p.toString()}`); };

  return (
    <div className="space-y-6">
      {toast && <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono">{toast}</div>}
      <AdminPageHeader title="Comment Moderation" description="Review reader comments on published articles. Only APPROVED comments appear publicly. Approve, reject or hide; deletion requires elevated permission. Every action is audited." breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'Comment Moderation' }]} />

      {/* Status filter tabs with counts */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setStatus('')} className={`px-3 py-1.5 text-xs rounded-xs border ${!filters.status ? 'bg-[#0F1115] text-[#D4A757] border-[#0F1115]' : 'border-stone-300 text-stone-600 hover:bg-stone-50'}`}>All</button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 text-xs rounded-xs border ${filters.status === s ? 'bg-[#0F1115] text-[#D4A757] border-[#0F1115]' : 'border-stone-300 text-stone-600 hover:bg-stone-50'}`}>
            {s} <span className="font-mono text-[10px] text-stone-400">({counts[s] ?? 0})</span>
          </button>
        ))}
      </div>

      <div className="bg-white border border-stone-200 rounded-xs divide-y divide-stone-100">
        {comments.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">No comments match this filter.</p>
        ) : comments.map((c) => (
          <div key={c.id} className="p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-stone-900 whitespace-pre-wrap break-words">{c.body}</p>
                <p className="text-[11px] text-stone-500 mt-1">
                  <span className="font-semibold text-stone-700">{c.author}</span> · {c.authorEmail} · {new Date(c.createdAt).toISOString().replace('T', ' ').slice(0, 16)} · on{' '}
                  <Link href={`/articles/${c.articleSlug}/`} className="text-[#8B5E3C] underline" target="_blank">{c.articleTitle}</Link>
                </p>
              </div>
              <span className={badge(c.status)}>{c.status}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              {c.status !== 'APPROVED' && <button onClick={() => run(moderateCommentAction(c.id, 'APPROVED'), 'Approved.')} disabled={pending} className="text-green-700 underline">approve</button>}
              {c.status !== 'REJECTED' && <button onClick={() => run(moderateCommentAction(c.id, 'REJECTED'), 'Rejected.')} disabled={pending} className="text-rose-700 underline">reject</button>}
              {c.status !== 'HIDDEN' && <button onClick={() => run(moderateCommentAction(c.id, 'HIDDEN'), 'Hidden.')} disabled={pending} className="text-stone-500 underline">hide</button>}
              {canDelete && <button onClick={() => { if (confirm('Permanently delete this comment?')) run(deleteCommentAction(c.id), 'Deleted.'); }} disabled={pending} className="text-rose-600 underline">delete</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminCommentsPage;
