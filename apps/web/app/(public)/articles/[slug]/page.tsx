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
import { isStaffDraftPreview } from '@/lib/cms/previewGuard';
import { getArticleSchemaType } from '@/lib/cms/articleTypeRegistry';
import { articleCategoryCrumb } from '@/lib/seo/articleBreadcrumb';
import { getPublicSiteName } from '@/lib/cms/settingsService';

type Params = { params: Promise<{ slug: string }> };

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

  /**
   * Batch 04-E — the structured-data classification comes from the managed
   * registry, resolved here because this is a Server Component and `lib/seo`
   * is synchronous and isomorphic. An unknown value, an uninitialised table or
   * an unreachable database all yield `'Article'`, never `'NewsArticle'`.
   */
  const schemaType = await getArticleSchemaType(article.articleType);
  const crumb = articleCategoryCrumb(article);
  // Stage 03 (H-06): resolved here because `lib/seo` is synchronous.
  const publisherName = await getPublicSiteName();

  return (
    <>
      <JsonLd
        data={[
          articleJsonLd(article, { schemaType, publisherName }),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            // Stage 03 (R-3): the SAME resolver the visible breadcrumb uses, so
            // the structured data and the rendered trail cannot diverge.
            { name: crumb.name, path: crumb.path },
            { name: article.title, path: ROUTES.ARTICLE(article.slug) },
          ]),
        ]}
      />
      <ArticleView article={article} draft={await isStaffDraftPreview()} />
      <ArticleMonetization articleId={article.id} />
      <AdPlacementSlot pageScope="article" />
      <CommentSection articleId={article.id} initialComments={await listApprovedForArticle(article.id)} />
      <ViewBeacon entityType="ARTICLE" entityId={article.id} path={ROUTES.ARTICLE(article.slug)} />
    </>
  );
}
