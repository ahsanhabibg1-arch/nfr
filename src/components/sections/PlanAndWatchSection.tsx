import React from 'react';
import { PlanGuide, Article } from '../../types';
import { SectionHeading } from '../SectionHeading';
import { ImageWithCredit } from '../ImageWithCredit';

interface PlanAndWatchSectionProps {
  guides: PlanGuide[];
  onSelectArticleBySlug: (slug: string) => void;
}

export const PlanAndWatchSection: React.FC<PlanAndWatchSectionProps> = ({
  guides,
  onSelectArticleBySlug,
}) => {
  return (
    <section id="plan-watch" className="w-full bg-[#F7F3EA] text-[#0F1115] py-16 border-b border-stone-300">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker="Spectator Intelligence &middot; Primary Navigation 4"
          title="NFR Plan &amp; Watch: The Definitive Guide"
          description="Independent, objective journalism covering broadcast access, hotel districts, transportation bottlenecks, and verified ticket guidance for Las Vegas championship week."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {guides.map((guide) => (
            <article
              key={guide.id}
              onClick={() => onSelectArticleBySlug(guide.articleSlug)}
              className="bg-white border border-stone-300 rounded-sm overflow-hidden hover:border-[#8B5E3C] hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <ImageWithCredit
                  src={guide.image}
                  alt={guide.title}
                  credit={guide.imageCredit}
                  aspectRatioClass="aspect-[16/10]"
                />

                <div className="p-5">
                  <div className="flex items-center justify-between text-[11px] font-sans text-stone-500 mb-1.5">
                    <span className="font-bold text-[#8B5E3C] uppercase tracking-wider">
                      {guide.subtopic}
                    </span>
                    <span>{guide.readTime}</span>
                  </div>

                  <h3 className="text-base font-serif font-bold text-[#0F1115] group-hover:text-[#8B5E3C] transition-colors leading-snug">
                    {guide.title}
                  </h3>

                  <p className="mt-2 text-xs text-stone-600 font-sans leading-relaxed line-clamp-2">
                    {guide.summary}
                  </p>

                  <div className="mt-4 p-3 bg-[#F7F3EA] border-l-2 border-[#D4A757] rounded-sm text-[11px] text-stone-800 font-sans">
                    <strong className="text-[#8B5E3C] block mb-0.5 uppercase tracking-wider text-[10px]">
                      Essential Advice:
                    </strong>
                    {guide.keyAdvice}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-xs font-sans text-[#8B5E3C] font-semibold">
                <span>Read Editorial Guide</span>
                <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">&rarr;</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
