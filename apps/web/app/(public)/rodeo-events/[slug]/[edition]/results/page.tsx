import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicEditionBySlug } from '@/lib/rodeoContent';
import { getPublicResults } from '@/lib/cms/competitionService';
import { buildMetadata, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { ROUTES } from '@/config/routes';
import { CoverageNav } from '@/components/editorial/CoverageNav';

type Params = { params: Promise<{ slug: string; edition: string }> };
export const revalidate = 300;
export const dynamicParams = true;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, edition } = await params;
  const ed = await getPublicEditionBySlug(slug, edition);
  if (!ed) return buildMetadata({ title: 'Results Not Found', description: 'Rodeo results.', path: ROUTES.EDITION_RESULTS(slug, edition), noindex: true });
  const rows = await getPublicResults(ed.id);
  return buildMetadata({ title: `${ed.event.name} ${ed.label} — Results`, description: `Source-verified results for ${ed.event.name} ${ed.label}.`, path: ROUTES.EDITION_RESULTS(ed.event.slug, ed.editionSlug), noindex: rows.length === 0 });
}

function val(r: { resultType: string; timeSeconds: string | null; scoreNumeric: string | null }): string {
  if (r.resultType === 'TIME') return r.timeSeconds ? `${r.timeSeconds}s` : '—';
  if (r.resultType === 'SCORE') return r.scoreNumeric ? `${r.scoreNumeric} pts` : '—';
  return r.resultType.replace('_', ' ').toLowerCase();
}

export default async function ResultsPage({ params }: Params) {
  const { slug, edition } = await params;
  const ed = await getPublicEditionBySlug(slug, edition);
  if (!ed) notFound();
  const results = await getPublicResults(ed.id);
  const byDiscipline = new Map<string, typeof results>();
  for (const r of results) { const k = r.discipline; if (!byDiscipline.has(k)) byDiscipline.set(k, []); byDiscipline.get(k)!.push(r); }

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: ed.event.name, path: ROUTES.RODEO_EVENT(ed.event.slug) }, { name: ed.label, path: ROUTES.RODEO_EDITION(ed.event.slug, ed.editionSlug) }, { name: 'Results', path: ROUTES.EDITION_RESULTS(ed.event.slug, ed.editionSlug) }])]} />
      <header className="mb-2"><p className="text-[11px] font-mono uppercase tracking-wider text-stone-500">{ed.event.name}</p><h1 className="font-serif text-3xl font-bold text-stone-900">{ed.label} — Results</h1></header>
      <CoverageNav eventSlug={ed.event.slug} editionSlug={ed.editionSlug} active="results" />
      {results.length === 0 ? (
        <p className="text-stone-500 text-sm bg-stone-50 border border-stone-200 rounded-xs p-6">No verified results have been published for this edition yet.</p>
      ) : (
        [...byDiscipline.entries()].map(([disc, rows]) => (
          <section key={disc} className="mb-7">
            <h2 className="font-serif text-lg font-bold text-stone-900 mb-2">{disc}</h2>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-[11px] font-mono uppercase text-stone-500"><tr><th className="text-left py-1 pr-2">#</th><th className="text-left py-1 pr-2">Competitor</th><th className="text-left py-1 pr-2">Result</th><th className="text-left py-1">Source</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((r) => (
                  <tr key={r.id}><td className="py-1.5 pr-2 text-stone-500">{r.placement ?? '—'}{r.isTie ? 'T' : ''}</td>
                    <td className="py-1.5 pr-2"><Link href={ROUTES.COMPETITOR(r.competitorSlug)} className="text-stone-900 hover:text-[#8B5E3C]">{r.competitor}</Link>{r.isCorrection ? <span className="text-[10px] text-amber-700 ml-1">(corrected)</span> : null}</td>
                    <td className="py-1.5 pr-2 text-stone-700 tabular-nums">{val(r)}</td>
                    <td className="py-1.5 text-[11px]">{r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noreferrer nofollow" className="text-[#8B5E3C] underline">source ↗</a> : <span className="text-stone-400">—</span>}</td></tr>
                ))}
              </tbody>
            </table></div>
          </section>
        ))
      )}
    </article>
  );
}
