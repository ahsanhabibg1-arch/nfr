import 'server-only';
import bcrypt from 'bcryptjs';

/**
 * Password hashing via bcrypt (bcryptjs, pure-JS, no native build).
 * Cost factor 12. No custom cryptography — bcrypt only (Batch 03 §3).
 */
const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** Minimum password policy for bootstrap/login (length-based, no composition rules). */
export function isAcceptablePassword(pw: string): boolean {
  return typeof pw === 'string' && pw.length >= 12 && pw.length <= 200;
}
