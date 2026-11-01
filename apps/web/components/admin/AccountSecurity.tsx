'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { changePasswordAction, revokeOwnOtherSessionsAction } from '../../app/admin/account-actions';

interface OwnSession { id: string; createdAt: string; ip: string | null; ua: string | null; current: boolean }

export function AccountSecurity({ sessions }: { sessions: OwnSession[] }) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  return (
    <div className="space-y-6 max-w-2xl">
      {toast && <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115] text-[#D4A757] border border-[#D4A757]/40 px-4 py-2.5 rounded-xs shadow-xl text-xs font-mono">{toast}</div>}

      <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
        <h4 className="font-sans font-bold text-sm text-stone-900">Change password</h4>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            if (next.length < 12) return setErr('New password must be at least 12 characters.');
            if (next !== confirm) return setErr('Passwords do not match.');
            start(async () => {
              const r = await changePasswordAction({ currentPassword: cur, newPassword: next });
              if (r.ok) { notify('Password changed — other sessions signed out.'); setCur(''); setNext(''); setConfirm(''); router.refresh(); }
              else setErr(r.error ?? 'Failed.');
            });
          }}
          className="space-y-3 text-xs"
        >
          <input type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} required className="w-full px-3 py-2 border border-stone-300 rounded-xs" />
          <input type="password" placeholder="New password (min 12 chars)" value={next} onChange={(e) => setNext(e.target.value)} required className="w-full px-3 py-2 border border-stone-300 rounded-xs" />
          <input type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="w-full px-3 py-2 border border-stone-300 rounded-xs" />
          {err && <p className="text-rose-700">{err}</p>}
          <button type="submit" disabled={pending} className="px-4 py-2 bg-[#0F1115] text-[#D4A757] font-semibold rounded-xs disabled:opacity-50">Change password</button>
        </form>
      </div>

      <div className="bg-white border border-stone-200 rounded-xs p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-sans font-bold text-sm text-stone-900">Active sessions ({sessions.length})</h4>
          {sessions.length > 1 && (
            <button disabled={pending} onClick={() => start(async () => { const r = await revokeOwnOtherSessionsAction(); notify(r.ok ? `Revoked ${('revoked' in r ? r.revoked : 0)} other session(s).` : `Failed: ${r.error}`); if (r.ok) router.refresh(); })} className="text-[11px] font-mono underline text-rose-600 disabled:opacity-40">Revoke other sessions</button>
          )}
        </div>
        <ul className="divide-y divide-stone-200 text-xs">
          {sessions.map((s) => (
            <li key={s.id} className="py-2 flex items-center justify-between font-mono text-[11px]">
              <span className="text-stone-600">{s.createdAt.slice(0, 16).replace('T', ' ')} · {s.ip ?? 'ip n/a'}</span>
              {s.current ? <span className="text-emerald-700 font-semibold">this session</span> : <span className="text-stone-400">other</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default AccountSecurity;
