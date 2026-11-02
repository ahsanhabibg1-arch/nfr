import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicEditionBySlug } from '@/lib/rodeoContent';
import { getPublicSchedule } from '@/lib/cms/competitionService';
import { buildMetadata, breadcrumbJsonLd, JsonLd } from '@/lib/seo';
import { ROUTES } from '@/config/routes';
import { CoverageNav } from '@/components/editorial/CoverageNav';

type Params = { params: Promise<{ slug: string; edition: string }> };
export const revalidate = 300;
export const dynamicParams = true;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, edition } = await params;
  const ed = await getPublicEditionBySlug(slug, edition);
  if (!ed) return buildMetadata({ title: 'Schedule Not Found', description: 'Rodeo schedule.', path: ROUTES.EDITION_SCHEDULE(slug, edition), noindex: true });
  const rows = await getPublicSchedule(ed.id);
  return buildMetadata({
    title: `${ed.event.name} ${ed.label} — Schedule`,
    description: `Day-by-day session schedule for ${ed.event.name} ${ed.label}. Verified sessions only.`,
    path: ROUTES.EDITION_SCHEDULE(ed.event.slug, ed.editionSlug),
    noindex: rows.length === 0, // thin/empty coverage is not indexed
  });
}

function fmt(startAt: string | null, tz: string | null): string {
  if (!startAt) return 'Time to be confirmed';
  try { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz || 'UTC' }).format(new Date(startAt)) + (tz ? ` (${tz})` : ' UTC'); } catch { return new Date(startAt).toISOString(); }
}

export default async function SchedulePage({ params }: Params) {
  const { slug, edition } = await params;
  const ed = await getPublicEditionBySlug(slug, edition);
  if (!ed) notFound();
  const sessions = await getPublicSchedule(ed.id);

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: ed.event.name, path: ROUTES.RODEO_EVENT(ed.event.slug) }, { name: ed.label, path: ROUTES.RODEO_EDITION(ed.event.slug, ed.editionSlug) }, { name: 'Schedule', path: ROUTES.EDITION_SCHEDULE(ed.event.slug, ed.editionSlug) }])]} />
      <header className="mb-2"><p className="text-[11px] font-mono uppercase tracking-wider text-stone-500">{ed.event.name}</p><h1 className="font-serif text-3xl font-bold text-stone-900">{ed.label} — Schedule</h1></header>
      <CoverageNav eventSlug={ed.event.slug} editionSlug={ed.editionSlug} active="schedule" />
      {sessions.length === 0 ? (
        <p className="text-stone-500 text-sm bg-stone-50 border border-stone-200 rounded-xs p-6">No verified schedule has been published for this edition yet. Check back closer to the event.</p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {sessions.map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-stone-900">{s.title}{s.roundNumber != null ? ` · Round ${s.roundNumber}` : ''}</p>
                {s.status !== 'SCHEDULED' && <span className="text-[11px] font-mono text-amber-700 uppercase">{s.status}</span>}
              </div>
              <p className="text-sm text-stone-600">{fmt(s.startAt, s.timezone)}</p>
              <p className="text-xs text-stone-500">{[s.sessionType, s.discipline, s.venue].filter(Boolean).join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
