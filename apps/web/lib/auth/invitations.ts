import 'server-only';
import crypto from 'node:crypto';

/**
 * Invitation / reset token primitives (Batch 09 §6/§12). Cryptographically secure
 * random tokens; only the SHA-256 hash is ever stored. The raw token is returned to
 * the caller exactly once (to build a manual link) and is never logged.
 */
export function generateToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
export const RESET_TTL_MS = 1000 * 60 * 60; // 1 hour
