import type { Metadata } from 'next';
import { CategoryArchiveView } from '@/views/CategoryArchiveView';
import {
  getSectionMetaByCategorySlug,
  getPublishedArticlesBySection,
  getPublishedArticlesByCategory,
} from '@/lib/content';
import { buildMetadata, faqPageJsonLd, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { getEntitySeo, mergeSeoMeta } from '@/lib/cms/entitySeoService';
import { listPublicFaqs } from '@/lib/cms/faqService';
import { getCategoryBySlug } from '@/lib/content';
import { FaqAccordion } from '@/components/FaqAccordion';
import { EntityIntro } from '@/components/editorial/EntityIntro';

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 60;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const meta = getSectionMetaByCategorySlug(slug);
  const categoryName = meta?.categoryKey || slug.replace(/-/g, ' ').toUpperCase();
  const catRow = await getCategoryBySlug(slug);
  const seo = catRow ? await getEntitySeo('CATEGORY', catRow.id) : null;
  return buildMetadata(mergeSeoMeta(seo, {
    title: `${categoryName} Archive — Editorial Dispatches`,
    description: meta?.description || `Explore comprehensive articles, analysis, and spectator intelligence for ${categoryName}.`,
    path: `/categories/${slug}/`,
    derivedNoindex: false,
  }));
}

export default async function CategoryPage({ params }: Params) {
  const { slug } = await params;
  const meta = getSectionMetaByCategorySlug(slug);
  const articles = meta
    ? await getPublishedArticlesBySection(meta.categoryKey)
    : await getPublishedArticlesByCategory(slug);
  const categoryName = meta?.categoryKey || slug.replace(/-/g, ' ').toUpperCase();
  const catRow = await getCategoryBySlug(slug);
  const [seo, faqs] = catRow ? await Promise.all([getEntitySeo('CATEGORY', catRow.id), listPublicFaqs('CATEGORY', catRow.id)]) : [null, []];
  const faqLd = faqPageJsonLd(faqs);
  const crumb = breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: categoryName, path: `/categories/${slug}/` },
  ]);

  return (
    <>
      <JsonLd data={faqLd ? [crumb, faqLd] : crumb} />
      <CategoryArchiveView
        articles={articles}
        categoryName={categoryName}
        description={meta?.description}
        sectionPath={meta?.path}
      />
      {(seo?.intro || faqs.length > 0) && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-10">
          <EntityIntro intro={seo?.intro} />
          <FaqAccordion faqs={faqs} />
        </div>
      )}
    </>
  );
}
