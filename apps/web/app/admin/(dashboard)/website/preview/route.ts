import { NextRequest, NextResponse } from 'next/server';
import { draftMode } from 'next/headers';
import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { prisma } from '@/lib/db';
import { ADMIN_VISIBLE_PAGE_KEYS } from '@/lib/cms/sectionRegistry';
import { publicArticleWhere } from '@/lib/fixturePolicy';

/**
 * BLD-01 — redirect to a RELATIVE Location, never an absolute one.
 *
 * THE DEFECT. Both redirects in this route used
 * `NextResponse.redirect(new URL(path, req.url))`. `NextResponse.redirect`
 * requires an absolute URL, and resolving against `req.url` takes the origin
 * from the incoming request as the server sees it. Behind the deployment
 * platform's proxy the application is bound to the container's internal
 * address (the deploy log shows `Local: http://localhost:10000`), so the
 * browser received `Location: http://localhost:10000/...`, tried to reach its
 * OWN localhost and reported "localhost refused to connect". The Builder canvas
 * takes the `embed=1` branch, which is why the canvas was the visible symptom.
 *
 * THE FIX. RFC 7231 §7.1.2 allows a relative-reference in `Location`, and every
 * browser resolves it against the request URL — which is the public origin the
 * user actually typed. That keeps the redirect same-origin by construction:
 * nothing has to know the deployment's hostname, no forwarded header has to be
 * trusted (`X-Forwarded-Host` is attacker-controlled unless the proxy is known
 * to overwrite it), and there is no localhost fallback to get wrong.
 *
 * `NextResponse.redirect()` cannot express this because it validates its
 * argument as an absolute URL, so the response is constructed directly. It is
 * the same `NextResponse` type and the same 307 status the helper produces, so
 * cookie handling — including the draft-mode cookie set moments earlier — is
 * unchanged: the framework applies the outgoing cookie store to whatever
 * response the handler returns.
 */
function sameOriginRedirect(path: string, extraHeaders: Record<string, string> = {}): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: assertSameOriginPath(path), ...extraHeaders },
  });
}

/**
 * Reject anything that is not a plain, single-rooted path on this origin.
 *
 * A relative `Location` is only same-origin if it cannot be read as something
 * else. The cases that matter:
 *   - `//evil.example/` is a PROTOCOL-RELATIVE url — the browser leaves the site.
 *   - `https://evil.example/` is absolute for the same reason.
 *   - `/\evil.example` is treated as `//` by some browsers.
 *   - CR/LF would split the header.
 *
 * `//` is rejected ANYWHERE, not just at the start. A slug of `/evil.example`
 * yields `/articles//evil.example/`, which stays on this origin and is
 * therefore not an open redirect — but no legitimate path here contains an
 * empty segment, so refusing it keeps one hostile slug from silently steering
 * the preview at a route nobody intended. The first draft of this guard only
 * checked the prefix; the regression test below caught the difference.
 *
 * The allow-list is deliberately narrower than "a valid URL path": these paths
 * are built from `pageKeyToUrl()` out of CMS slugs, and `normalizeSlug()` only
 * arrived with the Rodeo Coverage work, so rows created earlier were never held
 * to it. Validating the finished path covers every caller at once, and the same
 * guarantee is what makes `targetUrl` safe to interpolate into the standalone
 * preview's HTML below.
 */
function assertSameOriginPath(path: string): string {
  const ok =
    path.startsWith('/') &&
    !path.includes('//') &&
    !path.includes('\\') &&
    /^[A-Za-z0-9._~\-/%?&=]*$/.test(path);
  if (!ok) throw new Error('Unsafe preview redirect target.');
  return path;
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!roleHasPermission(user.roles, 'system.config')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ?exit=1 turns draft preview off and returns to the editor.
  if (req.nextUrl.searchParams.get('exit') === '1') {
    (await draftMode()).disable();
    return sameOriginRedirect('/admin/website/');
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
    const query = new URLSearchParams({
      _preview: 'draft',
      _pk: pageKey,
      // `_canvas=1` is what turns the click-to-select bridge on. Only this path
      // sets it, so the standalone preview keeps ordinary navigation.
      _canvas: '1',
    });
    const dest = `${assertSameOriginPath(targetUrl)}${targetUrl.includes('?') ? '&' : '?'}${query}`;
    return sameOriginRedirect(dest, {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Robots-Tag': 'noindex',
    });
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
  <iframe src="${assertSameOriginPath(targetUrl)}?_preview=draft&amp;_pk=${encodeURIComponent(pageKey)}" sandbox="allow-same-origin allow-scripts"></iframe>
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
