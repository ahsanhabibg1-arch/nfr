import type { Metadata } from 'next';
import { listPublicVenues } from '@/lib/batch12Content';
import { buildMetadata, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { directoryListingRobots } from '@/lib/seo/robots';
import { ROUTES } from '@/config/routes';
import { resolveDirectorySlots } from '@/lib/cms/directoryData';
import { DirectorySlots } from '@/views/DirectorySlots';
import { isStaffDraftPreview } from '@/lib/cms/previewGuard';

type SP = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';
export const revalidate = 300;

const DEFAULT_HERO_TITLE = 'Rodeo Venues';
const DEFAULT_HERO_DESCRIPTION =
  "Arenas and venues covered across NFRGuide's rodeo reporting. Search by name or filter by country.";

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams; const page = Number(str(sp.page)) || 1;
  const filtered = !!(str(sp.q) || str(sp.country) || page > 1);
  return buildMetadata({ title: 'Rodeo Venues Directory', description: 'Browse rodeo venues and arenas covered by NFRGuide — search by name and filter by country.', path: '/venues/', robots: directoryListingRobots(filtered) });
}

/** The monospaced tag line under a venue card: capacity and edition count. */
function venueTags(capacity: number | null, editionCount: number): string | null {
  const parts: string[] = [];
  if (capacity) parts.push(`${capacity.toLocaleString('en-US')} capacity`);
  if (editionCount) parts.push(`${editionCount} event edition${editionCount === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Venue directory (Stage 07 Task F). See the competitor directory for the full
 * rationale; the split is identical — the route owns the authoritative,
 * bounded `listPublicVenues` query, and the Builder owns where the header,
 * listing and call-to-action sit.
 */
export default async function VenuesDirectory({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = str(sp.q); const country = str(sp.country); const page = Number(str(sp.page)) || 1;
  const draft = await isStaffDraftPreview();
  const { items, total, totalPages, countryOptions } = await listPublicVenues({ q, country, page });

  const qs = (over: Record<string, string | number>) => { const p = new URLSearchParams(); if (q) p.set('q', q); if (country) p.set('country', country); for (const [k, v] of Object.entries(over)) { if (v) p.set(k, String(v)); } const s = p.toString(); return `/venues/${s ? `?${s}` : ''}`; };

  const directorySlots = await resolveDirectorySlots('directory:venues', {
    draft,
    listing: {
      defaultHeroTitle: DEFAULT_HERO_TITLE,
      defaultHeroDescription: DEFAULT_HERO_DESCRIPTION,
      items: items.map((v) => ({
        slug: v.slug,
        href: ROUTES.VENUE(v.slug),
        title: v.name,
        subtitle: v.nickname,
        meta: v.location,
        tags: venueTags(v.capacity, v.editionCount),
        badge: null,
      })),
      total,
      page,
      totalPages,
      entityLabel: 'venue',
      entityLabelPlural: 'venues',
      query: q,
      searchPlaceholder: 'Venue name…',
      filterName: 'country',
      filterLabel: 'Country',
      filterAllLabel: 'All countries',
      filterValue: country,
      filterOptions: countryOptions.map((c) => ({ value: c, label: c })),
      basePath: '/venues/',
      resetHref: '/venues/',
      prevHref: page > 1 ? qs({ page: page - 1 }) : null,
      nextHref: page < totalPages ? qs({ page: page + 1 }) : null,
    },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Venues', path: '/venues/' }])]} />
      <DirectorySlots slots={directorySlots} />
    </div>
  );
}
