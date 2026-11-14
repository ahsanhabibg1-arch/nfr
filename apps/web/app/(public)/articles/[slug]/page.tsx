import type { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { getPublishedArticleBySlug, getPublishedArticleSlugs, resolveArticleRedirect } from '@/lib/content';
import { buildMetadata, JsonLd } from '@/lib/seo';
import { articleMetadataInput, unavailableArticleMetadataInput } from '@/lib/seo/articleMeta';
import { articleUrl } from '@/config/routes';
import { ArticlePageBody } from '@/views/ArticlePageBody';

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 60;

/**
 * Only articles WITHOUT a managed subcategory are pre-rendered here.
 *
 * One article, one URL. An article that has a subcategory belongs to
 * `/<subcategory>/<slug>/`, and this route redirects it there rather than
 * serving the same content at a second address — two live URLs for one article
 * is duplicate content, and whichever one search picked would be the one the
 * site did not link to.
 */
export async function generateStaticParams() {
  const all = await getPublishedArticleSlugs();
  const bare: { slug: string }[] = [];
  for (const slug of all) {
    const a = await getPublishedArticleBySlug(slug);
    if (a && !a.subcategoryRef) bare.push({ slug });
  }
  return bare;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  // Unavailable article: noindex, follow (owner-approved route policy, Batch S3 follow-up).
  if (!article) return buildMetadata(unavailableArticleMetadataInput(slug));
  // Batch S1: stored ArticleSeo overrides (title, description, same-site canonical,
  // OG image, robots) with the previous title/deck/excerpt/hero fallbacks for blanks.
  return buildMetadata(articleMetadataInput(article));
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  // Eligibility policy: unpublished/unknown slugs never render publicly. A slug that was
  // renamed while published redirects to its current URL; everything else is a 404.
  if (!article) {
    const moved = await resolveArticleRedirect(slug);
    if (moved) (moved.permanent ? permanentRedirect : redirect)(moved.destination);
    notFound();
  }

  /**
   * The article has moved into a subcategory since this URL was indexed, or was
   * linked here by something that did not know about the subcategory. Either
   * way the canonical home is the nested URL, so send readers and crawlers
   * there permanently instead of serving a duplicate.
   */
  if (article.subcategoryRef) permanentRedirect(articleUrl(article));

  return <ArticlePageBody article={article} />;
}
