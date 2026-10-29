import 'server-only';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { prisma } from '../db';

/**
 * Server-side sessions (Batch 03 §3). An opaque 256-bit random token is set in
 * an HttpOnly cookie; only its SHA-256 hash is stored (Session.tokenHash), so a
 * database leak does not reveal usable tokens. Sessions are validated and
 * revoked server-side; there are no JWTs and nothing is stored in localStorage.
 */
export const SESSION_COOKIE = 'nfrguide_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  userId: string,
  meta?: { ip?: string | null; ua?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.session.create({
    data: { userId, tokenHash, expiresAt, ipAddress: meta?.ip ?? null, userAgent: meta?.ua ?? null },
  });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export type ValidatedSession = NonNullable<Awaited<ReturnType<typeof validateSessionToken>>>;

export async function validateSessionToken(token: string) {
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.status === 'SUSPENDED') return null;
  return session;
}

export async function invalidateSessionToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
