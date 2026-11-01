import type { Metadata } from 'next';
import { JsonLd, breadcrumbJsonLd, buildMetadata } from '@/lib/seo';
import { SectionLandingView } from '@/views/SectionLandingView';
import { RodeoDirectory } from '@/views/RodeoViews';
import { ViewBeacon } from '@/components/analytics/ViewBeacon';
import { getSectionMeta } from '@/lib/content';
import { listPublicHubs, listPublicEvents } from '@/lib/rodeoContent';

/**
 * Rodeo Events section landing (Batch 10). A dedicated static page replaces the
 * generic [section] handler for `/rodeo-events/` so it can list the DB-backed hubs and
 * recurring events beneath the existing editorial section content.
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const meta = getSectionMeta('rodeo-events')!;
  return buildMetadata({ title: `${meta.name} — Coverage & Guides`, description: meta.description, path: meta.path });
}

export default async function Page() {
  const meta = getSectionMeta('rodeo-events')!;
  const [hubs, events] = await Promise.all([listPublicHubs(), listPublicEvents()]);
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: meta.name, path: meta.path }])} />
      <SectionLandingView sectionKey="rodeo-events" />
      <RodeoDirectory hubs={hubs} events={events} />
      <ViewBeacon entityType="SECTION" entityId="rodeo-events" path={meta.path} />
    </>
  );
}
