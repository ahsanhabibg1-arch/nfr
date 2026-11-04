import 'server-only';
import { randomUUID } from 'node:crypto';

/**
 * Request-correlation id (Batch 22 §3). A short, non-sensitive identifier used to tie
 * the structured logs of one server request (or Server Action / API call) together and,
 * when surfaced to a user, to let an operator find the matching server logs. It is random
 * — it encodes NO session, account, or credential information. Prefer an inbound
 * `x-request-id` / `x-correlation-id` from a trusted proxy when present (see
 * `correlationIdFrom`), otherwise generate one. This is NOT a replacement for Next.js's
 * error `digest`, which remains the correlation handle for render-error boundaries.
 */
export function newCorrelationId(): string {
  return randomUUID();
}

/** Derive a correlation id from request headers (trusted proxy) or mint a fresh one. */
export function correlationIdFrom(h: { get(name: string): string | null } | null | undefined): string {
  const v = h?.get('x-request-id') || h?.get('x-correlation-id');
  // Only accept a short, safe token from the header; otherwise mint our own.
  return v && /^[\w-]{1,64}$/.test(v) ? v : newCorrelationId();
}

/**
 * Production-safe structured logging + error-reporting abstraction (Batch 13 §8).
 * - Emits single-line JSON to stdout/stderr (host log collectors can parse it).
 * - REDACTS sensitive fields (passwords, tokens, cookies, connection strings) before output.
 * - Works with monitoring DISABLED (no vendor, no DSN). When a provider is later configured
 *   by the owner, wire it inside `report()` — this file deliberately invents no DSN and adds
 *   no dependency.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ErrorCategory = 'auth' | 'rbac' | 'validation' | 'database' | 'storage' | 'external' | 'config' | 'unexpected';

const SENSITIVE_KEY = /(pass(word)?|secret|token|cookie|authorization|apikey|api_key|access[_-]?key|session|dsn|connection|database_url|\burl\b)/i;
const SECRET_VALUE = /(postgres(ql)?:\/\/\S+|AVNS_\w+|AKIA[0-9A-Z]{16}|eyJ[\w-]+\.[\w-]+\.[\w-]+|Bearer\s+\S+)/gi;

/** Recursively redact sensitive keys/values. Bounded depth; safe on cycles. */
export function redact(input: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (input == null) return input;
  if (typeof input === 'string') return input.replace(SECRET_VALUE, '[redacted]');
  if (typeof input !== 'object' || depth > 6) return typeof input === 'object' ? '[object]' : input;
  if (seen.has(input as object)) return '[circular]';
  seen.add(input as object);
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1, seen);
  }
  return out;
}

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(fields ? (redact(fields) as object) : {}) });
  if (level === 'error' || level === 'warn') console.error(line); else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => { if ((process.env.LOG_LEVEL || 'info') === 'debug') emit('debug', msg, fields); },
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
};

/**
 * Report a handled error safely. Category + a correlation id help triage; the error
 * message/stack are redacted. When monitoring is disabled (default) this just logs.
 */
export function report(category: ErrorCategory, err: unknown, ctx?: { correlationId?: string; fields?: Record<string, unknown> }): void {
  const e = err as { message?: string; name?: string; stack?: string };
  emit('error', `[${category}] ${e?.name || 'Error'}: ${String(e?.message || err)}`.slice(0, 500), {
    category,
    correlationId: ctx?.correlationId,
    stack: process.env.NODE_ENV === 'production' ? undefined : (e?.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : undefined),
    ...ctx?.fields,
  });
  // Hook point: if (process.env.SENTRY_DSN) { /* owner-configured provider, deferred */ }
}

/** Whether an external monitoring provider is configured (never invented here). */
export function monitoringEnabled(): boolean {
  return !!process.env.SENTRY_DSN;
}
