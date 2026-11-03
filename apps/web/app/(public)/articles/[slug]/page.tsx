import type { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { getPublishedArticleBySlug, getPublishedArticleSlugs, resolveArticleRedirect } from '@/lib/content';
import { ArticleView } from '@/views/ArticleView';
import { buildMetadata, articleJsonLd, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { ROUTES } from '@/config/routes';
import { ViewBeacon } from '@/components/analytics/ViewBeacon';
import { ArticleMonetization } from '@/components/monetization/ArticleMonetization';
import { AdPlacementSlot } from '@/components/monetization/AdPlacementSlot';

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
  if (!article) {
    return buildMetadata({
      title: 'Dispatch Unavailable',
      description: 'The requested editorial dispatch is currently unavailable.',
      path: `/articles/${slug}/`,
      noindex: true,
    });
  }
  return buildMetadata({
    title: article.title,
    description:
      article.deck ||
      article.excerpt ||
      'Independent rodeo journalism and championship analysis from NFRGuide.',
    path: ROUTES.ARTICLE(article.slug),
    image: article.heroImage,
    type: 'article',
    publishedTime: article.publishedAt,
    authorName: article.author.name,
  });
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
      <ViewBeacon entityType="ARTICLE" entityId={article.id} path={ROUTES.ARTICLE(article.slug)} />
    </>
  );
}
