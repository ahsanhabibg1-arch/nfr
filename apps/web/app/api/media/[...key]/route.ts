import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActor } from '@/lib/cms/guard';
import { roleHasPermission } from '@/lib/auth/rbac';
import { getStorage, assertSafeKey } from '@/lib/media/storage';

// fs-backed streaming requires the Node runtime.
export const runtime = 'nodejs';

/**
 * Serve a managed media blob (Batch 05 §14). Visibility-gated: only PUBLIC +
 * READY assets are served to anonymous visitors; DRAFT/ARCHIVED (or still
 * processing) require an authenticated CMS user with `media.view`, so draft-only
 * media is never exposed publicly. The asset id is embedded in the key
 * (`yyyy/mm/<id>[__variant].<ext>`), so we resolve + authorize before streaming.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string[] }> }): Promise<NextResponse> {
  const { key: parts } = await ctx.params;
  const key = (parts || []).join('/');
  try { assertSafeKey(key); } catch { return new NextResponse('Bad request', { status: 400 }); }

  const base = key.split('/').pop() || '';
  const id = base.replace(/\.[a-z0-9]+$/i, '').split('__')[0];
  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { id: true, storageKey: true, mimeType: true, visibility: true, processingStatus: true, derivatives: true },
  });
  if (!asset) return new NextResponse('Not found', { status: 404 });

  // The key must genuinely belong to this asset (original or a known derivative).
  const derivativeKeys = Object.values((asset.derivatives as Record<string, { key: string }> | null) ?? {}).map((d) => d.key);
  if (key !== asset.storageKey && !derivativeKeys.includes(key)) return new NextResponse('Not found', { status: 404 });

  const isPublic = asset.visibility === 'PUBLIC' && asset.processingStatus === 'READY';
  if (!isPublic) {
    const actor = await getActor();
    if (!actor || !roleHasPermission(actor.roles, 'media.view')) return new NextResponse('Not found', { status: 404 });
  }

  let body: Buffer;
  try { body = await getStorage().get(key); } catch { return new NextResponse('Not found', { status: 404 }); }

  const contentType = key.endsWith('.webp') ? 'image/webp' : asset.mimeType || 'application/octet-stream';
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': isPublic ? 'public, max-age=300, s-maxage=31536000, immutable' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
