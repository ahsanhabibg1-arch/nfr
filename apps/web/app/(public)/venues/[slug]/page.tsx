import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicVenueBySlug, getAllVenueSlugs } from '@/lib/batch12Content';
import { buildMetadata, venueJsonLd, breadcrumbJsonLd, faqPageJsonLd, JsonLd } from '@/lib/seo';
import { ROUTES } from '@/config/routes';
import { getEntitySeo, mergeSeoMeta } from '@/lib/cms/entitySeoService';
import { listPublicFaqs } from '@/lib/cms/faqService';
import { EntityIntro } from '@/components/editorial/EntityIntro';
import { FaqAccordion } from '@/components/FaqAccordion';

type Params = { params: Promise<{ slug: string }> };

export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await getAllVenueSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const v = await getPublicVenueBySlug(slug);
  if (!v) {
    return buildMetadata({ title: 'Venue Not Found', description: 'Rodeo venue information.', path: ROUTES.VENUE(slug), noindex: true });
  }
  const seo = await getEntitySeo('VENUE', v.id);
  const place = [v.city, v.state, v.country].filter(Boolean).join(', ');
  return buildMetadata(mergeSeoMeta(seo, {
    title: v.name,
    description: v.summary || v.description?.slice(0, 160) || `${v.name}${place ? ` in ${place}` : ''} — rodeo venue coverage on NFRGuide.`,
    path: ROUTES.VENUE(v.slug),
    derivedNoindex: !v.indexable,
  }));
}

export default async function VenuePage({ params }: Params) {
  const { slug } = await params;
  const v = await getPublicVenueBySlug(slug);
  if (!v) notFound();
  const [seo, faqs] = await Promise.all([getEntitySeo('VENUE', v.id), listPublicFaqs('VENUE', v.id)]);
  const faqLd = faqPageJsonLd(faqs);
  const place = [v.city, v.state, v.country].filter(Boolean).join(', ');

  return (
    <>
      <JsonLd
        data={[
          venueJsonLd({ name: v.name, url: `${ROUTES.VENUE(v.slug)}`, description: v.summary || v.description, city: v.city, state: v.state, country: v.country, latitude: v.latitude, longitude: v.longitude, capacity: v.capacity }),
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Rodeo Venues', path: '/venues/' }, { name: v.name, path: ROUTES.VENUE(v.slug) }]),
          ...(faqLd ? [faqLd] : []),
        ]}
      />
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <header className="mb-6">
          <p className="text-[11px] font-mono uppercase tracking-wider text-stone-500">Rodeo Venue</p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 mt-1">{v.name}</h1>
          {v.nickname && <p className="text-stone-500 italic mt-1">“{v.nickname}”</p>}
          {place && <p className="text-sm text-stone-600 mt-2">{place}</p>}
        </header>

        {v.summary && <p className="text-lg text-stone-700 leading-relaxed mb-6">{v.summary}</p>}

        {(v.capacity || v.openedYear || v.websiteUrl) && (
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8 text-sm">
            {v.capacity != null && (<div><dt className="text-[11px] font-mono uppercase text-stone-500">Capacity</dt><dd className="text-stone-900 font-semibold">{v.capacity.toLocaleString('en-US')}</dd></div>)}
            {v.openedYear != null && (<div><dt className="text-[11px] font-mono uppercase text-stone-500">Opened</dt><dd className="text-stone-900 font-semibold">{v.openedYear}</dd></div>)}
            {v.websiteUrl && (<div><dt className="text-[11px] font-mono uppercase text-stone-500">Official site</dt><dd><a href={v.websiteUrl} target="_blank" rel="noreferrer nofollow" className="text-[#8B5E3C] underline break-all">Website ↗</a></dd></div>)}
          </dl>
        )}

        {v.description && <div className="prose prose-stone max-w-none mb-8 whitespace-pre-line">{v.description}</div>}

        {v.editions.length > 0 && (
          <section className="mb-8">
            <h2 className="font-serif text-xl font-bold text-stone-900 mb-3">Events held here</h2>
            <ul className="divide-y divide-stone-200">
              {v.editions.map((e) => (
                <li key={`${e.eventSlug}-${e.editionSlug}`} className="py-2.5">
                  <Link href={ROUTES.RODEO_EDITION(e.eventSlug, e.editionSlug)} className="text-stone-900 hover:text-[#8B5E3C] font-medium">{e.eventName} — {e.label}{e.year ? ` (${e.year})` : ''}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {v.articles.length > 0 && (
          <section className="mb-8">
            <h2 className="font-serif text-xl font-bold text-stone-900 mb-3">Related coverage</h2>
            <ul className="divide-y divide-stone-200">
              {v.articles.map((a) => (
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
    </>
  );
}
