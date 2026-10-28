import React from 'react';
import { Discipline } from '../../types';
import { Breadcrumbs } from './Breadcrumbs';
import { ImageWithCredit } from '../ImageWithCredit';

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

      <div className="flex items-center gap-2 text-xs font-sans text-stone-500 mb-2">
        <span className="font-bold text-[#8B5E3C] uppercase tracking-wider">
          Official NFR Discipline
        </span>
        <span aria-hidden="true">&middot;</span>
        <span className="font-semibold text-stone-700">{discipline.category}</span>
        <span aria-hidden="true">&middot;</span>
        <span className="font-mono text-[11px] text-stone-500">Thomas &amp; Mack Standard</span>
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
        <ImageWithCredit
          src={discipline.image}
          alt={discipline.name}
          credit={discipline.imageCredit}
          aspectRatioClass="aspect-[16/9]"
          caption={`${discipline.name} in action at the National Finals Rodeo.`}
        />
      </div>
    </header>
  );
};
