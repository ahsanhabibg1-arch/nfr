import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionLandingView } from '@/views/SectionLandingView';
import { SubcategoryArchiveView } from '@/views/SubcategoryArchiveView';
import { getSectionMeta, getAllSectionKeys } from '@/lib/content';
import { getSubcategoryBySlug, getAllSubcategorySlugs } from '@/lib/cms/subcategoryContent';
import { buildMetadata, breadcrumbJsonLd, faqPageJsonLd, JsonLd } from '@/lib/seo';
import { ViewBeacon } from '@/components/analytics/ViewBeacon';
import { getEntitySeo, mergeSeoMeta } from '@/lib/cms/entitySeoService';
import { listPublicFaqs } from '@/lib/cms/faqService';
import { EntityIntro } from '@/components/editorial/EntityIntro';
import { FaqAccordion } from '@/components/FaqAccordion';
import { sectionMetadataInput, sectionSeoEntityId } from '@/lib/seo/sectionMeta';
import { isStaffDraftPreview } from '@/lib/cms/previewGuard';
import { ROUTES } from '@/config/routes';

type Params = { params: Promise<{ section: string }> };

/**
 * ONE depth-1 route serving TWO kinds of page.
 *
 * The owner chose a flat subcategory URL — `/cowboy-christmas/` — which puts a
 * subcategory archive at the same depth as a primary section. Next.js allows
 * only one dynamic segment per level, so `[section]` and a would-be
 * `[subcategory]` cannot coexist as sibling routes; they have to be the same
 * route, resolved here.
 *
 * Order matters and is not arbitrary: a PRIMARY SECTION always wins. A section
 * slug is part of the site's permanent structure, while a subcategory slug is
 * operator-entered, so if the two ever collided the section must keep its page.
 * `RESERVED_SUBCATEGORY_SLUGS` stops that collision at write time, which makes
 * this ordering a second line of defence rather than the only one.
 */
export const revalidate = 300;

/**
 * `false` previously, because only five slugs were ever valid. A subcategory is
 * created by an operator in the Admin and must work without a redeploy, so
 * unknown params are now resolved at request time and 404 if nothing matches.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  // `rodeo-events` is served by its own static route (app/(public)/rodeo-events/)
  // so it can list DB hubs/events; exclude it here to avoid a duplicate path.
  const sections = getAllSectionKeys().filter((section) => section !== 'rodeo-events');
  const subcategories = await getAllSubcategorySlugs();
  return [...sections, ...subcategories].map((section) => ({ section }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { section } = await params;

  const meta = await getSectionMeta(section);
  if (meta) {
    // Batch S2: EntitySeo(SECTION) search overrides on top of the SectionConfig-derived defaults.
    const seo = await getEntitySeo('SECTION', sectionSeoEntityId(meta));
    return buildMetadata(sectionMetadataInput(meta, seo));
  }

  const sub = await getSubcategoryBySlug(section);
  if (!sub) return {};
  const seo = await getEntitySeo('SUBCATEGORY', sub.id);
  return buildMetadata(mergeSeoMeta(seo, {
    title: `${sub.name} — ${sub.section.name}`,
    description:
      sub.summary || sub.description ||
      `Published ${sub.name.toLowerCase()} coverage from NFRGuide's ${sub.section.name} desk.`,
    path: ROUTES.SUBCATEGORY(sub.slug),
    image: sub.image ?? undefined,
    /**
     * A thin or archived archive stays reachable but is not offered to search.
     * `indexable` carries both rules; see `subcategoryContent.ts` for why an
     * archive holding one or two articles is a liability rather than an asset.
     */
    derivedNoindex: !sub.indexable,
  }));
}

export default async function SectionOrSubcategoryPage({ params }: Params) {
  const { section } = await params;
  const draft = await isStaffDraftPreview();

  const meta = await getSectionMeta(section);
  if (meta) {
    return (
      <>
        <JsonLd
          data={breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: meta.name, path: meta.path },
          ])}
        />
        <SectionLandingView sectionKey={section} draft={draft} />
        <ViewBeacon entityType="SECTION" entityId={section} path={meta.path} />
      </>
    );
  }

  const sub = await getSubcategoryBySlug(section);
  if (!sub) notFound();

  const [seo, faqs] = await Promise.all([
    getEntitySeo('SUBCATEGORY', sub.id),
    listPublicFaqs('SUBCATEGORY', sub.id),
  ]);
  const faqLd = faqPageJsonLd(faqs);
  /**
   * The section IS in the structured trail even though it is not in the URL.
   * Breadcrumb markup describes where a page sits in the site, not how its path
   * is spelled, and the flat URL would otherwise hide the hierarchy entirely.
   */
  const crumb = breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: sub.section.name, path: sub.section.path },
    { name: sub.name, path: ROUTES.SUBCATEGORY(sub.slug) },
  ]);

  return (
    <>
      <JsonLd data={faqLd ? [crumb, faqLd] : crumb} />
      <SubcategoryArchiveView sub={sub} />
      {(seo?.intro || faqs.length > 0) && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-10">
          <EntityIntro intro={seo?.intro} />
          <FaqAccordion faqs={faqs} />
        </div>
      )}
      <ViewBeacon entityType="SUBCATEGORY" entityId={sub.id} path={ROUTES.SUBCATEGORY(sub.slug)} />
    </>
  );
}
