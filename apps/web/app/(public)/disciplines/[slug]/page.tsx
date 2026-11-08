import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DisciplineGuideView } from '@/views/DisciplineGuideView';
import { getDisciplineBySlug, getAllDisciplines } from '@/lib/content';
import { buildMetadata, disciplineJsonLd, breadcrumbJsonLd, faqPageJsonLd, JsonLd } from '@/lib/seo';
import { ROUTES } from '@/config/routes';
import { ViewBeacon } from '@/components/analytics/ViewBeacon';
import { getEntitySeo, mergeSeoMeta } from '@/lib/cms/entitySeoService';
import { listPublicFaqs } from '@/lib/cms/faqService';
import { EntityIntro } from '@/components/editorial/EntityIntro';
import { FaqAccordion } from '@/components/FaqAccordion';
import { isStaffDraftPreview } from '@/lib/cms/previewGuard';
import { resolveDisciplineTemplateSlots } from '@/lib/cms/detailTemplateData';
import { ArticleAppendageSlots } from '@/views/ArticleAppendageSlots';

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
  const seo = await getEntitySeo('DISCIPLINE', d.id);
  return buildMetadata(mergeSeoMeta(seo, {
    title: `${d.name} Guide`,
    description: d.summary,
    path: ROUTES.DISCIPLINE(d.slug),
    image: d.image,
  }));
}

export default async function DisciplinePage({ params }: Params) {
  const { slug } = await params;
  const d = await getDisciplineBySlug(slug);
  if (!d) notFound();
  const draft = await isStaffDraftPreview();
  const [seo, faqs, appendageSlots] = await Promise.all([
    getEntitySeo('DISCIPLINE', d.id),
    listPublicFaqs('DISCIPLINE', d.id),
    resolveDisciplineTemplateSlots(d.id, { draft }),
  ]);
  const faqLd = faqPageJsonLd(faqs);

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
          ...(faqLd ? [faqLd] : []),
        ]}
      />
      <DisciplineGuideView slug={slug} />
      {(seo?.intro || faqs.length > 0) && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-10">
          <EntityIntro intro={seo?.intro} />
          <FaqAccordion faqs={faqs} />
        </div>
      )}
      <ArticleAppendageSlots slots={appendageSlots} />
      <ViewBeacon entityType="DISCIPLINE" entityId={d.id} path={ROUTES.DISCIPLINE(d.slug)} />
    </>
  );
}
