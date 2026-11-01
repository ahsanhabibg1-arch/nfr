'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { acceptInvitationAction, consumePasswordResetAction } from '../../app/admin/invite-actions';

/**
 * Shared client form for the manual invitation-accept and password-reset links
 * (Batch 09 §6/§12). The token comes from the URL; the user sets a password (and, for
 * invitations, confirms their name). Generic, no account enumeration.
 */
export function TokenSetupForm({ mode, token }: { mode: 'invite' | 'reset'; token: string }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (!token) return <p className="text-sm text-rose-700">Missing or invalid link.</p>;
  if (done) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-emerald-700 font-semibold">{mode === 'invite' ? 'Account activated.' : 'Password updated.'}</p>
        <p className="text-stone-600">You can now sign in.</p>
        <Link href="/admin/login/" className="inline-block px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">Go to sign in</Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (pw.length < 12) return setErr('Password must be at least 12 characters.');
        if (pw !== confirm) return setErr('Passwords do not match.');
        start(async () => {
          const r = mode === 'invite'
            ? await acceptInvitationAction({ token, name: name || undefined, password: pw })
            : await consumePasswordResetAction({ token, newPassword: pw });
          if (r.ok) setDone(true);
          else setErr(r.error ?? 'Something went wrong.');
        });
      }}
      className="space-y-3"
    >
      {mode === 'invite' && (
        <div>
          <label className="block text-xs font-mono uppercase text-stone-500 mb-1">Your name (optional)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xs" />
        </div>
      )}
      <div>
        <label className="block text-xs font-mono uppercase text-stone-500 mb-1">New password (min 12 chars)</label>
        <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xs" />
      </div>
      <div>
        <label className="block text-xs font-mono uppercase text-stone-500 mb-1">Confirm password</label>
        <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xs" />
      </div>
      {err && <p className="text-xs text-rose-700">{err}</p>}
      <button type="submit" disabled={pending} className="w-full px-4 py-2 bg-[#0F1115] text-[#D4A757] text-sm font-semibold rounded-xs disabled:opacity-50">
        {mode === 'invite' ? 'Activate account' : 'Set new password'}
      </button>
    </form>
  );
}

export default TokenSetupForm;
