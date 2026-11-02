import { NextResponse } from 'next/server';

/**
 * Liveness probe (Batch 13 §7). Minimal "process is alive" response. No database work,
 * no secrets, no version/infrastructure disclosure. Always 200 while the server runs.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json(
    { status: 'ok', time: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
