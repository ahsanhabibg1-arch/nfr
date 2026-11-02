import Link from 'next/link';
import { ROUTES } from '../../config/routes';

/**
 * Edition coverage navigation (Batch 14): overview + schedule/results/standings.
 * Server component (plain links). Only renders tabs; pages themselves show empty states
 * when a section has no published+verified coverage.
 */
export function CoverageNav({ eventSlug, editionSlug, active }: { eventSlug: string; editionSlug: string; active: 'overview' | 'schedule' | 'results' | 'standings' }) {
  const tabs: { key: typeof active; label: string; href: string }[] = [
    { key: 'overview', label: 'Overview', href: ROUTES.RODEO_EDITION(eventSlug, editionSlug) },
    { key: 'schedule', label: 'Schedule', href: ROUTES.EDITION_SCHEDULE(eventSlug, editionSlug) },
    { key: 'results', label: 'Results', href: ROUTES.EDITION_RESULTS(eventSlug, editionSlug) },
    { key: 'standings', label: 'Standings', href: ROUTES.EDITION_STANDINGS(eventSlug, editionSlug) },
  ];
  return (
    <nav aria-label="Edition coverage" className="flex flex-wrap gap-1 border-b border-stone-200 mb-6">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? 'page' : undefined}
          className={`px-3 py-2 text-xs font-mono uppercase tracking-wide border-b-2 -mb-px ${t.key === active ? 'border-[#8B5E3C] text-[#8B5E3C] font-semibold' : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
