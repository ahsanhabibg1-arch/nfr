import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionLandingView } from '@/views/SectionLandingView';
import { getSectionMeta, getAllSectionKeys } from '@/lib/content';
import { buildMetadata, breadcrumbJsonLd, JsonLd } from '@/lib/seo';

type Params = { params: Promise<{ section: string }> };

// Only the five approved primary sections are valid; anything else 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllSectionKeys().map((section) => ({ section }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { section } = await params;
  const meta = getSectionMeta(section);
  if (!meta) return {};
  return buildMetadata({
    title: `${meta.name} — Coverage & Guides`,
    description: meta.description,
    path: meta.path,
  });
}

export default async function SectionPage({ params }: Params) {
  const { section } = await params;
  const meta = getSectionMeta(section);
  if (!meta) notFound();

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: meta.name, path: meta.path },
        ])}
      />
      <SectionLandingView sectionKey={section} />
    </>
  );
}
