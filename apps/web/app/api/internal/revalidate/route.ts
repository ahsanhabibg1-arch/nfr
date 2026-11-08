import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INTERNAL_SECRET = process.env.INTERNAL_REVALIDATE_SECRET || '__scheduled_publish_revalidate__';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (body.secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const path = typeof body.path === 'string' ? body.path : '/';
  revalidatePath(path, 'layout');

  return NextResponse.json({ ok: true, revalidated: path }, { headers: { 'Cache-Control': 'no-store' } });
}
