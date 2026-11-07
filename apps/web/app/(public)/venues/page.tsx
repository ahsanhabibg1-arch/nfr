import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublicVenues } from '@/lib/batch12Content';
import { buildMetadata, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { ROUTES } from '@/config/routes';
import { getPublishedSections } from '@/lib/cms/pageLayoutService';
import type { SectionSlot } from '@/lib/cms/sectionRegistry';

type SP = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';
export const revalidate = 300;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams; const page = Number(str(sp.page)) || 1;
  const filtered = !!(str(sp.q) || str(sp.country) || page > 1);
  return buildMetadata({ title: 'Rodeo Venues Directory', description: 'Browse rodeo venues and arenas covered by NFRGuide — search by name and filter by country.', path: '/venues/', noindex: filtered });
}

function slotProp(sections: SectionSlot[], type: string, key: string, fallback: string): string {
  const s = sections.find((sl) => sl.sectionType === type);
  if (!s) return fallback;
  const v = s.props[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

export default async function VenuesDirectory({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = str(sp.q); const country = str(sp.country); const page = Number(str(sp.page)) || 1;
  const [{ items, total, totalPages, countryOptions }, layoutSections] = await Promise.all([
    listPublicVenues({ q, country, page }),
    getPublishedSections('directory:venues'),
  ]);
  const qs = (over: Record<string, string | number>) => { const p = new URLSearchParams(); if (q) p.set('q', q); if (country) p.set('country', country); for (const [k, v] of Object.entries(over)) { if (v) p.set(k, String(v)); } const s = p.toString(); return `/venues/${s ? `?${s}` : ''}`; };

  const heroTitle = slotProp(layoutSections, 'directory-hero', 'title', 'Rodeo Venues');
  const heroDesc = slotProp(layoutSections, 'directory-hero', 'description', 'Arenas and venues covered across NFRGuide\'s rodeo reporting. Search by name or filter by country.');
  const ctaSlot = layoutSections.find((s) => s.sectionType === 'directory-cta');
  const ctaVisible = ctaSlot?.visible !== false;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Venues', path: '/venues/' }])]} />
      <header className="mb-6">
        <p className="text-[11px] font-mono uppercase tracking-wider text-stone-500">Directory</p>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-900 mt-1">{heroTitle}</h1>
        <p className="text-stone-600 mt-2 max-w-2xl">{heroDesc}</p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3 mb-6 bg-white border border-stone-200 rounded-xs p-3">
        <div className="grow min-w-[200px]"><label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Search</label><input name="q" defaultValue={q} placeholder="Venue name…" className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xs focus:outline-none focus:border-[#D4A757]" /></div>
        {countryOptions.length > 0 && <div><label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Country</label>
          <select name="country" defaultValue={country} className="px-3 py-2 text-sm border border-stone-300 rounded-xs bg-white"><option value="">All countries</option>{countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>}
        <button type="submit" className="px-4 py-2 bg-[#0F1115] text-[#D4A757] text-xs font-semibold rounded-xs">Apply</button>
        {(q || country) && <Link href="/venues/" className="px-3 py-2 text-xs text-stone-500 underline">Reset</Link>}
      </form>

      <p className="text-xs text-stone-500 mb-3">{total} venue{total === 1 ? '' : 's'}{q ? ` matching “${q}”` : ''}{country ? ` in ${country}` : ''}.</p>

      {items.length === 0 ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xs p-10 text-center text-stone-500 text-sm">No venues match your search yet.</div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((v) => (
            <li key={v.slug}>
              <Link href={ROUTES.VENUE(v.slug)} className="block h-full bg-white border border-stone-200 rounded-xs p-4 hover:border-[#D4A757] transition-colors">
                <p className="font-serif text-lg font-bold text-stone-900">{v.name}</p>
                {v.nickname && <p className="text-xs text-stone-500 italic">“{v.nickname}”</p>}
                {v.location && <p className="text-xs text-stone-600 mt-1">{v.location}</p>}
                <p className="text-[11px] font-mono text-stone-500 mt-2">{v.capacity ? `${v.capacity.toLocaleString('en-US')} capacity` : ''}{v.capacity && v.editionCount ? ' · ' : ''}{v.editionCount ? `${v.editionCount} event edition${v.editionCount === 1 ? '' : 's'}` : ''}</p>
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

      {ctaVisible && slotProp(layoutSections, 'directory-cta', 'ctaUrl', '') && (
        <div className="mt-10 py-8 border-t border-stone-200 text-center">
          <Link href={slotProp(layoutSections, 'directory-cta', 'ctaUrl', '/')}
            className="inline-block px-6 py-3 bg-[#0F1115] text-[#D4A757] font-semibold text-sm rounded-xs hover:bg-stone-800 transition-colors">
            {slotProp(layoutSections, 'directory-cta', 'ctaText', 'Explore More')}
          </Link>
        </div>
      )}
    </div>
  );
}
