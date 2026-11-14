import type { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { getPublishedArticleBySlug, getPublishedArticleSlugs, resolveArticleRedirect } from '@/lib/content';
import { buildMetadata } from '@/lib/seo';
import { articleMetadataInput, unavailableArticleMetadataInput } from '@/lib/seo/articleMeta';
import { articleUrl, ROUTES } from '@/config/routes';
import { ArticlePageBody } from '@/views/ArticlePageBody';

type Params = { params: Promise<{ section: string; article: string }> };

/**
 * An article inside its subcategory — `/<subcategory>/<article>/`.
 *
 * The first segment is named `[section]` rather than `[subcategory]` because
 * Next.js requires one dynamic name per level and the parent route already
 * owns that level. It holds a SUBCATEGORY slug here; a primary section has no
 * children and falls through to 404 below.
 */
export const revalidate = 60;
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await getPublishedArticleSlugs();
  const params: { section: string; article: string }[] = [];
  for (const slug of slugs) {
    const a = await getPublishedArticleBySlug(slug);
    if (a?.subcategoryRef) params.push({ section: a.subcategoryRef.slug, article: slug });
  }
  return params;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { article: slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) return buildMetadata(unavailableArticleMetadataInput(slug));
  return buildMetadata(articleMetadataInput(article));
}

export default async function SubcategoryArticlePage({ params }: Params) {
  const { section, article: slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) {
    const moved = await resolveArticleRedirect(slug);
    if (moved) (moved.permanent ? permanentRedirect : redirect)(moved.destination);
    notFound();
  }

  /**
   * THE FIRST SEGMENT IS VERIFIED, NOT TRUSTED.
   *
   * Without this check `/anything/<slug>/` would serve the article — an
   * unlimited supply of URLs for one piece of content, every one of them HTTP
   * 200 and indexable. The article's own subcategory decides its address, so
   * any other first segment is redirected to the real one (a renamed
   * subcategory keeps its old links working for free), and an article with no
   * subcategory goes back to `/articles/<slug>/`.
   */
  if (article.subcategoryRef?.slug !== section) {
    permanentRedirect(article.subcategoryRef ? articleUrl(article) : ROUTES.ARTICLE(slug));
  }

  return <ArticlePageBody article={article} />;
}
