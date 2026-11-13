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
      return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: statusFor(e.code) });
    }
    console.error('[media upload] unexpected error:', e);
    return NextResponse.json({ ok: false, error: 'Upload failed.' }, { status: 500 });
  }
}

/**
 * MED-01A — map a service error to an honest status code.
 *
 * Every code except `forbidden` and `not_found` used to collapse to **400**. So
 * the confirmed production fault — the storage adapter failing to load, which is
 * a server-side deployment defect — was reported to the browser, to the platform
 * log and to any future monitoring as a *client* error. A 4xx says "your request
 * was wrong, do not retry"; nothing about that request was wrong.
 *
 * `storage` → **500**, deliberately not 503. 503 promises a transient condition
 * and invites a retry, and at this point the cause is unknown: a missing module
 * (never transient), a rejected credential (never transient) and a network blip
 * (transient) are indistinguishable here. Claiming "try again shortly" without a
 * basis — or inventing a `Retry-After` — would be a guess the client acts on.
 *
 * `processing` stays **4xx**, as 422: the request was well-formed but the file's
 * CONTENT could not be processed, which is what 422 means and what this error
 * overwhelmingly is in practice (a corrupt or truncated image). It is not 500,
 * because a 500 on every bad upload would bury real server faults in noise. The
 * caveat is recorded honestly: this same code is also thrown if `sharp` itself
 * were unusable in a deployment, which is a server fault wearing a client
 * error's status — the `report('unexpected', …)` call in `uploadMedia` is what
 * distinguishes the two, in the log rather than in the status code.
 *
 * The user-facing messages are unchanged; only the status codes move.
 */
function statusFor(code: ServiceError['code']): number {
  switch (code) {
    case 'forbidden': return 403;
    case 'not_found': return 404;
    case 'conflict': return 409;
    case 'rate_limited': return 429;
    case 'processing': return 422;
    case 'storage': return 500;
    default: return 400; // validation, invalid_transition, disabled
  }
}
