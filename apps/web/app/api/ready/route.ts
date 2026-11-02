import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { checkEnvConsistency } from '@/lib/env-guard';
import { report } from '@/lib/logger';

/**
 * Readiness probe (Batch 13 §7). Confirms the app can serve real requests: a bounded,
 * read-only database check (`SELECT 1`) plus the environment-isolation status. Never
 * mutates data, never returns secrets or connection strings; failures are sanitized to a
 * category string. Returns 200 when ready, 503 otherwise.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 2500;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

export async function GET(): Promise<NextResponse> {
  const checks: Record<string, string> = {};
  let ready = true;

  // DB connectivity — read-only, bounded.
  try { await withTimeout(prisma.$queryRaw`SELECT 1`, TIMEOUT_MS); checks.database = 'ok'; }
  catch (e) { ready = false; checks.database = 'unavailable'; report('database', e, { fields: { probe: 'ready' } }); }

  // Environment isolation (non-secret classification only).
  const consistency = checkEnvConsistency();
  checks.environment = consistency.ok ? 'ok' : 'misconfigured';
  if (!consistency.ok) ready = false;

  return NextResponse.json(
    { status: ready ? 'ready' : 'not-ready', checks },
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
