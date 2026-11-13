import React from 'react';
import { Discipline } from '../../types';
import { Breadcrumbs } from './Breadcrumbs';
import { ImageWithCredit } from '../ImageWithCredit';
import { IMAGE_SIZES } from '../../lib/media/imageMeta';

interface DisciplineGuideHeaderProps {
  discipline: Discipline;
  className?: string;
}

export const DisciplineGuideHeader: React.FC<DisciplineGuideHeaderProps> = ({
  discipline,
  className = '',
}) => {
  const breadcrumbs = [
    { label: 'NFR Competition', path: '/competition/' },
    { label: 'Disciplines', path: '/competition/' },
    { label: discipline.name },
  ];

  return (
    <header className={`mb-10 ${className}`}>
      <Breadcrumbs items={breadcrumbs} className="mb-4" />

      <div className="flex items-center gap-2 text-xs font-sans text-ink-muted mb-2">
        <span className="font-bold text-[#8B5E3C] uppercase tracking-wider">
          NFR Discipline Guide
        </span>
        <span aria-hidden="true">&middot;</span>
        <span className="font-semibold text-stone-700">{discipline.category}</span>
      </div>

      <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-[#0F1115] tracking-tight leading-[1.15]">
        {discipline.name}
      </h1>

      <p className="mt-3 text-lg sm:text-xl font-serif italic text-stone-700 leading-relaxed text-balance">
        &ldquo;{discipline.tagline}&rdquo;
      </p>

      {discipline.introduction && (
        <p className="mt-3 text-sm sm:text-base text-stone-700 font-sans leading-relaxed max-w-3xl">
          {discipline.introduction}
        </p>
      )}

      {/* Hero Action Image */}
      <div className="mt-6">
        {/*
          Issue 03 — the same correction MED-01B made to the article hero.

          This passed `alt={discipline.name}` and a caption assembled from the
          name ("<name> in action at the National Finals Rodeo.") on all seven
          discipline pages: the ALT text an editor wrote on the Media Library
          asset was discarded, and the caption was never written by anyone.

          `imageAlt` and `imageCaption` are resolved on the server by
          `lib/mappers.ts` through the shared chain in `lib/media/imageMeta.ts`,
          so this page and the article page cannot drift apart. `?? name` covers
          a `Discipline` assembled outside `toDiscipline`; it cannot override a
          deliberate empty string, because `''` is not nullish.
        */}
        <ImageWithCredit
          src={discipline.image}
          alt={discipline.imageAlt ?? discipline.name}
          credit={discipline.imageCredit}
          caption={discipline.imageCaption}
          srcSet={discipline.imageSrcSet}
          sizes={IMAGE_SIZES.hero}
          width={discipline.imageWidth}
          height={discipline.imageHeight}
          priority
          aspectRatioClass="aspect-[16/9]"
        />
      </div>
    </header>
  );
};
