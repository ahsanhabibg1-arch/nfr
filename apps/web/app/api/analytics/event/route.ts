import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { rateLimit } from '@/lib/analytics/rateLimit';
import { recordContentView, recordSearchQuery, recordSearchClick } from '@/lib/analytics/events';

/**
 * Public first-party analytics ingest (Batch 07 §7/§17). Privacy-conscious:
 *  - No identifier is persisted. The request IP+UA is hashed ONLY to derive a
 *    transient in-memory key for rate limiting + duplicate suppression; the hash is
 *    never written to the database.
 *  - Same-origin guarded + per-key token-bucket rate limited.
 *  - Collection is owner-gated: when disabled, recorders silently no-op and the
 *    endpoint still returns a success-shaped response (it never leaks collection
 *    state or whether a specific event was stored).
 *
 * NOTE: callers MUST post to the trailing-slash path `/api/analytics/event/`.
 * With `trailingSlash: true`, a POST to the non-slash path 308-redirects and the
 * request body cannot be replayed.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = fwd || req.headers.get('x-real-ip') || 'local';
  const ua = req.headers.get('user-agent') || '';
  return createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 24);
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // keepalive fetch may omit Origin; endpoint has no sensitive effect
  const host = req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const key = clientKey(req);
  if (!rateLimit(`evt:${key}`, { capacity: 30, refillPerSec: 1 })) {
    return NextResponse.json({ ok: false, reason: 'rate_limited' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }

  const ctx = { clientKey: key };
  const type = body.type;
  let recorded = false;
  if (type === 'content_view') ({ recorded } = await recordContentView(ctx, body));
  else if (type === 'search') ({ recorded } = await recordSearchQuery(ctx, body));
  else if (type === 'search_click') ({ recorded } = await recordSearchClick(ctx, body));
  else return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400 });

  return NextResponse.json({ ok: true, recorded }, { status: 200 });
}
