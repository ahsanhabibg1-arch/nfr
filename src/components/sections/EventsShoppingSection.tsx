import React from 'react';
import { ShoppingEvent } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { ImageWithCredit } from '../ImageWithCredit';
import { AdSlot } from '../AdSlot';

interface EventsShoppingSectionProps {
  events: ShoppingEvent[];
  onOpenArticle: (title: string) => void;
}

export const EventsShoppingSection: React.FC<EventsShoppingSectionProps> = ({
  events,
  onOpenArticle,
}) => {
  return (
    <section id="events-shopping" className="w-full bg-[#FFFFFF] text-[#0F1115] py-16 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker="Western Culture &middot; Primary Navigation 3"
          title="NFR Events &amp; Cowboy Christmas"
          description="Independent curations of daytime exhibitions, artisan leathercraft, silversmithing expos, the Junior World Finals, and the Miss Rodeo America pageant."
        />

        {/* Commercial / Editorial Disclosure Banner */}
        <div className="mb-8 p-3.5 bg-[#F7F3EA] border border-stone-300 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-sans text-stone-600">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#8B5E3C]" aria-hidden="true" />
            <span className="font-semibold text-stone-900">Editorial Transparency:</span>
            <span>All exhibitor highlights and shopping recommendations are independently chosen by NFRGuide editors.</span>
          </div>
          <span className="text-[11px] font-mono text-stone-500 uppercase tracking-wider">
            Unsponsored Editorial Selection
          </span>
        </div>

        {/* 3-Column Card Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {events.map((event) => (
            <article
              key={event.id}
              onClick={() => onOpenArticle(event.title)}
              className="bg-[#F7F3EA] border border-stone-300 rounded-sm overflow-hidden hover:border-[#8B5E3C] hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <ImageWithCredit
                  src={event.image}
                  alt={event.title}
                  credit={event.imageCredit}
                  aspectRatioClass="aspect-[16/10]"
                />

                <div className="p-5">
                  <div className="flex items-center justify-between text-[11px] font-sans text-stone-500 mb-1.5">
                    <span className="font-bold text-[#8B5E3C] uppercase tracking-wider">
                      {event.type}
                    </span>
                    <span className="text-stone-500 font-mono text-[10px]">{event.admissionNote}</span>
                  </div>

                  <h3 className="text-base sm:text-lg font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">
                    {event.title}
                  </h3>

                  <div className="mt-2 text-xs text-stone-500 font-sans flex items-center gap-1.5">
                    <span className="font-semibold text-stone-700">Venue:</span>
                    <span>{event.venue}</span>
                  </div>

                  <p className="mt-2.5 text-xs text-stone-700 font-sans leading-relaxed line-clamp-3">
                    {event.summary}
                  </p>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-stone-200 bg-white/70 flex items-center justify-between text-xs font-sans text-[#8B5E3C] font-semibold">
                <span>View Exhibition Guide</span>
                <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
              </div>
            </article>
          ))}
        </div>

        {/* Clearly Delineated Sponsor / Ad Placement */}
        <AdSlot label="Western Lifestyle &amp; Cowboy Christmas Exhibitor" />
      </div>
    </section>
  );
};
