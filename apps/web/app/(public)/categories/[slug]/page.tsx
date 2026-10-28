import type { Metadata } from 'next';
import { CategoryArchiveView } from '@/views/CategoryArchiveView';
import { getSectionMetaByCategorySlug } from '@/lib/content';
import { buildMetadata } from '@/lib/seo';

type Params = { params: Promise<{ slug: string }> };

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
  return <CategoryArchiveView slug={slug} />;
}
