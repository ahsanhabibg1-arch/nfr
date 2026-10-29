import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, isAcceptablePassword } from '../lib/auth/password';
import { checkRateLimit, resetRateLimit } from '../lib/auth/rateLimit';

describe('password hashing (bcrypt)', () => {
  it('hashes and verifies; never stores plaintext', async () => {
    const pw = 'correct horse battery staple';
    const hash = await hashPassword(pw);
    expect(hash).not.toContain(pw);
    expect(hash.startsWith('$2')).toBe(true); // bcrypt format
    expect(await verifyPassword(pw, hash)).toBe(true);
    expect(await verifyPassword('wrong password here', hash)).toBe(false);
  });

  it('enforces a minimum length policy', () => {
    expect(isAcceptablePassword('short')).toBe(false);
    expect(isAcceptablePassword('a'.repeat(12))).toBe(true);
  });
});

describe('login rate limiting', () => {
  it('blocks after the limit within the window, and resets on success', () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 5; i++) expect(checkRateLimit(key, 5).allowed).toBe(true);
    const blocked = checkRateLimit(key, 5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    resetRateLimit(key);
    expect(checkRateLimit(key, 5).allowed).toBe(true);
  });
});
