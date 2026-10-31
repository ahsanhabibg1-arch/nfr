import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { resolveActiveAffiliateLink } from '@/lib/monetization/publicMonetization';
import { recordOutboundClick } from '@/lib/monetization/clicks';

/**
 * First-party affiliate redirect (Batch 08 §8). The destination is looked up ONLY
 * from the database by stable link id and re-validated — it is never taken from the
 * request — so this cannot be an open redirect. Inactive/expired/invalid/unknown
 * links fall back safely to the homepage (no broken redirect, no leak). An outbound
 * click is recorded only when owner-enabled click tracking + analytics collection are
 * both on (see recordOutboundClick); recording never blocks or fails the redirect.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = fwd || req.headers.get('x-real-ip') || 'local';
  const ua = req.headers.get('user-agent') || '';
  return createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 24);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const resolved = await resolveActiveAffiliateLink(id);
  if (!resolved) {
    return NextResponse.redirect(new URL('/', req.url), 302);
  }
  try {
    await recordOutboundClick({ clientKey: clientKey(req) }, id);
  } catch {
    /* click recording must never break the redirect */
  }
  return NextResponse.redirect(resolved.destination, 302);
}
