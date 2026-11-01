import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, breadcrumbJsonLd, faqPageJsonLd, JsonLd } from '@/lib/seo';
import { ROUTES } from '@/config/routes';
import { resolveRodeoEntity, getPublicHubBySlug, getPublicEventBySlug, getAllRodeoSlugs } from '@/lib/rodeoContent';
import { getEntityCommercialAssociations } from '@/lib/monetization/publicMonetization';
import { getEntitySeo, mergeSeoMeta } from '@/lib/cms/entitySeoService';
import { listPublicFaqs } from '@/lib/cms/faqService';
import { RodeoHubView, RodeoEventView } from '@/views/RodeoViews';
import { ViewBeacon } from '@/components/analytics/ViewBeacon';

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateStaticParams() {
  const { hubs, events } = await getAllRodeoSlugs();
  return Array.from(new Set([...hubs, ...events])).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const r = await resolveRodeoEntity(slug);
  if (!r) return buildMetadata({ title: 'Rodeo Page Unavailable', description: 'This rodeo page is unavailable.', path: `/rodeo-events/${slug}/`, noindex: true });
  if (r.kind === 'event') {
    const e = await getPublicEventBySlug(slug);
    if (!e) return buildMetadata({ title: 'Rodeo Event Unavailable', description: '', path: `/rodeo-events/${slug}/`, noindex: true });
    const seo = await getEntitySeo('RODEO_EVENT', e.id);
    return buildMetadata(mergeSeoMeta(seo, { title: `${e.name}${e.location ? ` — ${e.location}` : ''}`, description: e.description || `${e.name}: recurring rodeo event coverage, editions and verified details from NFRGuide.`, path: ROUTES.RODEO_EVENT(e.slug), derivedNoindex: !e.indexable }));
  }
  const h = await getPublicHubBySlug(slug);
  if (!h) return buildMetadata({ title: 'Rodeo Hub Unavailable', description: '', path: `/rodeo-events/${slug}/`, noindex: true });
  const seo = await getEntitySeo('RODEO_HUB', h.id);
  return buildMetadata(mergeSeoMeta(seo, { title: `${h.title}${h.region ? ` — ${h.region}` : ''}`, description: h.description || `${h.title}: rodeo hub coverage and associated events from NFRGuide.`, path: ROUTES.RODEO_HUB(h.slug), derivedNoindex: !h.indexable }));
}

export default async function Page({ params }: Params) {
  const { slug } = await params;
  const r = await resolveRodeoEntity(slug);
  if (!r) notFound();

  if (r.kind === 'event') {
    const e = await getPublicEventBySlug(slug);
    if (!e) notFound();
    const [associations, seo, faqs] = await Promise.all([
      getEntityCommercialAssociations('RODEO_EVENT', e.id),
      getEntitySeo('RODEO_EVENT', e.id),
      listPublicFaqs('RODEO_EVENT', e.id),
    ]);
    const crumb = breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Rodeo Events', path: ROUTES.MORE_RODEO }, { name: e.name, path: ROUTES.RODEO_EVENT(e.slug) }]);
    const faqLd = faqPageJsonLd(faqs);
    return (
      <>
        <JsonLd data={faqLd ? [crumb, faqLd] : crumb} />
        <RodeoEventView event={e} associations={associations} extras={{ intro: seo?.intro, faqs }} />
        <ViewBeacon entityType="RODEO_EVENT" entityId={e.id} path={ROUTES.RODEO_EVENT(e.slug)} />
      </>
    );
  }

  const h = await getPublicHubBySlug(slug);
  if (!h) notFound();
  const [seo, faqs] = await Promise.all([getEntitySeo('RODEO_HUB', h.id), listPublicFaqs('RODEO_HUB', h.id)]);
  const crumb = breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Rodeo Events', path: ROUTES.MORE_RODEO }, { name: h.title, path: ROUTES.RODEO_HUB(h.slug) }]);
  const faqLd = faqPageJsonLd(faqs);
  return (
    <>
      <JsonLd data={faqLd ? [crumb, faqLd] : crumb} />
      <RodeoHubView hub={h} extras={{ intro: seo?.intro, faqs }} />
      <ViewBeacon entityType="RODEO_HUB" entityId={h.id} path={ROUTES.RODEO_HUB(h.slug)} />
    </>
  );
}
