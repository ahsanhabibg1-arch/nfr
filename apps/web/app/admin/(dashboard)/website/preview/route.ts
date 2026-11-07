import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { KNOWN_PAGE_KEYS } from '@/lib/cms/sectionRegistry';

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!roleHasPermission(user.roles, 'system.config')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const pageKey = req.nextUrl.searchParams.get('pageKey');
  if (!pageKey || !(KNOWN_PAGE_KEYS as readonly string[]).includes(pageKey)) {
    return NextResponse.json({ error: 'Invalid page key' }, { status: 400 });
  }

  const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
  if (!layout || !Array.isArray(layout.draftSections) || (layout.draftSections as unknown[]).length === 0) {
    return NextResponse.json({ error: 'No draft found for this page.' }, { status: 404 });
  }

  const targetUrl = pageKeyToUrl(pageKey);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <meta http-equiv="Cache-Control" content="no-store" />
  <title>Draft Preview — ${pageKey}</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    .preview-bar { position: sticky; top: 0; z-index: 9999; background: #0F1115; color: #D4A757; padding: 8px 16px; font-size: 12px; display: flex; align-items: center; gap: 12px; }
    .preview-bar span { opacity: 0.7; }
    .preview-bar a { color: #D4A757; text-decoration: underline; }
    iframe { width: 100%; height: calc(100vh - 36px); border: none; }
  </style>
</head>
<body>
  <div class="preview-bar">
    <strong>DRAFT PREVIEW</strong>
    <span>Page: ${pageKey}</span>
    <span>This is a draft preview — not visible to the public.</span>
    <a href="/admin/website/">← Back to editor</a>
  </div>
  <iframe src="${targetUrl}?_preview=draft&_pk=${encodeURIComponent(pageKey)}" sandbox="allow-same-origin allow-scripts"></iframe>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function pageKeyToUrl(pageKey: string): string {
  if (pageKey === 'homepage') return '/';
  if (pageKey.startsWith('section:')) return `/${pageKey.replace('section:', '')}/`;
  if (pageKey === 'template:article') return '/articles/';
  if (pageKey === 'directory:competitors') return '/competitors/';
  if (pageKey === 'directory:venues') return '/venues/';
  return '/';
}
