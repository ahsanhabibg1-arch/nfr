import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicEditionBySlug } from '@/lib/rodeoContent';
import { getPublicStandings } from '@/lib/cms/competitionService';
import { buildMetadata, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { ROUTES } from '@/config/routes';
import { CoverageNav } from '@/components/editorial/CoverageNav';

type Params = { params: Promise<{ slug: string; edition: string }> };
export const revalidate = 300;
export const dynamicParams = true;

const CAT_LABEL: Record<string, string> = { ROUND: 'Round', AGGREGATE: 'Aggregate', CHAMPIONSHIP: 'Championship', SEASON: 'Season' };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, edition } = await params;
  const ed = await getPublicEditionBySlug(slug, edition);
  if (!ed) return buildMetadata({ title: 'Standings Not Found', description: 'Rodeo standings.', path: ROUTES.EDITION_STANDINGS(slug, edition), noindex: true });
  const rows = await getPublicStandings(ed.id);
  return buildMetadata({ title: `${ed.event.name} ${ed.label} — Standings`, description: `Source-verified standings and rankings for ${ed.event.name} ${ed.label}.`, path: ROUTES.EDITION_STANDINGS(ed.event.slug, ed.editionSlug), noindex: rows.length === 0 });
}

export default async function StandingsPage({ params }: Params) {
  const { slug, edition } = await params;
  const ed = await getPublicEditionBySlug(slug, edition);
  if (!ed) notFound();
  const standings = await getPublicStandings(ed.id);
  // Group by category, then discipline — never mix categories.
  const groups = new Map<string, typeof standings>();
  for (const s of standings) { const k = `${s.category}|${s.discipline ?? 'All'}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(s); }

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: ed.event.name, path: ROUTES.RODEO_EVENT(ed.event.slug) }, { name: ed.label, path: ROUTES.RODEO_EDITION(ed.event.slug, ed.editionSlug) }, { name: 'Standings', path: ROUTES.EDITION_STANDINGS(ed.event.slug, ed.editionSlug) }])]} />
      <header className="mb-2"><p className="text-[11px] font-mono uppercase tracking-wider text-stone-500">{ed.event.name}</p><h1 className="font-serif text-3xl font-bold text-stone-900">{ed.label} — Standings</h1></header>
      <CoverageNav eventSlug={ed.event.slug} editionSlug={ed.editionSlug} active="standings" />
      {standings.length === 0 ? (
        <p className="text-stone-500 text-sm bg-stone-50 border border-stone-200 rounded-xs p-6">No verified standings have been published for this edition yet. Standings are editorially managed from official sources.</p>
      ) : (
        [...groups.entries()].map(([k, rows]) => {
          const [cat, disc] = k.split('|');
          return (
            <section key={k} className="mb-7">
              <h2 className="font-serif text-lg font-bold text-stone-900 mb-2">{CAT_LABEL[cat] || cat}{disc !== 'All' ? ` — ${disc}` : ''}</h2>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="text-[11px] font-mono uppercase text-stone-500"><tr><th className="text-left py-1 pr-2">Rank</th><th className="text-left py-1 pr-2">Competitor</th><th className="text-left py-1 pr-2">Value</th><th className="text-left py-1 pr-2">Earnings</th><th className="text-left py-1">Source</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map((s) => (
                    <tr key={s.id}><td className="py-1.5 pr-2 text-stone-500">{s.rankPosition ?? '—'}</td>
                      <td className="py-1.5 pr-2"><Link href={ROUTES.COMPETITOR(s.competitorSlug)} className="text-stone-900 hover:text-[#8B5E3C]">{s.competitor}</Link></td>
                      <td className="py-1.5 pr-2 tabular-nums text-stone-700">{s.aggregateValue ?? s.points ?? '—'}</td>
                      <td className="py-1.5 pr-2 tabular-nums text-stone-700">{s.earnings ? `$${s.earnings}` : '—'}</td>
                      <td className="py-1.5 text-[11px]">{s.sourceUrl ? <a href={s.sourceUrl} target="_blank" rel="noreferrer nofollow" className="text-[#8B5E3C] underline">source ↗</a> : <span className="text-stone-400">—</span>}</td></tr>
                  ))}
                </tbody>
              </table></div>
            </section>
          );
        })
      )}
    </article>
  );
}
