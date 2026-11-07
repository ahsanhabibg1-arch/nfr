import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublicCompetitors } from '@/lib/batch12Content';
import { buildMetadata, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { ROUTES } from '@/config/routes';
import { getPublishedSections } from '@/lib/cms/pageLayoutService';
import type { SectionSlot } from '@/lib/cms/sectionRegistry';

type SP = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';
export const revalidate = 300;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams; const page = Number(str(sp.page)) || 1;
  // Only the first, unfiltered page is a canonical indexable directory URL; filtered/paged
  // variants are noindex to avoid thin duplicate filter pages.
  const filtered = !!(str(sp.q) || str(sp.discipline) || page > 1);
  return buildMetadata({ title: 'Rodeo Competitors Directory', description: 'Browse rodeo competitors and contestants covered by NFRGuide — search by name and filter by discipline.', path: '/competitors/', noindex: filtered });
}

function slotProp(sections: SectionSlot[], type: string, key: string, fallback: string): string {
  const s = sections.find((sl) => sl.sectionType === type);
  if (!s) return fallback;
  const v = s.props[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

export default async function CompetitorsDirectory({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = str(sp.q); const discipline = str(sp.discipline); const page = Number(str(sp.page)) || 1;
  const [{ items, total, totalPages, disciplineOptions }, layoutSections] = await Promise.all([
    listPublicCompetitors({ q, disciplineSlug: discipline, page }),
    getPublishedSections('directory:competitors'),
  ]);
  const qs = (over: Record<string, string | number>) => { const p = new URLSearchParams(); if (q) p.set('q', q); if (discipline) p.set('discipline', discipline); for (const [k, v] of Object.entries(over)) { if (v) p.set(k, String(v)); else p.delete(k); } const s = p.toString(); return `/competitors/${s ? `?${s}` : ''}`; };

  const heroTitle = slotProp(layoutSections, 'directory-hero', 'title', 'Rodeo Competitors');
  const heroDesc = slotProp(layoutSections, 'directory-hero', 'description', 'Contestants and athletes covered across NFRGuide\'s rodeo reporting. Search by name or filter by discipline.');
  const ctaSlot = layoutSections.find((s) => s.sectionType === 'directory-cta');
  const ctaVisible = ctaSlot?.visible !== false;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Competitors', path: '/competitors/' }])]} />
      <header className="mb-6">
        <p className="text-[11px] font-mono uppercase tracking-wider text-stone-500">Directory</p>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 mt-1">{heroTitle}</h1>
        <p className="text-stone-600 mt-2 max-w-2xl">{heroDesc}</p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3 mb-6 bg-white border border-stone-200 rounded-xs p-3">
        <div className="grow min-w-[200px]"><label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Search</label><input name="q" defaultValue={q} placeholder="Competitor name…" className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xs focus:outline-none focus:border-[#D4A757]" /></div>
        <div><label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Discipline</label>
          <select name="discipline" defaultValue={discipline} className="px-3 py-2 text-sm border border-stone-300 rounded-xs bg-white"><option value="">All disciplines</option>{disciplineOptions.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select></div>
        <button type="submit" className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">Apply</button>
        {(q || discipline) && <Link href="/competitors/" className="px-3 py-2 text-xs text-stone-500 underline">Reset</Link>}
      </form>

      <p className="text-xs text-stone-500 mb-3">{total} competitor{total === 1 ? '' : 's'}{q ? ` matching “${q}”` : ''}{discipline ? ` in ${disciplineOptions.find((d) => d.slug === discipline)?.name ?? discipline}` : ''}.</p>

      {items.length === 0 ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xs p-10 text-center text-stone-500 text-sm">No competitors match your search yet.</div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((c) => (
            <li key={c.slug}>
              <Link href={ROUTES.COMPETITOR(c.slug)} className="block h-full bg-white border border-stone-200 rounded-xs p-4 hover:border-[#D4A757] transition-colors">
                <p className="font-serif text-lg font-bold text-stone-900">{c.fullName}</p>
                {c.knownAs && <p className="text-xs text-stone-500 italic">“{c.knownAs}”</p>}
                {c.hometown && <p className="text-xs text-stone-600 mt-1">{c.hometown}</p>}
                {c.disciplines.length > 0 && <p className="text-[11px] font-mono text-stone-500 mt-2">{c.disciplines.slice(0, 3).join(' · ')}</p>}
                {c.status && <span className="inline-block mt-2 text-[10px] font-mono uppercase text-stone-400">{c.status}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between mt-8 text-sm" aria-label="Pagination">
          {page > 1 ? <Link href={qs({ page: page - 1 })} className="text-[#8B5E3C] underline">← Previous</Link> : <span />}
          <span className="text-stone-500 text-xs">Page {page} of {totalPages}</span>
          {page < totalPages ? <Link href={qs({ page: page + 1 })} className="text-[#8B5E3C] underline">Next →</Link> : <span />}
        </nav>
      )}

      {ctaVisible && slotProp(layoutSections, 'directory-cta', 'ctaText', '') && (
        <div className="mt-10 py-8 border-t border-stone-200 text-center">
          <Link href={slotProp(layoutSections, 'directory-cta', 'ctaUrl', '/')}
            className="inline-block px-6 py-3 bg-[#0F1115] text-[#D4A757] font-semibold text-sm rounded-xs hover:bg-stone-800 transition-colors">
            {slotProp(layoutSections, 'directory-cta', 'ctaText', '')}
          </Link>
        </div>
      )}
    </div>
  );
}
