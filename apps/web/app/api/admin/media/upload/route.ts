import { NextRequest, NextResponse } from 'next/server';
import { getActor } from '@/lib/cms/guard';
import { roleHasPermission } from '@/lib/auth/rbac';
import { uploadMedia } from '@/lib/cms/mediaService';
import { ServiceError } from '@/lib/cms/articleService';
import { DEFAULT_MAX_BYTES } from '@/lib/media/validation';
import { checkDurableRateLimit } from '@/lib/auth/durableRateLimit';
import { log, correlationIdFrom } from '@/lib/logger';

// sharp + fs require the Node.js runtime (not edge).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authenticated media upload (Batch 05 §5). Server-side RBAC + validation; the
 * browser-declared MIME is re-verified against the file signature inside the
 * service. Never logs tokens or credentials.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ ok: false, error: 'You must be signed in.' }, { status: 401 });
  if (!roleHasPermission(actor.roles, 'media.upload')) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to upload media.' }, { status: 403 });
  }

  // Abuse protection (Batch 17 §C): throttle authenticated uploads per user — a
  // durable, multi-instance limiter. Keyed by the authenticated actor id (never a
  // forwarded IP header), so it cannot be bypassed by spoofing and does not block
  // unrelated users sharing a proxy. 30 uploads / 5 minutes.
  const cid = correlationIdFrom(req.headers);
  const rl = await checkDurableRateLimit(`media-upload:${actor.id}`, 30, 5 * 60 * 1000);
  if (!rl.allowed) {
    // Fail closed, but distinguish a limiter-storage outage (503, transient) from a
    // genuine threshold hit (429) so legitimate admins get an accurate signal.
    if (rl.storageError) {
      log.warn('media.upload.limiter_degraded', { cid, actorId: actor.id });
      return NextResponse.json(
        { ok: false, code: 'service_unavailable', error: 'Uploads are temporarily unavailable. Please try again shortly.' },
        { status: 503, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }
    log.warn('media.upload.rate_limited', { cid, actorId: actor.id });
    return NextResponse.json(
      { ok: false, code: 'rate_limited', error: 'Too many uploads. Please slow down and try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  const declaredLength = Number(req.headers.get('content-length') || 0);
  // Multipart framing adds a small amount beyond the file itself. Reject grossly
  // oversized requests before parsing them into memory; uploadMedia enforces the
  // exact file limit after signature validation.
  if (declaredLength > DEFAULT_MAX_BYTES + 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'Upload exceeds the configured size limit.' }, { status: 413 });
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: 'Malformed upload.' }, { status: 400 }); }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'No file provided.' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const result = await uploadMedia(actor, { buffer, originalName: file.name || 'upload', declaredMime: file.type || null });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ServiceError) {
      const status = e.code === 'forbidden' ? 403 : e.code === 'not_found' ? 404 : 400;
      return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status });
    }
    console.error('[media upload] unexpected error:', e);
    return NextResponse.json({ ok: false, error: 'Upload failed.' }, { status: 500 });
  }
}
