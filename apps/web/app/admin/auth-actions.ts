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
import { peekDurableRateLimit, recordDurableRateLimitFailure, resetDurableRateLimit } from '@/lib/auth/durableRateLimit';
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
 * FAILURE-ONLY counting (Batch 22 §2): the limits are gated with a read-only `peek` BEFORE
 * the bcrypt verify, and a failure is `record`ed only when authentication actually fails.
 * A successful login records nothing and resets both buckets — so a legitimate user never
 * consumes their own budget (materially fewer false lockouts). The residual, bounded
 * attacker-driven lockout and the CAPTCHA/backoff recommendation are documented in
 * docs/batches/batch-22/01_AUTHENTICATION_RESILIENCE.md.
 * Both checks FAIL CLOSED: on a limiter storage error the attempt is refused with a generic
 * "temporarily unavailable" message (never a silent bypass; no enumeration).
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
  // Gate on recorded FAILURES before the expensive verify (peek does not increment).
  const [rlIp, rlAcct] = await Promise.all([
    peekDurableRateLimit(ipKey, 5),
    peekDurableRateLimit(acctKey, 50),
  ]);
  // Fail closed on limiter storage failure — generic, enumeration-safe message.
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
    // Count only FAILURES, so legitimate successful logins never fill the bucket.
    await Promise.all([
      recordDurableRateLimitFailure(ipKey, 15 * 60 * 1000),
      recordDurableRateLimitFailure(acctKey, 60 * 60 * 1000),
    ]);
    log.warn('auth.login.failed', { cid });
    // Generic message — do not reveal whether the email exists.
    return { error: 'Invalid email or password.' };
  }

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
