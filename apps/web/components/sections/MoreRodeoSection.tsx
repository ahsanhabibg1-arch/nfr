'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { SectionHeading } from '../SectionHeading';
import { ROUTES } from '../../config/routes';

/** Database-backed hub / recurring-event cards (lib/rodeoContent listPublicHubs / listPublicEvents). */
export interface MoreRodeoHubCard {
  slug: string;
  title: string;
  region: string | null;
  description: string | null;
  eventCount: number;
}
export interface MoreRodeoEventCard {
  slug: string;
  name: string;
  location: string | null;
  traditionalMonth: string | null;
}

interface MoreRodeoSectionProps {
  hubs: MoreRodeoHubCard[];
  recurringEvents: MoreRodeoEventCard[];
}

/**
 * More Rodeo homepage module. Shows only persisted hub/event identity fields and links to
 * their canonical pages. Edition dates, purses and attendance are NOT shown here — those
 * belong on edition pages, sourced and verified (Requirements v2.0 §1, WEB-07).
 */
export const MoreRodeoSection: React.FC<MoreRodeoSectionProps> = ({ hubs, recurringEvents }) => {
  const [activeTab, setActiveTab] = useState<'events' | 'hubs'>('events');
  const tabClass = (active: boolean) =>
    `px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-sm transition-colors ${
      active ? 'bg-[#0F1115] text-[#D4A757]' : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
    }`;
  const card = 'bg-white border border-stone-300 rounded-sm p-6 hover:border-[#8B5E3C] hover:shadow-md transition-all duration-200 group flex flex-col justify-between';

  return (
    <section id="more-rodeo" className="w-full bg-[#F7F3EA] text-[#0F1115] py-16 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker="More Rodeo"
          title="More Rodeo: Hubs &amp; Recurring Events"
          description="Rodeo beyond the NFR: regional and thematic hubs, recurring events and their annual editions."
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-3 border-b border-stone-200">
          <div className="flex items-center gap-2" role="tablist">
            <button role="tab" aria-selected={activeTab === 'events'} onClick={() => setActiveTab('events')} className={tabClass(activeTab === 'events')}>
              Recurring Events ({recurringEvents.length})
            </button>
            <button role="tab" aria-selected={activeTab === 'hubs'} onClick={() => setActiveTab('hubs')} className={tabClass(activeTab === 'hubs')}>
              Rodeo Hubs ({hubs.length})
            </button>
          </div>
          <Link href={ROUTES.MORE_RODEO} className="text-xs font-semibold text-[#8B5E3C] hover:underline">
            All rodeo events &rarr;
          </Link>
        </div>

        {activeTab === 'events' && (
          recurringEvents.length === 0 ? (
            <p className="p-8 text-center border border-dashed border-stone-300 bg-white rounded-sm text-sm text-stone-600">No recurring events have been added yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recurringEvents.map((evt) => (
                <Link key={evt.slug} href={ROUTES.RODEO_EVENT(evt.slug)} className={card}>
                  <div>
                    {evt.traditionalMonth && (
                      <div className="text-[11px] font-sans text-stone-500 mb-2">{evt.traditionalMonth}</div>
                    )}
                    <h3 className="text-xl font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">{evt.name}</h3>
                    {evt.location && <p className="text-xs text-stone-500 font-sans mt-0.5">{evt.location}</p>}
                  </div>
                  <span className="mt-5 pt-3 border-t border-stone-100 text-xs font-sans text-[#8B5E3C] font-semibold">View event &rarr;</span>
                </Link>
              ))}
            </div>
          )
        )}

        {activeTab === 'hubs' && (
          hubs.length === 0 ? (
            <p className="p-8 text-center border border-dashed border-stone-300 bg-white rounded-sm text-sm text-stone-600">No rodeo hubs have been added yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {hubs.map((hub) => (
                <Link key={hub.slug} href={ROUTES.RODEO_HUB(hub.slug)} className={card}>
                  <div>
                    <div className="text-[11px] font-sans text-stone-500 mb-2">
                      {hub.eventCount} linked event{hub.eventCount === 1 ? '' : 's'}
                    </div>
                    <h3 className="text-xl font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">{hub.title}</h3>
                    {hub.region && <p className="text-xs text-stone-500 font-sans mt-0.5">{hub.region}</p>}
                  </div>
                  <span className="mt-5 pt-3 border-t border-stone-100 text-xs font-sans text-[#8B5E3C] font-semibold">View hub &rarr;</span>
                </Link>
              ))}
            </div>
          )
        )}
      </div>
    </section>
  );
};
