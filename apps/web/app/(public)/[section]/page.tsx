import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionLandingView } from '@/views/SectionLandingView';
import { getSectionMeta, getAllSectionKeys } from '@/lib/content';
import { buildMetadata, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { ViewBeacon } from '@/components/analytics/ViewBeacon';
import { getEntitySeo } from '@/lib/cms/entitySeoService';
import { sectionMetadataInput, sectionSeoEntityId } from '@/lib/seo/sectionMeta';
import { isStaffDraftPreview } from '@/lib/cms/previewGuard';

type Params = { params: Promise<{ section: string }> };

// Only the five approved primary sections are valid; anything else 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  // `rodeo-events` is served by its own static route (app/(public)/rodeo-events/)
  // so it can list DB hubs/events; exclude it here to avoid a duplicate path.
  return getAllSectionKeys()
    .filter((section) => section !== 'rodeo-events')
    .map((section) => ({ section }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { section } = await params;
  const meta = await getSectionMeta(section);
  if (!meta) return {};
  // Batch S2: EntitySeo(SECTION) search overrides on top of the SectionConfig-derived defaults.
  const seo = await getEntitySeo('SECTION', sectionSeoEntityId(meta));
  return buildMetadata(sectionMetadataInput(meta, seo));
}

export default async function SectionPage({ params }: Params) {
  const { section } = await params;
  const meta = await getSectionMeta(section);
  if (!meta) notFound();
  const draft = await isStaffDraftPreview();

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
