'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { setReaderStatusAction, revokeReaderSessionsAction, deleteReaderAction } from '../../app/admin/reader-actions';

interface Reader {
  id: string; name: string; email: string; status: string;
  emailVerified: boolean; createdAt: string; lastLoginAt: string | null;
  commentCount: number; activeSessions: number;
}
interface Counts { total: number; active: number; suspended: number }
interface Filters { status: string; q: string }

const statusBadge = (s: string) =>
  `text-[10px] font-mono px-1.5 py-0.5 rounded-xs ${s === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-700'}`;
const fmt = (iso: string | null) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) : '—');

export const AdminReadersPage: React.FC<{ readers: Reader[]; counts: Counts; canManage: boolean; filters: Filters }> = ({ readers, counts, canManage, filters }) => {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState(filters.q);
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const run = (p: Promise<{ ok: boolean; error?: string }>, okMsg: string) => start(async () => {
    const r = await p; notify(r.ok ? okMsg : `Failed: ${r.error}`); if (r.ok) router.refresh();
  });

  const push = (next: Partial<Filters>) => {
    const f = { ...filters, ...next };
    const p = new URLSearchParams();
    if (f.status) p.set('status', f.status);
    if (f.q) p.set('q', f.q);
    router.push(`/admin/readers/?${p.toString()}`);
  };

  const Tab = ({ value, label, count }: { value: string; label: string; count: number }) => (
    <button
      onClick={() => push({ status: value })}
      className={`px-3 py-1.5 text-xs rounded-xs border ${filters.status === value ? 'bg-[#0F1115] text-[#D4A757] border-[#0F1115]' : 'border-stone-300 text-stone-600 hover:bg-stone-50'}`}
    >
      {label} <span className="font-mono text-[10px] text-ink-muted">({count})</span>
    </button>
  );

  return (
    <div className="space-y-6">
      {toast && <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono">{toast}</div>}
      <AdminPageHeader
        title="Reader Accounts"
        description="Registered reader accounts (self-service sign-ups). Suspend to block sign-in and revoke active sessions, force-logout, or delete an account. Staff accounts are managed in Team. Every action is audited."
        breadcrumbs={[{ label: 'Admin', path: '/admin/' }, { label: 'Reader Accounts' }]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Tab value="" label="All" count={counts.total} />
        <Tab value="ACTIVE" label="Active" count={counts.active} />
        <Tab value="SUSPENDED" label="Suspended" count={counts.suspended} />
        <form onSubmit={(e) => { e.preventDefault(); push({ q: query.trim() }); }} className="ml-auto flex items-center gap-2" role="search">
          <label htmlFor="reader-search" className="sr-only">Search readers by name or email</label>
          <input
            id="reader-search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="px-3 py-1.5 text-xs border border-stone-300 rounded-xs bg-white text-stone-900 w-56 focus:outline-none focus:border-[#D4A757]"
          />
          <button type="submit" className="px-3 py-1.5 text-xs rounded-xs border border-stone-300 text-stone-600 hover:bg-stone-50">Search</button>
          {filters.q && <button type="button" onClick={() => { setQuery(''); push({ q: '' }); }} className="text-[11px] text-ink-muted underline">clear</button>}
        </form>
      </div>

      <div className="bg-white border border-stone-200 rounded-xs overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-ink-muted border-b border-stone-200">
              <th className="px-4 py-3">Reader</th>
              <th className="px-4 py-3">Verified</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3 text-center">Comments</th>
              <th className="px-4 py-3 text-center">Sessions</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {readers.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-ink-muted">No reader accounts match this filter.</td></tr>
            ) : readers.map((r) => (
              <tr key={r.id} className="hover:bg-stone-50/50 align-top">
                <td className="px-4 py-3">
                  <div className="font-semibold text-stone-900">{r.name}</div>
                  <div className="text-[11px] text-ink-muted font-mono">{r.email}</div>
                </td>
                <td className="px-4 py-3">
                  {r.emailVerified
                    ? <span className="text-[10px] font-mono text-green-700">verified</span>
                    : <span className="text-[10px] font-mono text-ink-muted">unverified</span>}
                </td>
                <td className="px-4 py-3 text-ink-muted font-mono text-[11px]">{fmt(r.createdAt)}</td>
                <td className="px-4 py-3 text-ink-muted font-mono text-[11px]">{fmt(r.lastLoginAt)}</td>
                <td className="px-4 py-3 text-center font-mono">{r.commentCount}</td>
                <td className="px-4 py-3 text-center font-mono">{r.activeSessions}</td>
                <td className="px-4 py-3"><span className={statusBadge(r.status)}>{r.status}</span></td>
                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap text-[11px] font-mono">
                  {canManage ? (
                    <>
                      {r.status === 'ACTIVE'
                        ? <button disabled={pending} onClick={() => run(setReaderStatusAction(r.id, 'SUSPENDED'), 'Reader suspended (sessions revoked).')} className="text-rose-600 underline disabled:opacity-40">suspend</button>
                        : <button disabled={pending} onClick={() => run(setReaderStatusAction(r.id, 'ACTIVE'), 'Reader reactivated.')} className="text-green-700 underline disabled:opacity-40">activate</button>}
                      {r.activeSessions > 0 && <button disabled={pending} onClick={() => run(revokeReaderSessionsAction(r.id), 'Sessions revoked.')} className="text-ink-muted underline disabled:opacity-40">force-logout</button>}
                      <button disabled={pending} onClick={() => { if (confirm(`Permanently delete ${r.email}? This also deletes their comments. This cannot be undone.`)) run(deleteReaderAction(r.id), 'Reader deleted.'); }} className="text-rose-700 underline disabled:opacity-40">delete</button>
                    </>
                  ) : <span className="text-ink-muted">view only</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminReadersPage;
