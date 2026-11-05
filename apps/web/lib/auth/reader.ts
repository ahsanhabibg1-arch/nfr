import 'server-only';
import crypto from 'node:crypto';
import { prisma } from '../db';
import { hashPassword, isAcceptablePassword } from './password';
import { invalidateAllUserSessions } from './session';

/**
 * Reader identity service (Batch 24). Readers share the User model + session system
 * with staff but are assigned ONLY the least-privilege `reader` role (zero admin
 * permissions), so public registration can never grant CMS access.
 *
 * Email verification + password-reset EMAIL delivery are gated behind a configured
 * provider (none yet): tokens are minted + persisted (hash-only, single-use, expiring)
 * and accounts remain usable, but no email is sent and no raw token is logged. See
 * docs/batches/batch-24/02_READER_AUTH_IMPLEMENTATION.md.
 */
export const READER_ROLE_KEY = 'reader';
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL_MS = 60 * 60 * 1000; // 1h

export type ReaderErrorCode = 'validation' | 'conflict' | 'not_found' | 'forbidden';
export class ReaderError extends Error {
  constructor(public code: ReaderErrorCode, message: string) { super(message); }
}

const sha256 = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

/** Ensure the reader role exists (idempotent) and return its id. */
export async function ensureReaderRole(): Promise<string> {
  const role = await prisma.role.upsert({
    where: { key: READER_ROLE_KEY },
    update: {},
    create: { key: READER_ROLE_KEY, name: 'Reader' },
  });
  return role.id;
}

export function validateRegistration(input: { email: string; name: string; password: string; confirm: string; acceptedTerms: boolean }): string | null {
  if (!input.name.trim() || input.name.trim().length > 80) return 'Please enter a display name (up to 80 characters).';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) return 'Please enter a valid email address.';
  if (!isAcceptablePassword(input.password)) return 'Password must be at least 12 characters.';
  if (input.password !== input.confirm) return 'Passwords do not match.';
  if (!input.acceptedTerms) return 'You must accept the Terms and Privacy Policy.';
  return null;
}

/** Create a reader account (status ACTIVE, reader role). Email dedupe is enforced by the
 *  unique constraint; a race is caught as a conflict. Never stores a plaintext password. */
export async function registerReader(input: { email: string; name: string; password: string }): Promise<{ id: string }> {
  const email = input.email.toLowerCase().trim();
  const roleId = await ensureReaderRole();
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: { email, name: input.name.trim(), status: 'ACTIVE', passwordHash, roles: { create: { roleId } } },
      select: { id: true },
    });
    return user;
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw new ReaderError('conflict', 'An account with this email already exists.');
    throw e;
  }
}

// --- Email verification (gated: no email sent without a provider) ---
export async function createEmailVerificationToken(userId: string): Promise<string> {
  const token = randomToken();
  await prisma.emailVerificationToken.create({ data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) } });
  return token; // caller would email this; NEVER log it.
}

export async function consumeEmailVerificationToken(token: string): Promise<boolean> {
  const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return false;
  await prisma.$transaction([
    prisma.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
  return true;
}

// --- Password reset (gated: no email sent without a provider) ---
/** Create a reset token for an email if the account exists. Returns the raw token (for a
 *  future email) or null when no account — callers MUST respond generically either way. */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() }, select: { id: true, status: true } });
  if (!user || user.status === 'SUSPENDED') return null;
  const token = randomToken();
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
  return token; // would be emailed; NEVER logged.
}

/** Consume a reset token: set the new password + invalidate all the user's sessions. */
export async function consumePasswordResetToken(token: string, newPassword: string): Promise<boolean> {
  if (!isAcceptablePassword(newPassword)) throw new ReaderError('validation', 'Password must be at least 12 characters.');
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return false;
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
  ]);
  await invalidateAllUserSessions(row.userId); // old sessions can no longer be used
  return true;
}
