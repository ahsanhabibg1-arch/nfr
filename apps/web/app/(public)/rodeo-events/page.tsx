import type { Metadata } from 'next';
import { JsonLd, breadcrumbJsonLd, buildMetadata } from '@/lib/seo';
import { SectionLandingView } from '@/views/SectionLandingView';
import { RodeoDirectory } from '@/views/RodeoViews';
import { ViewBeacon } from '@/components/analytics/ViewBeacon';
import { getSectionMeta } from '@/lib/content';
import { listPublicHubs, listPublicEvents } from '@/lib/rodeoContent';
import { getEntitySeo } from '@/lib/cms/entitySeoService';
import { sectionMetadataInput, sectionSeoEntityId } from '@/lib/seo/sectionMeta';
import { isStaffDraftPreview } from '@/lib/cms/previewGuard';

/**
 * Rodeo Events section landing (Batch 10). A dedicated static page replaces the
 * generic [section] handler for `/rodeo-events/` so it can list the DB-backed hubs and
 * recurring events beneath the existing editorial section content.
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const meta = (await getSectionMeta('rodeo-events'))!;
  // Batch S2: EntitySeo(SECTION, 'rodeo-events') search overrides on top of the SectionConfig-derived defaults.
  const seo = await getEntitySeo('SECTION', sectionSeoEntityId(meta));
  return buildMetadata(sectionMetadataInput(meta, seo));
}

export default async function Page() {
  const meta = (await getSectionMeta('rodeo-events'))!;
  const [hubs, events, draft] = await Promise.all([listPublicHubs(), listPublicEvents(), isStaffDraftPreview()]);
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: meta.name, path: meta.path }])} />
      <SectionLandingView sectionKey="rodeo-events" draft={draft} />
      <RodeoDirectory hubs={hubs} events={events} />
      <ViewBeacon entityType="SECTION" entityId="rodeo-events" path={meta.path} />
    </>
  );
}
