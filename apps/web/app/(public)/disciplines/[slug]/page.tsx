import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DisciplineGuideView } from '@/views/DisciplineGuideView';
import { getDisciplineBySlug, getAllDisciplines } from '@/lib/content';
import { buildMetadata, disciplineJsonLd, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { ROUTES } from '@/config/routes';
import { ViewBeacon } from '@/components/analytics/ViewBeacon';

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getAllDisciplines()).map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const d = await getDisciplineBySlug(slug);
  if (!d) {
    return buildMetadata({
      title: 'Discipline Not Found',
      description:
        'Comprehensive rules, scoring breakdown, and competition mechanics for the National Finals Rodeo.',
      path: `/disciplines/${slug}/`,
      noindex: true,
    });
  }
  return buildMetadata({
    title: `${d.name} Guide`,
    description: d.summary,
    path: ROUTES.DISCIPLINE(d.slug),
    image: d.image,
  });
}

export default async function DisciplinePage({ params }: Params) {
  const { slug } = await params;
  const d = await getDisciplineBySlug(slug);
  if (!d) notFound();

  return (
    <>
      <JsonLd
        data={[
          disciplineJsonLd(d),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'NFR Competition', path: ROUTES.COMPETITION },
            { name: d.name, path: ROUTES.DISCIPLINE(d.slug) },
          ]),
        ]}
      />
      <DisciplineGuideView slug={slug} />
      <ViewBeacon entityType="DISCIPLINE" entityId={d.id} path={ROUTES.DISCIPLINE(d.slug)} />
    </>
  );
}
