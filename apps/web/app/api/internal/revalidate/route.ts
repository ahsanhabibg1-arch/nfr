import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createHash, timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Paths this internal endpoint is permitted to revalidate. The only caller is
 * the scheduled-publish runner, which revalidates the root layout. Anything
 * else is rejected rather than passed to revalidatePath.
 */
const ALLOWED_PATHS = new Set(['/']);

/** Constant-time comparison over fixed-length digests, so neither the value nor its length leaks. */
function secretMatches(supplied: string, expected: string): boolean {
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read per-request: no module-level capture, and no fallback value. An unset
  // or empty secret disables the endpoint entirely instead of weakening it.
  const expected = process.env.INTERNAL_REVALIDATE_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const supplied = body.secret;
  if (typeof supplied !== 'string' || !secretMatches(supplied, expected)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const path = typeof body.path === 'string' ? body.path : '/';
  if (!ALLOWED_PATHS.has(path)) {
    return NextResponse.json({ error: 'invalid_target' }, { status: 400 });
  }

  revalidatePath(path, 'layout');

  return NextResponse.json({ ok: true, revalidated: path }, { headers: { 'Cache-Control': 'no-store' } });
}
