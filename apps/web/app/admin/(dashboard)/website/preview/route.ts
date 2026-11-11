import { NextRequest, NextResponse } from 'next/server';
import { draftMode } from 'next/headers';
import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { ADMIN_VISIBLE_PAGE_KEYS } from '@/lib/cms/sectionRegistry';
import { publicArticleWhere } from '@/lib/fixturePolicy';

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!roleHasPermission(user.roles, 'system.config')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ?exit=1 turns draft preview off and returns to the editor.
  if (req.nextUrl.searchParams.get('exit') === '1') {
    (await draftMode()).disable();
    return NextResponse.redirect(new URL('/admin/website/', req.url));
  }

  const pageKey = req.nextUrl.searchParams.get('pageKey');
  if (!pageKey || !(ADMIN_VISIBLE_PAGE_KEYS as readonly string[]).includes(pageKey)) {
    return NextResponse.json({ error: 'Invalid page key' }, { status: 400 });
  }

  /**
   * Embed mode — the Page Builder canvas (Stage 06 Task 3).
   *
   * The canvas mounts THIS route rather than a second renderer, so the centre
   * panel shows the same draft composition the standalone preview shows, built
   * by the same public pages. Two deliberate differences from the standalone
   * path below:
   *
   *  1. It redirects to the target page instead of returning a chrome wrapper.
   *     The wrapper's preview bar and its own inner iframe belong to a
   *     full-window preview; inside the canvas they would waste height and add
   *     a second frame boundary between the page and the Builder.
   *
   *  2. It does NOT 404 when no draft layout is stored. A page with no stored
   *     layout renders registry defaults — that is what the public site already
   *     does, and it is what the Builder's own tree shows — so refusing to draw
   *     the canvas would be wrong. There is no disclosure concern: the operator
   *     already holds `system.config` and the page shows what a visitor sees.
   */
  const embed = req.nextUrl.searchParams.get('embed') === '1';

  const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
  const hasDraft = !!layout && Array.isArray(layout.draftSections) && (layout.draftSections as unknown[]).length > 0;
  if (!hasDraft && !embed) {
    return NextResponse.json({ error: 'No draft found for this page.' }, { status: 404 });
  }

  const targetUrl = await pageKeyToUrl(pageKey);
  if (!targetUrl) {
    return NextResponse.json({ error: `No previewable URL for page key "${pageKey}".` }, { status: 404 });
  }

  if (embed) {
    (await draftMode()).enable();
    const dest = new URL(targetUrl, req.url);
    dest.searchParams.set('_preview', 'draft');
    dest.searchParams.set('_pk', pageKey);
    // `_canvas=1` is what turns the click-to-select bridge on. Only this path
    // sets it, so the standalone preview keeps ordinary navigation.
    dest.searchParams.set('_canvas', '1');
    const res = NextResponse.redirect(dest);
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.headers.set('X-Robots-Tag', 'noindex');
    return res;
  }

  // Next.js draft mode: public pages render the saved *draft* layout for this staff session
  // (pages re-check the system.config permission before honouring it). Visitors are unaffected.
  (await draftMode()).enable();

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
    <a href="/admin/website/preview?exit=1">Exit draft preview</a>
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

async function pageKeyToUrl(pageKey: string): Promise<string | null> {
  if (pageKey === 'homepage') return '/';
  if (pageKey.startsWith('section:')) return `/${pageKey.replace('section:', '')}/`;
  if (pageKey === 'template:article') {
    const latest = await prisma.article.findFirst({
      where: publicArticleWhere(),
      orderBy: { publishedAt: 'desc' },
      select: { slug: true },
    });
    return latest ? `/articles/${latest.slug}/` : null;
  }
  if (pageKey === 'template:rodeo-hub') {
    const hub = await prisma.rodeoHub.findFirst({ orderBy: { sortOrder: 'asc' }, select: { slug: true } });
    if (hub) return `/rodeo-events/${hub.slug}/`;
    const ev = await prisma.rodeoEvent.findFirst({ orderBy: { name: 'asc' }, select: { slug: true } });
    return ev ? `/rodeo-events/${ev.slug}/` : null;
  }
  if (pageKey === 'template:rodeo-edition') {
    const ed = await prisma.rodeoEventEdition.findFirst({
      orderBy: { startAt: 'desc' },
      include: { event: { select: { slug: true } } },
    });
    return ed ? `/rodeo-events/${ed.event.slug}/${ed.editionSlug}/` : null;
  }
  if (pageKey === 'template:discipline') {
    const d = await prisma.discipline.findFirst({ orderBy: { sortOrder: 'asc' }, select: { slug: true } });
    return d ? `/disciplines/${d.slug}/` : null;
  }
  if (pageKey === 'template:category') {
    const cat = await prisma.category.findFirst({ orderBy: { name: 'asc' }, select: { slug: true } });
    return cat ? `/categories/${cat.slug}/` : null;
  }
  if (pageKey === 'template:competitor') {
    const comp = await prisma.competitor.findFirst({ orderBy: { fullName: 'asc' }, select: { slug: true } });
    return comp ? `/competitors/${comp.slug}/` : null;
  }
  if (pageKey === 'template:venue') {
    const venue = await prisma.venue.findFirst({ orderBy: { name: 'asc' }, select: { slug: true } });
    return venue ? `/venues/${venue.slug}/` : null;
  }
  if (pageKey === 'directory:competitors') return '/competitors/';
  if (pageKey === 'directory:venues') return '/venues/';
  return null;
}
