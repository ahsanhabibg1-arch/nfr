import { NextRequest, NextResponse } from 'next/server';
import { getActor } from '@/lib/cms/guard';
import { roleHasPermission } from '@/lib/auth/rbac';
import { uploadMedia } from '@/lib/cms/mediaService';
import { ServiceError } from '@/lib/cms/articleService';

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
