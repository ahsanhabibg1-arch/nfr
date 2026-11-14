import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePermissionPage } from '@/lib/auth/currentUser';
import { prisma } from '@/lib/db';
import { getPublishedInfoPage, LEGACY_SLUGS } from '@/lib/cms/infoPageService';
import { sanitizeLegalHtml } from '@/lib/cms/sanitizeHtml';
import { InfoPageDiff, plainText, type DiffField } from '@/views/InfoPageDiff';
import { PreviewViewport } from '@/views/admin/PreviewViewport';

type Params = { params: Promise<{ slug: string }> };

/**
 * Secure draft preview and live/draft comparison (PM-06).
 *
 * SECURITY, and why this is a route under `/admin/` rather than a public URL
 * with a token. Draft content is unapproved and, for a policy page, legally
 * unreviewed. A `?preview=` parameter protects it with a secret that travels in
 * referrer headers, browser history and shared links; it is a URL, not an
 * authorisation. Sitting inside the admin segment means the request is subject
 * to the same session and permission check as every other admin screen, on the
 * server, with no second mechanism to keep in step.
 *
 * `force-dynamic` + `noindex` + no caching: a draft must never be stored by a
 * CDN, offered to a crawler, or served from a cache to the next person.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Draft preview',
  robots: { index: false, follow: false, nocache: true },
};

export default async function InfoPagePreview({ params }: Params) {
  // Server-side, before anything is read. Not a hidden button.
  await requirePermissionPage('system.config');

  const { slug } = await params;
  const page = await prisma.infoPage.findUnique({ where: { slug } });
  if (!page) notFound();

  const live = await getPublishedInfoPage(slug);
  const hero = page.heroMediaId
    ? await prisma.mediaAsset.findUnique({
        where: { id: page.heroMediaId },
        select: { url: true, altText: true, caption: true, credit: true },
      })
    : null;
  const seo = await prisma.entitySeo.findUnique({
    where: { entityType_entityId: { entityType: 'INFO_PAGE', entityId: page.id } },
    select: { seoTitle: true, metaDescription: true, canonicalOverride: true, ogImage: true, noindex: true },
  });

  const publicPath = (LEGACY_SLUGS as readonly string[]).includes(slug) ? `/${slug}/` : `/info/${slug}/`;

  /**
   * Compared field by field, including the ones that are easy to forget are
   * part of a publication: the SEO values and the hero both move with the body.
   */
  const fields: DiffField[] = [
    { label: 'Title', live: live?.title ?? null, draft: page.title },
    { label: 'Body', live: plainText(live?.body ?? null), draft: plainText(page.body), long: true },
    { label: 'Hero image', live: live?.hero?.url ?? null, draft: hero?.url ?? null },
    { label: 'Hero alt text', live: live?.hero?.alt ?? null, draft: hero?.altText ?? null },
    { label: 'SEO title', live: live?.seo?.seoTitle ?? live?.seoTitle ?? null, draft: seo?.seoTitle ?? page.seoTitle },
    { label: 'Meta description', live: live?.seo?.metaDescription ?? live?.metaDescription ?? null, draft: seo?.metaDescription ?? page.metaDescription },
    { label: 'Canonical URL', live: live?.seo?.canonicalOverride ?? null, draft: seo?.canonicalOverride ?? null },
    { label: 'Open Graph image', live: live?.seo?.ogImage ?? null, draft: seo?.ogImage ?? null },
    { label: 'Search indexing', live: live ? (live.seo?.noindex ? 'noindex' : 'index') : null, draft: seo?.noindex ? 'noindex' : 'index' },
    { label: 'Workflow status', live: live ? 'Published' : 'Not live', draft: page.status },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-amber-700">Draft preview — not public</p>
          <h1 className="font-serif text-2xl font-bold text-stone-900">{page.title}</h1>
          <p className="text-xs text-stone-500 font-mono">{publicPath}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/info-pages/" className="px-3 py-1.5 text-xs font-semibold rounded-xs border border-stone-300 text-stone-700">
            Back to pages
          </Link>
          {live && (
            <a href={publicPath} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-xs font-semibold rounded-xs border border-stone-300 text-stone-700">
              View live ↗
            </a>
          )}
        </div>
      </div>

      <p className="p-3 border border-amber-300 bg-amber-50 text-xs text-amber-950 rounded-sm">
        This is the saved <strong>draft</strong>. It is visible only to staff with
        page permissions, is never indexed, and is not what visitors currently see.
      </p>

      {/*
        The draft is rendered through the SAME sanitiser the public page uses,
        so what is previewed is what would be published — not a near-miss of it.
      */}
      <PreviewViewport>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <header className="mb-6">
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">Publication policy</p>
            <h2 className="font-serif text-3xl font-bold text-stone-900 mt-1">{page.title}</h2>
            {(seo?.metaDescription || page.metaDescription) && (
              <p className="text-stone-600 mt-2">{seo?.metaDescription || page.metaDescription}</p>
            )}
          </header>
          {hero && (
            <figure className="mb-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hero.url} alt={hero.altText ?? ''} className="w-full rounded-sm border border-stone-200" />
              {(hero.caption || hero.credit) && (
                <figcaption className="mt-2 text-[11px] text-stone-500">
                  {hero.caption}{hero.caption && hero.credit ? ' · ' : ''}
                  {hero.credit && <span className="italic">{hero.credit}</span>}
                </figcaption>
              )}
            </figure>
          )}
          <div className="prose prose-stone max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeLegalHtml(page.body) }} />
        </div>
      </PreviewViewport>

      <InfoPageDiff fields={fields} hasLive={!!live} />
    </div>
  );
}
