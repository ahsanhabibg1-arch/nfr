import React, { useState } from 'react';
import { RodeoHub, RecurringRodeoEvent } from '../../types';
import { SectionHeading } from '../SectionHeading';

interface MoreRodeoSectionProps {
  hubs: RodeoHub[];
  recurringEvents: RecurringRodeoEvent[];
  onOpenArticle: (title: string) => void;
}

export const MoreRodeoSection: React.FC<MoreRodeoSectionProps> = ({
  hubs,
  recurringEvents,
  onOpenArticle,
}) => {
  const [activeTab, setActiveTab] = useState<'events' | 'hubs'>('events');

  return (
    <section id="more-rodeo" className="w-full bg-[#F7F3EA] text-[#0F1115] py-16 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker="Beyond Las Vegas &middot; Primary Navigation 5"
          title="More Rodeo: Global Circuits &amp; Crown Jewels"
          description="Rodeo doesn't begin or end in Nevada. Explore the international circuits, summer crown jewel rodeos, and qualifying pipelines across North America and beyond."
        />

        {/* Conceptual Hierarchy Architecture Pill/Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-3 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('events')}
              className={`px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-sm transition-colors ${
                activeTab === 'events'
                  ? 'bg-[#0F1115] text-[#D4A757]'
                  : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
              }`}
            >
              Recurring Major Events (3)
            </button>
            <button
              onClick={() => setActiveTab('hubs')}
              className={`px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-sm transition-colors ${
                activeTab === 'hubs'
                  ? 'bg-[#0F1115] text-[#D4A757]'
                  : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
              }`}
            >
              Regional Rodeo Hubs (3)
            </button>
          </div>

          <div className="text-xs text-stone-500 font-sans">
            Taxonomy: <strong>Hub &rarr; Recurring Event &rarr; Annual Edition &rarr; Article</strong>
          </div>
        </div>

        {/* Tab 1: Recurring Events & Annual Editions */}
        {activeTab === 'events' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recurringEvents.map((evt) => (
              <div
                key={evt.id}
                onClick={() => onOpenArticle(`${evt.name} Event Guide`)}
                className="bg-white border border-stone-300 rounded-sm p-6 hover:border-[#8B5E3C] hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-sans text-stone-500 mb-2">
                    <span className="font-bold text-[#8B5E3C] uppercase tracking-wider">
                      {evt.status}
                    </span>
                    <span>{evt.traditionalMonth}</span>
                  </div>

                  <h3 className="text-xl font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">
                    {evt.name}
                  </h3>

                  <p className="text-xs text-stone-500 font-sans mt-0.5">
                    {evt.location}
                  </p>

                  <p className="mt-3 text-xs text-stone-700 font-sans leading-relaxed">
                    {evt.description}
                  </p>

                  {/* Annual Event Edition Box */}
                  <div className="mt-4 p-3.5 bg-[#F7F3EA] border border-stone-200 rounded-sm">
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">
                      <span>Upcoming Edition</span>
                      <span className="font-bold text-stone-900">{evt.currentEdition.year}</span>
                    </div>
                    <p className="text-xs font-semibold text-stone-900 font-sans">
                      {evt.currentEdition.dates}
                    </p>
                    <p className="text-[11px] text-stone-600 font-sans mt-0.5">
                      Purse Benchmark: {evt.currentEdition.purseBenchmark}
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-stone-100 flex items-center justify-between text-xs font-sans text-[#8B5E3C] font-semibold">
                  <span>Explore Event Guide</span>
                  <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Regional Rodeo Hubs */}
        {activeTab === 'hubs' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {hubs.map((hub) => (
              <div
                key={hub.id}
                onClick={() => onOpenArticle(`${hub.title} Circuit Analysis`)}
                className="bg-white border border-stone-300 rounded-sm p-6 hover:border-[#8B5E3C] hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-sans text-stone-500 mb-2">
                    <span className="font-bold text-[#8B5E3C] uppercase tracking-wider">
                      Circuit Hub
                    </span>
                    <span className="font-mono text-stone-400">{hub.annualEventsCount} Sanctioned Rodeos</span>
                  </div>

                  <h3 className="text-xl font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">
                    {hub.title}
                  </h3>

                  <p className="text-xs text-stone-500 font-sans mt-0.5">
                    {hub.region} &middot; {hub.circuitType}
                  </p>

                  <p className="mt-3 text-xs text-stone-700 font-sans leading-relaxed">
                    {hub.description}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-stone-100 flex items-center justify-between text-xs font-sans text-[#8B5E3C] font-semibold">
                  <span>View Circuit Hub Coverage</span>
                  <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
