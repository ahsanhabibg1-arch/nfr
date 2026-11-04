import { NextRequest, NextResponse } from 'next/server';
import { log, correlationIdFrom } from '@/lib/logger';

/**
 * First-party CSP violation receiver (Batch 21 §D). The report-only policy in
 * next.config.mjs points `report-uri` here so violations are collected on our own
 * infrastructure (no third-party service). It only LOGS a small, sanitized summary
 * — it never stores reports in the database (avoids write amplification / abuse) and
 * never collects sensitive data.
 *
 * Abuse protection: oversized bodies are rejected before parsing; only a handful of
 * known, truncated fields are logged. Always answers 204 so a browser never retries.
 * (Edge/CDN rate-limiting is the recommended outer layer in production.)
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 16 * 1024; // CSP reports are tiny; anything larger is noise/abuse.
const trunc = (v: unknown, n = 300) => (typeof v === 'string' ? v.slice(0, n) : undefined);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return new NextResponse(null, { status: 204 });

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return new NextResponse(null, { status: 204 });
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 204 }); // malformed → ignore quietly
  }

  // Support both the legacy `{"csp-report": {...}}` shape and the Reporting API array.
  const reports: Record<string, unknown>[] = Array.isArray(body)
    ? (body as Record<string, unknown>[]).map((r) => (r?.body as Record<string, unknown>) ?? r)
    : [((body as Record<string, unknown>)?.['csp-report'] as Record<string, unknown>) ?? (body as Record<string, unknown>)];

  const cid = correlationIdFrom(req.headers);
  for (const r of reports.slice(0, 10)) {
    if (!r || typeof r !== 'object') continue;
    // Log only non-sensitive, truncated fields. No cookies, headers, or payloads.
    log.warn('csp.violation', {
      cid,
      documentUri: trunc(r['document-uri'] ?? r['documentURL']),
      violatedDirective: trunc(r['violated-directive'] ?? r['effectiveDirective'] ?? r['effective-directive'], 120),
      blockedUri: trunc(r['blocked-uri'] ?? r['blockedURL'], 200),
      disposition: trunc(r['disposition'], 20),
    });
  }

  return new NextResponse(null, { status: 204 });
}
