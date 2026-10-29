'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from '../auth-actions';

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form
      action={formAction}
      className="bg-[#1E293B] border border-white/10 rounded-sm p-6 space-y-4 shadow-2xl"
    >
      {state.error && (
        <div
          role="alert"
          className="text-xs font-sans text-rose-200 bg-rose-950/50 border border-rose-800/50 rounded-xs px-3 py-2"
        >
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-[11px] font-mono uppercase tracking-wider text-stone-400 mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="w-full px-3 py-2 text-sm bg-[#0F1115] border border-white/10 rounded-xs text-white focus:outline-none focus:border-[#D4A757]"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-[11px] font-mono uppercase tracking-wider text-stone-400 mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full px-3 py-2 text-sm bg-[#0F1115] border border-white/10 rounded-xs text-white focus:outline-none focus:border-[#D4A757]"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 bg-[#D4A757] text-[#0F1115] text-xs font-bold uppercase tracking-wider rounded-xs hover:bg-[#C59642] transition-colors disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign In'}
      </button>

      <p className="text-[11px] text-stone-500 font-sans text-center pt-1">
        Authorized editorial staff only. Accounts are provisioned by an administrator.
      </p>
    </form>
  );
}
