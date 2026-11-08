import type { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { getPublishedArticleBySlug, getPublishedArticleSlugs, resolveArticleRedirect } from '@/lib/content';
import { ArticleView } from '@/views/ArticleView';
import { buildMetadata, articleJsonLd, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { articleMetadataInput, unavailableArticleMetadataInput } from '@/lib/seo/articleMeta';
import { ROUTES } from '@/config/routes';
import { ViewBeacon } from '@/components/analytics/ViewBeacon';
import { ArticleMonetization } from '@/components/monetization/ArticleMonetization';
import { AdPlacementSlot } from '@/components/monetization/AdPlacementSlot';
import { CommentSection } from '@/components/editorial/CommentSection';
import { listApprovedForArticle } from '@/lib/cms/commentService';

type Params = { params: Promise<{ slug: string }> };

function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export const revalidate = 60;

export async function generateStaticParams() {
  return (await getPublishedArticleSlugs()).map((slug) => ({ slug }));
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

  return (
    <>
      <JsonLd
        data={[
          articleJsonLd(article),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: article.category, path: ROUTES.CATEGORY(categorySlug(article.category)) },
            { name: article.title, path: ROUTES.ARTICLE(article.slug) },
          ]),
        ]}
      />
      <ArticleView article={article} />
      <ArticleMonetization articleId={article.id} />
      <AdPlacementSlot pageScope="article" />
      <CommentSection articleId={article.id} initialComments={await listApprovedForArticle(article.id)} />
      <ViewBeacon entityType="ARTICLE" entityId={article.id} path={ROUTES.ARTICLE(article.slug)} />
    </>
  );
}
