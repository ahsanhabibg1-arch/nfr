import React from 'react';
import { Breadcrumbs } from './Breadcrumbs';

interface SectionLandingHeroProps {
  sectionTitle: string;
  tagline: string;
  description: string;
  kicker?: string;
  breadcrumbs?: { label: string; path?: string }[];
  statPills?: { label: string; value: string }[];
  className?: string;
}

export const SectionLandingHero: React.FC<SectionLandingHeroProps> = ({
  sectionTitle,
  tagline,
  description,
  kicker = 'Editorial Section',
  breadcrumbs,
  statPills,
  className = '',
}) => {
  return (
    <div className={`w-full bg-[#0F1115] text-white py-12 md:py-16 border-b border-white/10 ${className}`}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {breadcrumbs && (
          <div className="mb-4">
            <Breadcrumbs items={breadcrumbs} className="text-stone-400" />
          </div>
        )}

        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-widest text-[#D4A757] font-sans mb-2">
            {kicker}
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-white tracking-tight leading-[1.15]">
            {sectionTitle}
          </h1>
          <p className="mt-3 text-base sm:text-lg font-serif italic text-stone-300">
            &ldquo;{tagline}&rdquo;
          </p>
          <p className="mt-3 text-sm sm:text-base text-stone-400 font-sans leading-relaxed">
            {description}
          </p>

          {statPills && statPills.length > 0 && (
            <div className="mt-6 pt-6 border-t border-white/10 flex flex-wrap gap-6 text-xs font-sans">
              {statPills.map((stat, i) => (
                <div key={i} className="flex flex-col">
                  <span className="text-stone-400 text-[10px] uppercase tracking-wider">{stat.label}</span>
                  <span className="text-sm font-bold text-[#D4A757] mt-0.5">{stat.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
