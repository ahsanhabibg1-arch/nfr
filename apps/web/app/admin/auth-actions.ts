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
import { checkDurableRateLimit, resetDurableRateLimit } from '@/lib/auth/durableRateLimit';
import { log, correlationIdFrom } from '@/lib/logger';

const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export type LoginState = { error?: string };

const TOO_MANY = (retryS: number) => `Too many attempts. Try again in about ${Math.max(1, Math.ceil(retryS / 60))} minute(s).`;

/**
 * Credentials login (Batch 03 §3; hardened Batch 21 §B). Server Action (same-origin
 * enforced by Next); generic failure message (no account enumeration); password never
 * logged; cookie HttpOnly/SameSite=Lax/Secure-in-prod. Two durable rate limits:
 *   - per IP+email (5 / 15 min): stops single-source brute force; one IP can't lock out
 *     an account it doesn't own.
 *   - per account/email across all IPs (50 / 60 min): bounds DISTRIBUTED brute force on a
 *     single account.
 * ATOMIC reserve-and-count gate (Batch 23 §4.1): each attempt is counted with a single
 * atomic check-and-increment BEFORE the bcrypt verify. This strictly enforces the ceiling
 * under concurrency — unlike a read-only peek, a burst of parallel requests cannot all pass
 * a near-limit check (TOCTOU) — and fails closed on a storage error. A SUCCESSFUL login
 * RESETS both buckets, so a legitimate user's own successful attempts never accumulate;
 * failed attempts remain counted until the window rolls over. (Earlier Batch 22 used a
 * peek→verify→record split that was failure-only but had a concurrency/failed-record gap;
 * this restores strict, fail-closed counting with the same reset-on-success behavior.)
 * Residual attacker-driven lockout + the CAPTCHA/backoff recommendation are documented in
 * docs/batches/batch-23/02_SECURITY_AND_AUTH_AUDIT.md.
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
  const cid = correlationIdFrom(h);
  const ipKey = `login:${ip}:${email}`;
  const acctKey = `login-acct:${email}`;
  // Atomic check-and-increment BEFORE the expensive verify: concurrency-safe ceiling,
  // fail-closed on storage error. A successful login resets both buckets below.
  const [rlIp, rlAcct] = await Promise.all([
    checkDurableRateLimit(ipKey, 5, 15 * 60 * 1000),
    checkDurableRateLimit(acctKey, 50, 60 * 60 * 1000),
  ]);
  if (rlIp.storageError || rlAcct.storageError) {
    log.warn('auth.login.limiter_degraded', { cid });
    return { error: 'Service temporarily unavailable. Please try again shortly.' };
  }
  if (!rlIp.allowed || !rlAcct.allowed) {
    // Structured, non-sensitive operational signal (no email/password/token logged).
    log.warn('auth.login.rate_limited', { cid, scope: rlAcct.allowed ? 'ip' : 'account' });
    return { error: TOO_MANY(Math.max(rlIp.retryAfterSeconds, rlAcct.retryAfterSeconds)) };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok =
    !!user &&
    !!user.passwordHash &&
    user.status !== 'SUSPENDED' &&
    (await verifyPassword(password, user.passwordHash));

  if (!ok || !user) {
    // The attempt was already counted atomically above; just log and return generically.
    log.warn('auth.login.failed', { cid });
    return { error: 'Invalid email or password.' };
  }

  // Success → clear both buckets so a legitimate user never accumulates a lockout.
  await Promise.all([resetDurableRateLimit(ipKey), resetDurableRateLimit(acctKey)]);
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
