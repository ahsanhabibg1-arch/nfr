import React from 'react';
import Link from 'next/link';
import { ROUTES } from '../config/routes';
import type { PublicHub, PublicEvent, PublicEdition, PublicArticleRef, PublicEditionCard, PublicEventCard } from '../lib/rodeoContent';
import type { PublicAssociation } from '../lib/monetization/publicMonetization';
import { EntityIntro } from '../components/editorial/EntityIntro';
import { FaqAccordion } from '../components/FaqAccordion';

export interface LandingExtras {
  intro?: string | null;
  faqs?: { id: string; question: string; answer: string }[];
}

/**
 * Public rodeo entity views (Batch 10). Server-rendered, no client JS. Only published
 * articles are linked; dates render as verified or explicitly "to be confirmed"
 * (never fabricated). Commercial partner associations are clearly labeled + disclosed
 * and kept per-entity (event-vs-edition separation preserved).
 */

function formatDateRange(startAt: string | null, endAt: string | null): string {
  if (!startAt) return 'Dates to be confirmed';
  const s = new Date(startAt).toISOString().slice(0, 10);
  if (!endAt) return s;
  return `${s} – ${new Date(endAt).toISOString().slice(0, 10)}`;
}

function ArticleList({ articles }: { articles: PublicArticleRef[] }) {
  if (articles.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-[11px] uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2">Related Coverage</h2>
      <ul className="space-y-2">
        {articles.map((a) => (
          <li key={a.slug} className="p-3 bg-white border border-stone-200 rounded-sm hover:border-[#D4A757]">
            <Link href={ROUTES.ARTICLE(a.slug)} className="block">
              <span className="text-[11px] font-sans text-[#8B5E3C] font-semibold uppercase tracking-wider">{a.category}</span>
              <span className="block font-serif font-semibold text-stone-900">{a.title}</span>
              {a.deck && <span className="block text-xs text-stone-600 font-sans line-clamp-1">{a.deck}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PartnersStrip({ associations }: { associations: PublicAssociation[] }) {
  if (associations.length === 0) return null;
  return (
    <section className="mt-8 border border-stone-300 rounded-sm bg-[#F7F3EA]/60 overflow-hidden">
      <div className="px-4 py-2 border-b border-stone-200 bg-white/60 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-mono font-bold text-[#8B5E3C]">Related Partners</span>
        <span className="text-[10px] uppercase tracking-wider font-mono text-stone-400">Commercial</span>
      </div>
      <ul className="divide-y divide-stone-200">
        {associations.map((a, i) => (
          <li key={i} className="px-4 py-2.5 flex items-center justify-between text-sm font-sans">
            <span className="font-semibold text-stone-900">{a.partnerName}</span>
            <span className="text-xs text-stone-500 font-mono">{a.relationshipType}</span>
          </li>
        ))}
      </ul>
      <p className="px-4 py-2 text-[11px] text-stone-600 border-t border-stone-200 bg-white/40">
        Commercial partners are independent of NFRGuide&rsquo;s editorial coverage and are not official sources. NFRGuide may earn a commission on qualifying actions.
      </p>
    </section>
  );
}

function EventCard({ e }: { e: PublicEventCard }) {
  return (
    <Link href={ROUTES.RODEO_EVENT(e.slug)} className="block p-4 bg-white border border-stone-200 rounded-sm hover:border-[#D4A757]">
      <div className="flex items-center gap-2 text-[11px] font-sans text-stone-500">
        {e.isFlagship && <span className="text-[#D4A757] font-bold uppercase tracking-wider">Flagship</span>}
        {e.location && <span>{e.location}</span>}
      </div>
      <h3 className="font-serif font-semibold text-stone-900 mt-0.5">{e.name}</h3>
      {e.traditionalMonth && <p className="text-xs text-stone-500 font-sans">Typically {e.traditionalMonth}</p>}
    </Link>
  );
}

function EditionCard({ eventSlug, ed }: { eventSlug: string; ed: PublicEditionCard }) {
  return (
    <Link href={ROUTES.RODEO_EDITION(eventSlug, ed.editionSlug)} className="block p-4 bg-white border border-stone-200 rounded-sm hover:border-[#D4A757]">
      <h3 className="font-serif font-semibold text-stone-900">{ed.label}</h3>
      <p className="text-xs text-stone-500 font-sans">{formatDateRange(ed.startAt, ed.endAt)}</p>
      {ed.venue && <p className="text-[11px] text-stone-400 font-sans">{ed.venue.name}{ed.venue.city ? `, ${ed.venue.city}` : ''}</p>}
    </Link>
  );
}

const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">{children}</div>
);

export function RodeoDirectory({ hubs, events }: { hubs: { slug: string; title: string; region: string | null; description: string | null; eventCount: number }[]; events: PublicEventCard[] }) {
  if (hubs.length === 0 && events.length === 0) return null;
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
      {hubs.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-3">Rodeo Hubs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {hubs.map((h) => (
              <Link key={h.slug} href={ROUTES.RODEO_HUB(h.slug)} className="block p-4 bg-white border border-stone-200 rounded-sm hover:border-[#D4A757]">
                {h.region && <span className="text-[11px] font-sans text-stone-500 uppercase tracking-wider">{h.region}</span>}
                <h3 className="font-serif font-bold text-stone-900">{h.title}</h3>
                {h.description && <p className="text-xs text-stone-600 font-sans line-clamp-2 mt-1">{h.description}</p>}
                <span className="text-[11px] text-stone-400 font-mono mt-1 block">{h.eventCount} event{h.eventCount === 1 ? '' : 's'}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {events.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-3">Recurring Events</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {events.map((e) => <EventCard key={e.slug} e={e} />)}
          </div>
        </section>
      )}
    </div>
  );
}

export function RodeoHubView({ hub, extras }: { hub: PublicHub; extras?: LandingExtras }) {
  return (
    <PageShell>
      <nav className="text-xs font-mono text-stone-500 mb-3"><Link href={ROUTES.MORE_RODEO} className="hover:underline">Rodeo Events</Link> / {hub.title}</nav>
      {hub.region && <span className="text-[11px] font-sans text-[#8B5E3C] uppercase tracking-widest font-bold">{hub.region}{hub.circuitType ? ` · ${hub.circuitType}` : ''}</span>}
      <h1 className="text-3xl font-serif font-black text-stone-900 mt-1">{hub.title}</h1>
      {hub.description && <p className="text-stone-700 font-sans mt-3 leading-relaxed">{hub.description}</p>}
      <EntityIntro intro={extras?.intro} />
      {hub.events.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[11px] uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2">Events in this hub</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{hub.events.map((e) => <EventCard key={e.slug} e={e} />)}</div>
        </section>
      ) : (
        <p className="mt-8 text-sm text-stone-500 font-sans">No events are associated with this hub yet.</p>
      )}
      <ArticleList articles={hub.articles} />
      <FaqAccordion faqs={extras?.faqs ?? []} />
    </PageShell>
  );
}

export function RodeoEventView({ event, associations, extras }: { event: PublicEvent; associations: PublicAssociation[]; extras?: LandingExtras }) {
  return (
    <PageShell>
      <nav className="text-xs font-mono text-stone-500 mb-3"><Link href={ROUTES.MORE_RODEO} className="hover:underline">Rodeo Events</Link> / {event.name}</nav>
      <div className="flex items-center gap-2 text-[11px] font-sans">
        {event.isFlagship && <span className="text-[#D4A757] font-bold uppercase tracking-widest">Flagship Event</span>}
        {event.location && <span className="text-stone-500">{event.location}</span>}
      </div>
      <h1 className="text-3xl font-serif font-black text-stone-900 mt-1">{event.name}</h1>
      {event.traditionalMonth && <p className="text-sm text-stone-500 font-sans mt-1">Traditionally held in {event.traditionalMonth}</p>}
      {event.description && <p className="text-stone-700 font-sans mt-3 leading-relaxed">{event.description}</p>}
      <EntityIntro intro={extras?.intro} />
      {event.officialUrl && (
        <p className="mt-2 text-xs font-sans"><a href={event.officialUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-[#8B5E3C] underline">Official event site ↗</a></p>
      )}

      {event.editions.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[11px] uppercase tracking-widest font-sans font-bold text-[#8B5E3C] mb-2">Editions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{event.editions.map((ed) => <EditionCard key={ed.editionSlug} eventSlug={event.slug} ed={ed} />)}</div>
        </section>
      ) : (
        <p className="mt-8 text-sm text-stone-500 font-sans">No editions have been published for this event yet.</p>
      )}

      {event.hubs.length > 0 && (
        <p className="mt-6 text-xs font-sans text-stone-500">Part of: {event.hubs.map((h, i) => (<React.Fragment key={h.slug}>{i > 0 ? ', ' : ''}<Link href={ROUTES.RODEO_HUB(h.slug)} className="text-[#8B5E3C] underline">{h.title}</Link></React.Fragment>))}</p>
      )}

      <ArticleList articles={event.articles} />
      <PartnersStrip associations={associations} />
      <FaqAccordion faqs={extras?.faqs ?? []} />
    </PageShell>
  );
}

export function RodeoEditionView({ edition, associations, extras }: { edition: PublicEdition; associations: PublicAssociation[]; extras?: LandingExtras }) {
  return (
    <PageShell>
      <nav className="text-xs font-mono text-stone-500 mb-3">
        <Link href={ROUTES.MORE_RODEO} className="hover:underline">Rodeo Events</Link> / <Link href={ROUTES.RODEO_EVENT(edition.event.slug)} className="hover:underline">{edition.event.name}</Link> / {edition.label}
      </nav>
      <h1 className="text-3xl font-serif font-black text-stone-900">{edition.event.name}: {edition.label}</h1>
      <div className="mt-3 p-4 bg-white border border-stone-200 rounded-sm text-sm font-sans text-stone-700 space-y-1">
        <div><span className="text-stone-500 font-mono text-xs uppercase tracking-wider mr-2">Dates</span>{formatDateRange(edition.startAt, edition.endAt)}{!edition.datesKnown && <span className="text-[11px] text-amber-700 ml-2">(unconfirmed)</span>}</div>
        {edition.venue && <div><span className="text-stone-500 font-mono text-xs uppercase tracking-wider mr-2">Venue</span>{edition.venue.name}{edition.venue.city ? `, ${edition.venue.city}` : ''}{edition.venue.state ? `, ${edition.venue.state}` : ''}</div>}
        {edition.purseBenchmark && <div><span className="text-stone-500 font-mono text-xs uppercase tracking-wider mr-2">Purse</span>{edition.purseBenchmark}</div>}
      </div>
      <p className="mt-4 text-xs font-sans text-stone-500">
        This edition is specific to {edition.label}. Broadcast, ticket and commercial details are verified per edition and are not carried over from other years. <Link href={ROUTES.RODEO_EVENT(edition.event.slug)} className="text-[#8B5E3C] underline">See all editions →</Link>
      </p>
      <EntityIntro intro={extras?.intro} />
      <ArticleList articles={edition.articles} />
      <PartnersStrip associations={associations} />
      <FaqAccordion faqs={extras?.faqs ?? []} />
    </PageShell>
  );
}
