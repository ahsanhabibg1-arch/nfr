'use client';

import React, { useActionState } from 'react';
import Link from 'next/link';
import {
  loginAction, registerAction, requestPasswordResetAction, resetPasswordAction,
  updateProfileAction, changePasswordAction, type FormState,
} from '../../app/(public)/account/actions';

const field = 'w-full px-3 py-2 text-sm border border-stone-300 rounded-xs bg-white text-stone-900 focus:outline-none focus:border-[#D4A757]';
const label = 'block text-[11px] font-mono uppercase tracking-wider text-stone-500 mb-1';
const primaryBtn = 'w-full inline-flex items-center justify-center px-4 py-2.5 bg-[#0F1115] text-[#D4A757] text-xs font-semibold uppercase tracking-wider rounded-xs hover:bg-stone-800 transition-colors disabled:opacity-50';
const INIT: FormState = {};

function Alert({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xs px-3 py-2">{state.error}</p>;
  if (state.notice) return <p role="status" className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xs px-3 py-2">{state.notice}</p>;
  return null;
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, INIT);
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <div><label className={label} htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required className={field} /></div>
      <div><label className={label} htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className={field} /></div>
      <button type="submit" disabled={pending} className={primaryBtn}>{pending ? 'Signing in…' : 'Sign in'}</button>
      <div className="flex items-center justify-between text-xs text-stone-600">
        <Link href="/register/" className="text-[#8B5E3C] underline">Create account</Link>
        <Link href="/forgot-password/" className="underline">Forgot password?</Link>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, INIT);
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <div><label className={label} htmlFor="name">Display name</label><input id="name" name="name" type="text" autoComplete="nickname" maxLength={80} required className={field} /></div>
      <div><label className={label} htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required className={field} /></div>
      <div><label className={label} htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" required className={field} /><p className="text-[11px] text-ink-muted mt-1">At least 12 characters.</p></div>
      <div><label className={label} htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={field} /></div>
      <label className="flex items-start gap-2 text-xs text-stone-600">
        <input type="checkbox" name="terms" className="mt-0.5" required />
        <span>I accept the <Link href="/terms/" className="underline">Terms</Link> and <Link href="/privacy/" className="underline">Privacy Policy</Link>.</span>
      </label>
      <button type="submit" disabled={pending} className={primaryBtn}>{pending ? 'Creating account…' : 'Create account'}</button>
      <p className="text-xs text-stone-600">Already have an account? <Link href="/login/" className="text-[#8B5E3C] underline">Sign in</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, INIT);
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <div><label className={label} htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required className={field} /></div>
      <button type="submit" disabled={pending} className={primaryBtn}>{pending ? 'Sending…' : 'Send reset link'}</button>
      <p className="text-xs text-stone-600"><Link href="/login/" className="underline">Back to sign in</Link></p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, INIT);
  return (
    <form action={action} className="space-y-4">
      <Alert state={state} />
      <input type="hidden" name="token" value={token} />
      <div><label className={label} htmlFor="next">New password</label><input id="next" name="next" type="password" autoComplete="new-password" required className={field} /></div>
      <div><label className={label} htmlFor="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={field} /></div>
      <button type="submit" disabled={pending} className={primaryBtn}>{pending ? 'Updating…' : 'Set new password'}</button>
    </form>
  );
}

export function ProfileNameForm({ currentName }: { currentName: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, INIT);
  return (
    <form action={action} className="space-y-3">
      <Alert state={state} />
      <div><label className={label} htmlFor="name">Display name</label><input id="name" name="name" type="text" defaultValue={currentName} maxLength={80} required className={field} /></div>
      <button type="submit" disabled={pending} className={primaryBtn}>{pending ? 'Saving…' : 'Save profile'}</button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, INIT);
  return (
    <form action={action} className="space-y-3">
      <Alert state={state} />
      <div><label className={label} htmlFor="current">Current password</label><input id="current" name="current" type="password" autoComplete="current-password" required className={field} /></div>
      <div><label className={label} htmlFor="next">New password</label><input id="next" name="next" type="password" autoComplete="new-password" required className={field} /></div>
      <div><label className={label} htmlFor="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={field} /></div>
      <button type="submit" disabled={pending} className={primaryBtn}>{pending ? 'Updating…' : 'Change password'}</button>
    </form>
  );
}
