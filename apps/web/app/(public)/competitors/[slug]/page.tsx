import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicCompetitorBySlug, getAllCompetitorSlugs, competitorHometown } from '@/lib/batch12Content';
import { buildMetadata, competitorJsonLd, breadcrumbJsonLd, faqPageJsonLd, JsonLd } from '@/lib/seo';
import { ROUTES } from '@/config/routes';
import { getEntitySeo, mergeSeoMeta } from '@/lib/cms/entitySeoService';
import { listPublicFaqs } from '@/lib/cms/faqService';
import { EntityIntro } from '@/components/editorial/EntityIntro';
import { FaqAccordion } from '@/components/FaqAccordion';
import { isStaffDraftPreview } from '@/lib/cms/previewGuard';
import { resolveCompetitorTemplateSlots } from '@/lib/cms/detailTemplateData';
import { ArticleAppendageSlots } from '@/views/ArticleAppendageSlots';

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getAllCompetitorSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const c = await getPublicCompetitorBySlug(slug);
  if (!c) {
    return buildMetadata({ title: 'Competitor Not Found', description: 'Rodeo competitor profile.', path: ROUTES.COMPETITOR(slug), noindex: true });
  }
  const seo = await getEntitySeo('COMPETITOR', c.id);
  const disc = c.disciplines.map((d) => d.name).join(', ');
  return buildMetadata(mergeSeoMeta(seo, {
    title: c.fullName,
    description: c.summary || `${c.fullName}${disc ? ` — ${disc}` : ''} rodeo competitor coverage on NFRGuide.`,
    path: ROUTES.COMPETITOR(c.slug),
    image: c.heroImage ?? undefined,
    derivedNoindex: !c.indexable,
  }));
}

export default async function CompetitorPage({ params }: Params) {
  const { slug } = await params;
  const c = await getPublicCompetitorBySlug(slug);
  if (!c) notFound();
  const draft = await isStaffDraftPreview();
  const [seo, faqs, appendageSlots] = await Promise.all([
    getEntitySeo('COMPETITOR', c.id),
    listPublicFaqs('COMPETITOR', c.id),
    resolveCompetitorTemplateSlots(c.id, { draft }),
  ]);
  const faqLd = faqPageJsonLd(faqs);
  const hometown = competitorHometown(c);

  return (
    <>
      <JsonLd
        data={[
          competitorJsonLd({ name: c.fullName, url: ROUTES.COMPETITOR(c.slug), description: c.summary, image: c.heroImage, disciplines: c.disciplines.map((d) => d.name), hometown }),
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Competitors', path: '/competitors/' }, { name: c.fullName, path: ROUTES.COMPETITOR(c.slug) }]),
          ...(faqLd ? [faqLd] : []),
        ]}
      />
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <header className="mb-6">
          <Link href="/competitors/" className="text-[11px] font-mono text-[#8B5E3C] hover:underline">← All competitors</Link>
          <p className="text-[11px] font-mono uppercase tracking-wider text-stone-500 mt-2">Rodeo Competitor{c.status ? ` · ${c.status}` : ''}</p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 mt-1">{c.fullName}</h1>
          {c.knownAs && <p className="text-stone-500 italic mt-1">“{c.knownAs}”</p>}
          {hometown && <p className="text-sm text-stone-600 mt-2">{hometown}</p>}
        </header>

        {c.heroImage && (
          <figure className="mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.heroImage} alt={c.fullName} className="w-full rounded-xs object-cover" />
            {c.imageCredit && <figcaption className="text-[11px] text-stone-400 mt-1">{c.imageCredit}</figcaption>}
          </figure>
        )}

        {c.summary && <p className="text-lg text-stone-700 leading-relaxed mb-6">{c.summary}</p>}

        {c.disciplines.length > 0 && (
          <section className="mb-8">
            <h2 className="font-serif text-xl font-bold text-stone-900 mb-3">Disciplines</h2>
            <div className="flex flex-wrap gap-2">
              {c.disciplines.map((d) => (
                <Link key={d.slug} href={ROUTES.DISCIPLINE(d.slug)} className="px-3 py-1 text-xs font-mono bg-stone-100 text-stone-700 rounded-xs hover:bg-stone-200">{d.name}</Link>
              ))}
            </div>
          </section>
        )}

        {c.participations.length > 0 && (
          <section className="mb-8">
            <h2 className="font-serif text-xl font-bold text-stone-900 mb-3">Event participation</h2>
            <ul className="divide-y divide-stone-200">
              {c.participations.map((p) => (
                <li key={`${p.eventSlug}-${p.editionSlug}`} className="py-2.5">
                  <Link href={ROUTES.RODEO_EDITION(p.eventSlug, p.editionSlug)} className="text-stone-900 hover:text-[#8B5E3C] font-medium">{p.eventName} — {p.editionLabel}{p.year ? ` (${p.year})` : ''}</Link>
                  {(p.placement != null || p.result) && (
                    <p className="text-sm text-stone-600">{p.placement != null ? `Placement: ${p.placement}` : ''}{p.placement != null && p.result ? ' · ' : ''}{p.result ?? ''}</p>
                  )}
                  {p.note && <p className="text-xs text-stone-500">{p.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {c.articles.length > 0 && (
          <section className="mb-8">
            <h2 className="font-serif text-xl font-bold text-stone-900 mb-3">Related coverage</h2>
            <ul className="divide-y divide-stone-200">
              {c.articles.map((a) => (
                <li key={a.slug} className="py-2.5">
                  <Link href={ROUTES.ARTICLE(a.slug)} className="text-stone-900 hover:text-[#8B5E3C] font-medium">{a.title}</Link>
                  {a.deck && <p className="text-sm text-stone-600 line-clamp-2">{a.deck}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(seo?.intro || faqs.length > 0) && (
          <div className="pt-2">
            <EntityIntro intro={seo?.intro} />
            <FaqAccordion faqs={faqs} />
          </div>
        )}
      </article>
      <ArticleAppendageSlots slots={appendageSlots} />
    </>
  );
}
