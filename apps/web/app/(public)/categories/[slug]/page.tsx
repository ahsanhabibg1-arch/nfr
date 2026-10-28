import type { Metadata } from 'next';
import { CategoryArchiveView } from '@/views/CategoryArchiveView';
import {
  getSectionMetaByCategorySlug,
  getPublishedArticlesBySection,
  getPublishedArticlesByCategory,
} from '@/lib/content';
import { buildMetadata } from '@/lib/seo';

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 60;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const meta = getSectionMetaByCategorySlug(slug);
  const categoryName = meta?.categoryKey || slug.replace(/-/g, ' ').toUpperCase();
  return buildMetadata({
    title: `${categoryName} Archive — Editorial Dispatches`,
    description:
      meta?.description ||
      `Explore comprehensive articles, analysis, and spectator intelligence for ${categoryName}.`,
    path: `/categories/${slug}/`,
  });
}

export default async function CategoryPage({ params }: Params) {
  const { slug } = await params;
  const meta = getSectionMetaByCategorySlug(slug);
  const articles = meta
    ? await getPublishedArticlesBySection(meta.categoryKey)
    : await getPublishedArticlesByCategory(slug);
  const categoryName = meta?.categoryKey || slug.replace(/-/g, ' ').toUpperCase();

  return (
    <CategoryArchiveView
      articles={articles}
      categoryName={categoryName}
      description={meta?.description}
      sectionPath={meta?.path}
    />
  );
}
