import type { Metadata } from 'next';
import { listPublicCompetitors } from '@/lib/batch12Content';
import { buildMetadata, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { directoryListingRobots } from '@/lib/seo/robots';
import { ROUTES } from '@/config/routes';
import { resolveDirectorySlots } from '@/lib/cms/directoryData';
import { DirectorySlots } from '@/views/DirectorySlots';
import { isStaffDraftPreview } from '@/lib/cms/previewGuard';

type SP = Promise<Record<string, string | string[] | undefined>>;
const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';
export const revalidate = 300;

const DEFAULT_HERO_TITLE = 'Rodeo Competitors';
const DEFAULT_HERO_DESCRIPTION =
  "Contestants and athletes covered across NFRGuide's rodeo reporting. Search by name or filter by discipline.";

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams; const page = Number(str(sp.page)) || 1;
  const filtered = !!(str(sp.q) || str(sp.discipline) || page > 1);
  return buildMetadata({ title: 'Rodeo Competitors Directory', description: 'Browse rodeo competitors and contestants covered by NFRGuide — search by name and filter by discipline.', path: '/competitors/', robots: directoryListingRobots(filtered) });
}

/**
 * Competitor directory (Stage 07 Task F).
 *
 * The route still owns the DATA — `listPublicCompetitors` is the authoritative,
 * bounded, page-clamped query, and it stays here because it depends on
 * `searchParams`. What moved is the PRESENTATION: the header, the search form,
 * the entries and the pagination are now the `directory-hero` and
 * `directory-grid` blocks, placed by the Builder in slot order.
 *
 * SEO is unchanged: the same `generateMetadata`, the same breadcrumb JSON-LD,
 * the same single `<h1>` (now emitted by the hero block rather than here), and
 * the same `directoryListingRobots` treatment of filtered views.
 */
export default async function CompetitorsDirectory({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = str(sp.q); const discipline = str(sp.discipline); const page = Number(str(sp.page)) || 1;
  const draft = await isStaffDraftPreview();
  const { items, total, totalPages, disciplineOptions } = await listPublicCompetitors({ q, disciplineSlug: discipline, page });

  const qs = (over: Record<string, string | number>) => { const p = new URLSearchParams(); if (q) p.set('q', q); if (discipline) p.set('discipline', discipline); for (const [k, v] of Object.entries(over)) { if (v) p.set(k, String(v)); else p.delete(k); } const s = p.toString(); return `/competitors/${s ? `?${s}` : ''}`; };

  const directorySlots = await resolveDirectorySlots('directory:competitors', {
    draft,
    listing: {
      defaultHeroTitle: DEFAULT_HERO_TITLE,
      defaultHeroDescription: DEFAULT_HERO_DESCRIPTION,
      items: items.map((c) => ({
        slug: c.slug,
        href: ROUTES.COMPETITOR(c.slug),
        title: c.fullName,
        subtitle: c.knownAs,
        meta: c.hometown,
        tags: c.disciplines.length > 0 ? c.disciplines.slice(0, 3).join(' · ') : null,
        badge: c.status,
      })),
      total,
      page,
      totalPages,
      entityLabel: 'competitor',
      entityLabelPlural: 'competitors',
      query: q,
      searchPlaceholder: 'Competitor name…',
      filterName: 'discipline',
      filterLabel: 'Discipline',
      filterAllLabel: 'All disciplines',
      filterValue: discipline,
      filterOptions: disciplineOptions.map((d) => ({ value: d.slug, label: d.name })),
      basePath: '/competitors/',
      resetHref: '/competitors/',
      prevHref: page > 1 ? qs({ page: page - 1 }) : null,
      nextHref: page < totalPages ? qs({ page: page + 1 }) : null,
    },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Competitors', path: '/competitors/' }])]} />
      <DirectorySlots slots={directorySlots} />
    </div>
  );
}
