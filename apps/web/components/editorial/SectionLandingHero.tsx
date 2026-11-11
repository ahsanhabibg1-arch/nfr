import React from 'react';
import { Breadcrumbs } from './Breadcrumbs';

interface SectionLandingHeroProps {
  sectionTitle: string;
  tagline: string;
  description: string;
  kicker?: string;
  breadcrumbs?: { label: string; path?: string }[];
  statPills?: { label: string; value: string }[];
  /**
   * Stage 04 Task D: optional background image, from the Page Builder's
   * `landing-hero.heroImageUrl` property. That property was declared in the
   * registry but STRUCTURALLY unconsumable — this component had no image field
   * at all, so an admin could set it and nothing could ever use it.
   *
   * When unset the hero renders exactly as before, so existing section-landing
   * pages are visually unchanged.
   */
  backgroundImageUrl?: string;
  /** Decorative by default; supply alt text only if the image carries meaning. */
  backgroundImageAlt?: string;
  className?: string;
}

export const SectionLandingHero: React.FC<SectionLandingHeroProps> = ({
  sectionTitle,
  tagline,
  description,
  kicker = 'Editorial Section',
  breadcrumbs,
  statPills,
  backgroundImageUrl,
  backgroundImageAlt,
  className = '',
}) => {
  const hasBackground = Boolean(backgroundImageUrl && backgroundImageUrl.trim());
  return (
    <div className={`relative w-full bg-[#0F1115] text-white py-12 md:py-16 border-b border-white/10 ${className}`}>
      {hasBackground && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backgroundImageUrl}
            alt={backgroundImageAlt ?? ''}
            aria-hidden={backgroundImageAlt ? undefined : true}
            className="absolute inset-0 w-full h-full object-cover opacity-35"
          />
          {/* Keeps headline contrast on top of an arbitrary editor-chosen image. */}
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#0F1115] via-[#0F1115]/85 to-[#0F1115]/40" />
        </>
      )}
      <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {breadcrumbs && (
          <div className="mb-4">
            <Breadcrumbs items={breadcrumbs} tone="dark" />
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
