'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { verifyPassword, hashPassword, isAcceptablePassword } from '@/lib/auth/password';
import {
  createSession, setSessionCookie, getSessionToken, invalidateSessionToken,
  clearSessionCookie, invalidateAllUserSessions,
} from '@/lib/auth/session';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { checkDurableRateLimit } from '@/lib/auth/durableRateLimit';
import { log, correlationIdFrom } from '@/lib/logger';
import {
  registerReader, validateRegistration, ReaderError,
  createPasswordResetToken, consumePasswordResetToken,
} from '@/lib/auth/reader';
import { createComment } from '@/lib/cms/commentService';

export type FormState = { error?: string; notice?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const clientIp = (h: Headers) => (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'local').trim();
const TOO_MANY = (s: number) => `Too many attempts. Try again in about ${Math.max(1, Math.ceil(s / 60))} minute(s).`;

/** Public reader registration → auto-login → /account/. Reader role only (no admin). */
export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const input = {
    name: str(fd, 'name').trim(),
    email: str(fd, 'email').toLowerCase().trim(),
    password: str(fd, 'password'),
    confirm: str(fd, 'confirm'),
    acceptedTerms: fd.get('terms') === 'on' || fd.get('terms') === 'true',
  };
  const invalid = validateRegistration(input);
  if (invalid) return { error: invalid };

  const h = await headers();
  const rl = await checkDurableRateLimit(`register:${clientIp(h)}`, 5, 60 * 60 * 1000);
  if (rl.storageError) return { error: 'Service temporarily unavailable. Please try again shortly.' };
  if (!rl.allowed) return { error: TOO_MANY(rl.retryAfterSeconds) };

  let userId: string;
  try {
    ({ id: userId } = await registerReader(input));
  } catch (e) {
    if (e instanceof ReaderError && e.code === 'conflict') return { error: 'An account with this email already exists. Try signing in instead.' };
    log.error('reader.register.error', { cid: correlationIdFrom(h) });
    return { error: 'Could not create your account. Please try again.' };
  }
  const { token, expiresAt } = await createSession(userId, { ip: clientIp(h), ua: h.get('user-agent') });
  await setSessionCookie(token, expiresAt);
  redirect('/'); // land on the home page after sign-up (the account menu now reflects the signed-in state)
}

/** Public login — works for readers AND staff (shared session). Atomic, fail-closed,
 *  enumeration-safe limiter (mirrors the admin login). Staff can then reach /admin/. */
export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })
    .safeParse({ email: str(fd, 'email').toLowerCase().trim(), password: str(fd, 'password') });
  if (!parsed.success) return { error: 'Invalid email or password.' };
  const { email, password } = parsed.data;

  const h = await headers();
  const ip = clientIp(h); const cid = correlationIdFrom(h);
  const [rlIp, rlAcct] = await Promise.all([
    checkDurableRateLimit(`login:${ip}:${email}`, 5, 15 * 60 * 1000),
    checkDurableRateLimit(`login-acct:${email}`, 50, 60 * 60 * 1000),
  ]);
  if (rlIp.storageError || rlAcct.storageError) return { error: 'Service temporarily unavailable. Please try again shortly.' };
  if (!rlIp.allowed || !rlAcct.allowed) { log.warn('auth.login.rate_limited', { cid, scope: rlAcct.allowed ? 'ip' : 'account' }); return { error: TOO_MANY(Math.max(rlIp.retryAfterSeconds, rlAcct.retryAfterSeconds)) }; }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = !!user && !!user.passwordHash && user.status !== 'SUSPENDED' && (await verifyPassword(password, user.passwordHash));
  if (!ok || !user) { log.warn('auth.login.failed', { cid }); return { error: 'Invalid email or password.' }; }

  const { token, expiresAt } = await createSession(user.id, { ip, ua: h.get('user-agent') });
  await setSessionCookie(token, expiresAt);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.auditLog.create({ data: { actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, detail: `ip=${ip}` } });
  redirect('/'); // land on the home page after sign-in (reader or staff); staff reach the CMS via the account menu
}

export async function logoutAction(): Promise<void> {
  const token = await getSessionToken();
  if (token) await invalidateSessionToken(token);
  await clearSessionCookie();
  redirect('/');
}

/** Update the reader's display name (own account only). */
export async function updateProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'You must be signed in.' };
  const name = str(fd, 'name').trim();
  if (!name || name.length > 80) return { error: 'Please enter a display name (up to 80 characters).' };
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  return { notice: 'Profile updated.' };
}

/** Change password after re-authentication; revokes other sessions. */
export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'You must be signed in.' };
  const current = str(fd, 'current'); const next = str(fd, 'next'); const confirm = str(fd, 'confirm');
  if (next !== confirm) return { error: 'New passwords do not match.' };
  if (!isAcceptablePassword(next)) return { error: 'Password must be at least 12 characters.' };
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row?.passwordHash || !(await verifyPassword(current, row.passwordHash))) return { error: 'Your current password is incorrect.' };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await invalidateAllUserSessions(user.id);
  // Re-establish the current session so the user stays signed in on this device.
  const h = await headers();
  const { token, expiresAt } = await createSession(user.id, { ip: clientIp(h), ua: h.get('user-agent') });
  await setSessionCookie(token, expiresAt);
  return { notice: 'Password changed. Other sessions were signed out.' };
}

/** Forgot password — ALWAYS a generic response (no account enumeration). Email delivery
 *  is gated (no provider): a token is minted but nothing is emailed or logged. */
export async function requestPasswordResetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, 'email').toLowerCase().trim();
  const h = await headers();
  const rl = await checkDurableRateLimit(`pwreset:${clientIp(h)}:${email}`, 5, 60 * 60 * 1000);
  if (!rl.allowed || rl.storageError) {
    // Still generic — never reveal whether the account exists or that we're limiting it.
    return { notice: 'If an account exists for that email, a reset link will be sent once email delivery is configured.' };
  }
  try { await createPasswordResetToken(email); } catch { /* swallow — generic response */ }
  return { notice: 'If an account exists for that email, a reset link will be sent once email delivery is configured.' };
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = str(fd, 'token'); const next = str(fd, 'next'); const confirm = str(fd, 'confirm');
  if (!token) return { error: 'Missing or invalid reset token.' };
  if (next !== confirm) return { error: 'Passwords do not match.' };
  try {
    const ok = await consumePasswordResetToken(token, next);
    if (!ok) return { error: 'This reset link is invalid or has expired.' };
  } catch (e) {
    return { error: e instanceof ReaderError ? e.message : 'Could not reset your password.' };
  }
  redirect('/login/?reset=1');
}

/** Submit a comment on a published article (authenticated active readers/staff). */
export async function submitCommentAction(articleId: string, body: string): Promise<{ ok: boolean; error?: string; pending?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Please sign in to comment.' };
  try {
    await createComment(user.id, articleId, body);
    return { ok: true, pending: true };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return { ok: false, error: (e as Error).message || 'Could not post your comment.', ...(code ? {} : {}) };
  }
}
