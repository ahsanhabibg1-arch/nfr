import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, breadcrumbJsonLd, rodeoEditionJsonLd, JsonLd, SITE_URL } from '@/lib/seo';
import { ROUTES } from '@/config/routes';
import { getPublicEditionBySlug, getAllRodeoSlugs } from '@/lib/rodeoContent';
import { getEntityCommercialAssociations } from '@/lib/monetization/publicMonetization';
import { RodeoEditionView } from '@/views/RodeoViews';
import { ViewBeacon } from '@/components/analytics/ViewBeacon';

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
  return buildMetadata({ title: `${ed.event.name}: ${ed.label}`, description: desc, path: ROUTES.RODEO_EDITION(ed.event.slug, ed.editionSlug) });
}

export default async function Page({ params }: Params) {
  const { slug, edition } = await params;
  const ed = await getPublicEditionBySlug(slug, edition);
  if (!ed) notFound();
  const associations = await getEntityCommercialAssociations('RODEO_EDITION', ed.id);
  const url = `${SITE_URL}${ROUTES.RODEO_EDITION(ed.event.slug, ed.editionSlug)}`;
  const eventLd = rodeoEditionJsonLd({ name: `${ed.event.name}: ${ed.label}`, startAt: ed.startAt, endAt: ed.endAt, url, venue: ed.venue });
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Rodeo Events', path: ROUTES.MORE_RODEO },
    { name: ed.event.name, path: ROUTES.RODEO_EVENT(ed.event.slug) },
    { name: ed.label, path: ROUTES.RODEO_EDITION(ed.event.slug, ed.editionSlug) },
  ]);
  return (
    <>
      <JsonLd data={eventLd ? [breadcrumb, eventLd] : breadcrumb} />
      <RodeoEditionView edition={ed} associations={associations} />
      <ViewBeacon entityType="RODEO_EDITION" entityId={ed.id} path={ROUTES.RODEO_EDITION(ed.event.slug, ed.editionSlug)} />
    </>
  );
}
