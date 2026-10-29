'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import {
  createSession,
  setSessionCookie,
  getSessionToken,
  invalidateSessionToken,
  clearSessionCookie,
} from '@/lib/auth/session';
import { checkRateLimit, resetRateLimit } from '@/lib/auth/rateLimit';

const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export type LoginState = { error?: string };

/**
 * Credentials login (Batch 03 §3). Server Action (same-origin enforced by Next);
 * generic failure message; rate-limited per IP+email; password never logged;
 * session cookie is HttpOnly/SameSite=Lax/Secure-in-prod. On success, redirects.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: String(formData.get('email') ?? '').toLowerCase().trim(),
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) return { error: 'Invalid email or password.' };
  const { email, password } = parsed.data;

  const h = await headers();
  const ip = (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'local').trim();
  const rl = checkRateLimit(`login:${ip}:${email}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    return { error: `Too many attempts. Try again in about ${Math.ceil(rl.retryAfterSeconds / 60)} minute(s).` };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok =
    !!user &&
    !!user.passwordHash &&
    user.status !== 'SUSPENDED' &&
    (await verifyPassword(password, user.passwordHash));

  if (!ok || !user) {
    // Generic message — do not reveal whether the email exists.
    return { error: 'Invalid email or password.' };
  }

  resetRateLimit(`login:${ip}:${email}`);
  const { token, expiresAt } = await createSession(user.id, { ip, ua: h.get('user-agent') });
  await setSessionCookie(token, expiresAt);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.auditLog.create({
    data: { actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, detail: `ip=${ip}` },
  });

  redirect('/admin/');
}

/** Logout: revoke the server-side session and clear the cookie (§3). */
export async function logoutAction(): Promise<void> {
  const token = await getSessionToken();
  if (token) await invalidateSessionToken(token);
  await clearSessionCookie();
  redirect('/admin/login/');
}
