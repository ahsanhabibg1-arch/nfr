import type { Metadata } from 'next';
import { notFound, redirect, permanentRedirect } from 'next/navigation';
import { buildMetadata, breadcrumbJsonLd, rodeoEditionJsonLd, faqPageJsonLd, JsonLd, SITE_URL } from '@/lib/seo';
import { ROUTES, PRIMARY_SECTIONS } from '@/config/routes';
import { getPublicEditionBySlug, getAllRodeoSlugs } from '@/lib/rodeoContent';
import { getEntityCommercialAssociations } from '@/lib/monetization/publicMonetization';
import { getEntitySeo, mergeSeoMeta } from '@/lib/cms/entitySeoService';
import { listPublicFaqs } from '@/lib/cms/faqService';
import { RodeoEditionView } from '@/views/RodeoViews';
import { ViewBeacon } from '@/components/analytics/ViewBeacon';
import { CoverageNav } from '@/components/editorial/CoverageNav';
import { editionCoverageSummary } from '@/lib/cms/competitionService';
import { isStaffDraftPreview } from '@/lib/cms/previewGuard';
import { resolveRodeoEditionTemplateSlots } from '@/lib/cms/detailTemplateData';
import { ArticleAppendageSlots } from '@/views/ArticleAppendageSlots';
import { resolveRodeoRedirect } from '@/lib/cms/rodeoSlugs';

/**
 * QA fix: the breadcrumb name for `/rodeo-events/` is taken from the section
 * config instead of a local literal.
 *
 * Three breadcrumb trails hardcoded `'Rodeo Events'` for `ROUTES.MORE_RODEO`,
 * while the page that actually lives at that URL renders its own h1, title and
 * breadcrumb as "More Rodeo" from `PRIMARY_SECTIONS['rodeo-events'].name`. So
 * one URL was published under two different names in BreadcrumbList structured
 * data, and neither matched what the visitor saw on the destination page.
 * `config/routes.ts` is the single source for a section's name.
 */
const MORE_RODEO_NAME = PRIMARY_SECTIONS['rodeo-events'].name;


type Params = { params: Promise<{ slug: string; edition: string }> };

export const revalidate = 300;

export async function generateStaticParams() {
  const { editions } = await getAllRodeoSlugs();
  return editions.map((e) => ({ slug: e.eventSlug, edition: e.editionSlug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, edition } = await params;
  const ed = await getPublicEditionBySlug(slug, edition);
  if (!ed) return buildMetadata({ title: 'Edition Unavailable', description: 'This rodeo edition is unavailable.', path: `/rodeo-events/${slug}/${edition}/`, noindex: true });
  const desc = `${ed.event.name} ${ed.label}: ${ed.datesKnown ? 'verified dates, ' : ''}venue and coverage from NFRGuide.`;
  const seo = await getEntitySeo('RODEO_EDITION', ed.id);
  return buildMetadata(mergeSeoMeta(seo, { title: `${ed.event.name}: ${ed.label}`, description: desc, path: ROUTES.RODEO_EDITION(ed.event.slug, ed.editionSlug), derivedNoindex: !ed.indexable }));
}

export default async function Page({ params }: Params) {
  const { slug, edition } = await params;
  const ed = await getPublicEditionBySlug(slug, edition);
  /**
   * A renamed edition — or a renamed PARENT EVENT — leaves a permanent redirect
   * for this nested path. Without consulting it the old URL 404s, which is what
   * the owner's custom-slug approval was meant to prevent.
   */
  if (!ed) {
    const moved = await resolveRodeoRedirect(`/rodeo-events/${slug}/${edition}/`);
    if (moved) (moved.permanent ? permanentRedirect : redirect)(moved.destination);
    notFound();
  }
  const draft = await isStaffDraftPreview();
  const [associations, seo, faqs, coverage, appendageSlots] = await Promise.all([
    getEntityCommercialAssociations('RODEO_EDITION', ed.id),
    getEntitySeo('RODEO_EDITION', ed.id),
    listPublicFaqs('RODEO_EDITION', ed.id),
    editionCoverageSummary(ed.id),
    resolveRodeoEditionTemplateSlots(ed.id, { draft }),
  ]);
  const url = `${SITE_URL}${ROUTES.RODEO_EDITION(ed.event.slug, ed.editionSlug)}`;
  const eventLd = rodeoEditionJsonLd({ name: `${ed.event.name}: ${ed.label}`, startAt: ed.startAt, endAt: ed.endAt, url, venue: ed.venue });
  const faqLd = faqPageJsonLd(faqs);
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: MORE_RODEO_NAME, path: ROUTES.MORE_RODEO },
    { name: ed.event.name, path: ROUTES.RODEO_EVENT(ed.event.slug) },
    { name: ed.label, path: ROUTES.RODEO_EDITION(ed.event.slug, ed.editionSlug) },
  ]);
  const ld = [breadcrumb, ...(eventLd ? [eventLd] : []), ...(faqLd ? [faqLd] : [])];
  return (
    <>
      <JsonLd data={ld} />
      {coverage.hasAny && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8">
          <CoverageNav eventSlug={ed.event.slug} editionSlug={ed.editionSlug} active="overview" />
          <p className="text-xs text-stone-500 -mt-4 mb-2">Published coverage: {coverage.sessions} schedule · {coverage.results} results · {coverage.standings} standings.</p>
        </div>
      )}
      <RodeoEditionView edition={ed} associations={associations} extras={{ intro: seo?.intro, faqs }} />
      <ArticleAppendageSlots slots={appendageSlots} />
      <ViewBeacon entityType="RODEO_EDITION" entityId={ed.id} path={ROUTES.RODEO_EDITION(ed.event.slug, ed.editionSlug)} />
    </>
  );
}
