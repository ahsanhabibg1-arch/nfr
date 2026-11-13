import type { Metadata } from 'next';
import { CategoryArchiveView } from '@/views/CategoryArchiveView';
import {
  resolveCategoryArchive,
  getPublishedArticlesBySection,
  getPublishedArticlesByCategory,
} from '@/lib/content';
import { buildMetadata, faqPageJsonLd, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { getEntitySeo, mergeSeoMeta } from '@/lib/cms/entitySeoService';
import { listPublicFaqs } from '@/lib/cms/faqService';
import { getArticleTypeSnapshot } from '@/lib/cms/articleTypeRegistry';
import { FaqAccordion } from '@/components/FaqAccordion';
import { EntityIntro } from '@/components/editorial/EntityIntro';
import { isStaffDraftPreview } from '@/lib/cms/previewGuard';
import { resolveCategoryTemplateSlots } from '@/lib/cms/detailTemplateData';
import { ArticleAppendageSlots } from '@/views/ArticleAppendageSlots';

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 60;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  // Stage 02 (H-02/H-03): one database-aware resolver for both surfaces.
  const identity = await resolveCategoryArchive(slug);
  const seo = identity.categoryId ? await getEntitySeo('CATEGORY', identity.categoryId) : null;
  /**
   * B-01 — a slug that names no category at all must not be indexable.
   *
   * This route accepts any slug, so before this check `/categories/<anything>/`
   * returned HTTP 200 with `index, follow` and a plausible title built from the
   * slug itself: an unlimited supply of thin, indexable soft-404s. Every other
   * unknown-entity route already emits `noindex` (articles, disciplines,
   * venues, competitors), and the route index in `seo/routeIndex` has always
   * modelled an unknown category slug as `not-found` — the runtime was the only
   * thing that disagreed.
   *
   * KNOWN means EITHER of two things, and both must keep working:
   *   - `meta`   — one of the five canonical sections from `config/routes.ts`;
   *   - `catRow` — a managed `Category` row, which may not be a canonical
   *                section. Those archives are legitimate and stay indexable
   *                (`tests/seo-routes.test.ts` fixes this as `other-cat`).
   *
   * Only when NEITHER resolves is the slug genuinely unknown. The HTTP status
   * is deliberately left at 200, matching the other unknown-entity routes;
   * `derivedNoindex` yields `noindex, nofollow` through `mergeSeoMeta`, and a
   * stored editor `noindex` still combines on top of it.
   */
  const unknownCategory = !identity.known;
  return buildMetadata(mergeSeoMeta(seo, {
    title: `${identity.name} Archive — Editorial Dispatches`,
    description: identity.description || `Explore comprehensive articles, analysis, and spectator intelligence for ${identity.name}.`,
    path: `/categories/${slug}/`,
    derivedNoindex: unknownCategory,
  }));
}

export default async function CategoryPage({ params }: Params) {
  const { slug } = await params;
  const identity = await resolveCategoryArchive(slug);
  /**
   * Stage 02 — article selection is unchanged in substance: a canonical section
   * still selects by its `categoryKey`, and everything else by the slug. The
   * resolver merely supplies the key instead of the page re-deriving it.
   */
  const articles = identity.sectionKey
    ? await getPublishedArticlesBySection(identity.categoryKey!)
    : await getPublishedArticlesByCategory(slug);
  const categoryName = identity.name;
  const draft = await isStaffDraftPreview();
  const [seo, faqs] = identity.categoryId
    ? await Promise.all([getEntitySeo('CATEGORY', identity.categoryId), listPublicFaqs('CATEGORY', identity.categoryId)])
    : [null, []];
  const appendageSlots = await resolveCategoryTemplateSlots(slug, { draft });
  // Batch 04-E — managed labels for the archive's type filter, resolved here so
  // the client view needs no database access.
  const articleTypes = await getArticleTypeSnapshot();
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
        description={identity.description || undefined}
        sectionPath={identity.sectionKey ? `/categories/${slug}/` : undefined}
        articleTypes={articleTypes}
      />
      {(seo?.intro || faqs.length > 0) && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-10">
          <EntityIntro intro={seo?.intro} />
          <FaqAccordion faqs={faqs} />
        </div>
      )}
      <ArticleAppendageSlots slots={appendageSlots} />
    </>
  );
}
