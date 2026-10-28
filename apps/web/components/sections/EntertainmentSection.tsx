'use client';

import React from 'react';
import { EntertainmentFeature } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { ImageWithCredit } from '../ImageWithCredit';

interface EntertainmentSectionProps {
  features: EntertainmentFeature[];
  onOpenArticle: (slug?: string) => void;
}

export const EntertainmentSection: React.FC<EntertainmentSectionProps> = ({
  features,
  onOpenArticle,
}) => {
  return (
    <section id="entertainment" className="w-full bg-[#1E293B] text-white py-16 border-b border-white/10">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          dark
          kicker="Las Vegas Nightlife &middot; Primary Navigation 2"
          title="NFR Entertainment &amp; Fan Experiences"
          description="When the final chute closes at the Thomas & Mack Center, Las Vegas transforms into the epicentre of country music, legendary buckle presentations, and citywide celebrations."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((item) => (
            <article
              key={item.id}
              onClick={() => onOpenArticle(item.articleSlug)}
              className="bg-[#0F1115] border border-white/10 rounded-sm overflow-hidden hover:border-[#D4A757]/60 transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <ImageWithCredit
                  src={item.image}
                  alt={item.title}
                  credit={item.imageCredit}
                  aspectRatioClass="aspect-[16/10]"
                />

                <div className="p-5">
                  <div className="flex items-center justify-between text-[11px] font-sans text-stone-400 mb-1.5">
                    <span className="font-bold text-[#D4A757] uppercase tracking-wider">
                      {item.type}
                    </span>
                    <span className="font-mono text-[10px] text-stone-400">{item.venue}</span>
                  </div>

                  <h3 className="text-base sm:text-lg font-serif font-bold text-white group-hover:text-[#D4A757] transition-colors leading-snug">
                    {item.title}
                  </h3>

                  <p className="mt-2 text-xs text-stone-300 font-sans leading-relaxed line-clamp-3">
                    {item.summary}
                  </p>

                  <div className="mt-4 pt-3 border-t border-white/10 space-y-1">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-stone-400 block mb-1">
                      Event Highlights:
                    </span>
                    {item.highlights.map((h, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-stone-300 font-sans">
                        <span className="text-[#D4A757]">&bull;</span>
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-white/10 bg-black/30 flex items-center justify-between text-xs font-sans text-[#D4A757] font-semibold">
                <span>View Entertainment Dispatch</span>
                <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
